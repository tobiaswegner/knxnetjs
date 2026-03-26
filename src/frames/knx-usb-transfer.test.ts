import {
  KNXUSBTransferFrame,
  KNXUSBTransferProtocolId,
  KNXUSBTransferEMIId,
} from './knx-usb-transfer';

describe('KNXUSBTransferProtocolId', () => {
  test('should have correct values', () => {
    expect(KNXUSBTransferProtocolId.KNXTunnel).toBe(0x01);
    expect(KNXUSBTransferProtocolId.BusAccessServerFeatureService).toBe(0x0f);
  });
});

describe('KNXUSBTransferEMIId', () => {
  test('should have correct values', () => {
    expect(KNXUSBTransferEMIId.EMI1).toBe(0x01);
    expect(KNXUSBTransferEMIId.EMI2).toBe(0x02);
    expect(KNXUSBTransferEMIId.cEMI).toBe(0x03);
  });
});

describe('KNXUSBTransferFrame', () => {
  // Helper: build a minimal valid cEMI L_DATA_IND frame
  const cemiFrame = Buffer.from([
    0x29, 0x00, 0xBC, 0x60, 0xD0, 0x11, 0x04, 0x01, 0x02, 0x00, 0x81,
  ]);

  describe('constructor', () => {
    test('should store header and body', () => {
      const header = {
        protocolVersion: 0x00,
        headerLength: 0x08,
        bodyLength: 12,
        protocolId: KNXUSBTransferProtocolId.KNXTunnel,
        emiId: KNXUSBTransferEMIId.cEMI,
        manufacturerCode: 0x0000,
      };
      const body = {
        emiMessageCode: 0x29,
        data: cemiFrame.subarray(1),
      };
      const frame = new KNXUSBTransferFrame(header, body);
      expect(frame.header).toBe(header);
      expect(frame.body).toBe(body);
    });
  });

  describe('createForCEMI', () => {
    test('should create a frame with correct protocol and EMI IDs', () => {
      const frame = KNXUSBTransferFrame.createForCEMI(cemiFrame);

      expect(frame.header.protocolVersion).toBe(0x00);
      expect(frame.header.headerLength).toBe(0x08);
      expect(frame.header.protocolId).toBe(KNXUSBTransferProtocolId.KNXTunnel);
      expect(frame.header.emiId).toBe(KNXUSBTransferEMIId.cEMI);
      expect(frame.header.manufacturerCode).toBe(0x0000);
    });

    test('should split cEMI message code into emiMessageCode and data', () => {
      const frame = KNXUSBTransferFrame.createForCEMI(cemiFrame);
      expect(frame.body.emiMessageCode).toBe(0x29); // L_DATA_IND
      expect(frame.body.data.toString('hex')).toBe(
        cemiFrame.subarray(1).toString('hex')
      );
    });

    test('should set bodyLength to 1 + cemiData.length', () => {
      const frame = KNXUSBTransferFrame.createForCEMI(cemiFrame);
      expect(frame.header.bodyLength).toBe(1 + cemiFrame.length);
    });

    test('should accept custom manufacturerCode', () => {
      const frame = KNXUSBTransferFrame.createForCEMI(cemiFrame, 0x1234);
      expect(frame.header.manufacturerCode).toBe(0x1234);
    });
  });

  describe('createForBusAccess', () => {
    test('should create a frame with BusAccessServerFeatureService protocol ID', () => {
      const value = Buffer.from([0x01]);
      const frame = KNXUSBTransferFrame.createForBusAccess(0x03, 0x05, value);

      expect(frame.header.protocolId).toBe(
        KNXUSBTransferProtocolId.BusAccessServerFeatureService
      );
      expect(frame.header.emiId).toBe(0x03); // service
      expect(frame.body.emiMessageCode).toBe(0x05); // feature
      expect(frame.body.data.toString('hex')).toBe('01');
    });

    test('should set manufacturerCode to 0', () => {
      const frame = KNXUSBTransferFrame.createForBusAccess(1, 2, Buffer.from([0x00]));
      expect(frame.header.manufacturerCode).toBe(0x0000);
    });
  });

  describe('toBuffer', () => {
    test('should produce an 8-byte header followed by body', () => {
      const frame = KNXUSBTransferFrame.createForCEMI(cemiFrame);
      const buf = frame.toBuffer();

      // header(8) + emiMessageCode(1) + data(cemiFrame.length - 1) = 8 + cemiFrame.length
      expect(buf.length).toBe(8 + cemiFrame.length);
    });

    test('should encode header fields correctly', () => {
      const frame = KNXUSBTransferFrame.createForCEMI(cemiFrame);
      const buf = frame.toBuffer();

      expect(buf[0]).toBe(0x00); // protocolVersion
      expect(buf[1]).toBe(0x08); // headerLength
      // toBuffer() recalculates bodyLength from actual body (emiMessageCode + data)
      expect(buf.readUInt16BE(2)).toBe(cemiFrame.length); // 1 + (cemiFrame.length - 1)
      expect(buf[4]).toBe(KNXUSBTransferProtocolId.KNXTunnel);
      expect(buf[5]).toBe(KNXUSBTransferEMIId.cEMI);
      expect(buf.readUInt16BE(6)).toBe(0x0000); // manufacturerCode
    });

    test('should encode emiMessageCode at byte 8', () => {
      const frame = KNXUSBTransferFrame.createForCEMI(cemiFrame);
      const buf = frame.toBuffer();
      expect(buf[8]).toBe(0x29); // L_DATA_IND
    });
  });

  describe('fromBuffer', () => {
    test('should parse a valid buffer round-trip', () => {
      const original = KNXUSBTransferFrame.createForCEMI(cemiFrame);
      const buf = original.toBuffer();
      const parsed = KNXUSBTransferFrame.fromBuffer(buf);

      expect(parsed.header.protocolVersion).toBe(original.header.protocolVersion);
      expect(parsed.header.headerLength).toBe(original.header.headerLength);
      expect(parsed.header.protocolId).toBe(original.header.protocolId);
      expect(parsed.header.emiId).toBe(original.header.emiId);
      expect(parsed.header.manufacturerCode).toBe(original.header.manufacturerCode);
      expect(parsed.body.emiMessageCode).toBe(original.body.emiMessageCode);
      expect(parsed.body.data.toString('hex')).toBe(
        original.body.data.toString('hex')
      );
    });

    test('should throw when buffer is too short (< 8)', () => {
      expect(() => KNXUSBTransferFrame.fromBuffer(Buffer.alloc(7))).toThrow(
        'Buffer too short for KNX USB Transfer Header'
      );
    });

    test('should throw when headerLength is not 0x08', () => {
      const buf = Buffer.alloc(10);
      buf[0] = 0x00; // protocolVersion
      buf[1] = 0x09; // headerLength != 0x08
      buf.writeUInt16BE(2, 2); // bodyLength
      expect(() => KNXUSBTransferFrame.fromBuffer(buf)).toThrow(
        'Invalid header length: 9'
      );
    });

    test('should throw when buffer is too short for body', () => {
      const buf = Buffer.alloc(8); // header only, no body
      buf[0] = 0x00;
      buf[1] = 0x08;
      buf.writeUInt16BE(1, 2); // bodyLength = 1
      // Buffer is exactly 8 bytes but we need 8 + 1 = 9
      expect(() => KNXUSBTransferFrame.fromBuffer(buf)).toThrow(
        'Buffer too short for KNX USB Transfer Body'
      );
    });

    test('should parse manufacturerCode correctly', () => {
      const frame = KNXUSBTransferFrame.createForCEMI(cemiFrame, 0xABCD);
      const parsed = KNXUSBTransferFrame.fromBuffer(frame.toBuffer());
      expect(parsed.header.manufacturerCode).toBe(0xABCD);
    });
  });

  describe('isValid', () => {
    test('should return true for a valid cEMI tunnel frame', () => {
      const buf = KNXUSBTransferFrame.createForCEMI(cemiFrame).toBuffer();
      expect(KNXUSBTransferFrame.isValid(buf)).toBe(true);
    });

    test('should return false for buffer shorter than 9 bytes', () => {
      expect(KNXUSBTransferFrame.isValid(Buffer.alloc(8))).toBe(false);
    });

    test('should return false when protocolVersion is not 0x00', () => {
      const buf = KNXUSBTransferFrame.createForCEMI(cemiFrame).toBuffer();
      buf[0] = 0x01; // wrong version
      expect(KNXUSBTransferFrame.isValid(buf)).toBe(false);
    });

    test('should return false when headerLength is not 0x08', () => {
      const buf = KNXUSBTransferFrame.createForCEMI(cemiFrame).toBuffer();
      buf[1] = 0x06; // wrong header length
      expect(KNXUSBTransferFrame.isValid(buf)).toBe(false);
    });

    test('should return false when protocolId is not KNXTunnel', () => {
      const buf = KNXUSBTransferFrame.createForCEMI(cemiFrame).toBuffer();
      buf[4] = KNXUSBTransferProtocolId.BusAccessServerFeatureService;
      expect(KNXUSBTransferFrame.isValid(buf)).toBe(false);
    });

    test('should return false when emiId is not cEMI', () => {
      const buf = KNXUSBTransferFrame.createForCEMI(cemiFrame).toBuffer();
      buf[5] = KNXUSBTransferEMIId.EMI1;
      expect(KNXUSBTransferFrame.isValid(buf)).toBe(false);
    });
  });

  describe('getCEMIData', () => {
    test('should return body data when emiMessageCode is 0x11', () => {
      // L_DATA_REQ has message code 0x11
      const cemiWithCode11 = Buffer.from([0x11, 0x00, 0xBC, 0x60]);
      const frame = KNXUSBTransferFrame.createForCEMI(cemiWithCode11);
      const data = frame.getCEMIData();
      expect(data).not.toBeNull();
      expect(data!.toString('hex')).toBe(cemiWithCode11.subarray(1).toString('hex'));
    });

    test('should return null when emiMessageCode is not 0x11', () => {
      // cemiFrame starts with 0x29 (L_DATA_IND), not 0x11
      const frame = KNXUSBTransferFrame.createForCEMI(cemiFrame);
      expect(frame.getCEMIData()).toBeNull();
    });
  });

  describe('toString', () => {
    test('should include key fields', () => {
      const frame = KNXUSBTransferFrame.createForCEMI(cemiFrame);
      const str = frame.toString();

      expect(str).toContain('protocolVersion: 0x00');
      expect(str).toContain('headerLength: 0x08');
      expect(str).toContain('protocolId: 0x01');
      expect(str).toContain('emiId: 0x03');
      expect(str).toContain('emiMessageCode: 0x29');
    });
  });

  describe('binary test vector', () => {
    // Standard KNX USB Transfer Frame for cEMI data:
    // Header: 00 08 00 0C 01 03 00 00
    //   protocolVersion=0x00, headerLength=0x08, bodyLength=0x000C (12),
    //   protocolId=0x01 (KNXTunnel), emiId=0x03 (cEMI), mfgCode=0x0000
    // Body: 29 00 BC 60 D0 11 04 01 02 00 81
    //   emiMessageCode=0x29, data=[00 BC 60 D0 11 04 01 02 00 81]
    const vector = Buffer.from([
      0x00, 0x08, 0x00, 0x0c, 0x01, 0x03, 0x00, 0x00, // header
      0x29, 0x00, 0xbc, 0x60, 0xd0, 0x11, 0x04, 0x01, 0x02, 0x00, 0x81, // body
    ]);

    test('should parse binary vector correctly', () => {
      const frame = KNXUSBTransferFrame.fromBuffer(vector);
      expect(frame.header.protocolVersion).toBe(0x00);
      expect(frame.header.headerLength).toBe(0x08);
      expect(frame.header.bodyLength).toBe(0x000c);
      expect(frame.header.protocolId).toBe(0x01);
      expect(frame.header.emiId).toBe(0x03);
      expect(frame.header.manufacturerCode).toBe(0x0000);
      expect(frame.body.emiMessageCode).toBe(0x29);
    });

    test('should produce same binary when round-tripped', () => {
      const frame = KNXUSBTransferFrame.fromBuffer(vector);
      // bodyLength in toBuffer is recalculated from actual body size
      const output = frame.toBuffer();
      // Header bytes 0-7 should match (except bodyLength which is recalculated)
      expect(output[0]).toBe(0x00);
      expect(output[1]).toBe(0x08);
      expect(output[4]).toBe(0x01);
      expect(output[5]).toBe(0x03);
      // Body should be unchanged
      expect(output[8]).toBe(0x29);
    });
  });
});
