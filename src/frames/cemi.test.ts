import { CEMIFrame, CEMIMessageCode, Priority } from './cemi';

describe('CEMIFrame', () => {
  describe('Standard Frame Parsing', () => {
    // CEMI L_DATA_IND standard frame (CTRL1 bit 7 set) with CTRL2 byte
    // Format: msg_code, add_info_len, CTRL1, CTRL2, src_addr(2), dst_addr(2), length, data
    // 29 00 BC 00 D0 11 04 01 02 00 81
    const standardFrameBuffer = Buffer.from([0x29, 0x00, 0xBC, 0x00, 0xD0, 0x11, 0x04, 0x01, 0x02, 0x00, 0x81]);
    let frame: CEMIFrame;

    beforeEach(() => {
      frame = CEMIFrame.fromBuffer(standardFrameBuffer);
    });

    test('should parse message code correctly', () => {
      expect(frame.messageCode).toBe(CEMIMessageCode.L_DATA_IND);
      expect(frame.messageType).toBe('L_DATA.ind');
    });

    test('should parse additional info correctly', () => {
      expect(frame.additionalInfoLength).toBe(0);
      expect(frame.additionalInfo).toEqual([]);
    });

    test('should detect frame type correctly', () => {
      expect(frame.standardFrame).toBe(true);
      expect(frame.extendedFrame).toBe(false);
    });

    test('should parse control fields correctly', () => {
      expect(frame.controlField1).toBe(0xBC);
      expect(frame.controlField2).toBe(0x00); // Dedicated CTRL2 byte in CEMI frames
    });

    test('should parse priority correctly', () => {
      expect(frame.priority).toBe(Priority.LOW);
      expect(frame.priorityText).toBe('Low');
    });

    test('should parse hop count correctly', () => {
      expect(frame.hopCount).toBe(0); // From Control Field 2
    });

    test('should parse addresses correctly', () => {
      expect(frame.sourceAddress).toBe(0xD011);
      expect(frame.sourceAddressString).toBe('13.0.17');
      expect(frame.destinationAddress).toBe(0x0401);
      expect(frame.destinationAddressString).toBe('0.4.1');
    });

    test('should detect address type correctly', () => {
      expect(frame.isGroupAddress).toBe(false);
    });

    test('should parse data correctly', () => {
      expect(frame.dataLength).toBe(2); // NPDU length byte
      expect(frame.data.toString('hex')).toBe('0081');
    });

    test('should parse TPCI and APCI correctly', () => {
      expect(frame.tpci).toBe(0x0);   // Expected TPCI is 0
      expect(frame.apci).toBe(0x81);  // Expected APCI is 0x81
      expect(frame.applicationData.length).toBe(0);
    });

    test('should validate frame correctly', () => {
      expect(frame.isValid()).toBe(true);
    });

    test('should format frame string correctly', () => {
      const formatted = frame.toFormattedString(false);
      expect(formatted).toContain('L_DATA.ind');
      expect(formatted).toContain('Src: 13.0.17');
      expect(formatted).toContain('Dst: 0.4.1');
      expect(formatted).toContain('Priority: Low');
    });
  });

  describe('Frame with Additional Info', () => {
    // CEMI frame with additional info (type=0x03, length=0x02, data=0x1234)
    // Format: msg_code, add_info_len, [add_info], CTRL1, CTRL2, src_addr(2), dst_addr(2), length, data
    // 29 04 03 02 12 34 BC 00 D0 11 04 01 01 81
    const frameWithAddInfoBuffer = Buffer.from([0x29, 0x04, 0x03, 0x02, 0x12, 0x34, 0xBC, 0x00, 0xD0, 0x11, 0x04, 0x01, 0x01, 0x81]);
    let frame: CEMIFrame;

    beforeEach(() => {
      frame = CEMIFrame.fromBuffer(frameWithAddInfoBuffer);
    });

    test('should parse additional info correctly', () => {
      expect(frame.additionalInfoLength).toBe(4);
      expect(frame.additionalInfo).toHaveLength(1);
      expect(frame.additionalInfo[0]).toEqual({
        type: 0x03,
        length: 2,
        data: Buffer.from([0x12, 0x34])
      });
    });

    test('should parse frame data correctly despite additional info', () => {
      expect(frame.messageCode).toBe(CEMIMessageCode.L_DATA_IND);
      expect(frame.sourceAddressString).toBe('13.0.17');
      expect(frame.destinationAddressString).toBe('0.4.1');
      expect(frame.dataLength).toBe(1);
      expect(frame.data.toString('hex')).toBe('81');
    });

    test('should validate frame correctly', () => {
      expect(frame.isValid()).toBe(true);
    });
  });

  describe('Group Address Frame', () => {
    // CEMI frame with group address (set bit 7 in CTRL2)
    // Format: msg_code, add_info_len, CTRL1, CTRL2, src_addr(2), dst_addr(2), length, data
    // 29 00 FC 80 D0 11 04 01 01 80
    const groupAddressFrameBuffer = Buffer.from([0x29, 0x00, 0xFC, 0x80, 0xD0, 0x11, 0x04, 0x01, 0x01, 0x80]);
    let frame: CEMIFrame;

    beforeEach(() => {
      frame = CEMIFrame.fromBuffer(groupAddressFrameBuffer);
    });

    test('should detect group address correctly', () => {
      expect(frame.isGroupAddress).toBe(true);
      // Group address format: main/middle/sub
      expect(frame.destinationAddressString).toMatch(/\d+\/\d+\/\d+/);
    });

    test('should parse control field 2 from dedicated byte', () => {
      // Control field 2 is a dedicated byte in CEMI frames
      expect(frame.controlField2 & 0x80).toBe(0x80);
    });
  });

  describe('Extended Frame Parsing', () => {
    // Create an extended frame (clear bit 7 in control field 1)
    // Extended frame: 29 00 7C 00 D0 11 04 01 02 00 81
    const extendedFrameBuffer = Buffer.from([0x29, 0x00, 0x7C, 0x00, 0xD0, 0x11, 0x04, 0x01, 0x02, 0x00, 0x81]);
    let frame: CEMIFrame;

    beforeEach(() => {
      frame = CEMIFrame.fromBuffer(extendedFrameBuffer);
    });

    test('should detect extended frame correctly', () => {
      expect(frame.extendedFrame).toBe(true);
      expect(frame.standardFrame).toBe(false);
    });

    test('should parse control field 2 from separate byte', () => {
      expect(frame.controlField2).toBe(0x00);
    });

    test('should parse data length from full byte', () => {
      expect(frame.dataLength).toBe(2); // Full byte value, not masked
    });
  });

  describe('Frame Creation', () => {
    test('should create frame correctly', () => {
      const data = Buffer.from([0x00, 0x80]);
      const frame = CEMIFrame.create(
        CEMIMessageCode.L_DATA_REQ,
        0x1101, // Source: 1.1.1
        0x0801, // Destination: 0/1/1 (group)
        data,
        Priority.LOW,
        6
      );

      expect(frame.messageCode).toBe(CEMIMessageCode.L_DATA_REQ);
      // Debug: let's see what we actually get
      const buffer = frame.toBuffer();
      console.log('Created frame buffer:', buffer.toString('hex'));
      console.log('Buffer breakdown:');
      console.log('  Message code:', buffer.readUInt8(0).toString(16));
      console.log('  Add info len:', buffer.readUInt8(1));
      console.log('  Control1:', buffer.readUInt8(2).toString(16));
      console.log('  Bytes 3-4 (should be src):', buffer.readUInt16BE(3).toString(16));
      console.log('  Bytes 5-6 (should be dst):', buffer.readUInt16BE(5).toString(16));
      console.log('serviceInfoOffset:', (frame as any).serviceInfoOffset);
      console.log('extendedFrame:', frame.extendedFrame);
      console.log('Source offset calc:', (frame as any).serviceInfoOffset + 1 + (frame.extendedFrame ? 1 : 0));
      console.log('Dest offset calc:', (frame as any).serviceInfoOffset + 3 + (frame.extendedFrame ? 1 : 0));
      console.log('Source address parsed:', frame.sourceAddress.toString(16));
      console.log('Destination address parsed:', frame.destinationAddress.toString(16));
      
      expect(frame.sourceAddress).toBe(0x1101);
      expect(frame.destinationAddress).toBe(0x0801);
      expect(frame.priority).toBe(Priority.LOW);
      expect(frame.hopCount).toBe(6);
      expect(frame.data.length).toBe(data.length); // Correct data length
    });

    test('should create frame with additional info', () => {
      const additionalInfo = [{
        type: 0x03,
        length: 2,
        data: Buffer.from([0x12, 0x34])
      }];
      
      const frame = CEMIFrame.create(
        CEMIMessageCode.L_DATA_IND,
        0x1101,
        0x0801,
        Buffer.from([0x80]),
        Priority.NORMAL,
        5,
        additionalInfo
      );

      expect(frame.additionalInfoLength).toBe(4); // type(1) + length(1) + data(2)
      expect(frame.additionalInfo).toHaveLength(1);
      expect(frame.additionalInfo[0]?.type).toBe(0x03);
      expect(frame.additionalInfo[0]?.data).toEqual(Buffer.from([0x12, 0x34]));
    });
  });

  describe('Buffer Validation', () => {
    test('should validate correct buffers', () => {
      const validBuffer = Buffer.from([0x29, 0x00, 0xBC, 0xD0, 0x11, 0x04, 0x01, 0x00, 0x81]);
      expect(CEMIFrame.isValidBuffer(validBuffer)).toBe(true);
    });

    test('should reject too short buffers', () => {
      const shortBuffer = Buffer.from([0x29]);
      expect(CEMIFrame.isValidBuffer(shortBuffer)).toBe(false);
    });

    test('should reject invalid message codes', () => {
      const invalidBuffer = Buffer.from([0xFF, 0x00, 0xBC, 0xD0, 0x11, 0x04, 0x01, 0x00, 0x81]);
      expect(CEMIFrame.isValidBuffer(invalidBuffer)).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should throw error for too short buffer in constructor', () => {
      expect(() => {
        new CEMIFrame(Buffer.from([0x29]));
      }).toThrow('Invalid cEMI frame: too short');
    });

    test('should handle malformed additional info gracefully', () => {
      // Frame with invalid additional info length
      const malformedBuffer = Buffer.from([0x29, 0x10, 0xBC, 0xD0, 0x11, 0x04, 0x01, 0x00, 0x81]);
      const frame = CEMIFrame.fromBuffer(malformedBuffer);

      expect(frame.additionalInfo).toEqual([]);
    });
  });

  describe('Physical Frame Parsing (L_BUSMON_IND)', () => {
    describe('Standard Physical Frame', () => {
      // Physical frame from bus monitor - standard frame has NO dedicated CTRL2 byte
      // CTRL2 info is encoded in upper 4 bits of NPCI/length byte
      // Format: msg_code, add_info_len, CTRL1, src_addr(2), dst_addr(2), NPCI(with CTRL2), data
      // 2B 00 BC D0 11 04 01 E1 00 81
      // NPCI byte 0xE1: upper 4 bits = 0xE (hop count 6, group addr), lower 4 bits = 1 (length)
      const standardPhysicalFrame = Buffer.from([0x2B, 0x00, 0xBC, 0xD0, 0x11, 0x04, 0x01, 0xE1, 0x00, 0x81]);
      let frame: CEMIFrame;

      beforeEach(() => {
        frame = CEMIFrame.fromBuffer(standardPhysicalFrame);
      });

      test('should detect as physical frame', () => {
        expect(frame.isPhysicalFrame).toBe(true);
        expect(frame.messageCode).toBe(CEMIMessageCode.L_BUSMON_IND);
      });

      test('should detect standard frame type', () => {
        expect(frame.standardFrame).toBe(true);
        expect(frame.extendedFrame).toBe(false);
      });

      test('should parse addresses correctly without CTRL2 byte', () => {
        expect(frame.sourceAddress).toBe(0xD011);
        expect(frame.sourceAddressString).toBe('13.0.17');
        expect(frame.destinationAddress).toBe(0x0401);
      });

      test('should extract CTRL2 from NPCI byte', () => {
        // CTRL2 comes from upper 4 bits of NPCI (0xE1 -> 0xE0)
        expect(frame.controlField2 & 0xF0).toBe(0xE0);
      });

      test('should parse hop count from NPCI', () => {
        // Hop count is bits 6-4 of CTRL2 (0xE0 >> 4 & 0x07 = 6)
        expect(frame.hopCount).toBe(6);
      });

      test('should detect group address from NPCI', () => {
        // Bit 7 of CTRL2 (0xE0 & 0x80 = 0x80) indicates group address
        expect(frame.isGroupAddress).toBe(true);
      });

      test('should parse data length from lower 4 bits of NPCI', () => {
        // Length is lower 4 bits of NPCI (0xE1 & 0x0F = 1)
        expect(frame.dataLength).toBe(1);
      });
    });

    describe('Extended Physical Frame', () => {
      // Extended physical frame from bus monitor - HAS dedicated CTRL2 byte
      // Format: msg_code, add_info_len, CTRL1, CTRL2, src_addr(2), dst_addr(2), length, data
      // 2B 00 7C E0 D0 11 04 01 02 00 81
      const extendedPhysicalFrame = Buffer.from([0x2B, 0x00, 0x7C, 0xE0, 0xD0, 0x11, 0x04, 0x01, 0x02, 0x00, 0x81]);
      let frame: CEMIFrame;

      beforeEach(() => {
        frame = CEMIFrame.fromBuffer(extendedPhysicalFrame);
      });

      test('should detect as physical frame', () => {
        expect(frame.isPhysicalFrame).toBe(true);
        expect(frame.messageCode).toBe(CEMIMessageCode.L_BUSMON_IND);
      });

      test('should detect extended frame type', () => {
        expect(frame.extendedFrame).toBe(true);
        expect(frame.standardFrame).toBe(false);
      });

      test('should parse addresses correctly with CTRL2 byte', () => {
        expect(frame.sourceAddress).toBe(0xD011);
        expect(frame.sourceAddressString).toBe('13.0.17');
        expect(frame.destinationAddress).toBe(0x0401);
      });

      test('should parse CTRL2 from dedicated byte', () => {
        expect(frame.controlField2).toBe(0xE0);
      });

      test('should parse full data length byte', () => {
        expect(frame.dataLength).toBe(2);
      });
    });
  });
});