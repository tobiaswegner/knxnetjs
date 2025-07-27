import { KNXNetConnection } from './types';
import { KNXNetRoutingImpl } from './routing';

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

export { KNXNetConnection, KNXNetRoutingOptions } from './types';
export { KNX_CONSTANTS } from './constants';