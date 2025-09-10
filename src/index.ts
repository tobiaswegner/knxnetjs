import { KNXBusInterface, KNXUSBOptions } from "./types";
import { KNXNetRoutingImpl } from "./interfaces/routing";
import { KNXNetDiscovery } from "./discovery";
import { KNXNetTunnelingImpl } from "./interfaces/tunneling";
import { KNXUSBImpl } from "./interfaces/usb";
import { CEMIFrame } from "./frames";
import { KNXNetManagementImpl } from "./interfaces/management";

export function createRouting(
  multicastAddress?: string,
  port?: number
): KNXBusInterface {
  const connection = new KNXNetRoutingImpl(multicastAddress, port);

  // Auto-connect when first used
  const originalSend = connection.send.bind(connection);
  connection.send = async (frame: CEMIFrame) => {
    if (!(connection as any).isConnected) {
      await connection.open();
    }
    return originalSend(frame);
  };

  return connection;
}

export function createManagement(
  serverAddress: string,
  serverPort?: number,
  localPort?: number
): KNXBusInterface {
  return new KNXNetManagementImpl(serverAddress, serverPort, localPort);
}

export function createTunneling(
  serverAddress: string,
  serverPort?: number,
  localPort?: number
): KNXBusInterface {
  return new KNXNetTunnelingImpl(serverAddress, serverPort, localPort);
}

export function createBusmonitor(
  serverAddress: string,
  serverPort?: number,
  localPort?: number
): KNXBusInterface {
  return new KNXNetTunnelingImpl(serverAddress, serverPort, localPort, true);
}

export function createUSB(options?: KNXUSBOptions): KNXBusInterface {
  return new KNXUSBImpl(options);
}

export function createUSBBusmonitor(options?: KNXUSBOptions): KNXBusInterface {
  const usbOptions = { ...options, busmonitorMode: true };
  return new KNXUSBImpl(usbOptions);
}

export function createDiscovery(): KNXNetDiscovery {
  return new KNXNetDiscovery();
}

export {
  KNXBusInterface,
  KNXNetRoutingOptions,
  KNXNetTunnelingOptions,
  KNXUSBOptions,
  DiscoveryEndpoint,
  DiscoveryOptions,
  KNXInterfaceType,
  KNXInterfaceInformation,
} from "./types";
export { KNX_CONSTANTS } from "./constants";
export { KNXNetDiscovery } from "./discovery";
export { KNXNetTunnelingImpl } from "./interfaces/tunneling";
export { KNXUSBImpl } from "./interfaces/usb";
export { CEMIFrame, CEMIMessageCode, Priority } from "./frames";
export { discoverInterfaces, createInterface } from "./interface-discovery";
