# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2025-07-27

### Added
- KNXnet/IP tunneling connection support with full protocol implementation
- New `-t`/`--tunnel` option for CLI dump command to use tunneling instead of routing
- KNXNetTunnelingImpl class implementing complete tunneling lifecycle
- Tunneling protocol support: CONNECT_REQUEST/RESPONSE, TUNNELLING_REQUEST/ACK, DISCONNECT_REQUEST
- Connection state monitoring with heartbeat mechanism (CONNECTIONSTATE_REQUEST/RESPONSE)
- Automatic sequence counter management for tunneling frames
- Support for both "ip" and "ip:port" tunnel address formats in CLI
- `createTunneling()` function in index.ts with basic parameter interface

### Changed
- Enhanced CLI with tunneling mode support alongside existing routing mode
- Updated help text with tunneling examples and usage instructions
- Improved socket binding to handle automatic port assignment when localPort is 0
- Fixed connection response parsing for servers returning 0.0.0.0:0 endpoints

### Technical Details
- Full KNXnet/IP Tunneling specification compliance
- UDP unicast communication with connection management
- Proper HPAI (Host Protocol Address Information) handling
- Connection timeout and heartbeat interval configuration
- Graceful connection establishment and teardown procedures

## [1.2.0] - 2025-07-27

### Added
- KNXnet/IP device discovery functionality based on Device Management standard v01.06.02
- New `knxnetjs discover` command for finding KNX devices on the network
- KNXNetDiscovery class implementing SEARCH_REQUEST/SEARCH_RESPONSE protocol
- Comprehensive device information parsing including KNX addresses, MAC addresses, and serial numbers
- Service family detection for device capabilities (Core, Management, Tunnelling, Routing)
- Real-time discovery with formatted output and device details
- Discovery timeout configuration via `--timeout` option

### Changed
- Enhanced constants with all KNXnet/IP service types (Core, Management, Tunnelling, Routing)
- Improved CLI help system with discovery command documentation
- Updated TypeScript interfaces for discovery endpoints and options

### Technical Details
- Full compliance with KNXnet/IP Core and Device Management specifications
- UDP multicast discovery protocol implementation
- DIB (Device Information Block) parsing for hardware information
- Service family capability detection and mapping
- Enhanced error handling and network troubleshooting guidance

## [1.1.0] - 2025-07-27

### Added
- CLI command for KNXnet/IP routing connection and frame dumping
- New `knxnetjs` binary with `dump` command to listen for and display KNX frames
- Command line options for custom multicast address and port configuration
- Detailed frame formatting with timestamp, message type, routing info, addresses, and raw data
- Help system and usage documentation for CLI tool
- Enhanced TypeScript interface for KNXNetConnection with error event support

### Changed
- Updated KNXNetConnection interface to include `connect()` method and error event handler
- Improved KNXNetRoutingImpl class with proper method overloading for event handlers
- Code formatting improvements (applied by linter)

### Technical Details
- Added CLI entry point in package.json (`bin` field)
- CLI supports custom multicast addresses and ports via `-a`/`--address` and `-p`/`--port` flags
- Frame output includes parsed CEMI information with source/destination addresses
- Graceful shutdown handling with Ctrl+C signal processing

## [1.0.0] - 2025-01-27

### Added

- Initial release of reworked knxnetjs library in TypeScript
- `createRouting()` function for creating KNXnet/IP routing connections
- Support for KNXnet/IP Routing protocol v01.05.01
- UDP multicast communication on standard port 3671
- Standard multicast address 224.0.23.12 support
- ROUTING_INDICATION frame handling for KNX telegram transmission
- ROUTING_LOST_MESSAGE frame handling for lost message notifications
- ROUTING_BUSY frame handling for flow control
- Routing counter validation and processing
- Auto-connect functionality for seamless connection management
- Event-driven architecture with 'recv', 'lostMessage', 'busy', and 'error' events
- Proper cEMI frame encapsulation and parsing
- TypeScript definitions and interfaces
- Comprehensive constants for KNX protocol values

### Technical Implementation

- Full compliance with KNX Standard Routing KNXnet/IP specification
- UDP multicast socket management with membership handling
- Frame parsing with proper header validation
- Routing counter extraction from cEMI frames
- Flow control mechanisms for network congestion handling
- Error handling for malformed frames and network issues