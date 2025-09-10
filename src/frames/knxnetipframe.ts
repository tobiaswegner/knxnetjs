import { KNX_CONSTANTS } from '../constants';

export class KNXnetIPFrame {
  public readonly service: number;
  public readonly payload: Buffer;

  constructor(service: number, buffer: Buffer) {
    this.service = service;
    this.payload = buffer;
  }

  static fromBuffer(buffer: Buffer): KNXnetIPFrame {
    if (buffer.length < KNX_CONSTANTS.HEADER_SIZE) {
      throw new Error('Buffer too short for KNXnet/IP header');
    }

    const headerSize = buffer.readUInt8(0);
    const version = buffer.readUInt8(1);
    const service = buffer.readUInt16BE(2);
    const totalLength = buffer.readUInt16BE(4);

    if (buffer.length < totalLength) {
      throw new Error('Buffer length does not match declared length');
    }

    if (headerSize !== KNX_CONSTANTS.HEADER_SIZE) {
      throw new Error(`Invalid header size: ${headerSize}, expected ${KNX_CONSTANTS.HEADER_SIZE}`);
    }

    if (version !== KNX_CONSTANTS.KNXNETIP_VERSION) {
      throw new Error(`Invalid KNXnet/IP version: 0x${version.toString(16)}, expected 0x${KNX_CONSTANTS.KNXNETIP_VERSION.toString(16)}`);
    }

    const payload = buffer.slice(KNX_CONSTANTS.HEADER_SIZE, totalLength);
    return new KNXnetIPFrame(service, payload);
  }

  toBuffer(): Buffer {
    const totalLength = KNX_CONSTANTS.HEADER_SIZE + this.payload.length;
    const buffer = Buffer.alloc(totalLength);

    buffer.writeUInt8(KNX_CONSTANTS.HEADER_SIZE, 0);
    buffer.writeUInt8(KNX_CONSTANTS.KNXNETIP_VERSION, 1);
    buffer.writeUInt16BE(this.service, 2);
    buffer.writeUInt16BE(totalLength, 4);
    
    this.payload.copy(buffer, KNX_CONSTANTS.HEADER_SIZE);

    return buffer;
  }

  isValid(): boolean {
    return true;
  }
}