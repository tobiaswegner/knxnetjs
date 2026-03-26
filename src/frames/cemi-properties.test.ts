import {
  CEMIPropertyWrite,
  CEMIPropertyReadReq,
  CEMIPropertyReadCon,
  Properties,
  DPT_CommMode,
} from './cemi-properties';
import { CEMIMessageCode } from './cemi';

describe('Properties enum', () => {
  test('PID_COMM_MODE should equal 52', () => {
    expect(Properties.PID_COMM_MODE).toBe(52);
  });
});

describe('DPT_CommMode enum', () => {
  test('should have correct values', () => {
    expect(DPT_CommMode.DataLinkLayer).toBe(0x00);
    expect(DPT_CommMode.DataLinkLayerBusmonitor).toBe(0x01);
    expect(DPT_CommMode.DataLinkLayerRawFrames).toBe(0x02);
    expect(DPT_CommMode.CEMITranpsortLayer).toBe(0x06);
    expect(DPT_CommMode.NoLayer).toBe(0xff);
  });
});

describe('CEMIPropertyWrite', () => {
  describe('constructor', () => {
    test('should create a valid property write frame', () => {
      const data = Buffer.from([0x00]);
      const frame = new CEMIPropertyWrite(0x0000, 0x01, Properties.PID_COMM_MODE, 1, 1, data);

      expect(frame.messageCode).toBe(CEMIMessageCode.M_PROP_WRITE_REQ);
      expect(frame.interfaceObject).toBe(0x0000);
      expect(frame.objectInstance).toBe(0x01);
      expect(frame.propertyId).toBe(Properties.PID_COMM_MODE);
      expect(frame.numberOfElements).toBe(1);
      expect(frame.startIndex).toBe(1);
      expect(frame.data).toEqual(data);
    });

    test('should throw when numberOfElements exceeds 15', () => {
      expect(
        () => new CEMIPropertyWrite(0, 1, 1, 16, 1, Buffer.alloc(1))
      ).toThrow('Number of elements cannot exceed 15 (4 bits)');
    });

    test('should throw when startIndex exceeds 4095', () => {
      expect(
        () => new CEMIPropertyWrite(0, 1, 1, 1, 4096, Buffer.alloc(1))
      ).toThrow('Start index cannot exceed 4095 (12 bits)');
    });

    test('should allow maximum numberOfElements (15)', () => {
      const frame = new CEMIPropertyWrite(0, 1, 1, 15, 0, Buffer.alloc(1));
      expect(frame.numberOfElements).toBe(15);
    });

    test('should allow maximum startIndex (4095)', () => {
      const frame = new CEMIPropertyWrite(0, 1, 1, 1, 4095, Buffer.alloc(1));
      expect(frame.startIndex).toBe(4095);
    });

    test('should handle empty data buffer', () => {
      const frame = new CEMIPropertyWrite(0, 1, 1, 0, 0, Buffer.alloc(0));
      expect(frame.data.length).toBe(0);
    });
  });

  describe('bit packing of numberOfElements and startIndex', () => {
    test('should pack numberOfElements (upper 4 bits) and startIndex (lower 12 bits)', () => {
      // numberOfElements=5 (0101), startIndex=0xABC (1010 1011 1100)
      // Packed word: 0101 1010 1011 1100 = 0x5ABC
      const frame = new CEMIPropertyWrite(0, 1, 1, 5, 0xABC, Buffer.alloc(1));
      expect(frame.numberOfElements).toBe(5);
      expect(frame.startIndex).toBe(0xABC);
    });

    test('should pack max values correctly', () => {
      const frame = new CEMIPropertyWrite(0, 1, 1, 15, 4095, Buffer.alloc(1));
      expect(frame.numberOfElements).toBe(15);
      expect(frame.startIndex).toBe(4095);
    });

    test('should pack zero values correctly', () => {
      const frame = new CEMIPropertyWrite(0, 1, 1, 0, 0, Buffer.alloc(1));
      expect(frame.numberOfElements).toBe(0);
      expect(frame.startIndex).toBe(0);
    });
  });

  describe('toBuffer', () => {
    test('should produce a buffer of correct length (7 + data)', () => {
      const data = Buffer.from([0x01, 0x02, 0x03]);
      const frame = new CEMIPropertyWrite(0, 1, 1, 1, 1, data);
      expect(frame.toBuffer().length).toBe(10);
    });

    test('should encode all fields correctly', () => {
      const data = Buffer.from([0x01, 0x02]);
      const frame = new CEMIPropertyWrite(0x0001, 0x02, 0x34, 2, 5, data);
      const buf = frame.toBuffer();

      expect(buf[0]).toBe(0xf6); // M_PROP_WRITE_REQ
      expect(buf.readUInt16BE(1)).toBe(0x0001); // interfaceObject
      expect(buf[3]).toBe(0x02); // objectInstance
      expect(buf[4]).toBe(0x34); // propertyId
      expect(buf.readUInt16BE(5)).toBe((2 << 12) | 5); // packed
      expect(buf[7]).toBe(0x01);
      expect(buf[8]).toBe(0x02);
    });
  });

  describe('fromBuffer', () => {
    test('should parse a valid buffer round-trip', () => {
      const data = Buffer.from([0xAA, 0xBB]);
      const original = new CEMIPropertyWrite(0x0100, 0x02, 0x34, 5, 100, data);
      const parsed = CEMIPropertyWrite.fromBuffer(original.toBuffer());

      expect(parsed.interfaceObject).toBe(0x0100);
      expect(parsed.objectInstance).toBe(0x02);
      expect(parsed.propertyId).toBe(0x34);
      expect(parsed.numberOfElements).toBe(5);
      expect(parsed.startIndex).toBe(100);
      expect(parsed.data.toString('hex')).toBe('aabb');
    });

    test('should throw when buffer is too short', () => {
      expect(() => CEMIPropertyWrite.fromBuffer(Buffer.alloc(6))).toThrow(
        'Invalid CEMIPropertyWrite frame: too short'
      );
    });

    test('should throw when message code is wrong', () => {
      const buf = Buffer.alloc(8);
      buf[0] = 0xff; // Wrong message code (not M_PROP_WRITE_REQ)
      expect(() => CEMIPropertyWrite.fromBuffer(buf)).toThrow(
        'Invalid message code for CEMIPropertyWrite'
      );
    });
  });

  describe('isValid', () => {
    test('should return true for a valid frame', () => {
      const frame = new CEMIPropertyWrite(0, 1, 1, 1, 1, Buffer.from([0x00]));
      expect(frame.isValid()).toBe(true);
    });
  });

  describe('binary test vector', () => {
    // M_PROP_WRITE_REQ (0xF6), interfaceObject=0x0000, objectInstance=0x01,
    // propertyId=0x34 (52 = PID_COMM_MODE), numberOfElements=1, startIndex=1,
    // data=0x01 (DataLinkLayerBusmonitor)
    const vector = Buffer.from([0xf6, 0x00, 0x00, 0x01, 0x34, 0x10, 0x01, 0x01]);

    test('should parse binary vector correctly', () => {
      const frame = CEMIPropertyWrite.fromBuffer(vector);
      expect(frame.messageCode).toBe(0xf6);
      expect(frame.interfaceObject).toBe(0x0000);
      expect(frame.objectInstance).toBe(0x01);
      expect(frame.propertyId).toBe(0x34);
      expect(frame.numberOfElements).toBe(1);
      expect(frame.startIndex).toBe(1);
      expect(frame.data[0]).toBe(0x01);
    });
  });
});

describe('CEMIPropertyReadReq', () => {
  describe('constructor', () => {
    test('should create a valid property read request', () => {
      const frame = new CEMIPropertyReadReq(0x0000, 0x01, Properties.PID_COMM_MODE, 1, 1);

      expect(frame.messageCode).toBe(CEMIMessageCode.M_PROP_READ_REQ);
      expect(frame.interfaceObject).toBe(0x0000);
      expect(frame.objectInstance).toBe(0x01);
      expect(frame.propertyId).toBe(Properties.PID_COMM_MODE);
      expect(frame.numberOfElements).toBe(1);
      expect(frame.startIndex).toBe(1);
    });

    test('should throw when numberOfElements exceeds 15', () => {
      expect(() => new CEMIPropertyReadReq(0, 1, 1, 16, 0)).toThrow(
        'Number of elements cannot exceed 15 (4 bits)'
      );
    });

    test('should throw when startIndex exceeds 4095', () => {
      expect(() => new CEMIPropertyReadReq(0, 1, 1, 1, 4096)).toThrow(
        'Start index cannot exceed 4095 (12 bits)'
      );
    });
  });

  describe('toBuffer', () => {
    test('should produce a 7-byte buffer (no data payload)', () => {
      const frame = new CEMIPropertyReadReq(0, 1, 1, 1, 1);
      expect(frame.toBuffer().length).toBe(7);
    });

    test('should encode message code as M_PROP_READ_REQ (0xFC)', () => {
      const frame = new CEMIPropertyReadReq(0, 1, 1, 1, 1);
      expect(frame.toBuffer()[0]).toBe(0xfc);
    });
  });

  describe('fromBuffer', () => {
    test('should parse a valid buffer round-trip', () => {
      const original = new CEMIPropertyReadReq(0x0200, 0x03, 0x52, 4, 2);
      const parsed = CEMIPropertyReadReq.fromBuffer(original.toBuffer());

      expect(parsed.interfaceObject).toBe(0x0200);
      expect(parsed.objectInstance).toBe(0x03);
      expect(parsed.propertyId).toBe(0x52);
      expect(parsed.numberOfElements).toBe(4);
      expect(parsed.startIndex).toBe(2);
    });

    test('should throw when buffer is too short', () => {
      expect(() => CEMIPropertyReadReq.fromBuffer(Buffer.alloc(6))).toThrow(
        'Invalid CEMIPropertyReadReq frame: too short'
      );
    });

    test('should throw when message code is wrong', () => {
      const buf = Buffer.alloc(8);
      buf[0] = 0xf6; // M_PROP_WRITE_REQ, not M_PROP_READ_REQ
      expect(() => CEMIPropertyReadReq.fromBuffer(buf)).toThrow(
        'Invalid message code for CEMIPropertyReadReq'
      );
    });
  });

  describe('isValid', () => {
    test('should return true for a valid frame', () => {
      const frame = new CEMIPropertyReadReq(0, 1, 1, 1, 1);
      expect(frame.isValid()).toBe(true);
    });
  });

  describe('binary test vector', () => {
    // M_PROP_READ_REQ (0xFC), interfaceObject=0x0000, objectInstance=0x01,
    // propertyId=0x34, numberOfElements=1, startIndex=1
    const vector = Buffer.from([0xfc, 0x00, 0x00, 0x01, 0x34, 0x10, 0x01]);

    test('should parse binary vector correctly', () => {
      const frame = CEMIPropertyReadReq.fromBuffer(vector);
      expect(frame.messageCode).toBe(0xfc);
      expect(frame.interfaceObject).toBe(0x0000);
      expect(frame.objectInstance).toBe(0x01);
      expect(frame.propertyId).toBe(0x34);
      expect(frame.numberOfElements).toBe(1);
      expect(frame.startIndex).toBe(1);
    });
  });
});

describe('CEMIPropertyReadCon', () => {
  describe('constructor', () => {
    test('should create a valid property read confirmation', () => {
      const data = Buffer.from([0x00]);
      const frame = new CEMIPropertyReadCon(0x0000, 0x01, Properties.PID_COMM_MODE, 1, 1, data);

      expect(frame.messageCode).toBe(CEMIMessageCode.M_PROP_READ_CON);
      expect(frame.interfaceObject).toBe(0x0000);
      expect(frame.objectInstance).toBe(0x01);
      expect(frame.propertyId).toBe(Properties.PID_COMM_MODE);
      expect(frame.numberOfElements).toBe(1);
      expect(frame.startIndex).toBe(1);
      expect(frame.data).toEqual(data);
    });

    test('should throw when numberOfElements exceeds 15', () => {
      expect(
        () => new CEMIPropertyReadCon(0, 1, 1, 16, 1, Buffer.alloc(1))
      ).toThrow('Number of elements cannot exceed 15 (4 bits)');
    });

    test('should throw when startIndex exceeds 4095', () => {
      expect(
        () => new CEMIPropertyReadCon(0, 1, 1, 1, 4096, Buffer.alloc(1))
      ).toThrow('Start index cannot exceed 4095 (12 bits)');
    });
  });

  describe('toBuffer', () => {
    test('should produce a buffer of correct length (7 + data)', () => {
      const data = Buffer.from([0x01, 0x02]);
      const frame = new CEMIPropertyReadCon(0, 1, 1, 1, 1, data);
      expect(frame.toBuffer().length).toBe(9);
    });

    test('should encode message code as M_PROP_READ_CON (0xFB)', () => {
      const frame = new CEMIPropertyReadCon(0, 1, 1, 1, 1, Buffer.from([0x00]));
      expect(frame.toBuffer()[0]).toBe(0xfb);
    });
  });

  describe('fromBuffer', () => {
    test('should parse a valid buffer round-trip', () => {
      const data = Buffer.from([0xDE, 0xAD]);
      const original = new CEMIPropertyReadCon(0x0300, 0x02, 0x52, 2, 3, data);
      const parsed = CEMIPropertyReadCon.fromBuffer(original.toBuffer());

      expect(parsed.interfaceObject).toBe(0x0300);
      expect(parsed.objectInstance).toBe(0x02);
      expect(parsed.propertyId).toBe(0x52);
      expect(parsed.numberOfElements).toBe(2);
      expect(parsed.startIndex).toBe(3);
      expect(parsed.data.toString('hex')).toBe('dead');
    });

    test('should throw when buffer is too short', () => {
      expect(() => CEMIPropertyReadCon.fromBuffer(Buffer.alloc(6))).toThrow(
        'Invalid CEMIPropertyReadCon frame: too short'
      );
    });

    test('should throw when message code is wrong', () => {
      const buf = Buffer.alloc(8);
      buf[0] = 0xfc; // M_PROP_READ_REQ, not M_PROP_READ_CON
      expect(() => CEMIPropertyReadCon.fromBuffer(buf)).toThrow(
        'Invalid message code for CEMIPropertyReadCon'
      );
    });
  });

  describe('isValid', () => {
    test('should return true for a valid frame', () => {
      const frame = new CEMIPropertyReadCon(0, 1, 1, 1, 1, Buffer.from([0x00]));
      expect(frame.isValid()).toBe(true);
    });
  });

  describe('binary test vector', () => {
    // M_PROP_READ_CON (0xFB), interfaceObject=0x0000, objectInstance=0x01,
    // propertyId=0x34, numberOfElements=1, startIndex=1, data=0x00 (DataLinkLayer)
    const vector = Buffer.from([0xfb, 0x00, 0x00, 0x01, 0x34, 0x10, 0x01, 0x00]);

    test('should parse binary vector correctly', () => {
      const frame = CEMIPropertyReadCon.fromBuffer(vector);
      expect(frame.messageCode).toBe(0xfb);
      expect(frame.interfaceObject).toBe(0x0000);
      expect(frame.objectInstance).toBe(0x01);
      expect(frame.propertyId).toBe(0x34);
      expect(frame.numberOfElements).toBe(1);
      expect(frame.startIndex).toBe(1);
      expect(frame.data[0]).toBe(0x00);
    });
  });

  describe('message code distinctness', () => {
    test('CEMIPropertyWrite uses 0xF6, ReadReq uses 0xFC, ReadCon uses 0xFB', () => {
      const writeFrame = new CEMIPropertyWrite(0, 1, 1, 1, 1, Buffer.from([0]));
      const readReq = new CEMIPropertyReadReq(0, 1, 1, 1, 1);
      const readCon = new CEMIPropertyReadCon(0, 1, 1, 1, 1, Buffer.from([0]));

      expect(writeFrame.messageCode).toBe(0xf6);
      expect(readReq.messageCode).toBe(0xfc);
      expect(readCon.messageCode).toBe(0xfb);
    });
  });
});
