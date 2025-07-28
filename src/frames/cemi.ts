export interface KNXAddress {
  area: number;
  line: number;
  device: number;
}

export interface KNXGroupAddress {
  main: number;
  middle: number;
  sub: number;
}

export enum CEMIMessageCode {
  L_DATA_REQ = 0x11,
  L_DATA_CON = 0x2e,
  L_DATA_IND = 0x29,
  L_BUSMON_IND = 0x2b,
  L_RAW_REQ = 0x10,
  L_RAW_IND = 0x2d,
  L_RAW_CON = 0x2f,
  L_POLL_DATA_REQ = 0x13,
  L_POLL_DATA_CON = 0x25,

  // Management services
  M_PROP_READ_REQ = 0xfc,
  M_PROP_READ_CON = 0xfb,
  M_PROP_WRITE_REQ = 0xf6,
  M_PROP_WRITE_CON = 0xf5,
  M_PROP_INFO_IND = 0xf7,
  M_FUNC_PROP_COM_REQ = 0xf8,
  M_FUNC_PROP_ST_REQ = 0xf9,
  M_FUNC_PROP_CON = 0xfa,
  M_RESET_REQ = 0xf1,
  M_RESET_IND = 0xf0,
}

export enum Priority {
  SYSTEM = 0,
  NORMAL = 1,
  URGENT = 2,
  LOW = 3,
}

export interface AdditionalInfo {
  type: number;
  length: number;
  data: Buffer;
}

export class CEMIFrame {
  private buffer: Buffer;

  constructor(buffer: Buffer) {
    if (buffer.length < 2) {
      throw new Error("Invalid cEMI frame: too short");
    }
    this.buffer = buffer;
  }

  static fromBuffer(buffer: Buffer): CEMIFrame {
    return new CEMIFrame(buffer);
  }

  static create(
    messageCode: CEMIMessageCode,
    sourceAddress: number,
    destinationAddress: number,
    data: Buffer,
    priority: Priority = Priority.LOW,
    hopCount: number = 6,
    additionalInfo: AdditionalInfo[] = []
  ): CEMIFrame {
    // Calculate additional info total length
    let additionalInfoLength = 0;
    for (const info of additionalInfo) {
      additionalInfoLength += 2 + info.data.length; // type + length + data
    }

    const serviceInfoLength = 6 + data.length; // L_Data service info
    const frameLength = 2 + additionalInfoLength + serviceInfoLength;
    const buffer = Buffer.allocUnsafe(frameLength);

    let offset = 0;

    // Message Code
    buffer.writeUInt8(messageCode, offset++);

    // Additional Info Length
    buffer.writeUInt8(additionalInfoLength, offset++);

    // Additional Information
    for (const info of additionalInfo) {
      buffer.writeUInt8(info.type, offset++);
      buffer.writeUInt8(info.data.length, offset++);
      info.data.copy(buffer, offset);
      offset += info.data.length;
    }

    // Service Information (L_Data)
    // Control Field 1 (CTRL1)
    const ctrl1 = (hopCount << 4) | (priority << 2) | 0x00; // No repeat, no broadcast, no ack
    buffer.writeUInt8(ctrl1, offset++);

    // Source Address
    buffer.writeUInt16BE(sourceAddress, offset);
    offset += 2;

    // Destination Address
    buffer.writeUInt16BE(destinationAddress, offset);
    offset += 2;

    // Data Length
    buffer.writeUInt8(data.length, offset++);

    // TPCI + APCI + Data
    if (data.length > 0) {
      data.copy(buffer, offset);
    } else {
      buffer.writeUInt8(0x00, offset); // Default TPCI/APCI
    }

    return new CEMIFrame(buffer);
  }

  get messageCode(): CEMIMessageCode {
    return this.buffer.readUInt8(0) as CEMIMessageCode;
  }

  get messageType(): string {
    switch (this.messageCode) {
      case CEMIMessageCode.L_DATA_REQ:
        return "L_DATA.req";
      case CEMIMessageCode.L_DATA_CON:
        return "L_DATA.con";
      case CEMIMessageCode.L_DATA_IND:
        return "L_DATA.ind";
      case CEMIMessageCode.L_BUSMON_IND:
        return "L_BUSMON.ind";
      case CEMIMessageCode.L_RAW_REQ:
        return "L_RAW.req";
      case CEMIMessageCode.L_RAW_IND:
        return "L_RAW.ind";
      case CEMIMessageCode.L_RAW_CON:
        return "L_RAW.con";
      case CEMIMessageCode.L_POLL_DATA_REQ:
        return "L_POLL_DATA.req";
      case CEMIMessageCode.L_POLL_DATA_CON:
        return "L_POLL_DATA.con";
      case CEMIMessageCode.M_PROP_READ_REQ:
        return "M_PropRead.req";
      case CEMIMessageCode.M_PROP_READ_CON:
        return "M_PropRead.con";
      case CEMIMessageCode.M_PROP_WRITE_REQ:
        return "M_PropWrite.req";
      case CEMIMessageCode.M_PROP_WRITE_CON:
        return "M_PropWrite.con";
      case CEMIMessageCode.M_PROP_INFO_IND:
        return "M_PropInfo.ind";
      case CEMIMessageCode.M_FUNC_PROP_COM_REQ:
        return "M_FuncPropCom.req";
      case CEMIMessageCode.M_FUNC_PROP_ST_REQ:
        return "M_FuncPropSt.req";
      case CEMIMessageCode.M_FUNC_PROP_CON:
        return "M_FuncProp.con";
      case CEMIMessageCode.M_RESET_REQ:
        return "M_Reset.req";
      case CEMIMessageCode.M_RESET_IND:
        return "M_Reset.ind";
      default:
        return "Unknown";
    }
  }

  get additionalInfoLength(): number {
    return this.buffer.length > 1 ? this.buffer.readUInt8(1) : 0;
  }

  get additionalInfo(): AdditionalInfo[] {
    const additionalInfos: AdditionalInfo[] = [];
    const addInfoLength = this.additionalInfoLength;

    if (addInfoLength === 0 || this.buffer.length < 2 + addInfoLength) {
      return additionalInfos;
    }

    let offset = 2;
    const endOffset = 2 + addInfoLength;

    while (offset < endOffset) {
      if (offset + 1 >= endOffset) break;

      const type = this.buffer.readUInt8(offset++);
      const length = this.buffer.readUInt8(offset++);

      if (offset + length > endOffset) break;

      const data = this.buffer.subarray(offset, offset + length);
      additionalInfos.push({ type, length, data });
      offset += length;
    }

    return additionalInfos;
  }

  private get serviceInfoOffset(): number {
    return 2 + this.additionalInfoLength;
  }

  get controlField1(): number {
    const offset = this.serviceInfoOffset;
    return this.buffer.length > offset ? this.buffer.readUInt8(offset) : 0;
  }

  get controlField2(): number {
    if (this.extendedFrame) {
      const offset = this.serviceInfoOffset + 1;
      return this.buffer.length > offset ? this.buffer.readUInt8(offset) : 0;
    } else {
      return 0;
    }
  }

  get priority(): Priority {
    return (this.controlField1 >> 2) & 0x03;
  }

  get priorityText(): string {
    switch (this.priority) {
      case Priority.SYSTEM:
        return "System";
      case Priority.NORMAL:
        return "Normal";
      case Priority.URGENT:
        return "Urgent";
      case Priority.LOW:
        return "Low";
      default:
        return "Unknown";
    }
  }

  get extendedFrame(): boolean {
    return (this.controlField1 & 0x40) === 0;
  }

  get standardFrame(): boolean {
    return (this.controlField1 & 0x40) !== 0;
  }

  get repeatFlag(): boolean {
    return (this.controlField1 & 0x20) !== 0;
  }

  get systemBroadcast(): boolean {
    return (this.controlField1 & 0x10) !== 0;
  }

  get acknowledgeRequest(): boolean {
    return (this.controlField1 & 0x02) !== 0;
  }

  get confirmFlag(): boolean {
    return (this.controlField1 & 0x01) !== 0;
  }

  get hopCount(): number {
    return (this.controlField2 >> 4) & 0x07;
  }

  get routingCounter(): number {
    return this.hopCount;
  }

  get sourceAddress(): number {
    const offset = this.serviceInfoOffset + 1 + (this.extendedFrame ? 1 : 0);
    if (this.buffer.length < offset + 2) return 0;
    return this.buffer.readUInt16BE(offset);
  }

  get sourceAddressString(): string {
    const addr = this.sourceAddress;
    const area = (addr >> 12) & 0x0f;
    const line = (addr >> 8) & 0x0f;
    const device = addr & 0xff;
    return `${area}.${line}.${device}`;
  }

  get destinationAddress(): number {
    const offset = this.serviceInfoOffset + 3 + (this.extendedFrame ? 1 : 0);
    if (this.buffer.length < offset + 2) return 0;
    return this.buffer.readUInt16BE(offset);
  }

  get destinationAddressString(): string {
    const addr = this.destinationAddress;
    if (this.isGroupAddress) {
      const main = (addr >> 11) & 0x1f;
      const middle = (addr >> 8) & 0x07;
      const sub = addr & 0xff;
      return `${main}/${middle}/${sub}`;
    } else {
      const area = (addr >> 12) & 0x0f;
      const line = (addr >> 8) & 0x0f;
      const device = addr & 0xff;
      return `${area}.${line}.${device}`;
    }
  }

  get isGroupAddress(): boolean {
    return (this.controlField2 & 0x80) !== 0;
  }

  get dataLength(): number {
    const offset = this.serviceInfoOffset + 5 + (this.extendedFrame ? 1 : 0);
    if (this.buffer.length < offset + 1) return 0;
    return this.buffer.readUInt8(offset);
  }

  get data(): Buffer {
    const offset = this.serviceInfoOffset + 6 + (this.extendedFrame ? 1 : 0);
    if (this.buffer.length <= offset) return Buffer.alloc(0);
    return this.buffer.subarray(offset);
  }

  get tpci(): number {
    const data = this.data;
    if (data.length === 0) return 0;
    return (data.readUInt8(0) >> 6) & 0x03;
  }

  get apci(): number {
    const data = this.data;
    if (data.length === 0) return 0;
    if (data.length === 1) {
      return data.readUInt8(0) & 0x3f;
    }
    return ((data.readUInt8(0) & 0x03) << 8) | data.readUInt8(1);
  }

  get applicationData(): Buffer {
    const data = this.data;
    if (data.length <= 1) return Buffer.alloc(0);
    return data.subarray(data.length === 1 ? 1 : 2);
  }

  get rawBuffer(): Buffer {
    return this.buffer;
  }

  get length(): number {
    return this.buffer.length;
  }

  toBuffer(): Buffer {
    return Buffer.from(this.buffer);
  }

  toString(): string {
    return this.buffer.toString("hex").toUpperCase();
  }

  toFormattedString(includeTimestamp: boolean = true): string {
    let output = "";

    if (includeTimestamp) {
      output += `[${new Date().toISOString()}] `;
    }

    output += this.messageType;
    output += ` | Routing: ${this.hopCount} | Priority: ${this.priorityText}`;

    if (this.buffer.length >= 6) {
      output += ` | Src: ${this.sourceAddressString}`;
      output += ` | Dst: ${this.destinationAddressString}`;
      output += ` | Length: ${this.dataLength}`;

      if (this.data.length > 0) {
        output += ` | Data: ${this.data.toString("hex").toUpperCase()}`;
      }
    }

    output += ` | Raw: ${this.toString()}`;

    return output;
  }

  isValid(): boolean {
    if (this.buffer.length < 2) return false;

    const addInfoLength = this.additionalInfoLength;
    const minFrameLength = 2 + addInfoLength;

    if (this.buffer.length < minFrameLength) return false;

    // Check if we have service information for L_Data services
    const serviceOffset = this.serviceInfoOffset;
    if (this.buffer.length < serviceOffset + 6) return true; // Minimal frame

    const declaredLength = this.dataLength;
    const actualDataLength = this.buffer.length - (serviceOffset + 6);

    return actualDataLength >= declaredLength;
  }

  static isValidBuffer(buffer: Buffer): boolean {
    if (buffer.length < 2) return false;

    const messageCode = buffer.readUInt8(0);
    return Object.values(CEMIMessageCode).includes(messageCode);
  }
}
