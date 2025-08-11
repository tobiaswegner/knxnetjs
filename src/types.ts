import { EventEmitter } from "events";
import { CEMIFrame } from "./frames";

export interface KNXBusInterface extends EventEmitter {
  send(frame: CEMIFrame): Promise<void>;
  on(event: "recv", listener: (frame: CEMIFrame) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  open(): Promise<void>;
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

export interface DiscoveryEndpoint {
  name: string;
  ip: string;
  port: number;
  capabilities: number;
  deviceState: number;
  knxAddress?: string;
  macAddress?: string;
  serialNumber?: string;
  projectInstallationId?: number;
  friendlyName?: string;
}

export interface DiscoveryOptions {
  timeout?: number;
  searchResponseTimeout?: number;
}

export interface HPAI {
  hostProtocol: number;
  address: string;
  port: number;
}

export interface KNXNetTunnelingOptions {
  serverAddress: string;
  serverPort?: number;
  localPort?: number;
  heartbeatInterval?: number;
  connectionTimeout?: number;
  busmonitorMode?: boolean;
}

export interface KNXUSBOptions {
  devicePath?: string;
  baudRate?: number;
  autoConnect?: boolean;
  busmonitorMode?: boolean;
}
