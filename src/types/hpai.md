# HPAI (Host Protocol Address Info) Specification

## Overview

The HPAI (Host Protocol Address Info) structure is a fundamental component in KNXnet/IP communication that encapsulates network endpoint information. This specification defines the data structure, serialization methods, and validation requirements for HPAI implementation.

## Data Structure

### Core Interface

```typescript
interface HPAI {
  hostProtocol: number;
  address: string;
  port: number;
}
```

### Host Protocol Types

```typescript
enum HostProtocol {
  IPV4_UDP = 0x01,
  IPV4_TCP = 0x02
}
```

## Wire Format

The HPAI structure is serialized as an 8-byte binary structure:

```
Byte 0: Structure Length (0x08)
Byte 1: Host Protocol Type
Bytes 2-5: IPv4 Address (4 bytes, network byte order)
Bytes 6-7: Port Number (2 bytes, network byte order)
```

### Field Descriptions

- **Structure Length**: Always 0x08 (8 bytes total)
- **Host Protocol Type**: Protocol identifier (see HostProtocol enum)
- **IPv4 Address**: 32-bit IPv4 address in network byte order
- **Port Number**: 16-bit port number in network byte order (0 = use source port from UDP)

## KNXnet/IP Protocol Specifics

### Port 0 Behavior

In KNXnet/IP protocol, port 0 has special meaning:
- **Discovery responses**: Devices often use port 0 to indicate the client should use the source port from the received UDP packet
- **Connection management**: When a server responds with port 0, it means "use the port you sent the request from"
- **Protocol compliance**: Port 0 is a valid and commonly used value, not an error condition

This behavior allows for automatic port selection and NAT traversal in network configurations.

## Implementation Requirements

### Class Definition

```typescript
export class HPAI {
  public readonly hostProtocol: number;
  public readonly address: string;
  public readonly port: number;

  constructor(hostProtocol: number, address: string, port: number);
  static fromBuffer(buffer: Buffer): HPAI;
  toBuffer(): Buffer;
  isValid(): boolean;
  toString(): string;
}
```

### Serialization Methods

#### `fromBuffer(buffer: Buffer): HPAI`

**Purpose**: Deserialize a HPAI structure from a binary buffer

**Parameters**:
- `buffer`: Buffer containing the 8-byte HPAI structure

**Validation Requirements**:
- Buffer must be exactly 8 bytes long
- First byte (structure length) must be 0x08
- Host protocol must be a valid value (0x01 or 0x02)
- IPv4 address bytes must form a valid address string
- Port number must be in valid range (0-65535)

**Error Conditions**:
- Throw error if buffer length ≠ 8
- Throw error if structure length ≠ 0x08
- Throw error if host protocol is invalid
- Throw error if resulting address is invalid

#### `toBuffer(): Buffer`

**Purpose**: Serialize the HPAI structure to a binary buffer

**Returns**: 8-byte Buffer containing the serialized HPAI structure

**Implementation**:
1. Allocate 8-byte buffer
2. Write structure length (0x08) at offset 0
3. Write host protocol at offset 1
4. Parse IPv4 address string and write 4 bytes at offset 2-5
5. Write port number (big-endian) at offset 6-7

### Validation Methods

#### `isValid(): boolean`

**Purpose**: Validate the current HPAI instance

**Validation Rules**:
- Host protocol must be valid (IPV4_UDP or IPV4_TCP)
- Address must be a valid IPv4 address string
- Port must be in range 0-65535 (0 = use source port from UDP packet)
- Address must not be empty or null

### Utility Methods

#### `toString(): string`

**Purpose**: Return human-readable representation

**Format**: `{protocol}://{address}:{port}`

**Examples**:
- `UDP://192.168.1.1:3671`
- `TCP://10.0.0.1:3671`
- `UDP://0.0.0.0:0` (use source address and port)

## Unit Test Requirements

### Test Categories

#### 1. Serialization Tests

```typescript
describe('HPAI Serialization', () => {
  test('should serialize valid HPAI to buffer');
  test('should deserialize valid buffer to HPAI');
  test('should round-trip serialize/deserialize');
  test('should handle edge case addresses (0.0.0.0, 255.255.255.255)');
  test('should handle edge case ports (0, 1, 65535)');
});
```

#### 2. Validation Tests

```typescript
describe('HPAI Validation', () => {
  test('should validate correct HPAI structures');
  test('should reject invalid host protocols');
  test('should reject invalid IP addresses');
  test('should reject invalid port numbers');
  test('should reject ports outside valid range');
});
```

#### 3. Error Handling Tests

```typescript
describe('HPAI Error Handling', () => {
  test('should throw on buffer too short');
  test('should throw on buffer too long');
  test('should throw on invalid structure length');
  test('should throw on malformed IP address');
  test('should provide meaningful error messages');
});
```

#### 4. Buffer Format Tests

```typescript
describe('HPAI Buffer Format', () => {
  test('should create correct byte sequence for known values');
  test('should parse known byte sequences correctly');
  test('should handle big-endian byte order for addresses');
  test('should handle big-endian byte order for ports');
});
```

### Test Data Sets

#### Valid Test Cases

```typescript
const validHPAIs = [
  { hostProtocol: 0x01, address: '192.168.1.1', port: 3671 },
  { hostProtocol: 0x02, address: '10.0.0.1', port: 3671 },
  { hostProtocol: 0x01, address: '0.0.0.0', port: 0 },
  { hostProtocol: 0x01, address: '255.255.255.255', port: 65535 }
];
```

#### Invalid Test Cases

```typescript
const invalidHPAIs = [
  { hostProtocol: 0x00, address: '192.168.1.1', port: 3671 }, // Invalid protocol
  { hostProtocol: 0x01, address: '256.1.1.1', port: 3671 },   // Invalid IP
  { hostProtocol: 0x01, address: '192.168.1.1', port: -1 },   // Invalid port
  { hostProtocol: 0x01, address: '', port: 3671 },            // Empty address
  { hostProtocol: 0x03, address: '192.168.1.1', port: 3671 }  // Unsupported protocol
];
```

#### Binary Test Vectors

```typescript
const binaryTestVectors = [
  {
    description: 'Standard KNXnet/IP endpoint',
    hapi: { hostProtocol: 0x01, address: '192.168.1.100', port: 3671 },
    buffer: Buffer.from([0x08, 0x01, 0xC0, 0xA8, 0x01, 0x64, 0x0E, 0x57])
  },
  {
    description: 'TCP endpoint',
    hapi: { hostProtocol: 0x02, address: '10.0.0.1', port: 80 },
    buffer: Buffer.from([0x08, 0x02, 0x0A, 0x00, 0x00, 0x01, 0x00, 0x50])
  }
];
```

## Integration with Existing Codebase

### Compatibility with HPAI Interface

The HPAI implementation should maintain compatibility with the existing `HPAI` interface defined in `src/types.ts`:

```typescript
export interface HPAI {
  hostProtocol: number;
  address: string;
  port: number;
}
```

### Usage in Frame Structures

HPAI instances are commonly used in:
- Connection establishment frames
- Discovery response frames
- Heartbeat frames
- Error response frames

### File Organization

- Implementation: `src/types/hpai.ts`
- Unit tests: `src/types/hpai.test.ts`
- Type exports: Export from `src/types/index.ts`

## Performance Considerations

- Buffer allocation should be efficient for high-frequency operations
- IP address parsing should be optimized for common cases
- Validation should be fast for real-time communication

## Security Considerations

- Validate all input buffers to prevent buffer overflow attacks
- Sanitize IP address strings to prevent injection attacks
- Enforce strict parsing to prevent malformed data processing
- Consider rate limiting for buffer processing in network scenarios