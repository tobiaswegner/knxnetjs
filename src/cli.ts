#!/usr/bin/env node

import {
  createRouting,
  createTunneling,
  createBusmonitor,
  createUSB,
  createUSBBusmonitor,
  KNXUSBImpl,
  discoverInterfaces,
  KNXInterfaceInformation,
  createManagement,
} from "./index";
import { KNXBusInterface } from "./types";
import { KNX_CONSTANTS } from "./constants";
import { CEMIFrame } from "./frames";

interface CLIOptions {
  multicastAddress?: string;
  port?: number;
  timeout?: number;
  tunnel?: string;
  usb?: boolean;
  usbDevice?: string;
  busmonitor?: boolean;
  help?: boolean;
  // Property write options
  interfaceObject?: number;
  objectInstance?: number;
  propertyId?: number;
  numberOfElements?: number;
  startIndex?: number;
  data?: string;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "-h":
      case "--help":
        options.help = true;
        break;
      case "-a":
      case "--address":
        if (i + 1 < args.length) {
          const addr = args[++i];
          if (addr) {
            options.multicastAddress = addr;
          }
        }
        break;
      case "-p":
      case "--port":
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
      case "-t":
      case "--tunnel":
        if (i + 1 < args.length) {
          const tunnelAddr = args[++i];
          if (tunnelAddr) {
            options.tunnel = tunnelAddr;
          }
        }
        break;
      case "--timeout":
        if (i + 1 < args.length) {
          const timeoutStr = args[++i];
          if (timeoutStr) {
            const timeout = parseInt(timeoutStr, 10);
            if (!isNaN(timeout)) {
              options.timeout = timeout;
            }
          }
        }
        break;
      case "--busmonitor":
        options.busmonitor = true;
        break;
      case "-u":
      case "--usb":
        options.usb = true;
        break;
      case "--usb-device":
        if (i + 1 < args.length) {
          const usbDevice = args[++i];
          if (usbDevice) {
            options.usbDevice = usbDevice;
          }
        }
        break;
      case "--interface-object":
        if (i + 1 < args.length) {
          const interfaceObjectStr = args[++i];
          if (interfaceObjectStr) {
            const interfaceObject = parseInt(interfaceObjectStr, 16);
            if (!isNaN(interfaceObject)) {
              options.interfaceObject = interfaceObject;
            }
          }
        }
        break;
      case "--object-instance":
        if (i + 1 < args.length) {
          const objectInstanceStr = args[++i];
          if (objectInstanceStr) {
            const objectInstance = parseInt(objectInstanceStr, 10);
            if (!isNaN(objectInstance)) {
              options.objectInstance = objectInstance;
            }
          }
        }
        break;
      case "--property-id":
        if (i + 1 < args.length) {
          const propertyIdStr = args[++i];
          if (propertyIdStr) {
            const propertyId = parseInt(propertyIdStr, 10);
            if (!isNaN(propertyId)) {
              options.propertyId = propertyId;
            }
          }
        }
        break;
      case "--elements":
        if (i + 1 < args.length) {
          const elementsStr = args[++i];
          if (elementsStr) {
            const elements = parseInt(elementsStr, 10);
            if (!isNaN(elements)) {
              options.numberOfElements = elements;
            }
          }
        }
        break;
      case "--start-index":
        if (i + 1 < args.length) {
          const startIndexStr = args[++i];
          if (startIndexStr) {
            const startIndex = parseInt(startIndexStr, 10);
            if (!isNaN(startIndex)) {
              options.startIndex = startIndex;
            }
          }
        }
        break;
      case "--data":
        if (i + 1 < args.length) {
          const data = args[++i];
          if (data) {
            options.data = data;
          }
        }
        break;
      case "dump":
      case "discover":
      case "writeProperty":
      case "readProperty":
        break;
      default:
        if (arg && arg.startsWith("-")) {
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

Usage: knxnetjs <command> [options]

Commands:
  dump                    Connect to KNX network and dump all received frames
  discover                Discover KNXnet/IP endpoints on the network
  writeProperty           Write a property to a KNX interface object
  readProperty            Read a property from a KNX interface object

Options:
  -a, --address <addr>    Multicast address for routing (default: 224.0.23.12)
  -p, --port <port>       Port number (default: 3671)
  -t, --tunnel <addr>     Use tunneling to specified server address instead of routing
  -u, --usb               Use USB KNX interface instead of network
  --usb-device <path>     Specify USB device path (auto-detect if not provided)
  --busmonitor            Enable busmonitor mode (read-only)
  --timeout <ms>          Discovery timeout in milliseconds (default: 3000)
  -h, --help              Show this help message

Property Write Options:
  --interface-object <hex>  Interface object type (hex format, e.g., 0x0008)
  --object-instance <num>   Object instance (default: 1)
  --property-id <id>        Property ID (e.g., 52 for PID_COMM_MODE)
  --elements <count>        Number of elements (default: 1)
  --start-index <idx>       Start index (default: 1)
  --data <hex>              Data to write in hex format (e.g., 00 or 00FF)

Examples:
  # Frame dumping
  knxnetjs dump                              # Dump via routing (multicast)
  knxnetjs dump -a 224.0.23.12 -p 3671     # Custom routing address and port
  knxnetjs dump -t 192.168.1.100            # Dump via tunneling to server
  knxnetjs dump -t 192.168.1.100:3672       # Tunneling with custom port
  knxnetjs dump -t 192.168.1.100 --busmonitor  # Busmonitor mode (read-only)
  knxnetjs dump -u                           # Dump via USB interface
  knxnetjs dump -u --usb-device /dev/hidraw0 # Dump via specific USB device
  knxnetjs dump -u --busmonitor              # USB busmonitor mode (read-only)
  
  # Discovery
  knxnetjs discover                          # Discover KNX devices
  knxnetjs discover --timeout 5000          # Discover with 5 second timeout
  
  # Property writing
  knxnetjs writeProperty -u --interface-object 0x0008 --property-id 52 --data 00
  knxnetjs writeProperty -t 192.168.1.100 --interface-object 0x0008 --object-instance 1 --property-id 52 --data 01
  
  # Property reading
  knxnetjs readProperty -u --interface-object 0x0008 --property-id 52
  knxnetjs readProperty -t 192.168.1.100 --interface-object 0x0008 --object-instance 1 --property-id 52 --elements 2
`);
}

async function startFrameDump(options: CLIOptions): Promise<void> {
  let connection: KNXBusInterface;

  if (options.usb) {
    // USB KNX interface connection
    const usbOptions = {
      ...(options.usbDevice && { devicePath: options.usbDevice }),
      ...(options.busmonitor !== undefined && {
        busmonitorMode: options.busmonitor,
      }),
    };

    if (options.busmonitor) {
      console.log("Starting USB KNX busmonitor connection...");
      console.log(`Device: ${options.usbDevice || "Auto-detect"}`);
      console.log(`Mode: Busmonitor (read-only)`);
      console.log("Press Ctrl+C to stop\n");

      connection = createUSBBusmonitor(usbOptions);
    } else {
      console.log("Starting USB KNX connection...");
      console.log(`Device: ${options.usbDevice || "Auto-detect"}`);
      console.log("Press Ctrl+C to stop\n");

      connection = createUSB(usbOptions);
    }
  } else if (options.tunnel) {
    // Parse tunnel address (support both "ip" and "ip:port" formats)
    const tunnelParts = options.tunnel.split(":");
    const serverAddress = tunnelParts[0];
    if (!serverAddress) {
      throw new Error("Invalid tunnel address format");
    }
    const serverPort = tunnelParts[1]
      ? parseInt(tunnelParts[1], 10)
      : undefined;

    if (options.busmonitor) {
      console.log("Starting KNXnet/IP busmonitor connection...");
      console.log(`Server Address: ${serverAddress}`);
      console.log(`Server Port: ${serverPort || 3671}`);
      console.log(`Mode: Busmonitor (read-only)`);
      console.log("Press Ctrl+C to stop\n");

      connection = createBusmonitor(serverAddress, serverPort);
    } else {
      console.log("Starting KNXnet/IP tunneling connection...");
      console.log(`Server Address: ${serverAddress}`);
      console.log(`Server Port: ${serverPort || 3671}`);
      console.log("Press Ctrl+C to stop\n");

      connection = createTunneling(serverAddress, serverPort);
    }
  } else {
    if (options.busmonitor) {
      console.error(
        "Error: --busmonitor option requires tunneling mode (-t/--tunnel) or USB mode (-u/--usb)"
      );
      console.error(
        "Busmonitor mode is only available with tunneling or USB connections"
      );
      process.exit(1);
    }

    console.log("Starting KNXnet/IP routing connection...");
    console.log(
      `Multicast Address: ${options.multicastAddress || "224.0.23.12"}`
    );
    console.log(`Port: ${options.port || 3671}`);
    console.log("Press Ctrl+C to stop\n");

    connection = createRouting(options.multicastAddress, options.port);
  }

  connection.on("recv", (frame: CEMIFrame) => {
    console.log(frame.toFormattedString());
  });

  connection.on("error", (error: Error) => {
    console.error("Connection error:", error.message);
  });

  if (options.usb) {
    (connection as KNXUSBImpl).on("reset", () => {
      console.log("Interface reset");
    });
  }

  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    await connection.close();
    process.exit(0);
  });

  try {
    await connection.open();
    if (options.usb) {
      if (options.busmonitor) {
        console.log(
          "USB KNX busmonitor connection established! Monitoring KNX traffic...\n"
        );
      } else {
        console.log(
          "USB KNX connection established! Listening for KNX frames...\n"
        );
      }
    } else if (options.tunnel) {
      if (options.busmonitor) {
        console.log(
          "Busmonitor connection established! Monitoring KNX traffic...\n"
        );
      } else {
        console.log(
          "Tunneling connection established! Listening for KNX frames...\n"
        );
      }
    } else {
      console.log(
        "Routing connection established! Listening for KNX frames...\n"
      );
    }
  } catch (error) {
    console.error("Failed to connect:", (error as Error).message);
    process.exit(1);
  }
}

function formatCapabilities(capabilities: number): string {
  const caps: string[] = [];

  if (capabilities & KNX_CONSTANTS.DEVICE_CAPABILITIES.DEVICE_MANAGEMENT) {
    caps.push("Device Management");
  }
  if (capabilities & KNX_CONSTANTS.DEVICE_CAPABILITIES.TUNNELLING) {
    caps.push("Tunnelling");
  }
  if (capabilities & KNX_CONSTANTS.DEVICE_CAPABILITIES.ROUTING) {
    caps.push("Routing");
  }
  if (capabilities & KNX_CONSTANTS.DEVICE_CAPABILITIES.REMOTE_LOGGING) {
    caps.push("Remote Logging");
  }
  if (capabilities & KNX_CONSTANTS.DEVICE_CAPABILITIES.REMOTE_CONFIGURATION) {
    caps.push("Remote Config");
  }
  if (capabilities & KNX_CONSTANTS.DEVICE_CAPABILITIES.OBJECT_SERVER) {
    caps.push("Object Server");
  }

  return caps.length > 0 ? caps.join(", ") : "None";
}

function formatInterfaceResult(interfaceInfo: KNXInterfaceInformation): string {
  let output = `\n┌─ ${interfaceInfo.name}\n`;
  output += `├─ Type: ${interfaceInfo.type.toUpperCase()}\n`;

  if (interfaceInfo.description) {
    output += `├─ Description: ${interfaceInfo.description}\n`;
  }

  // Network interface details
  if (interfaceInfo.address) {
    output += `├─ Address: ${interfaceInfo.address}:${
      interfaceInfo.port || 3671
    }\n`;
  }
  if (interfaceInfo.capabilities !== undefined) {
    output += `├─ Capabilities: ${formatCapabilities(
      interfaceInfo.capabilities
    )}\n`;
  }
  if (interfaceInfo.knxAddress) {
    output += `├─ KNX Address: ${interfaceInfo.knxAddress}\n`;
  }
  if (interfaceInfo.macAddress) {
    output += `├─ MAC Address: ${interfaceInfo.macAddress}\n`;
  }
  if (interfaceInfo.serialNumber) {
    output += `├─ Serial Number: ${interfaceInfo.serialNumber}\n`;
  }
  if (
    interfaceInfo.friendlyName &&
    interfaceInfo.friendlyName !== interfaceInfo.name
  ) {
    output += `├─ Friendly Name: ${interfaceInfo.friendlyName}\n`;
  }

  // USB interface details
  if (interfaceInfo.devicePath) {
    output += `├─ Device Path: ${interfaceInfo.devicePath}\n`;
  }
  if (
    interfaceInfo.vendorId !== undefined &&
    interfaceInfo.productId !== undefined
  ) {
    output += `├─ USB ID: ${interfaceInfo.vendorId
      .toString(16)
      .padStart(4, "0")}:${interfaceInfo.productId
      .toString(16)
      .padStart(4, "0")}\n`;
  }
  if (interfaceInfo.manufacturer) {
    output += `├─ Manufacturer: ${interfaceInfo.manufacturer}\n`;
  }
  if (interfaceInfo.product) {
    output += `├─ Product: ${interfaceInfo.product}\n`;
  }

  // Show supported features
  const features = [];
  if (interfaceInfo.supportsRouting()) features.push("Routing");
  if (interfaceInfo.supportsTunneling()) features.push("Tunneling");
  if (interfaceInfo.supportsBusmonitor()) features.push("Busmonitor");

  if (features.length > 0) {
    output += `├─ Supported: ${features.join(", ")}\n`;
  }

  output += `└─ Status: Available`;

  return output;
}

async function startDiscovery(options: CLIOptions): Promise<void> {
  console.log("Starting KNX interface discovery...");
  console.log(
    `Timeout: ${
      options.timeout || KNX_CONSTANTS.DISCOVERY.DEFAULT_SEARCH_TIMEOUT
    }ms\n`
  );

  let interfaceCount = 0;

  try {
    await discoverInterfaces(
      (interfaceInfo: KNXInterfaceInformation) => {
        interfaceCount++;
        console.log(formatInterfaceResult(interfaceInfo));
      },
      {
        timeout:
          options.timeout || KNX_CONSTANTS.DISCOVERY.DEFAULT_SEARCH_TIMEOUT,
        includeUSB: true,
      }
    );

    console.log(`\n┌────────────────────────────────────┐`);
    console.log(`│ Discovery completed                │`);
    console.log(
      `│ Found ${interfaceCount
        .toString()
        .padStart(2, " ")} interface(s)                │`
    );
    console.log(`└────────────────────────────────────┘\n`);

    if (interfaceCount === 0) {
      console.log("No KNX interfaces found.");
      console.log("Make sure:");
      console.log("- KNX devices are connected and powered on");
      console.log("- Your network allows UDP multicast traffic");
      console.log("- USB KNX interfaces are properly connected");
      console.log("- Devices are on the same network segment");
    }
  } catch (error) {
    console.error("Failed to discover interfaces:", (error as Error).message);
    process.exit(1);
  }
}

async function writeProperty(options: CLIOptions): Promise<void> {
  // Validate required options
  if (options.interfaceObject === undefined) {
    console.error("Error: --interface-object is required");
    process.exit(1);
  }
  if (options.propertyId === undefined) {
    console.error("Error: --property-id is required");
    process.exit(1);
  }
  if (!options.data) {
    console.error("Error: --data is required");
    process.exit(1);
  }

  // Set defaults
  const objectInstance = options.objectInstance ?? 1;
  const numberOfElements = options.numberOfElements ?? 1;
  const startIndex = options.startIndex ?? 1;

  // Parse hex data
  let dataBuffer: Buffer;
  try {
    const hexData = options.data.replace(/\s/g, ""); // Remove spaces
    dataBuffer = Buffer.from(hexData, "hex");
  } catch (error) {
    console.error("Error: Invalid hex data format");
    process.exit(1);
  }

  console.log("Property Write Operation");
  console.log(
    `Interface Object: 0x${options.interfaceObject
      .toString(16)
      .padStart(4, "0")
      .toUpperCase()}`
  );
  console.log(`Object Instance: ${objectInstance}`);
  console.log(`Property ID: ${options.propertyId}`);
  console.log(`Number of Elements: ${numberOfElements}`);
  console.log(`Start Index: ${startIndex}`);
  console.log(`Data: ${dataBuffer.toString("hex").toUpperCase()}`);

  let connection: KNXBusInterface | undefined;

  try {
    if (options.usb) {
      // USB KNX interface connection
      const usbOptions = {
        ...(options.usbDevice && { devicePath: options.usbDevice }),
      };

      console.log("\nConnecting to USB KNX interface...");
      connection = createUSB(usbOptions);
    } else if (options.tunnel) {
      // Parse tunnel address
      const tunnelParts = options.tunnel.split(":");
      const serverAddress = tunnelParts[0];
      if (!serverAddress) {
        throw new Error("Invalid tunnel address format");
      }
      const serverPort = tunnelParts[1]
        ? parseInt(tunnelParts[1], 10)
        : undefined;

      console.log(
        `\nConnecting to tunneling server ${serverAddress}:${
          serverPort || 3671
        }...`
      );
      connection = createManagement(serverAddress, serverPort);
    } else {
      console.error(
        "Error: Property write requires either USB (-u) or tunneling (-t) connection"
      );
      console.error(
        "Routing connections do not support property write operations"
      );
      process.exit(1);
    }

    // Set up error handling
    connection.on("error", (error: Error) => {
      console.error("Connection error:", error.message);
      process.exit(1);
    });

    // Open connection
    await connection.open();
    console.log("Connected successfully!");

    // Write property
    console.log("\nWriting property...");
    await connection.writeProperty(
      options.interfaceObject,
      objectInstance,
      options.propertyId,
      numberOfElements,
      startIndex,
      dataBuffer
    );

    console.log("Property write completed successfully!");
  } catch (error) {
    console.error("Failed to write property:", (error as Error).message);
  } finally {
    // Always close connection
    if (connection) {
      try {
        await connection.close();
        console.log("Connection closed.");
      } catch (closeError) {
        console.error(
          "Error closing connection:",
          (closeError as Error).message
        );
      }
    }
  }
}

async function readProperty(options: CLIOptions): Promise<void> {
  // Validate required options
  if (options.interfaceObject === undefined) {
    console.error("Error: --interface-object is required");
    process.exit(1);
  }
  if (options.propertyId === undefined) {
    console.error("Error: --property-id is required");
    process.exit(1);
  }

  // Set defaults
  const objectInstance = options.objectInstance ?? 1;
  const numberOfElements = options.numberOfElements ?? 1;
  const startIndex = options.startIndex ?? 1;

  console.log("Property Read Operation");
  console.log(
    `Interface Object: 0x${options.interfaceObject
      .toString(16)
      .padStart(4, "0")
      .toUpperCase()}`
  );
  console.log(`Object Instance: ${objectInstance}`);
  console.log(`Property ID: ${options.propertyId}`);
  console.log(`Number of Elements: ${numberOfElements}`);
  console.log(`Start Index: ${startIndex}`);

  let connection: KNXBusInterface | undefined;

  try {
    if (options.usb) {
      // USB KNX interface connection
      const usbOptions = {
        ...(options.usbDevice && { devicePath: options.usbDevice }),
      };

      console.log("\nConnecting to USB KNX interface...");
      connection = createUSB(usbOptions);
    } else if (options.tunnel) {
      // Parse tunnel address
      const tunnelParts = options.tunnel.split(":");
      const serverAddress = tunnelParts[0];
      if (!serverAddress) {
        throw new Error("Invalid tunnel address format");
      }
      const serverPort = tunnelParts[1]
        ? parseInt(tunnelParts[1], 10)
        : undefined;

      console.log(
        `\nConnecting to tunneling server ${serverAddress}:${
          serverPort || 3671
        }...`
      );
      connection = createManagement(serverAddress, serverPort);
    } else {
      console.error(
        "Error: Property read requires either USB (-u) or tunneling (-t) connection"
      );
      console.error(
        "Routing connections do not support property read operations"
      );
      process.exit(1);
    }

    // Set up error handling
    connection.on("error", (error: Error) => {
      console.error("Connection error:", error.message);
      process.exit(1);
    });

    // Open connection
    await connection.open();
    console.log("Connected successfully!");

    // Read property
    console.log("\nReading property...");
    const result = await connection.readProperty(
      options.interfaceObject,
      objectInstance,
      options.propertyId,
      numberOfElements,
      startIndex
    );

    console.log("Property read completed successfully!");
    console.log(`Data: ${result.toString("hex").toUpperCase()}`);
    console.log(`Data (decimal): [${Array.from(result).join(", ")}]`);
  } catch (error) {
    console.error("Failed to read property:", (error as Error).message);
  } finally {
    // Always close connection
    if (connection) {
      try {
        await connection.close();
        console.log("Connection closed.");
      } catch (closeError) {
        console.error(
          "Error closing connection:",
          (closeError as Error).message
        );
      }
    }
  }
}

async function main(): Promise<void> {
  const options = parseArgs();
  const args = process.argv.slice(2);

  if (options.help || args.length === 0) {
    printHelp();
    return;
  }

  if (args[0] === "dump") {
    await startFrameDump(options);
  } else if (args[0] === "discover") {
    await startDiscovery(options);
  } else if (args[0] === "writeProperty") {
    await writeProperty(options);
  } else if (args[0] === "readProperty") {
    await readProperty(options);
  } else {
    console.error(`Unknown command: ${args[0]}`);
    console.error('Use "knxnetjs --help" for usage information');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error.message);
    process.exit(1);
  });
}
