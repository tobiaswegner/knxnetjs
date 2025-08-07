# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.7.0] - 2025-08-07

### Changed
- **Code Organization**: Moved routing and tunneling implementations to new `interfaces/` subdirectory
- Restructured project for better separation of interface implementations
- Updated import paths throughout codebase to reflect new directory structure

### Technical Details
- Created `src/interfaces/` directory for better code organization
- Moved `routing.ts` and `tunneling.ts` to `src/interfaces/` subdirectory
- Updated all import statements to use relative paths from new location
- Build verification confirms all imports and compilation work correctly

## [1.6.0] - 2025-08-03

### Added
- **Practical Examples Collection**: Added comprehensive examples directory with real-world usage patterns
- Basic routing example demonstrating frame listening and sending
- Advanced tunneling control example with device automation (lights, dimmers, temperature sensors)
- Examples showcase common KNX home automation scenarios and best practices
- Ready-to-run Node.js scripts with proper error handling and graceful shutdown

### Documentation
- Enhanced README.md with complete package documentation and usage guides
- Comprehensive API documentation with TypeScript examples
- CLI usage guide with all supported commands and options
- Troubleshooting section for common integration issues
- Protocol support details and network requirements

### Technical Details
- Examples use CommonJS format for broad Node.js compatibility
- Real-world group address patterns and device control commands
- Proper KNX data type handling (switches, dimmers, temperature values)
- Production-ready error handling and connection management

## [1.5.0] - 2025-08-03

### Added
- Comprehensive Jest testing framework with TypeScript support
- Complete cEMI frame parsing test suite with 27 test cases
- Support for extended frame Control Field 2 in frame creation
- Proper TPCI (6-bit) and APCI (10-bit) parsing according to KNX specification
- Enhanced frame validation for various cEMI frame types

### Fixed
- **Critical cEMI frame parsing issues** with additional information handling
- Incorrect data length interpretation (now correctly represents application payload bytes)
- Extended frame creation missing Control Field 2 byte
- TPCI/APCI bit field parsing for proper 16-bit transport/application control
- Address offset calculations for both standard and extended frames
- Control Field 2 integration with length field in standard frames

### Technical Details
- cEMI data length field correctly represents application payload bytes (excluding TPCI/APCI)
- TPCI uses 6 bits, APCI uses 10 bits (total 16 bits = 2 bytes minimum for data)
- Extended frame creation now includes proper Control Field 2
- Comprehensive test coverage validates frame parsing edge cases
- Jest testing infrastructure for continuous validation

## [1.4.0] - 2025-08-02

### Added
- New CEMIFrame class for structured cEMI frame handling and parsing
- CEMIFrame.toFormattedString() method for enhanced frame display formatting
- CEMIFrame validation with isValidBuffer() method
- Export of CEMIFrame, CEMIMessageCode, and Priority types from main index
- **Busmonitor mode support** for KNXnet/IP tunneling connections
- New `createBusmonitor()` function for read-only bus monitoring
- CLI `--busmonitor` option for enhanced bus traffic monitoring

### Changed
- Updated KNXNetConnection interface to use CEMIFrame objects instead of raw buffers
- Enhanced CLI frame formatting using new CEMIFrame.toFormattedString() method
- Improved error handling for invalid cEMI frames in both routing and tunneling
- Refactored routing and tunneling implementations to use structured CEMIFrame objects
- Better type safety with CEMIFrame-based send() and recv event handling
- Enhanced tunneling implementation with busmonitor mode support

### Technical Details
- Centralized cEMI frame parsing and validation logic
- Enhanced frame debugging and troubleshooting capabilities
- Improved code maintainability with structured frame objects
- Better error reporting for malformed cEMI frames
- Busmonitor mode prevents frame transmission (read-only operation)
- Validation ensures busmonitor mode requires tunneling connection
- Proper KNXnet/IP busmonitor protocol implementation using layer type 0x80
- Connection type remains 0x04 (tunneling) with busmonitor layer specification

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