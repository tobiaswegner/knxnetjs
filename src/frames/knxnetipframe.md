# KNXnetIPFrame

Class `KNXnetIPFrame` encapsulates a KNXnet/IP frame with the following header and payload:

- 1 byte header size (default `KNX_CONSTANTS.HEADER_SIZE`, 6 bytes)
- 1 byte header version (default `KNX_CONSTANTS.KNXNETIP_VERSION`, 0x10)
- 2 byte KNXnetIP service
- 2 byte telegram length

After the header, arbitrary payload is stored.

## Interface

- **Constructor:**
  - `KNXnetIPFrame(service: number, buffer : Buffer)`
    - Creates a frame with the given service and payload.
- **Static method:**
  - `static fromBuffer(buffer : Buffer) : KNXnetIPFrame`
    - Parses a buffer and returns a `KNXnetIPFrame` instance.
- **Method:**
  - `toBuffer() : Buffer`
    - Serializes the frame to a `Buffer`.
- **Method:**
  - `isValid() : bool`
    - Returns true if the header size and version are valid (matches KNXnet/IP spec).

## Unit Tests

- **Constructor and Serialization:**
  - Construct a frame with a known service and payload, serialize with `toBuffer()`, and check the buffer contents match the expected header and payload bytes.
- **Parsing from Buffer:**
  - Create a valid buffer, parse with `fromBuffer()`, and verify all fields (header, service, payload) are correct.
- **isValid Method:**
  - Test that frames with correct header size/version return true, and frames with incorrect values return false.
- **Round-trip Consistency:**
  - Serialize a frame to a buffer, then parse it back with `fromBuffer()`, and check that the resulting frame matches the original.
- **Edge Cases:**
  - Test with empty payloads, maximum payload size, and malformed/short buffers to ensure robust error handling.
