# knxnetjs

[![npm version](https://badge.fury.io/js/knxnetjs.svg)](https://badge.fury.io/js/knxnetjs)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-16.0+-green.svg)](https://nodejs.org/)

A modern TypeScript library for KNXnet/IP communication, providing comprehensive support for KNX home automation and building automation systems.

## Features

- **🔌 Multiple Connection Types**: Routing, Tunneling, USB, and Busmonitor modes
- **🔗 USB KNX Interface**: Direct USB HID communication with KNX interfaces
- **🔍 Device Discovery**: Automatic KNX device detection on the network
- **📡 KNXnet/IP Protocol**: Full compliance with KNX specifications
- **🏠 Home Automation**: Perfect for smart home and building automation
- **📊 Bus Monitoring**: Real-time KNX bus traffic analysis (Network + USB)
- **⚡ TypeScript**: Full type safety and modern development experience
- **🧪 Comprehensive Testing**: 27+ test cases ensuring reliability
- **📋 CLI Tool**: Command-line interface for quick debugging and monitoring

## Installation

```bash
npm install knxnetjs
```

## Quick Start

### Basic Routing Connection

```typescript
import { createRouting, CEMIFrame, CEMIMessageCode, Priority } from 'knxnetjs';

// Create a routing connection (multicast)
const connection = createRouting();

// Listen for incoming KNX frames
connection.on('recv', (frame: CEMIFrame) => {
  console.log(`Received: ${frame.toFormattedString()}`);
  console.log(`From: ${frame.sourceAddressString} To: ${frame.destinationAddressString}`);
  console.log(`Data: ${frame.applicationData.toString('hex')}`);
});

// Send a KNX frame
const frame = CEMIFrame.create(
  CEMIMessageCode.L_DATA_REQ,
  0x1101, // Source address: 1.1.1
  0x0801, // Destination address: 0/1/1 (group)
  Buffer.from([0x00, 0x81]), // Data: switch on
  Priority.LOW
);

await connection.send(frame);
```

### Tunneling Connection

```typescript
import { createTunneling } from 'knxnetjs';

// Create a tunneling connection to a KNX/IP interface
const connection = createTunneling('192.168.1.100', 3671);

connection.on('recv', (frame: CEMIFrame) => {
  console.log(`Tunneling received: ${frame.toFormattedString()}`);
});

await connection.connect();
await connection.send(frame);
await connection.close();
```

### USB KNX Interface

```typescript
import { createUSB } from 'knxnetjs';

// Create a USB connection to a KNX interface
const connection = createUSB({
  devicePath: '/dev/hidraw0' // Optional: auto-detect if not specified
});

connection.on('recv', (frame: CEMIFrame) => {
  console.log(`USB received: ${frame.toFormattedString()}`);
});

await connection.connect();
await connection.send(frame);
await connection.close();
```

### Busmonitor Mode (Read-Only)

```typescript
import { createBusmonitor, createUSBBusmonitor } from 'knxnetjs';

// Network busmonitor via tunneling
const networkMonitor = createBusmonitor('192.168.1.100');

// USB busmonitor via direct interface
const usbMonitor = createUSBBusmonitor({
  devicePath: '/dev/hidraw0' // Optional: auto-detect if not specified
});

networkMonitor.on('recv', (frame: CEMIFrame) => {
  console.log(`[NET MONITOR] ${frame.toFormattedString()}`);
  console.log(`  Priority: ${frame.priorityText}`);
  console.log(`  TPCI: 0x${frame.tpci.toString(16)}`);
  console.log(`  APCI: 0x${frame.apci.toString(16)}`);
});

await networkMonitor.connect();
// Busmonitor mode is read-only - cannot send frames
```

### Device Discovery

```typescript
import { createDiscovery } from 'knxnetjs';

const discovery = createDiscovery();

discovery.on('deviceFound', (device) => {
  console.log(`Found device: ${device.name}`);
  console.log(`  Address: ${device.ip}:${device.port}`);
  console.log(`  Capabilities: ${device.capabilities}`);
  console.log(`  KNX Address: ${device.knxAddress}`);
});

// Discover devices on the network
const devices = await discovery.discover({ timeout: 5000 });
console.log(`Discovered ${devices.length} devices`);
```

## CLI Usage

The package includes a command-line tool for testing and debugging:

```bash
# Install globally for CLI access
npm install -g knxnetjs

# Listen to KNX traffic via routing (multicast)
knxnetjs dump

# Listen via tunneling to a specific interface
knxnetjs dump -t 192.168.1.100

# Listen via USB KNX interface
knxnetjs dump -u

# Listen via specific USB device
knxnetjs dump -u --usb-device /dev/hidraw0

# Enable busmonitor mode for detailed traffic analysis
knxnetjs dump -t 192.168.1.100 --busmonitor  # Network busmonitor
knxnetjs dump -u --busmonitor                # USB busmonitor

# Discover KNX devices on the network
knxnetjs discover

# Custom settings
knxnetjs dump -a 224.0.23.12 -p 3671
knxnetjs discover --timeout 10000
```

## Advanced Usage

### Working with cEMI Frames

```typescript
import { CEMIFrame, CEMIMessageCode, Priority } from 'knxnetjs';

// Create a frame manually
const frame = CEMIFrame.create(
  CEMIMessageCode.L_DATA_REQ,
  0x1234, // Source: 1.2.52
  0x0901, // Destination: 0/9/1
  Buffer.from([0x00, 0x80]), // Switch on command
  Priority.LOW,
  6 // Hop count
);

// Parse frame properties
console.log(`Message Type: ${frame.messageType}`);
console.log(`Source: ${frame.sourceAddressString}`);
console.log(`Destination: ${frame.destinationAddressString}`);
console.log(`Is Group Address: ${frame.isGroupAddress}`);
console.log(`Priority: ${frame.priorityText}`);
console.log(`Data Length: ${frame.dataLength}`);
console.log(`Application Data: ${frame.applicationData.toString('hex')}`);

// Create from buffer
const buffer = Buffer.from([0x29, 0x00, 0xBC, 0xD0, 0x11, 0x04, 0x01, 0x00, 0x00, 0x81]);
const parsedFrame = CEMIFrame.fromBuffer(buffer);
```

### Error Handling

```typescript
import { createRouting } from 'knxnetjs';

const connection = createRouting();

connection.on('error', (error) => {
  console.error('KNX Connection Error:', error.message);
  // Handle connection errors
});

connection.on('recv', (frame) => {
  try {
    // Process frame
    if (frame.isValid()) {
      console.log(`Valid frame: ${frame.toFormattedString()}`);
    }
  } catch (error) {
    console.error('Frame processing error:', error);
  }
});
```

### Using with Additional Information

```typescript
// Create frame with additional information
const additionalInfo = [{
  type: 0x03,
  length: 2,
  data: Buffer.from([0x12, 0x34])
}];

const frameWithInfo = CEMIFrame.create(
  CEMIMessageCode.L_DATA_IND,
  0x1101,
  0x0801,
  Buffer.from([0x00, 0x80]),
  Priority.NORMAL,
  5,
  additionalInfo
);

console.log(`Additional Info: ${frameWithInfo.additionalInfo.length} items`);
```

## Configuration Options

### Routing Options

```typescript
import { createRouting } from 'knxnetjs';

const connection = createRouting(
  '224.0.23.12', // Multicast address (default)
  3671           // Port (default)
);
```

### Tunneling Options

```typescript
import { createTunneling } from 'knxnetjs';

const connection = createTunneling(
  '192.168.1.100', // KNX/IP interface address
  3671,            // Server port (default)
  0                // Local port (0 = auto-assign)
);
```

### USB Options

```typescript
import { createUSB, createUSBBusmonitor } from 'knxnetjs';

// Basic USB connection with auto-detection
const connection = createUSB();

// USB connection with specific device path
const connection = createUSB({
  devicePath: '/dev/hidraw0',  // Specific device path
  autoConnect: true,           // Auto-connect on creation (default: true)
  busmonitorMode: false        // Read-only mode (default: false)
});

// USB busmonitor mode
const monitor = createUSBBusmonitor({
  devicePath: '/dev/hidraw1'   // Optional: auto-detect if not specified
});
```

### Discovery Options

```typescript
import { createDiscovery } from 'knxnetjs';

const discovery = createDiscovery();
const devices = await discovery.discover({
  timeout: 5000,              // Discovery timeout in ms
  searchResponseTimeout: 10000 // Response timeout in ms
});
```

## Protocol Support

- **KNXnet/IP Core**: v01.05.01
- **KNXnet/IP Routing**: Full support with multicast communication
- **KNXnet/IP Tunneling**: Full support with connection management
- **KNXnet/IP Device Management**: Device discovery and information
- **USB KNX Interface**: HID protocol with Transfer Protocol support
- **cEMI Frames**: Complete parsing and generation support
- **Standard & Extended Frames**: Both frame types supported
- **Group Communication**: Full support for group addressing

## Requirements

### Network (KNXnet/IP)
- **Multicast Support**: Required for routing mode
- **UDP Port 3671**: Standard KNXnet/IP port
- **Network Segment**: Devices must be on same network for discovery
- **Firewall**: Ensure UDP traffic is allowed

### USB Interface
- **USB HID Drivers**: Required for USB KNX interface communication
- **Device Permissions**: User must have read/write access to HID device
- **Compatible Interfaces**: Standard KNX USB interfaces with HID protocol

## Examples Repository

Check out the `examples/` directory for more comprehensive examples:

- Basic home automation controls
- Advanced frame parsing
- Integration with home automation platforms
- Real-time monitoring dashboards
- Custom protocol implementations

## Testing

Run the comprehensive test suite:

```bash
npm test
```

The library includes 27+ test cases covering:
- cEMI frame parsing and generation
- Connection types (routing, tunneling, busmonitor)
- Device discovery
- Protocol compliance
- Error handling

## Troubleshooting

### Common Issues

1. **No devices found during discovery**
   - Ensure multicast is enabled on your network
   - Check firewall settings for UDP port 3671
   - Verify devices are on the same network segment

2. **Tunneling connection fails**
   - Verify the KNX/IP interface address
   - Check if the interface supports tunneling
   - Ensure the interface isn't already at max connections

3. **USB interface not detected**
   - Check if the USB KNX interface is properly connected
   - Verify device permissions (may require sudo or udev rules)
   - On Linux, check `/dev/hidraw*` devices
   - On Windows, ensure proper HID drivers are installed
   - Try specifying the device path manually with `--usb-device`

4. **USB connection fails**
   - Verify the device path is correct (`ls /dev/hidraw*`)
   - Check if another application is using the interface
   - Ensure your user has permissions to access HID devices
   - Try running with elevated privileges (sudo) temporarily

5. **Busmonitor mode not working**
   - Ensure the interface supports busmonitor mode
   - Some routers disable busmonitor for performance reasons
   - For USB: verify the interface supports read-only monitoring
   - Try different interfaces or update firmware

### Debug Mode

Enable detailed logging for debugging:

```bash
DEBUG=knxnetjs* node your-app.js
```

## Contributing

Contributions are welcome! Please read our contributing guidelines and:

1. Fork the repository
2. Create a feature branch
3. Add tests for your changes
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Related Projects

- [KNX Association](https://www.knx.org/) - Official KNX specifications
- [OpenHAB](https://www.openhab.org/) - Open source home automation
- [Home Assistant](https://www.home-assistant.io/) - Popular home automation platform

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for detailed version history and breaking changes.

---

**knxnetjs** - Modern KNX communication for Node.js applications 🏠⚡