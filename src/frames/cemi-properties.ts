import { CEMIMessageCode } from "./cemi";

export enum Properties {
  PID_COMM_MODE = 52,
}

export enum DPT_CommMode {
  DataLinkLayer = 0x00,
  DataLinkLayerBusmonitor = 0x01,
  DataLinkLayerRawFrames = 0x02,
  CEMITranpsortLayer = 0x06,
  NoLayer = 0xff,
}

/*
 * Basic message structure for Data Properties
 *
 * Message code, 1 byte
 * Interface object, 2 byte
 * Object Instance, 1 byte
 * Property Id, 1 byte
 * Number of elements, 4 bits
 * start index, 12 bits
 * data
 */
export class CEMIPropertyWrite {
  private buffer: Buffer;

  constructor(
    interfaceObject: number,
    objectInstance: number,
    propertyId: number,
    numberOfElements: number,
    startIndex: number,
    data: Buffer
  ) {
    if (numberOfElements > 15) {
      throw new Error("Number of elements cannot exceed 15 (4 bits)");
    }
    if (startIndex > 4095) {
      throw new Error("Start index cannot exceed 4095 (12 bits)");
    }

    // Calculate buffer size: 1 (msg code) + 2 (interface obj) + 1 (obj instance) + 1 (prop id) + 2 (elements+index) + data
    const bufferSize = 7 + data.length;
    this.buffer = Buffer.allocUnsafe(bufferSize);

    let offset = 0;

    // Message code - M_PROP_WRITE_REQ
    this.buffer.writeUInt8(CEMIMessageCode.M_PROP_WRITE_REQ, offset++);

    // Interface object (2 bytes, big endian)
    this.buffer.writeUInt16BE(interfaceObject, offset);
    offset += 2;

    // Object Instance (1 byte)
    this.buffer.writeUInt8(objectInstance, offset++);

    // Property Id (1 byte)
    this.buffer.writeUInt8(propertyId, offset++);

    // Number of elements (4 bits) + start index (12 bits)
    // Pack into 2 bytes: NNNN IIII IIII IIII
    const packed = (numberOfElements << 12) | (startIndex & 0x0fff);
    this.buffer.writeUInt16BE(packed, offset);
    offset += 2;

    // Data
    data.copy(this.buffer, offset);
  }

  static fromBuffer(buffer: Buffer): CEMIPropertyWrite {
    if (buffer.length < 7) {
      throw new Error("Invalid CEMIPropertyWrite frame: too short");
    }

    const messageCode = buffer.readUInt8(0);
    if (messageCode !== 0xf6) {
      throw new Error("Invalid message code for CEMIPropertyWrite");
    }

    const interfaceObject = buffer.readUInt16BE(1);
    const objectInstance = buffer.readUInt8(3);
    const propertyId = buffer.readUInt8(4);

    // Unpack number of elements and start index from 2 bytes
    const packed = buffer.readUInt16BE(5);
    const numberOfElements = (packed >> 12) & 0x0f;
    const startIndex = packed & 0x0fff;

    const data = buffer.subarray(7);

    return new CEMIPropertyWrite(
      interfaceObject,
      objectInstance,
      propertyId,
      numberOfElements,
      startIndex,
      data
    );
  }

  get messageCode(): number {
    return this.buffer.readUInt8(0);
  }

  get interfaceObject(): number {
    return this.buffer.readUInt16BE(1);
  }

  get objectInstance(): number {
    return this.buffer.readUInt8(3);
  }

  get propertyId(): number {
    return this.buffer.readUInt8(4);
  }

  get numberOfElements(): number {
    const packed = this.buffer.readUInt16BE(5);
    return (packed >> 12) & 0x0f;
  }

  get startIndex(): number {
    const packed = this.buffer.readUInt16BE(5);
    return packed & 0x0fff;
  }

  get data(): Buffer {
    return this.buffer.subarray(7);
  }

  toBuffer(): Buffer {
    return Buffer.from(this.buffer);
  }

  isValid(): boolean {
    return (
      this.buffer.length >= 7 &&
      this.messageCode === CEMIMessageCode.M_PROP_WRITE_REQ &&
      this.numberOfElements <= 15 &&
      this.startIndex <= 4095
    );
  }
}
