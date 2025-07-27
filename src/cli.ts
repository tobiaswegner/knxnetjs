#!/usr/bin/env node

import { createRouting } from './index';
import { KNXNetConnection } from './types';

interface CLIOptions {
  multicastAddress?: string;
  port?: number;
  help?: boolean;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '-h':
      case '--help':
        options.help = true;
        break;
      case '-a':
      case '--address':
        if (i + 1 < args.length) {
          const addr = args[++i];
          if (addr) {
            options.multicastAddress = addr;
          }
        }
        break;
      case '-p':
      case '--port':
        if (i + 1 < args.length) {
          const portStr = args[++i];
          if (portStr) {
            const port = parseInt(portStr, 10);
            if (!isNaN(port)) {
              options.port = port;
            }
          }
        }
        break;
      case 'dump':
        break;
      default:
        if (arg && arg.startsWith('-')) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
        break;
    }
  }
  
  return options;
}

function printHelp(): void {
  console.log(`
knxnetjs - KNXnet/IP CLI Tool

Usage: knxnetjs dump [options]

Commands:
  dump                    Connect to KNX network and dump all received frames

Options:
  -a, --address <addr>    Multicast address (default: 224.0.23.12)
  -p, --port <port>       Port number (default: 3671)
  -h, --help              Show this help message

Examples:
  knxnetjs dump                              # Use default settings
  knxnetjs dump -a 224.0.23.12 -p 3671     # Custom address and port
`);
}

function formatCemiFrame(frame: Buffer): string {
  if (frame.length < 2) {
    return 'Invalid CEMI frame (too short)';
  }
  
  const messageCode = frame.readUInt8(0);
  const ctrl1 = frame.length > 1 ? frame.readUInt8(1) : 0;
  
  let messageType = 'Unknown';
  switch (messageCode) {
    case 0x11: messageType = 'L_DATA.req'; break;
    case 0x2E: messageType = 'L_DATA.con'; break;
    case 0x29: messageType = 'L_DATA.ind'; break;
  }
  
  const priority = (ctrl1 >> 2) & 0x03;
  const routing = (ctrl1 >> 4) & 0x07;
  
  let output = `[${new Date().toISOString()}] ${messageType}`;
  output += ` | Routing: ${routing} | Priority: ${priority}`;
  
  if (frame.length >= 8) {
    const sourceAddress = frame.readUInt16BE(2);
    const destAddress = frame.readUInt16BE(4);
    const length = frame.readUInt8(6);
    
    output += ` | Src: ${(sourceAddress >> 12) & 0x0F}.${(sourceAddress >> 8) & 0x0F}.${sourceAddress & 0xFF}`;
    output += ` | Dst: ${(destAddress >> 11) & 0x1F}/${(destAddress >> 8) & 0x07}/${destAddress & 0xFF}`;
    output += ` | Length: ${length}`;
    
    if (frame.length > 7) {
      const data = frame.subarray(7);
      output += ` | Data: ${data.toString('hex').toUpperCase()}`;
    }
  }
  
  output += ` | Raw: ${frame.toString('hex').toUpperCase()}`;
  
  return output;
}

async function startFrameDump(options: CLIOptions): Promise<void> {
  console.log('Starting KNXnet/IP routing connection...');
  console.log(`Multicast Address: ${options.multicastAddress || '224.0.23.12'}`);
  console.log(`Port: ${options.port || 3671}`);
  console.log('Press Ctrl+C to stop\n');
  
  const connection: KNXNetConnection = createRouting(options.multicastAddress, options.port);
  
  connection.on('recv', (frame: Buffer) => {
    console.log(formatCemiFrame(frame));
  });
  
  connection.on('error', (error: Error) => {
    console.error('Connection error:', error.message);
  });
  
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await connection.close();
    process.exit(0);
  });
  
  try {
    await connection.connect();
    console.log('Connected! Listening for KNX frames...\n');
  } catch (error) {
    console.error('Failed to connect:', (error as Error).message);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const options = parseArgs();
  const args = process.argv.slice(2);
  
  if (options.help || args.length === 0) {
    printHelp();
    return;
  }
  
  if (args[0] === 'dump') {
    await startFrameDump(options);
  } else {
    console.error(`Unknown command: ${args[0]}`);
    console.error('Use "knxnetjs --help" for usage information');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
}