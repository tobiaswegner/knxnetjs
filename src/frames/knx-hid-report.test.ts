import { KNXHIDReport } from './knx-hid-report';

describe('KNXHIDReport', () => {
  describe('constructor', () => {
    test('should create with default parameters', () => {
      const body = Buffer.from([0x01, 0x02, 0x03]);
      const report = new KNXHIDReport(body);

      expect(report.getReportId()).toBe(1);
      expect(report.getSequenceCounter()).toBe(1);
      expect(report.getPackageType()).toBe(3);
      expect(report.getBodyLength()).toBe(3);
      expect(report.getBody()).toEqual(body);
    });

    test('should create with custom parameters', () => {
      const body = Buffer.from([0xAA]);
      const report = new KNXHIDReport(body, 2, 5, 7);

      expect(report.getReportId()).toBe(2);
      expect(report.getSequenceCounter()).toBe(5);
      expect(report.getPackageType()).toBe(7);
    });

    test('should accept empty body', () => {
      const report = new KNXHIDReport(Buffer.alloc(0));
      expect(report.getBodyLength()).toBe(0);
    });

    test('should accept body of maximum length (61 bytes)', () => {
      const body = Buffer.alloc(61);
      const report = new KNXHIDReport(body);
      expect(report.getBodyLength()).toBe(61);
    });

    test('should throw when body exceeds 61 bytes', () => {
      expect(() => new KNXHIDReport(Buffer.alloc(62))).toThrow(
        'Body length 62 exceeds maximum of 61 bytes'
      );
    });

    test('should throw when reportId is out of range (negative)', () => {
      expect(() => new KNXHIDReport(Buffer.alloc(1), -1)).toThrow(
        'Report ID -1 must be between 0 and 255'
      );
    });

    test('should throw when reportId is out of range (>255)', () => {
      expect(() => new KNXHIDReport(Buffer.alloc(1), 256)).toThrow(
        'Report ID 256 must be between 0 and 255'
      );
    });

    test('should throw when sequenceCounter is out of range (negative)', () => {
      expect(() => new KNXHIDReport(Buffer.alloc(1), 1, -1)).toThrow(
        'Sequence counter -1 must be between 0 and 15'
      );
    });

    test('should throw when sequenceCounter is out of range (>15)', () => {
      expect(() => new KNXHIDReport(Buffer.alloc(1), 1, 16)).toThrow(
        'Sequence counter 16 must be between 0 and 15'
      );
    });

    test('should throw when packageType is out of range (negative)', () => {
      expect(() => new KNXHIDReport(Buffer.alloc(1), 1, 1, -1)).toThrow(
        'Package type -1 must be between 0 and 15'
      );
    });

    test('should throw when packageType is out of range (>15)', () => {
      expect(() => new KNXHIDReport(Buffer.alloc(1), 1, 1, 16)).toThrow(
        'Package type 16 must be between 0 and 15'
      );
    });

    test('should mask sequenceCounter and packageType to 4 bits', () => {
      // Values 0-15 are valid; the constructor AND setter both mask with 0x0f
      const report = new KNXHIDReport(Buffer.alloc(1), 1, 15, 15);
      expect(report.getSequenceCounter()).toBe(15);
      expect(report.getPackageType()).toBe(15);
    });
  });

  describe('toBuffer', () => {
    test('should always produce a 64-byte buffer', () => {
      const report = new KNXHIDReport(Buffer.from([0x01]));
      expect(report.toBuffer().length).toBe(64);
    });

    test('should encode reportId in byte 0', () => {
      const report = new KNXHIDReport(Buffer.alloc(1), 0x42);
      expect(report.toBuffer()[0]).toBe(0x42);
    });

    test('should encode sequenceCounter in upper nibble and packageType in lower nibble of byte 1', () => {
      // seq=0xA (10), type=0x5 (5) => byte 1 = 0xA5
      const report = new KNXHIDReport(Buffer.alloc(1), 1, 10, 5);
      expect(report.toBuffer()[1]).toBe(0xA5);
    });

    test('should encode bodyLength in byte 2', () => {
      const body = Buffer.from([0x01, 0x02, 0x03]);
      const report = new KNXHIDReport(body);
      expect(report.toBuffer()[2]).toBe(3);
    });

    test('should encode body starting at byte 3', () => {
      const body = Buffer.from([0xDE, 0xAD, 0xBE, 0xEF]);
      const report = new KNXHIDReport(body);
      const buf = report.toBuffer();
      expect(buf[3]).toBe(0xDE);
      expect(buf[4]).toBe(0xAD);
      expect(buf[5]).toBe(0xBE);
      expect(buf[6]).toBe(0xEF);
    });

    test('should zero-pad remaining bytes after body', () => {
      const body = Buffer.from([0xFF]);
      const report = new KNXHIDReport(body);
      const buf = report.toBuffer();
      // Bytes 4..63 should be zero
      for (let i = 4; i < 64; i++) {
        expect(buf[i]).toBe(0);
      }
    });
  });

  describe('fromBuffer', () => {
    test('should parse a valid buffer round-trip', () => {
      const body = Buffer.from([0x11, 0x22, 0x33]);
      const original = new KNXHIDReport(body, 1, 3, 7);
      const parsed = KNXHIDReport.fromBuffer(original.toBuffer());

      expect(parsed.getReportId()).toBe(1);
      expect(parsed.getSequenceCounter()).toBe(3);
      expect(parsed.getPackageType()).toBe(7);
      expect(parsed.getBodyLength()).toBe(3);
      expect(parsed.getBody().toString('hex')).toBe('112233');
    });

    test('should throw when buffer is shorter than 3 bytes', () => {
      expect(() => KNXHIDReport.fromBuffer(Buffer.alloc(2))).toThrow(
        'Buffer too short for KNX HID report'
      );
    });

    test('should throw when buffer is too short for declared body length', () => {
      const buf = Buffer.alloc(5);
      buf[0] = 0x01; // reportId
      buf[1] = 0x13; // seq=1, type=3
      buf[2] = 10;   // bodyLength=10, but only 2 bytes follow
      expect(() => KNXHIDReport.fromBuffer(buf)).toThrow(
        'Buffer too short for declared body length 10'
      );
    });

    test('should correctly parse sequence and type from packed nibbles', () => {
      // byte[1] = 0xB4 => seq=(0xB4 >> 4) & 0x0F = 11, type=0xB4 & 0x0F = 4
      const buf = Buffer.alloc(4);
      buf[0] = 0x01;
      buf[1] = 0xB4;
      buf[2] = 0x01; // bodyLength=1
      buf[3] = 0xFF; // body byte
      const report = KNXHIDReport.fromBuffer(buf);
      expect(report.getSequenceCounter()).toBe(11);
      expect(report.getPackageType()).toBe(4);
    });
  });

  describe('setters', () => {
    test('setReportId should update the report ID', () => {
      const report = new KNXHIDReport(Buffer.alloc(1));
      report.setReportId(42);
      expect(report.getReportId()).toBe(42);
    });

    test('setReportId should throw on invalid values', () => {
      const report = new KNXHIDReport(Buffer.alloc(1));
      expect(() => report.setReportId(256)).toThrow('Report ID 256 must be between 0 and 255');
      expect(() => report.setReportId(-1)).toThrow('Report ID -1 must be between 0 and 255');
    });

    test('setSequenceCounter should update the counter', () => {
      const report = new KNXHIDReport(Buffer.alloc(1));
      report.setSequenceCounter(7);
      expect(report.getSequenceCounter()).toBe(7);
    });

    test('setSequenceCounter should throw on invalid values', () => {
      const report = new KNXHIDReport(Buffer.alloc(1));
      expect(() => report.setSequenceCounter(16)).toThrow('Sequence counter 16 must be between 0 and 15');
    });

    test('setPackageType should update the type', () => {
      const report = new KNXHIDReport(Buffer.alloc(1));
      report.setPackageType(9);
      expect(report.getPackageType()).toBe(9);
    });

    test('setPackageType should throw on invalid values', () => {
      const report = new KNXHIDReport(Buffer.alloc(1));
      expect(() => report.setPackageType(16)).toThrow('Package type 16 must be between 0 and 15');
    });

    test('setBody should update body and bodyLength', () => {
      const report = new KNXHIDReport(Buffer.from([0x01]));
      const newBody = Buffer.from([0x0A, 0x0B, 0x0C]);
      report.setBody(newBody);
      expect(report.getBodyLength()).toBe(3);
      expect(report.getBody().toString('hex')).toBe('0a0b0c');
    });

    test('setBody should throw when body exceeds 61 bytes', () => {
      const report = new KNXHIDReport(Buffer.alloc(1));
      expect(() => report.setBody(Buffer.alloc(62))).toThrow(
        'Body length 62 exceeds maximum of 61 bytes'
      );
    });

    test('getBody should return a copy (not a reference)', () => {
      const body = Buffer.from([0x01, 0x02]);
      const report = new KNXHIDReport(body);
      const copy = report.getBody();
      copy[0] = 0xFF;
      expect(report.getBody()[0]).toBe(0x01); // original unchanged
    });
  });

  describe('toString', () => {
    test('should include key fields in string representation', () => {
      const body = Buffer.from([0xAB, 0xCD]);
      const report = new KNXHIDReport(body, 1, 2, 3);
      const str = report.toString();

      expect(str).toContain('reportId: 0x01');
      expect(str).toContain('seq: 2');
      expect(str).toContain('type: 3');
      expect(str).toContain('bodyLen: 2');
      expect(str).toContain('abcd');
    });
  });

  describe('binary test vector', () => {
    // A real KNX HID Report: reportId=1, seq=1, type=3 (first+last), bodyLen=11
    // body = property write cEMI frame
    const bodyData = Buffer.from([0xf6, 0x00, 0x00, 0x01, 0x34, 0x10, 0x01, 0x01, 0x00, 0x00, 0x00]);
    const report = new KNXHIDReport(bodyData, 1, 1, 3);
    const buf = report.toBuffer();

    test('should produce 64-byte output', () => {
      expect(buf.length).toBe(64);
    });

    test('should encode correctly', () => {
      expect(buf[0]).toBe(0x01); // reportId
      expect(buf[1]).toBe(0x13); // seq=1, type=3
      expect(buf[2]).toBe(11);   // bodyLength
    });

    test('should parse back to same values', () => {
      const parsed = KNXHIDReport.fromBuffer(buf);
      expect(parsed.getReportId()).toBe(1);
      expect(parsed.getSequenceCounter()).toBe(1);
      expect(parsed.getPackageType()).toBe(3);
      expect(parsed.getBodyLength()).toBe(11);
      expect(parsed.getBody().toString('hex')).toBe(bodyData.toString('hex'));
    });
  });
});
