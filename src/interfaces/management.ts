import { EventEmitter } from "events";
import { createSocket, Socket, RemoteInfo } from "dgram";
import { KNXBusInterface, KNXNetTunnelingOptions, HPAI } from "../types";
import { KNX_CONSTANTS } from "../constants";
import { CEMIFrame, KNXnetIPFrame, CEMIMessageCode } from "../frames";
import {
  CEMIPropertyWrite,
  CEMIPropertyReadReq,
  CEMIPropertyReadCon,
} from "../frames/cemi-properties";

export class KNXNetManagementImpl
  extends EventEmitter
  implements KNXBusInterface
{
  private socket: Socket | undefined;
  private isConnected = false;
  private readonly options: Required<KNXNetTunnelingOptions>;
  private connectionId: number = 0;
  private sequenceCounter: number = 0;
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
    throw new Error(
      "send is not implemented for KNX device management connections"
    );
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
        this.localEndpoint = {
          hostProtocol: 0x01, // UDP
          address: "0.0.0.0", // Any interface
          port: address.port,
        };
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
    const currentSeq = this.sequenceCounter;
    this.sequenceCounter = (this.sequenceCounter + 1) & 0xff;

    // Connection Header (4 bytes)
    const connectionHeader = Buffer.allocUnsafe(4);
    connectionHeader.writeUInt8(4, 0); // Structure length
    connectionHeader.writeUInt8(this.connectionId, 1);
    connectionHeader.writeUInt8(currentSeq, 2);
    connectionHeader.writeUInt8(0, 3); // Reserved

    const payload = Buffer.concat([connectionHeader, propertyData]);
    const frame = new KNXnetIPFrame(
      KNX_CONSTANTS.SERVICE_TYPES.DEVICE_CONFIGURATION_REQUEST,
      payload
    );
    return frame.toBuffer();
  }

  private createConnectRequestFrame(): Buffer {
    // Control Endpoint HPAI (8 bytes)
    const controlHpai = this.createHPAI(this.localEndpoint!);

    // Data Endpoint HPAI (8 bytes)
    const dataHpai = this.createHPAI(this.localEndpoint!);

    // Connection Request Information (4 bytes)
    const cri = Buffer.allocUnsafe(2);
    cri.writeUInt8(2, 0); // Structure length
    cri.writeUInt8(KNX_CONSTANTS.MANAGEMENT.CONNECTION_TYPE, 1); // Always tunneling connection type

    const payload = Buffer.concat([controlHpai, dataHpai, cri]);
    const frame = new KNXnetIPFrame(
      KNX_CONSTANTS.SERVICE_TYPES.CONNECT_REQUEST,
      payload
    );
    return frame.toBuffer();
  }

  private createTunnelingRequestFrame(cemiFrame: Buffer): Buffer {
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
    return frame.toBuffer();
  }

  private createHPAI(endpoint: HPAI): Buffer {
    const hpai = Buffer.allocUnsafe(8);
    hpai.writeUInt8(8, 0); // Structure length
    hpai.writeUInt8(endpoint.hostProtocol, 1);

    const ipParts =
      endpoint.address === "0.0.0.0"
        ? [0, 0, 0, 0]
        : endpoint.address.split(".").map((x: string) => parseInt(x, 10));
    hpai.writeUInt8(ipParts[0] || 0, 2);
    hpai.writeUInt8(ipParts[1] || 0, 3);
    hpai.writeUInt8(ipParts[2] || 0, 4);
    hpai.writeUInt8(ipParts[3] || 0, 5);
    hpai.writeUInt16BE(endpoint.port, 6);

    return hpai;
  }

  private parseHPAI(buffer: Buffer, offset: number): HPAI {
    const hostProtocol = buffer.readUInt8(offset + 1);
    const ip = [
      buffer.readUInt8(offset + 2),
      buffer.readUInt8(offset + 3),
      buffer.readUInt8(offset + 4),
      buffer.readUInt8(offset + 5),
    ].join(".");
    const port = buffer.readUInt16BE(offset + 6);

    return {
      hostProtocol,
      address: ip,
      port,
    };
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

    // Data Endpoint HPAI (8 bytes)
    const dataEndpoint = this.parseHPAI(msg, offset);

    // Use server's address and port if data endpoint is 0.0.0.0:0
    if (dataEndpoint.address === "0.0.0.0") {
      dataEndpoint.address = rinfo.address;
    }
    if (dataEndpoint.port === 0) {
      dataEndpoint.port = rinfo.port;
    }

    return { status, connectionId, dataEndpoint };
  }

  private parseTunnelingAck(msg: Buffer): number {
    const frame = KNXnetIPFrame.fromBuffer(msg);
    // Status is at offset 3 in payload (4 byte connection header - 1 for status position)
    return frame.payload.readUInt8(3);
  }

  private handleIncomingMessage(msg: Buffer, _rinfo: RemoteInfo): void {
    try {
      if (msg.length < KNX_CONSTANTS.HEADER_SIZE) {
        return;
      }

      const serviceType = msg.readUInt16BE(2);

      switch (serviceType) {
        case KNX_CONSTANTS.SERVICE_TYPES.DEVICE_CONFIGURATION_REQUEST:
          this.handleDeviceConfigurationRequest(msg);
          break;
        case KNX_CONSTANTS.SERVICE_TYPES.TUNNELLING_REQUEST:
          this.handleTunnelingRequest(msg);
          break;
        case KNX_CONSTANTS.SERVICE_TYPES.CONNECTIONSTATE_REQUEST:
          this.handleConnectionStateRequest(msg);
          break;
        // CONNECT_RESPONSE and TUNNELLING_ACK are handled by specific listeners
      }
    } catch (error) {
      this.emit("error", error);
    }
  }

  private handleDeviceConfigurationRequest(msg: Buffer): void {
    let offset = KNX_CONSTANTS.HEADER_SIZE;

    // Connection Header (4 bytes)
    const connectionId = msg.readUInt8(offset + 1);
    const sequenceCounter = msg.readUInt8(offset + 2);
    offset += 4;

    // Send ACK
    this.sendDeviceConfigurationAck(
      connectionId,
      sequenceCounter,
      KNX_CONSTANTS.ERROR_CODES.E_NO_ERROR
    );

    // Extract cEMI frame
    const cemiFrameBuffer = msg.subarray(offset);
    const cemiFrame = CEMIPropertyReadCon.fromBuffer(cemiFrameBuffer);
    if (cemiFrame.isValid()) {
      this.emit("recv", cemiFrame);
    }
  }

  private handleTunnelingRequest(msg: Buffer): void {
    let offset = KNX_CONSTANTS.HEADER_SIZE;

    // Connection Header (4 bytes)
    const connectionId = msg.readUInt8(offset + 1);
    const sequenceCounter = msg.readUInt8(offset + 2);
    offset += 4;

    // Send ACK
    this.sendTunnelingAck(
      connectionId,
      sequenceCounter,
      KNX_CONSTANTS.ERROR_CODES.E_NO_ERROR
    );

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

  private sendDeviceConfigurationAck(
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
      KNX_CONSTANTS.SERVICE_TYPES.DEVICE_CONFIGURATION_ACK,
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
    const controlHpai = this.createHPAI(this.localEndpoint!);

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
    const controlHpai = this.createHPAI(this.localEndpoint!);

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

    this.connectionId = 0;
    this.sequenceCounter = 0;
    this.serverEndpoint = undefined;
    this.localEndpoint = undefined;
  }
}
