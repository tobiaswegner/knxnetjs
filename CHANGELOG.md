# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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