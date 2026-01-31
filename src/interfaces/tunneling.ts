import { EventEmitter } from "events";
import { createSocket, Socket, RemoteInfo } from "dgram";
import { KNXBusInterface, KNXNetTunnelingOptions, HPAI } from "../types";
import { HostProtocol } from "../types/hpai";
import { KNX_CONSTANTS } from "../constants";
import { CEMIFrame, KNXnetIPFrame, CEMIMessageCode } from "../frames";
import {
  CEMIPropertyWrite,
  CEMIPropertyReadReq,
  CEMIPropertyReadCon,
} from "../frames/cemi-properties";

export class KNXNetTunnelingImpl
  extends EventEmitter
  implements KNXBusInterface
{
  private socket: Socket | undefined;
  private isConnected = false;
  private readonly options: Required<KNXNetTunnelingOptions>;
  private connectionId: number = 0;
  private sequenceCounter: number = 0;
  private expectedIncomingSequence: number = 0;
  private pendingRequests: Map<number, { resolve: () => void; reject: (error: Error) => void; timeoutId: NodeJS.Timeout; retryCount: number; originalFrame: Buffer }> = new Map();
  private heartbeatTimer: NodeJS.Timeout | undefined;
  private connectionTimer: NodeJS.Timeout | undefined;
  private serverEndpoint: HPAI | undefined;
  private localEndpoint: HPAI | undefined;
  private readonly busmonitorMode: boolean;

  constructor(
    serverAddress: string,
    serverPort?: number,
    localPort?: number,
    busmonitorMode?: boolean
  ) {
    super();
    this.busmonitorMode = busmonitorMode ?? false;
    this.options = {
      serverAddress,
      serverPort: serverPort ?? KNX_CONSTANTS.DEFAULT_PORT,
      localPort: localPort ?? 0,
      heartbeatInterval: KNX_CONSTANTS.TUNNELING.DEFAULT_HEARTBEAT_INTERVAL,
      connectionTimeout: KNX_CONSTANTS.TUNNELING.DEFAULT_CONNECTION_TIMEOUT,
      busmonitorMode: this.busmonitorMode,
    };
  }

  async open(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      await this.setupSocket();
      await this.establishConnection();
      this.startHeartbeat();
      this.isConnected = true;
    } catch (error) {
      await this.cleanup();
      throw error;
    }
  }

  async send(frame: CEMIFrame): Promise<void> {
    if (!this.isConnected || !this.socket || !this.serverEndpoint) {
      throw new Error("Not connected to tunneling server");
    }

    // In busmonitor mode, typically no frames are sent - this is monitor-only
    if (this.busmonitorMode) {
      throw new Error(
        "Cannot send frames in busmonitor mode - this is a monitor-only connection"
      );
    }

    const { frame: tunnelFrame, sequence } = this.createTunnelingRequestFrame(frame.toBuffer());

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.handleTunnelingTimeout(sequence);
      }, 1000); // KNXnet/IP spec: 1 second timeout

      // Store the pending request with its sequence number
      this.pendingRequests.set(sequence, { 
        resolve, 
        reject, 
        timeoutId, 
        retryCount: 0, 
        originalFrame: tunnelFrame 
      });

      this.socket!.send(
        tunnelFrame,
        this.serverEndpoint!.port,
        this.serverEndpoint!.address,
        (err) => {
          if (err) {
            const pending = this.pendingRequests.get(sequence);
            if (pending) {
              clearTimeout(pending.timeoutId);
              this.pendingRequests.delete(sequence);
            }
            reject(err);
          }
        }
      );
    });
  }

  async close(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await this.sendDisconnectRequest();
    } catch (error) {
      // Ignore disconnect errors
    }

    await this.cleanup();
  }

  /**
   * Check if this connection is in busmonitor mode
   */
  isBusmonitorMode(): boolean {
    return this.busmonitorMode;
  }

  async writeProperty(
    interfaceObject: number,
    objectInstance: number,
    propertyId: number,
    numberOfElements: number,
    startIndex: number,
    data: Buffer
  ): Promise<void> {
    if (!this.isConnected || !this.socket || !this.serverEndpoint) {
      throw new Error("Not connected to tunneling server");
    }

    const propertyWrite = new CEMIPropertyWrite(
      interfaceObject,
      objectInstance,
      propertyId,
      numberOfElements,
      startIndex,
      data
    );

    const configFrame = this.createDeviceConfigurationFrame(
      propertyWrite.toBuffer()
    );

    await new Promise<void>((resolve, reject) => {
      this.socket!.send(
        configFrame,
        this.serverEndpoint!.port,
        this.serverEndpoint!.address,
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });

    return new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        resolve();
      }, 2000);
    });
  }

  async readProperty(
    interfaceObject: number,
    objectInstance: number,
    propertyId: number,
    numberOfElements: number,
    startIndex: number
  ): Promise<Buffer> {
    if (!this.isConnected || !this.socket || !this.serverEndpoint) {
      throw new Error("Not connected to tunneling server");
    }

    const propertyRead = new CEMIPropertyReadReq(
      interfaceObject,
      objectInstance,
      propertyId,
      numberOfElements,
      startIndex
    );

    const configFrame = this.createDeviceConfigurationFrame(
      propertyRead.toBuffer()
    );

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Property read timeout"));
      }, 5000);

      // Set up one-time response listener for property read confirmation
      const responseHandler = (frame: CEMIFrame) => {
        if (frame.messageCode === CEMIMessageCode.M_PROP_READ_CON) {
          clearTimeout(timeout);
          this.off("recv", responseHandler);
          // Return the frame data which contains the property value
          resolve(frame.data);
        }
      };

      this.on("recv", responseHandler);

      this.socket!.send(
        configFrame,
        this.serverEndpoint!.port,
        this.serverEndpoint!.address,
        (err) => {
          if (err) {
            clearTimeout(timeout);
            this.off("recv", responseHandler);
            reject(err);
          }
        }
      );
    });
  }

  on(event: "recv", listener: (frame: CEMIFrame) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  private async setupSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = createSocket({ type: "udp4", reuseAddr: true });

      this.socket.on("error", (err) => {
        this.emit("error", err);
        reject(err);
      });

      this.socket.on("message", (msg, rinfo) => {
        this.handleIncomingMessage(msg, rinfo);
      });

      this.socket.on("listening", () => {
        const address = this.socket!.address();
        this.localEndpoint = new HPAI(
          HostProtocol.IPV4_UDP,
          "0.0.0.0", // Any interface
          address.port
        );
        resolve();
      });

      // Bind to specified port or let system choose available port
      if (this.options.localPort === 0) {
        this.socket.bind(); // Let system choose port
      } else {
        this.socket.bind(this.options.localPort);
      }
    });
  }

  private async establishConnection(): Promise<void> {
    const connectFrame = this.createConnectRequestFrame();

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error("Connection timeout"));
      }, this.options.connectionTimeout);

      const handleResponse = (msg: Buffer, rinfo: RemoteInfo) => {
        if (this.isConnectResponse(msg)) {
          clearTimeout(timeoutId);
          this.socket!.off("message", handleResponse);

          try {
            const result = this.parseConnectResponse(msg, rinfo);
            if (result.status === KNX_CONSTANTS.ERROR_CODES.E_NO_ERROR) {
              this.connectionId = result.connectionId;
              this.serverEndpoint = result.dataEndpoint;
              resolve();
            } else {
              reject(
                new Error(`Connection failed: 0x${result.status.toString(16)}`)
              );
            }
          } catch (error) {
            reject(error);
          }
        }
      };

      this.socket!.on("message", handleResponse);

      this.socket!.send(
        connectFrame,
        this.options.serverPort,
        this.options.serverAddress,
        (err) => {
          if (err) {
            clearTimeout(timeoutId);
            this.socket!.off("message", handleResponse);
            reject(err);
          }
        }
      );
    });
  }

  private createDeviceConfigurationFrame(propertyData: Buffer): Buffer {
    // Connection Header (4 bytes)
    const connectionHeader = Buffer.allocUnsafe(2);
    connectionHeader.writeUInt8(2, 0); // Structure length
    connectionHeader.writeUInt8(3, 1); // Device management connection

    const payload = Buffer.concat([connectionHeader, propertyData]);
    const frame = new KNXnetIPFrame(
      KNX_CONSTANTS.SERVICE_TYPES.DEVICE_CONFIGURATION_REQUEST,
      payload
    );
    return frame.toBuffer();
  }

  private createConnectRequestFrame(): Buffer {
    // Control Endpoint HPAI (8 bytes)
    const controlHpai = this.localEndpoint!.toBuffer();

    // Data Endpoint HPAI (8 bytes)
    const dataHpai = this.localEndpoint!.toBuffer();

    // Connection Request Information (4 bytes)
    const cri = Buffer.allocUnsafe(4);
    cri.writeUInt8(4, 0); // Structure length
    cri.writeUInt8(KNX_CONSTANTS.TUNNELING.CONNECTION_TYPE, 1); // Always tunneling connection type

    // Use appropriate layer type based on busmonitor mode
    const layerType = this.busmonitorMode
      ? KNX_CONSTANTS.TUNNELING.LAYER_TYPE_BUSMONITOR
      : KNX_CONSTANTS.TUNNELING.LAYER_TYPE_TUNNEL_LINKLAYER;

    cri.writeUInt8(layerType, 2); // Layer type
    cri.writeUInt8(0, 3); // Reserved

    const payload = Buffer.concat([controlHpai, dataHpai, cri]);
    const frame = new KNXnetIPFrame(
      KNX_CONSTANTS.SERVICE_TYPES.CONNECT_REQUEST,
      payload
    );
    return frame.toBuffer();
  }

  private createTunnelingRequestFrame(cemiFrame: Buffer): { frame: Buffer; sequence: number } {
    const currentSeq = this.sequenceCounter;
    this.sequenceCounter = (this.sequenceCounter + 1) & 0xff;

    // Connection Header (4 bytes)
    const connectionHeader = Buffer.allocUnsafe(4);
    connectionHeader.writeUInt8(4, 0); // Structure length
    connectionHeader.writeUInt8(this.connectionId, 1);
    connectionHeader.writeUInt8(currentSeq, 2);
    connectionHeader.writeUInt8(0, 3); // Reserved

    const payload = Buffer.concat([connectionHeader, cemiFrame]);
    const frame = new KNXnetIPFrame(
      KNX_CONSTANTS.SERVICE_TYPES.TUNNELLING_REQUEST,
      payload
    );
    return { frame: frame.toBuffer(), sequence: currentSeq };
  }


  private parseHPAI(buffer: Buffer, offset: number): HPAI {
    // Parse HPAI from buffer at offset
    const hapiBuffer = buffer.subarray(offset, offset + 8);
    return HPAI.fromBuffer(hapiBuffer);
  }

  private isConnectResponse(msg: Buffer): boolean {
    if (msg.length < 6) return false;
    const serviceType = msg.readUInt16BE(2);
    return serviceType === KNX_CONSTANTS.SERVICE_TYPES.CONNECT_RESPONSE;
  }

  private isTunnelingAck(msg: Buffer): boolean {
    try {
      const frame = KNXnetIPFrame.fromBuffer(msg);
      return frame.service === KNX_CONSTANTS.SERVICE_TYPES.TUNNELLING_ACK;
    } catch {
      return false;
    }
  }

  private parseConnectResponse(
    msg: Buffer,
    rinfo: RemoteInfo
  ): { status: number; connectionId: number; dataEndpoint: HPAI } {
    let offset = KNX_CONSTANTS.HEADER_SIZE;

    // Connection ID (1 byte)
    const connectionId = msg.readUInt8(offset);
    offset += 1;

    // Status (1 byte)
    const status = msg.readUInt8(offset);
    offset += 1;

    if (status != KNX_CONSTANTS.ERROR_CODES.E_NO_ERROR) {
      return {
        status,
        connectionId,
        dataEndpoint: new HPAI(HostProtocol.IPV4_UDP, "0.0.0.0", 0),
      };
    }

    // Data Endpoint HPAI (8 bytes)
    const dataEndpoint = this.parseHPAI(msg, offset);

    // Use server's address and port if data endpoint is 0.0.0.0:0
    let finalEndpoint = dataEndpoint;
    if (dataEndpoint.address === "0.0.0.0" || dataEndpoint.port === 0) {
      finalEndpoint = new HPAI(
        dataEndpoint.hostProtocol,
        dataEndpoint.address === "0.0.0.0" ? rinfo.address : dataEndpoint.address,
        dataEndpoint.port === 0 ? rinfo.port : dataEndpoint.port
      );
    }

    return { status, connectionId, dataEndpoint: finalEndpoint };
  }

  private parseTunnelingAck(msg: Buffer): { status: number; sequence: number } {
    const frame = KNXnetIPFrame.fromBuffer(msg);
    const sequence = frame.payload.readUInt8(2);
    const status = frame.payload.readUInt8(3);
    return { status, sequence };
  }

  private handleIncomingMessage(msg: Buffer, _rinfo: RemoteInfo): void {
    try {
      if (msg.length < KNX_CONSTANTS.HEADER_SIZE) {
        return;
      }

      const serviceType = msg.readUInt16BE(2);

      switch (serviceType) {
        case KNX_CONSTANTS.SERVICE_TYPES.TUNNELLING_REQUEST:
          this.handleTunnelingRequest(msg);
          break;
        case KNX_CONSTANTS.SERVICE_TYPES.CONNECTIONSTATE_REQUEST:
          this.handleConnectionStateRequest(msg);
          break;
        case KNX_CONSTANTS.SERVICE_TYPES.TUNNELLING_ACK:
          this.handleTunnelingAck(msg);
          break;
        // CONNECT_RESPONSE is handled by specific listeners
      }
    } catch (error) {
      this.emit("error", error);
    }
  }

  private handleTunnelingRequest(msg: Buffer): void {
    let offset = KNX_CONSTANTS.HEADER_SIZE;

    // Connection Header (4 bytes)
    const connectionId = msg.readUInt8(offset + 1);
    const sequenceCounter = msg.readUInt8(offset + 2);
    offset += 4;

    // Validate connection ID
    if (connectionId !== this.connectionId) {
      this.sendTunnelingAck(
        connectionId,
        sequenceCounter,
        KNX_CONSTANTS.ERROR_CODES.E_CONNECTION_ID
      );
      return;
    }

    // Validate sequence number
    const sequenceValid = this.isValidIncomingSequence(sequenceCounter);
    
    if (!sequenceValid.isValid) {
      // Send NACK for invalid sequence
      this.sendTunnelingAck(
        connectionId,
        sequenceCounter,
        sequenceValid.errorCode!
      );
      
      // Schedule reconnection for unexpected sequence numbers
      if (sequenceValid.shouldReconnect) {
        this.emit("error", new Error(`Invalid sequence number ${sequenceCounter}, expected ${this.expectedIncomingSequence}. Reconnection required.`));
      }
      return;
    }
    
    // Send ACK - always acknowledge valid sequences (including duplicates)
    this.sendTunnelingAck(
      connectionId,
      sequenceCounter,
      KNX_CONSTANTS.ERROR_CODES.E_NO_ERROR
    );

    // Only process frame if it's not a duplicate
    if (!sequenceValid.isDuplicate) {
      // Update expected sequence for next message only for new frames
      this.expectedIncomingSequence = (sequenceCounter + 1) & 0xff;
      // Extract cEMI frame
      const cemiFrameBuffer = msg.subarray(offset);
      if (CEMIFrame.isValidBuffer(cemiFrameBuffer)) {
        const cemiFrame = CEMIFrame.fromBuffer(cemiFrameBuffer);
        this.emit("recv", cemiFrame);
      } else {
        // For invalid frames, create a basic cEMI frame wrapper
        try {
          const cemiFrame = CEMIFrame.fromBuffer(cemiFrameBuffer);
          this.emit("recv", cemiFrame);
        } catch (error) {
          this.emit(
            "error",
            new Error(`Invalid cEMI frame received: ${(error as Error).message}`)
          );
        }
      }
    } else {
      // Duplicate frame - acknowledged but not processed
      // According to KNXnet/IP spec: "frames with sequence number one less than expected are silently discarded"
    }
  }

  private sendTunnelingAck(
    connectionId: number,
    sequenceCounter: number,
    status: number
  ): void {
    if (!this.socket || !this.serverEndpoint) {
      return;
    }

    // Connection Header (4 bytes)
    const connectionHeader = Buffer.allocUnsafe(4);
    connectionHeader.writeUInt8(4, 0); // Structure length
    connectionHeader.writeUInt8(connectionId, 1);
    connectionHeader.writeUInt8(sequenceCounter, 2);
    connectionHeader.writeUInt8(status, 3);

    const frame = new KNXnetIPFrame(
      KNX_CONSTANTS.SERVICE_TYPES.TUNNELLING_ACK,
      connectionHeader
    );
    const ackFrame = frame.toBuffer();

    this.socket.send(
      ackFrame,
      this.serverEndpoint.port,
      this.serverEndpoint.address
    );
  }

  private handleConnectionStateRequest(_msg: Buffer): void {
    // Send connection state response
    this.sendConnectionStateResponse(KNX_CONSTANTS.ERROR_CODES.E_NO_ERROR);
  }

  private isValidIncomingSequence(sequence: number): { isValid: boolean; isDuplicate: boolean; shouldReconnect: boolean; errorCode?: number } {
    // Normalize sequence numbers to 8-bit (0-255)
    const normalizeSequence = (seq: number) => seq & 0xff;
    const expectedNorm = normalizeSequence(this.expectedIncomingSequence);
    const receivedNorm = normalizeSequence(sequence);
    
    // Check if this is the expected sequence number
    if (receivedNorm === expectedNorm) {
      return { isValid: true, isDuplicate: false, shouldReconnect: false };
    }
    
    // Check if this is the previous sequence number (duplicate)
    // According to KNXnet/IP spec: "frames with sequence number one less than expected are silently discarded"
    const previousExpected = normalizeSequence(this.expectedIncomingSequence - 1);
    if (receivedNorm === previousExpected) {
      // This is a duplicate - acknowledge but don't process, and don't trigger reconnection
      return { isValid: true, isDuplicate: true, shouldReconnect: false };
    }
    
    // Any other sequence number is invalid and should trigger reconnection
    // According to KNXnet/IP spec: unexpected sequence numbers trigger reconnection
    return { 
      isValid: false, 
      isDuplicate: false, 
      shouldReconnect: true,
      errorCode: KNX_CONSTANTS.ERROR_CODES.E_SEQUENCE_NUMBER 
    };
  }

  private handleTunnelingTimeout(sequence: number): void {
    const pending = this.pendingRequests.get(sequence);
    if (!pending) {
      return;
    }

    // KNXnet/IP spec: retry once with same sequence number, then disconnect
    if (pending.retryCount === 0) {
      pending.retryCount = 1;
      
      // Retry with same sequence number (don't increment sequenceCounter)
      const retryTimeoutId = setTimeout(() => {
        // Second timeout - terminate connection
        this.pendingRequests.delete(sequence);
        pending.reject(new Error("Tunneling request failed after retry. Terminating connection."));
        this.close(); // Disconnect as per specification
      }, 1000); // Another 1 second timeout
      
      pending.timeoutId = retryTimeoutId;
      
      // Resend with same frame
      this.socket!.send(
        pending.originalFrame,
        this.serverEndpoint!.port,
        this.serverEndpoint!.address,
        (err) => {
          if (err) {
            clearTimeout(retryTimeoutId);
            this.pendingRequests.delete(sequence);
            pending.reject(err);
          }
        }
      );
    } else {
      // Already retried - terminate connection
      this.pendingRequests.delete(sequence);
      pending.reject(new Error("Tunneling request failed after retry. Terminating connection."));
      this.close(); // Disconnect as per specification
    }
  }

  private handleTunnelingAck(msg: Buffer): void {
    try {
      const ackData = this.parseTunnelingAck(msg);
      const pending = this.pendingRequests.get(ackData.sequence);
      
      if (pending) {
        clearTimeout(pending.timeoutId);
        this.pendingRequests.delete(ackData.sequence);
        
        if (ackData.status === KNX_CONSTANTS.ERROR_CODES.E_NO_ERROR) {
          pending.resolve();
        } else {
          // KNXnet/IP spec: on error ACK, retry once then terminate connection
          if (pending.retryCount === 0) {
            pending.retryCount = 1;
            
            // Retry with same sequence number
            const retryTimeoutId = setTimeout(() => {
              this.pendingRequests.delete(ackData.sequence);
              pending.reject(new Error("Tunneling request failed after retry. Terminating connection."));
              this.close(); // Disconnect as per specification
            }, 1000);
            
            pending.timeoutId = retryTimeoutId;
            this.pendingRequests.set(ackData.sequence, pending);
            
            // Resend with same frame
            this.socket!.send(
              pending.originalFrame,
              this.serverEndpoint!.port,
              this.serverEndpoint!.address,
              (err) => {
                if (err) {
                  clearTimeout(retryTimeoutId);
                  this.pendingRequests.delete(ackData.sequence);
                  pending.reject(err);
                }
              }
            );
          } else {
            // Already retried - terminate connection
            pending.reject(new Error(`Tunneling error after retry: 0x${ackData.status.toString(16)}. Terminating connection.`));
            this.close(); // Disconnect as per specification
          }
        }
      }
      // If no pending request found, ignore the ACK (might be duplicate or late)
    } catch (error) {
      this.emit("error", new Error(`Error parsing tunneling ACK: ${(error as Error).message}`));
    }
  }

  private sendConnectionStateResponse(status: number): void {
    if (!this.socket || !this.serverEndpoint) {
      return;
    }

    // Connection ID and Status (2 bytes)
    const payload = Buffer.allocUnsafe(2);
    payload.writeUInt8(this.connectionId, 0);
    payload.writeUInt8(status, 1);

    const frame = new KNXnetIPFrame(
      KNX_CONSTANTS.SERVICE_TYPES.CONNECTIONSTATE_RESPONSE,
      payload
    );
    const responseFrame = frame.toBuffer();

    this.socket.send(
      responseFrame,
      this.serverEndpoint.port,
      this.serverEndpoint.address
    );
  }

  private async sendDisconnectRequest(): Promise<void> {
    if (!this.socket || !this.serverEndpoint) {
      return;
    }

    // Connection ID and Reserved byte (2 bytes)
    const connectionInfo = Buffer.allocUnsafe(2);
    connectionInfo.writeUInt8(this.connectionId, 0);
    connectionInfo.writeUInt8(0, 1); // Reserved

    // Control Endpoint HPAI (8 bytes)
    const controlHpai = this.localEndpoint!.toBuffer();

    const payload = Buffer.concat([connectionInfo, controlHpai]);
    const frame = new KNXnetIPFrame(
      KNX_CONSTANTS.SERVICE_TYPES.DISCONNECT_REQUEST,
      payload
    );
    const disconnectFrame = frame.toBuffer();

    return new Promise((resolve) => {
      this.socket!.send(
        disconnectFrame,
        this.serverEndpoint!.port,
        this.serverEndpoint!.address,
        () => {
          resolve();
        }
      );
    });
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.sendConnectionStateRequest();
    }, this.options.heartbeatInterval);
  }

  private sendConnectionStateRequest(): void {
    if (!this.socket || !this.serverEndpoint) {
      return;
    }

    // Connection ID and Reserved byte (2 bytes)
    const connectionInfo = Buffer.allocUnsafe(2);
    connectionInfo.writeUInt8(this.connectionId, 0);
    connectionInfo.writeUInt8(0, 1); // Reserved

    // Control Endpoint HPAI (8 bytes)
    const controlHpai = this.localEndpoint!.toBuffer();

    const payload = Buffer.concat([connectionInfo, controlHpai]);
    const frame = new KNXnetIPFrame(
      KNX_CONSTANTS.SERVICE_TYPES.CONNECTIONSTATE_REQUEST,
      payload
    );
    const requestFrame = frame.toBuffer();

    this.socket.send(
      requestFrame,
      this.serverEndpoint.port,
      this.serverEndpoint.address
    );
  }

  private async cleanup(): Promise<void> {
    this.isConnected = false;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }

    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer);
      this.connectionTimer = undefined;
    }

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.close();
      this.socket = undefined;
    }

    // Clear pending requests
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error("Connection closed"));
    }
    this.pendingRequests.clear();

    this.connectionId = 0;
    this.sequenceCounter = 0;
    this.expectedIncomingSequence = 0;
    this.serverEndpoint = undefined;
    this.localEndpoint = undefined;
  }
}
