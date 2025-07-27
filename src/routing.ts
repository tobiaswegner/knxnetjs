import { EventEmitter } from "events";
import { createSocket, Socket } from "dgram";
import {
  KNXNetConnection,
  KNXNetRoutingOptions,
  RoutingIndicationFrame,
  RoutingLostMessageFrame,
  RoutingBusyFrame,
} from "./types";
import { KNX_CONSTANTS } from "./constants";

export class KNXNetRoutingImpl
  extends EventEmitter
  implements KNXNetConnection
{
  private socket?: Socket;
  private isConnected = false;
  private readonly options: Required<KNXNetRoutingOptions>;
  private busyCounter = 0;
  private lastBusyTime = 0;

  constructor(multicastAddress?: string, port?: number) {
    super();
    this.options = {
      multicastAddress:
        multicastAddress || KNX_CONSTANTS.DEFAULT_MULTICAST_ADDRESS,
      port: port || KNX_CONSTANTS.DEFAULT_PORT,
      ttl: 16,
    };
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.socket = createSocket({ type: "udp4", reuseAddr: true });

      this.socket.on("message", (msg) => {
        this.handleIncomingMessage(msg);
      });

      this.socket.on("error", (err) => {
        this.emit("error", err);
        reject(err);
      });

      this.socket.bind(this.options.port, () => {
        if (!this.socket) return;

        this.socket.addMembership(this.options.multicastAddress);
        this.socket.setMulticastTTL(this.options.ttl);
        this.isConnected = true;
        resolve();
      });
    });
  }

  async send(data: Buffer): Promise<void> {
    if (!this.isConnected || !this.socket) {
      throw new Error("Not connected");
    }

    const frame = this.createRoutingIndicationFrame(data);

    return new Promise((resolve, reject) => {
      this.socket!.send(
        frame,
        this.options.port,
        this.options.multicastAddress,
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  async close(): Promise<void> {
    if (this.socket && this.isConnected) {
      this.socket.dropMembership(this.options.multicastAddress);
      this.socket.close();
      this.isConnected = false;
    }
  }

  on(event: "recv", listener: (data: Buffer) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  private handleIncomingMessage(msg: Buffer): void {
    try {
      const frame = this.parseKNXNetFrame(msg);

      switch (frame.serviceType) {
        case KNX_CONSTANTS.SERVICE_TYPES.ROUTING_INDICATION:
          this.handleRoutingIndication(frame as RoutingIndicationFrame);
          break;
        case KNX_CONSTANTS.SERVICE_TYPES.ROUTING_LOST_MESSAGE:
          this.handleRoutingLostMessage(frame as RoutingLostMessageFrame);
          break;
        case KNX_CONSTANTS.SERVICE_TYPES.ROUTING_BUSY:
          this.handleRoutingBusy(frame as RoutingBusyFrame);
          break;
      }
    } catch (error) {
      this.emit("error", error);
    }
  }

  private parseKNXNetFrame(buffer: Buffer): any {
    if (buffer.length < KNX_CONSTANTS.HEADER_SIZE) {
      throw new Error("Invalid frame: too short");
    }

    const headerSize = buffer.readUInt8(0);
    const version = buffer.readUInt8(1);
    const serviceType = buffer.readUInt16BE(2);
    const totalLength = buffer.readUInt16BE(4);

    if (
      headerSize !== KNX_CONSTANTS.HEADER_SIZE ||
      version !== KNX_CONSTANTS.KNXNETIP_VERSION
    ) {
      throw new Error("Invalid frame header");
    }

    const data = buffer.subarray(headerSize, totalLength);

    switch (serviceType) {
      case KNX_CONSTANTS.SERVICE_TYPES.ROUTING_INDICATION:
        return {
          serviceType,
          cemiFrame: data,
        };

      case KNX_CONSTANTS.SERVICE_TYPES.ROUTING_LOST_MESSAGE:
        return {
          serviceType,
          deviceState: data.readUInt8(1),
          numberOfLostMessages: data.readUInt16BE(2),
        };

      case KNX_CONSTANTS.SERVICE_TYPES.ROUTING_BUSY:
        return {
          serviceType,
          deviceState: data.readUInt8(1),
          waitTime: data.readUInt16BE(2),
          controlField: data.readUInt16BE(4),
        };

      default:
        throw new Error(`Unknown service type: 0x${serviceType.toString(16)}`);
    }
  }

  private createRoutingIndicationFrame(cemiFrame: Buffer): Buffer {
    const totalLength = KNX_CONSTANTS.HEADER_SIZE + cemiFrame.length;
    const frame = Buffer.allocUnsafe(totalLength);

    frame.writeUInt8(KNX_CONSTANTS.HEADER_SIZE, 0);
    frame.writeUInt8(KNX_CONSTANTS.KNXNETIP_VERSION, 1);
    frame.writeUInt16BE(KNX_CONSTANTS.SERVICE_TYPES.ROUTING_INDICATION, 2);
    frame.writeUInt16BE(totalLength, 4);

    cemiFrame.copy(frame, KNX_CONSTANTS.HEADER_SIZE);

    return frame;
  }

  private handleRoutingIndication(frame: RoutingIndicationFrame): void {
    const routingCounter = this.extractRoutingCounter(frame.cemiFrame);

    if (routingCounter === KNX_CONSTANTS.ROUTING_COUNTER.DONT_ROUTE) {
      return;
    }

    this.emit("recv", frame.cemiFrame);
  }

  private handleRoutingLostMessage(frame: RoutingLostMessageFrame): void {
    this.emit("lostMessage", {
      deviceState: frame.deviceState,
      numberOfLostMessages: frame.numberOfLostMessages,
    });
  }

  private handleRoutingBusy(frame: RoutingBusyFrame): void {
    const now = Date.now();

    if (
      now - this.lastBusyTime >
      KNX_CONSTANTS.FLOW_CONTROL.BUSY_DETECTION_THRESHOLD
    ) {
      this.busyCounter = 0;
    }

    this.busyCounter++;
    this.lastBusyTime = now;

    this.emit("busy", {
      waitTime: frame.waitTime,
      controlField: frame.controlField,
      busyCounter: this.busyCounter,
    });
  }

  private extractRoutingCounter(cemiFrame: Buffer): number {
    if (cemiFrame.length < 8) {
      return KNX_CONSTANTS.ROUTING_COUNTER.DONT_ROUTE;
    }

    const ctrl1 = cemiFrame.readUInt8(1);
    return (ctrl1 >> 4) & 0x07;
  }
}
