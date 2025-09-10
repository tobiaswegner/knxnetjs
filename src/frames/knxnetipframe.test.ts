import { KNXnetIPFrame } from './knxnetipframe';
import { KNX_CONSTANTS } from '../constants';

describe('KNXnetIPFrame', () => {
  describe('Constructor and Serialization', () => {
    test('should construct frame with service and payload', () => {
      const service = KNX_CONSTANTS.SERVICE_TYPES.SEARCH_REQUEST;
      const payload = Buffer.from([0x01, 0x02, 0x03, 0x04]);
      
      const frame = new KNXnetIPFrame(service, payload);
      
      expect(frame.service).toBe(service);
      expect(frame.payload).toEqual(payload);
    });

    test('should serialize to buffer with correct header and payload', () => {
      const service = KNX_CONSTANTS.SERVICE_TYPES.SEARCH_REQUEST;
      const payload = Buffer.from([0x01, 0x02, 0x03, 0x04]);
      const frame = new KNXnetIPFrame(service, payload);
      
      const buffer = frame.toBuffer();
      
      expect(buffer.length).toBe(KNX_CONSTANTS.HEADER_SIZE + payload.length);
      expect(buffer.readUInt8(0)).toBe(KNX_CONSTANTS.HEADER_SIZE);
      expect(buffer.readUInt8(1)).toBe(KNX_CONSTANTS.KNXNETIP_VERSION);
      expect(buffer.readUInt16BE(2)).toBe(service);
      expect(buffer.readUInt16BE(4)).toBe(KNX_CONSTANTS.HEADER_SIZE + payload.length);
      expect(buffer.slice(KNX_CONSTANTS.HEADER_SIZE)).toEqual(payload);
    });
  });

  describe('Parsing from Buffer', () => {
    test('should parse valid buffer correctly', () => {
      const service = KNX_CONSTANTS.SERVICE_TYPES.SEARCH_RESPONSE;
      const payload = Buffer.from([0xAA, 0xBB, 0xCC, 0xDD]);
      const totalLength = KNX_CONSTANTS.HEADER_SIZE + payload.length;
      
      const buffer = Buffer.alloc(totalLength);
      buffer.writeUInt8(KNX_CONSTANTS.HEADER_SIZE, 0);
      buffer.writeUInt8(KNX_CONSTANTS.KNXNETIP_VERSION, 1);
      buffer.writeUInt16BE(service, 2);
      buffer.writeUInt16BE(totalLength, 4);
      payload.copy(buffer, KNX_CONSTANTS.HEADER_SIZE);
      
      const frame = KNXnetIPFrame.fromBuffer(buffer);
      
      expect(frame.service).toBe(service);
      expect(frame.payload).toEqual(payload);
    });

    test('should throw error for buffer too short for header', () => {
      const shortBuffer = Buffer.from([0x06, 0x10]);
      
      expect(() => KNXnetIPFrame.fromBuffer(shortBuffer)).toThrow('Buffer too short for KNXnet/IP header');
    });

    test('should throw error for invalid header size', () => {
      const buffer = Buffer.from([0x05, 0x10, 0x02, 0x01, 0x00, 0x06]);
      
      expect(() => KNXnetIPFrame.fromBuffer(buffer)).toThrow('Invalid header size: 5, expected 6');
    });

    test('should throw error for invalid version', () => {
      const buffer = Buffer.from([0x06, 0x20, 0x02, 0x01, 0x00, 0x06]);
      
      expect(() => KNXnetIPFrame.fromBuffer(buffer)).toThrow('Invalid KNXnet/IP version: 0x20, expected 0x10');
    });

    test('should throw error for buffer length mismatch', () => {
      const buffer = Buffer.from([0x06, 0x10, 0x02, 0x01, 0x00, 0x10]);
      
      expect(() => KNXnetIPFrame.fromBuffer(buffer)).toThrow('Buffer length does not match declared length');
    });
  });

  describe('isValid Method', () => {
    test('should return true for valid frame', () => {
      const frame = new KNXnetIPFrame(KNX_CONSTANTS.SERVICE_TYPES.SEARCH_REQUEST, Buffer.alloc(0));
      
      expect(frame.isValid()).toBe(true);
    });
  });

  describe('Round-trip Consistency', () => {
    test('should maintain consistency after serialize and parse', () => {
      const originalService = KNX_CONSTANTS.SERVICE_TYPES.TUNNELLING_REQUEST;
      const originalPayload = Buffer.from([0x04, 0x01, 0x00, 0x29, 0x00, 0xBC, 0xD0]);
      const originalFrame = new KNXnetIPFrame(originalService, originalPayload);
      
      const serialized = originalFrame.toBuffer();
      const parsedFrame = KNXnetIPFrame.fromBuffer(serialized);
      
      expect(parsedFrame.service).toBe(originalFrame.service);
      expect(parsedFrame.payload).toEqual(originalFrame.payload);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty payload', () => {
      const frame = new KNXnetIPFrame(KNX_CONSTANTS.SERVICE_TYPES.CONNECT_REQUEST, Buffer.alloc(0));
      const buffer = frame.toBuffer();
      
      expect(buffer.length).toBe(KNX_CONSTANTS.HEADER_SIZE);
      
      const parsedFrame = KNXnetIPFrame.fromBuffer(buffer);
      expect(parsedFrame.payload.length).toBe(0);
    });

    test('should handle large payload', () => {
      const largePayload = Buffer.alloc(1000, 0xFF);
      const frame = new KNXnetIPFrame(KNX_CONSTANTS.SERVICE_TYPES.ROUTING_INDICATION, largePayload);
      const buffer = frame.toBuffer();
      
      expect(buffer.length).toBe(KNX_CONSTANTS.HEADER_SIZE + 1000);
      
      const parsedFrame = KNXnetIPFrame.fromBuffer(buffer);
      expect(parsedFrame.payload).toEqual(largePayload);
    });

    test('should handle minimum valid buffer', () => {
      const minBuffer = Buffer.from([0x06, 0x10, 0x02, 0x01, 0x00, 0x06]);
      
      const frame = KNXnetIPFrame.fromBuffer(minBuffer);
      
      expect(frame.service).toBe(KNX_CONSTANTS.SERVICE_TYPES.SEARCH_REQUEST);
      expect(frame.payload.length).toBe(0);
    });
  });
});