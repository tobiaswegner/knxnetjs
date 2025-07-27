import { EventEmitter } from 'events';

export interface KNXNetConnection extends EventEmitter {
  send(data: Buffer): Promise<void>;
  on(event: 'recv', listener: (data: Buffer) => void): this;
  close(): Promise<void>;
}

export interface KNXRoutingFrame {
  serviceType: number;
  data: Buffer;
}

export interface RoutingIndicationFrame extends KNXRoutingFrame {
  serviceType: 0x0530;
  cemiFrame: Buffer;
}

export interface RoutingLostMessageFrame extends KNXRoutingFrame {
  serviceType: 0x0531;
  deviceState: number;
  numberOfLostMessages: number;
}

export interface RoutingBusyFrame extends KNXRoutingFrame {
  serviceType: 0x0532;
  deviceState: number;
  waitTime: number;
  controlField: number;
}

export interface KNXNetRoutingOptions {
  multicastAddress?: string;
  port?: number;
  ttl?: number;
}