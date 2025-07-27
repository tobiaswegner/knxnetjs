import { KNXNetConnection } from './types';
import { KNXNetRoutingImpl } from './routing';
import { KNXNetDiscovery } from './discovery';
import { KNXNetTunnelingImpl } from './tunneling';

export function createRouting(multicastAddress?: string, port?: number): KNXNetConnection {
  const connection = new KNXNetRoutingImpl(multicastAddress, port);
  
  // Auto-connect when first used
  const originalSend = connection.send.bind(connection);
  connection.send = async (data: Buffer) => {
    if (!(connection as any).isConnected) {
      await connection.connect();
    }
    return originalSend(data);
  };
  
  return connection;
}

export function createTunneling(serverAddress: string, serverPort?: number, localPort?: number): KNXNetConnection {
  return new KNXNetTunnelingImpl(serverAddress, serverPort, localPort);
}

export function createDiscovery(): KNXNetDiscovery {
  return new KNXNetDiscovery();
}

export { KNXNetConnection, KNXNetRoutingOptions, KNXNetTunnelingOptions, DiscoveryEndpoint, DiscoveryOptions } from './types';
export { KNX_CONSTANTS } from './constants';
export { KNXNetDiscovery } from './discovery';
export { KNXNetTunnelingImpl } from './tunneling';