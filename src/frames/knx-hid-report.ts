export class KNXHIDReport {
  private static readonly MAX_BODY_LENGTH = 61;
  private static readonly REPORT_SIZE = 64;

  private reportId: number;
  private sequenceCounter: number;
  private packageType: number;
  private bodyLength: number;
  private body: Buffer;

  constructor(
    body: Buffer,
    reportId: number = 1,
    sequenceCounter: number = 1,
    packageType: number = 3
  ) {
    if (body.length > KNXHIDReport.MAX_BODY_LENGTH) {
      throw new Error(
        `Body length ${body.length} exceeds maximum of ${KNXHIDReport.MAX_BODY_LENGTH} bytes`
      );
    }
    if (reportId < 0 || reportId > 255) {
      throw new Error(`Report ID ${reportId} must be between 0 and 255`);
    }
    if (sequenceCounter < 0 || sequenceCounter > 15) {
      throw new Error(
        `Sequence counter ${sequenceCounter} must be between 0 and 15`
      );
    }
    if (packageType < 0 || packageType > 15) {
      throw new Error(`Package type ${packageType} must be between 0 and 15`);
    }

    this.reportId = reportId;
    this.sequenceCounter = sequenceCounter & 0x0f;
    this.packageType = packageType & 0x0f;
    this.bodyLength = body.length;
    this.body = Buffer.from(body);
  }

  static fromBuffer(buffer: Buffer): KNXHIDReport {
    if (buffer.length < 3) {
      throw new Error("Buffer too short for KNX HID report");
    }

    const reportId = buffer[0]!;
    const sequenceAndType = buffer[1]!;
    const sequenceCounter = (sequenceAndType >> 4) & 0x0f;
    const packageType = sequenceAndType & 0x0f;
    const bodyLength = buffer[2]!;

    if (buffer.length < 3 + bodyLength) {
      throw new Error(
        `Buffer too short for declared body length ${bodyLength}`
      );
    }

    const body = buffer.subarray(3, 3 + bodyLength);

    return new KNXHIDReport(body, reportId, sequenceCounter, packageType);
  }

  toBuffer(): Buffer {
    const buffer = Buffer.alloc(KNXHIDReport.REPORT_SIZE);

    // Report ID (8 bits)
    buffer[0] = this.reportId;

    // Sequence counter (4 bits) + Package type (4 bits)
    buffer[1] = (this.sequenceCounter << 4) | this.packageType;

    // Body length (8 bits)
    buffer[2] = this.bodyLength;

    // Body data
    this.body.copy(buffer, 3);

    // Remaining bytes are already zero from Buffer.alloc()

    return buffer;
  }

  getReportId(): number {
    return this.reportId;
  }

  setReportId(reportId: number): void {
    if (reportId < 0 || reportId > 255) {
      throw new Error(`Report ID ${reportId} must be between 0 and 255`);
    }
    this.reportId = reportId;
  }

  getSequenceCounter(): number {
    return this.sequenceCounter;
  }

  setSequenceCounter(counter: number): void {
    if (counter < 0 || counter > 15) {
      throw new Error(`Sequence counter ${counter} must be between 0 and 15`);
    }
    this.sequenceCounter = counter & 0x0f;
  }

  getPackageType(): number {
    return this.packageType;
  }

  setPackageType(type: number): void {
    if (type < 0 || type > 15) {
      throw new Error(`Package type ${type} must be between 0 and 15`);
    }
    this.packageType = type & 0x0f;
  }

  getBodyLength(): number {
    return this.bodyLength;
  }

  getBody(): Buffer {
    return Buffer.from(this.body);
  }

  setBody(body: Buffer): void {
    if (body.length > KNXHIDReport.MAX_BODY_LENGTH) {
      throw new Error(
        `Body length ${body.length} exceeds maximum of ${KNXHIDReport.MAX_BODY_LENGTH} bytes`
      );
    }
    this.body = Buffer.from(body);
    this.bodyLength = body.length;
  }

  toString(): string {
    return (
      `KNXHIDReport { reportId: 0x${this.reportId
        .toString(16)
        .padStart(2, "0")}, ` +
      `seq: ${this.sequenceCounter}, type: ${this.packageType}, ` +
      `bodyLen: ${this.bodyLength}, body: ${this.body.toString("hex")} }`
    );
  }
}
