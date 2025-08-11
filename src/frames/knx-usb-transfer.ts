/**
 * KNX USB Transfer Protocol implementation
 * Handles the KNX USB Transfer Protocol Header and Body structures
 */

export enum KNXUSBTransferProtocolId {
  KNXTunnel = 0x01,
  BusAccessServerFeatureService = 0x0f,
}

export enum KNXUSBTransferEMIId {
  EMI1 = 0x01,
  EMI2 = 0x02,
  cEMI = 0x03,
}

export interface KNXUSBTransferHeader {
  protocolVersion: number; // 1 octet - 00h
  headerLength: number; // 1 octet - 08h
  bodyLength: number; // 2 octets - length of body
  protocolId: number; // 1 octet - 01h for KNX tunnel
  emiId: number; // 1 octet - 03h for common EMI
  manufacturerCode: number; // 2 octets - 00h 00h by default
}

export interface KNXUSBTransferBody {
  emiMessageCode: number; // 1 octet - 11h for cEMI format
  data: Buffer; // EMI Message Data (cEMI/EMI1/EMI2) - max 52 octets
}

export class KNXUSBTransferFrame {
  public header: KNXUSBTransferHeader;
  public body: KNXUSBTransferBody;

  constructor(header: KNXUSBTransferHeader, body: KNXUSBTransferBody) {
    this.header = header;
    this.body = body;
  }

  /**
   * Creates a KNX USB Transfer Frame from a Buffer
   */
  static fromBuffer(buffer: Buffer): KNXUSBTransferFrame {
    if (buffer.length < 8) {
      throw new Error("Buffer too short for KNX USB Transfer Header");
    }

    // Parse Header
    const header: KNXUSBTransferHeader = {
      protocolVersion: buffer[0] || 0,
      headerLength: buffer[1] || 0,
      bodyLength: buffer.readUInt16BE(2),
      protocolId: buffer[4] || 0,
      emiId: buffer[5] || 0,
      manufacturerCode: buffer.readUInt16BE(6),
    };

    // Validate header
    if (header.headerLength !== 0x08) {
      throw new Error(`Invalid header length: ${header.headerLength}`);
    }

    if (buffer.length < header.headerLength + 1) {
      throw new Error("Buffer too short for KNX USB Transfer Body");
    }

    // Parse Body
    const bodyStart = header.headerLength;
    const emiMessageCode = buffer[bodyStart] || 0;
    const data = buffer.subarray(bodyStart + 1);

    const body: KNXUSBTransferBody = {
      emiMessageCode,
      data,
    };

    return new KNXUSBTransferFrame(header, body);
  }

  /**
   * Converts the frame to a Buffer
   */
  toBuffer(): Buffer {
    const bodyBuffer = Buffer.allocUnsafe(1 + this.body.data.length);
    bodyBuffer[0] = this.body.emiMessageCode;
    this.body.data.copy(bodyBuffer, 1);

    const headerBuffer = Buffer.allocUnsafe(8);
    headerBuffer[0] = this.header.protocolVersion;
    headerBuffer[1] = this.header.headerLength;
    headerBuffer.writeUInt16BE(bodyBuffer.length, 2); // body length
    headerBuffer[4] = this.header.protocolId;
    headerBuffer[5] = this.header.emiId;
    headerBuffer.writeUInt16BE(this.header.manufacturerCode, 6);

    return Buffer.concat([headerBuffer, bodyBuffer]);
  }

  /**
   * Creates a KNX USB Transfer Frame for cEMI data
   */
  static createForCEMI(
    cemiData: Buffer,
    manufacturerCode: number = 0x0000
  ): KNXUSBTransferFrame {
    const body: KNXUSBTransferBody = {
      emiMessageCode: cemiData[0]!,
      data: cemiData.subarray(1),
    };

    const header: KNXUSBTransferHeader = {
      protocolVersion: 0x00,
      headerLength: 0x08,
      bodyLength: 1 + cemiData.length, // message code + data
      protocolId: KNXUSBTransferProtocolId.KNXTunnel,
      emiId: KNXUSBTransferEMIId.cEMI,
      manufacturerCode,
    };

    return new KNXUSBTransferFrame(header, body);
  }

  /**
   * Creates a KNX USB Transfer Frame for bus access
   */
  static createForBusAccess(
    service: number,
    feature: number,
    value: Buffer
  ): KNXUSBTransferFrame {
    const body: KNXUSBTransferBody = {
      emiMessageCode: feature,
      data: value,
    };

    const header: KNXUSBTransferHeader = {
      protocolVersion: 0x00,
      headerLength: 0x08,
      bodyLength: 1 + value.length, // feature + data
      protocolId: KNXUSBTransferProtocolId.BusAccessServerFeatureService,
      emiId: service,
      manufacturerCode: 0x0000,
    };

    return new KNXUSBTransferFrame(header, body);
  }

  /**
   * Validates if a buffer contains a valid KNX USB Transfer Frame
   */
  static isValid(buffer: Buffer): boolean {
    if (buffer.length < 9) {
      // Minimum: 8-byte header + 1-byte EMI message code
      return false;
    }

    const protocolVersion = buffer[0];
    const headerLength = buffer[1];
    const protocolId = buffer[4];
    const emiId = buffer[5];

    return (
      protocolVersion === 0x00 &&
      headerLength === 0x08 &&
      protocolId === KNXUSBTransferProtocolId.KNXTunnel &&
      emiId === KNXUSBTransferEMIId.cEMI
    );
  }

  /**
   * Gets the cEMI data from the frame body
   */
  getCEMIData(): Buffer | null {
    if (this.body.emiMessageCode === 0x11) {
      // cEMI format
      return this.body.data;
    }
    return null;
  }

  /**
   * Returns frame information as a string for debugging
   */
  toString(): string {
    return `KNXUSBTransferFrame {
  header: {
    protocolVersion: 0x${this.header.protocolVersion
      .toString(16)
      .padStart(2, "0")},
    headerLength: 0x${this.header.headerLength.toString(16).padStart(2, "0")},
    bodyLength: ${this.header.bodyLength},
    protocolId: 0x${this.header.protocolId.toString(16).padStart(2, "0")},
    emiId: 0x${this.header.emiId.toString(16).padStart(2, "0")},
    manufacturerCode: 0x${this.header.manufacturerCode
      .toString(16)
      .padStart(4, "0")}
  },
  body: {
    emiMessageCode: 0x${this.body.emiMessageCode.toString(16).padStart(2, "0")},
    dataLength: ${this.body.data.length}
  }
}`;
  }
}
