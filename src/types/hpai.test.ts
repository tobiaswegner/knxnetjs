import { HPAI, HostProtocol } from './hpai';

describe('HPAI Serialization', () => {
  test('should serialize valid HPAI to buffer', () => {
    const hpai = new HPAI(HostProtocol.IPV4_UDP, '192.168.1.100', 3671);
    const buffer = hpai.toBuffer();

    expect(buffer.length).toBe(8);
    expect(buffer.readUInt8(0)).toBe(0x08); // Structure length
    expect(buffer.readUInt8(1)).toBe(0x01); // Host protocol
    expect(buffer.readUInt8(2)).toBe(192);  // IP byte 1
    expect(buffer.readUInt8(3)).toBe(168);  // IP byte 2
    expect(buffer.readUInt8(4)).toBe(1);    // IP byte 3
    expect(buffer.readUInt8(5)).toBe(100);  // IP byte 4
    expect(buffer.readUInt16BE(6)).toBe(3671); // Port
  });

  test('should deserialize valid buffer to HPAI', () => {
    const buffer = Buffer.from([0x08, 0x01, 0xC0, 0xA8, 0x01, 0x64, 0x0E, 0x57]);
    const hpai = HPAI.fromBuffer(buffer);

    expect(hpai.hostProtocol).toBe(HostProtocol.IPV4_UDP);
    expect(hpai.address).toBe('192.168.1.100');
    expect(hpai.port).toBe(3671);
  });

  test('should round-trip serialize/deserialize', () => {
    const original = new HPAI(HostProtocol.IPV4_TCP, '10.0.0.1', 80);
    const buffer = original.toBuffer();
    const deserialized = HPAI.fromBuffer(buffer);

    expect(deserialized.hostProtocol).toBe(original.hostProtocol);
    expect(deserialized.address).toBe(original.address);
    expect(deserialized.port).toBe(original.port);
  });

  test('should handle edge case addresses (0.0.0.0, 255.255.255.255)', () => {
    const hpai1 = new HPAI(HostProtocol.IPV4_UDP, '0.0.0.0', 1);
    const buffer1 = hpai1.toBuffer();
    const deserialized1 = HPAI.fromBuffer(buffer1);
    expect(deserialized1.address).toBe('0.0.0.0');

    const hpai2 = new HPAI(HostProtocol.IPV4_UDP, '255.255.255.255', 65535);
    const buffer2 = hpai2.toBuffer();
    const deserialized2 = HPAI.fromBuffer(buffer2);
    expect(deserialized2.address).toBe('255.255.255.255');
  });

  test('should handle edge case ports (0, 1, 65535)', () => {
    const hpai0 = new HPAI(HostProtocol.IPV4_UDP, '192.168.1.1', 0);
    const buffer0 = hpai0.toBuffer();
    const deserialized0 = HPAI.fromBuffer(buffer0);
    expect(deserialized0.port).toBe(0);

    const hpai1 = new HPAI(HostProtocol.IPV4_UDP, '192.168.1.1', 1);
    const buffer1 = hpai1.toBuffer();
    const deserialized1 = HPAI.fromBuffer(buffer1);
    expect(deserialized1.port).toBe(1);

    const hpai2 = new HPAI(HostProtocol.IPV4_UDP, '192.168.1.1', 65535);
    const buffer2 = hpai2.toBuffer();
    const deserialized2 = HPAI.fromBuffer(buffer2);
    expect(deserialized2.port).toBe(65535);
  });
});

describe('HPAI Validation', () => {
  test('should validate correct HPAI structures', () => {
    const validHPAIs = [
      new HPAI(HostProtocol.IPV4_UDP, '192.168.1.1', 3671),
      new HPAI(HostProtocol.IPV4_TCP, '10.0.0.1', 80),
      new HPAI(HostProtocol.IPV4_UDP, '0.0.0.0', 0),
      new HPAI(HostProtocol.IPV4_UDP, '255.255.255.255', 65535)
    ];

    validHPAIs.forEach(hpai => {
      expect(hpai.isValid()).toBe(true);
    });
  });

  test('should reject invalid host protocols', () => {
    const hpai = new HPAI(0x00, '192.168.1.1', 3671);
    expect(hpai.isValid()).toBe(false);

    const hpai2 = new HPAI(0x03, '192.168.1.1', 3671);
    expect(hpai2.isValid()).toBe(false);
  });

  test('should reject invalid IP addresses', () => {
    const invalidAddresses = [
      '256.1.1.1',     // Octet > 255
      '192.168.1',     // Too few octets
      '192.168.1.1.1', // Too many octets
      '192.168.01.1',  // Leading zero
      '192.168.-1.1',  // Negative number
      'not.an.ip.addr', // Non-numeric
      '',              // Empty string
      '192.168.1.',    // Trailing dot
      '.192.168.1.1'   // Leading dot
    ];

    invalidAddresses.forEach(address => {
      const hpai = new HPAI(HostProtocol.IPV4_UDP, address, 3671);
      expect(hpai.isValid()).toBe(false);
    });
  });

  test('should reject invalid port numbers', () => {
    const invalidPorts = [-1, 65536, 100000];

    invalidPorts.forEach(port => {
      const hpai = new HPAI(HostProtocol.IPV4_UDP, '192.168.1.1', port);
      expect(hpai.isValid()).toBe(false);
    });
  });

  test('should reject ports outside valid range', () => {
    const hpai1 = new HPAI(HostProtocol.IPV4_UDP, '192.168.1.1', -1);
    expect(hpai1.isValid()).toBe(false);

    const hpai2 = new HPAI(HostProtocol.IPV4_UDP, '192.168.1.1', 65536);
    expect(hpai2.isValid()).toBe(false);
  });
});

describe('HPAI Error Handling', () => {
  test('should throw on buffer too short', () => {
    const shortBuffer = Buffer.from([0x08, 0x01, 0xC0, 0xA8, 0x01, 0x64, 0x0E]);
    expect(() => HPAI.fromBuffer(shortBuffer)).toThrow('Invalid buffer length: expected 8 bytes, got 7');
  });

  test('should throw on buffer too long', () => {
    const longBuffer = Buffer.from([0x08, 0x01, 0xC0, 0xA8, 0x01, 0x64, 0x0E, 0x57, 0x00]);
    expect(() => HPAI.fromBuffer(longBuffer)).toThrow('Invalid buffer length: expected 8 bytes, got 9');
  });

  test('should throw on invalid structure length', () => {
    const buffer = Buffer.from([0x07, 0x01, 0xC0, 0xA8, 0x01, 0x64, 0x0E, 0x57]);
    expect(() => HPAI.fromBuffer(buffer)).toThrow('Invalid structure length: expected 0x08, got 0x7');
  });

  test('should throw on malformed IP address', () => {
    // This test creates a buffer with an invalid IP (256.1.1.1)
    const buffer = Buffer.from([0x08, 0x01, 0x01, 0x00, 0x01, 0x01, 0x0E, 0x57]); // 1.0.1.1 (valid)
    const validHapi = HPAI.fromBuffer(buffer);
    expect(validHapi.address).toBe('1.0.1.1');

    // Test serialization of invalid HPAI
    const invalidHapi = new HPAI(HostProtocol.IPV4_UDP, '256.1.1.1', 3671);
    expect(() => invalidHapi.toBuffer()).toThrow('Cannot serialize invalid HPAI instance');
  });

  test('should throw on invalid host protocol in buffer', () => {
    const buffer = Buffer.from([0x08, 0x00, 0xC0, 0xA8, 0x01, 0x64, 0x0E, 0x57]);
    expect(() => HPAI.fromBuffer(buffer)).toThrow('Invalid host protocol: 0x0');

    const buffer2 = Buffer.from([0x08, 0x03, 0xC0, 0xA8, 0x01, 0x64, 0x0E, 0x57]);
    expect(() => HPAI.fromBuffer(buffer2)).toThrow('Invalid host protocol: 0x3');
  });

  test('should allow port 0 in buffer (valid in KNXnet/IP)', () => {
    const buffer = Buffer.from([0x08, 0x01, 0xC0, 0xA8, 0x01, 0x64, 0x00, 0x00]); // Port 0
    const hpai = HPAI.fromBuffer(buffer);
    expect(hpai.port).toBe(0);
    expect(hpai.address).toBe('192.168.1.100');
    expect(hpai.hostProtocol).toBe(HostProtocol.IPV4_UDP);
  });

  test('should provide meaningful error messages', () => {
    expect(() => HPAI.fromBuffer(Buffer.alloc(4))).toThrow(/Invalid buffer length/);
    expect(() => HPAI.fromBuffer(Buffer.from([0x06, 0x01, 0xC0, 0xA8, 0x01, 0x64, 0x0E, 0x57]))).toThrow(/Invalid structure length/);

    const invalidHapi = new HPAI(0x99, 'invalid.ip', -1);
    expect(() => invalidHapi.toBuffer()).toThrow(/Cannot serialize invalid HPAI instance/);
  });
});

describe('HPAI Buffer Format', () => {
  test('should create correct byte sequence for known values', () => {
    const hpai = new HPAI(HostProtocol.IPV4_UDP, '192.168.1.100', 3671);
    const buffer = hpai.toBuffer();
    const expected = Buffer.from([0x08, 0x01, 0xC0, 0xA8, 0x01, 0x64, 0x0E, 0x57]);

    expect(buffer).toEqual(expected);
  });

  test('should parse known byte sequences correctly', () => {
    const buffer = Buffer.from([0x08, 0x02, 0x0A, 0x00, 0x00, 0x01, 0x00, 0x50]);
    const hpai = HPAI.fromBuffer(buffer);

    expect(hpai.hostProtocol).toBe(HostProtocol.IPV4_TCP);
    expect(hpai.address).toBe('10.0.0.1');
    expect(hpai.port).toBe(80);
  });

  test('should handle big-endian byte order for addresses', () => {
    // Test address 255.254.253.252
    const hpai = new HPAI(HostProtocol.IPV4_UDP, '255.254.253.252', 1234);
    const buffer = hpai.toBuffer();

    expect(buffer.readUInt8(2)).toBe(255);
    expect(buffer.readUInt8(3)).toBe(254);
    expect(buffer.readUInt8(4)).toBe(253);
    expect(buffer.readUInt8(5)).toBe(252);

    const deserialized = HPAI.fromBuffer(buffer);
    expect(deserialized.address).toBe('255.254.253.252');
  });

  test('should handle big-endian byte order for ports', () => {
    // Test port 0x1234 (4660 decimal)
    const hpai = new HPAI(HostProtocol.IPV4_UDP, '192.168.1.1', 4660);
    const buffer = hpai.toBuffer();

    expect(buffer.readUInt16BE(6)).toBe(4660);
    expect(buffer.readUInt8(6)).toBe(0x12); // High byte
    expect(buffer.readUInt8(7)).toBe(0x34); // Low byte

    const deserialized = HPAI.fromBuffer(buffer);
    expect(deserialized.port).toBe(4660);
  });
});

describe('HPAI Binary Test Vectors', () => {
  const binaryTestVectors = [
    {
      description: 'Standard KNXnet/IP endpoint',
      hpai: { hostProtocol: HostProtocol.IPV4_UDP, address: '192.168.1.100', port: 3671 },
      buffer: Buffer.from([0x08, 0x01, 0xC0, 0xA8, 0x01, 0x64, 0x0E, 0x57])
    },
    {
      description: 'TCP endpoint',
      hpai: { hostProtocol: HostProtocol.IPV4_TCP, address: '10.0.0.1', port: 80 },
      buffer: Buffer.from([0x08, 0x02, 0x0A, 0x00, 0x00, 0x01, 0x00, 0x50])
    }
  ];

  binaryTestVectors.forEach(({ description, hpai, buffer }) => {
    test(`should handle ${description}`, () => {
      // Test serialization
      const hpaiInstance = new HPAI(hpai.hostProtocol, hpai.address, hpai.port);
      const serializedBuffer = hpaiInstance.toBuffer();
      expect(serializedBuffer).toEqual(buffer);

      // Test deserialization
      const deserializedHapi = HPAI.fromBuffer(buffer);
      expect(deserializedHapi.hostProtocol).toBe(hpai.hostProtocol);
      expect(deserializedHapi.address).toBe(hpai.address);
      expect(deserializedHapi.port).toBe(hpai.port);
    });
  });
});

describe('HPAI toString', () => {
  test('should format UDP endpoints correctly', () => {
    const hpai = new HPAI(HostProtocol.IPV4_UDP, '192.168.1.1', 3671);
    expect(hpai.toString()).toBe('UDP://192.168.1.1:3671');
  });

  test('should format TCP endpoints correctly', () => {
    const hpai = new HPAI(HostProtocol.IPV4_TCP, '10.0.0.1', 80);
    expect(hpai.toString()).toBe('TCP://10.0.0.1:80');
  });

  test('should handle edge cases', () => {
    const hpai1 = new HPAI(HostProtocol.IPV4_UDP, '0.0.0.0', 0);
    expect(hpai1.toString()).toBe('UDP://0.0.0.0:0');

    const hpai2 = new HPAI(HostProtocol.IPV4_TCP, '255.255.255.255', 65535);
    expect(hpai2.toString()).toBe('TCP://255.255.255.255:65535');
  });
});