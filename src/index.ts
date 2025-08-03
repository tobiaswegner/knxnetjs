import { KNXNetConnection } from './types';
import { KNXNetRoutingImpl } from './routing';
import { KNXNetDiscovery } from './discovery';
import { KNXNetTunnelingImpl } from './tunneling';
import { CEMIFrame } from './frames';

export function createRouting(multicastAddress?: string, port?: number): KNXNetConnection {
  const connection = new KNXNetRoutingImpl(multicastAddress, port);
  
  // Auto-connect when first used
  const originalSend = connection.send.bind(connection);
  connection.send = async (frame: CEMIFrame) => {
    if (!(connection as any).isConnected) {
      await connection.connect();
    }
    return originalSend(frame);
  };
  
  return connection;
}

export function createTunneling(serverAddress: string, serverPort?: number, localPort?: number): KNXNetConnection {
  return new KNXNetTunnelingImpl(serverAddress, serverPort, localPort);
}

export function createBusmonitor(serverAddress: string, serverPort?: number, localPort?: number): KNXNetConnection {
  return new KNXNetTunnelingImpl(serverAddress, serverPort, localPort, true);
}

export function createDiscovery(): KNXNetDiscovery {
  return new KNXNetDiscovery();
}

export { KNXNetConnection, KNXNetRoutingOptions, KNXNetTunnelingOptions, DiscoveryEndpoint, DiscoveryOptions } from './types';
export { KNX_CONSTANTS } from './constants';
export { KNXNetDiscovery } from './discovery';
export { KNXNetTunnelingImpl } from './tunneling';
export { CEMIFrame, CEMIMessageCode, Priority } from './frames';