import { EventEmitter } from "events";
import { createSocket, Socket, RemoteInfo } from "dgram";
import { KNXBusInterface, KNXNetTunnelingOptions, HPAI } from "../types";
import { KNX_CONSTANTS } from "../constants";
import { CEMIFrame } from "../frames";

export class KNXNetTunnelingImpl
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
    if (!this.isConnected || !this.socket || !this.serverEndpoint) {
      throw new Error("Not connected to tunneling server");
    }

    // In busmonitor mode, typically no frames are sent - this is monitor-only
    if (this.busmonitorMode) {
      throw new Error(
        "Cannot send frames in busmonitor mode - this is a monitor-only connection"
      );
    }

    const tunnelFrame = this.createTunnelingRequestFrame(frame.toBuffer());

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error("Tunneling request timeout"));
      }, this.options.connectionTimeout);

      const handleAck = (msg: Buffer, rinfo: RemoteInfo) => {
        if (this.isTunnelingAck(msg)) {
          clearTimeout(timeoutId);
          this.socket!.off("message", handleAck);

          const status = this.parseTunnelingAck(msg);
          if (status === KNX_CONSTANTS.ERROR_CODES.E_NO_ERROR) {
            resolve();
          } else {
            reject(new Error(`Tunneling error: 0x${status.toString(16)}`));
          }
        }
      };

      this.socket!.on("message", handleAck);

      this.socket!.send(
        tunnelFrame,
        this.serverEndpoint!.port,
        this.serverEndpoint!.address,
        (err) => {
          if (err) {
            clearTimeout(timeoutId);
            this.socket!.off("message", handleAck);
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

  private createConnectRequestFrame(): Buffer {
    // KNXnet/IP Header (6 bytes)
    const header = Buffer.allocUnsafe(6);
    header.writeUInt8(KNX_CONSTANTS.HEADER_SIZE, 0);
    header.writeUInt8(KNX_CONSTANTS.KNXNETIP_VERSION, 1);
    header.writeUInt16BE(KNX_CONSTANTS.SERVICE_TYPES.CONNECT_REQUEST, 2);
    header.writeUInt16BE(26, 4); // Total length: 6 + 8 + 8 + 4

    // Control Endpoint HPAI (8 bytes)
    const controlHpai = this.createHPAI(this.localEndpoint!);

    // Data Endpoint HPAI (8 bytes)
    const dataHpai = this.createHPAI(this.localEndpoint!);

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

    return Buffer.concat([header, controlHpai, dataHpai, cri]);
  }

  private createTunnelingRequestFrame(cemiFrame: Buffer): Buffer {
    const currentSeq = this.sequenceCounter;
    this.sequenceCounter = (this.sequenceCounter + 1) & 0xff;

    // KNXnet/IP Header (6 bytes)
    const totalLength = 6 + 4 + cemiFrame.length;
    const header = Buffer.allocUnsafe(6);
    header.writeUInt8(KNX_CONSTANTS.HEADER_SIZE, 0);
    header.writeUInt8(KNX_CONSTANTS.KNXNETIP_VERSION, 1);
    header.writeUInt16BE(KNX_CONSTANTS.SERVICE_TYPES.TUNNELLING_REQUEST, 2);
    header.writeUInt16BE(totalLength, 4);

    // Connection Header (4 bytes)
    const connectionHeader = Buffer.allocUnsafe(4);
    connectionHeader.writeUInt8(4, 0); // Structure length
    connectionHeader.writeUInt8(this.connectionId, 1);
    connectionHeader.writeUInt8(currentSeq, 2);
    connectionHeader.writeUInt8(0, 3); // Reserved

    return Buffer.concat([header, connectionHeader, cemiFrame]);
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
    if (msg.length < 6) return false;
    const serviceType = msg.readUInt16BE(2);
    return serviceType === KNX_CONSTANTS.SERVICE_TYPES.TUNNELLING_ACK;
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
    // Status is at offset 9 (6 byte header + 4 byte connection header - 1 for status position)
    return msg.readUInt8(9);
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
        // CONNECT_RESPONSE and TUNNELLING_ACK are handled by specific listeners
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

    const ackFrame = Buffer.allocUnsafe(10);

    // KNXnet/IP Header
    ackFrame.writeUInt8(KNX_CONSTANTS.HEADER_SIZE, 0);
    ackFrame.writeUInt8(KNX_CONSTANTS.KNXNETIP_VERSION, 1);
    ackFrame.writeUInt16BE(KNX_CONSTANTS.SERVICE_TYPES.TUNNELLING_ACK, 2);
    ackFrame.writeUInt16BE(10, 4);

    // Connection Header
    ackFrame.writeUInt8(4, 6);
    ackFrame.writeUInt8(connectionId, 7);
    ackFrame.writeUInt8(sequenceCounter, 8);
    ackFrame.writeUInt8(status, 9);

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

    const responseFrame = Buffer.allocUnsafe(8);

    // KNXnet/IP Header
    responseFrame.writeUInt8(KNX_CONSTANTS.HEADER_SIZE, 0);
    responseFrame.writeUInt8(KNX_CONSTANTS.KNXNETIP_VERSION, 1);
    responseFrame.writeUInt16BE(
      KNX_CONSTANTS.SERVICE_TYPES.CONNECTIONSTATE_RESPONSE,
      2
    );
    responseFrame.writeUInt16BE(8, 4);

    // Connection ID and Status
    responseFrame.writeUInt8(this.connectionId, 6);
    responseFrame.writeUInt8(status, 7);

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

    const disconnectFrame = Buffer.allocUnsafe(16);

    // KNXnet/IP Header
    disconnectFrame.writeUInt8(KNX_CONSTANTS.HEADER_SIZE, 0);
    disconnectFrame.writeUInt8(KNX_CONSTANTS.KNXNETIP_VERSION, 1);
    disconnectFrame.writeUInt16BE(
      KNX_CONSTANTS.SERVICE_TYPES.DISCONNECT_REQUEST,
      2
    );
    disconnectFrame.writeUInt16BE(16, 4);

    // Connection ID
    disconnectFrame.writeUInt8(this.connectionId, 6);
    disconnectFrame.writeUInt8(0, 7); // Reserved

    // Control Endpoint HPAI
    const controlHpai = this.createHPAI(this.localEndpoint!);
    controlHpai.copy(disconnectFrame, 8);

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

    const requestFrame = Buffer.allocUnsafe(16);

    // KNXnet/IP Header
    requestFrame.writeUInt8(KNX_CONSTANTS.HEADER_SIZE, 0);
    requestFrame.writeUInt8(KNX_CONSTANTS.KNXNETIP_VERSION, 1);
    requestFrame.writeUInt16BE(
      KNX_CONSTANTS.SERVICE_TYPES.CONNECTIONSTATE_REQUEST,
      2
    );
    requestFrame.writeUInt16BE(16, 4);

    // Connection ID
    requestFrame.writeUInt8(this.connectionId, 6);
    requestFrame.writeUInt8(0, 7); // Reserved

    // Control Endpoint HPAI
    const controlHpai = this.createHPAI(this.localEndpoint!);
    controlHpai.copy(requestFrame, 8);

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
