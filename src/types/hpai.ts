export enum HostProtocol {
  IPV4_UDP = 0x01,
  IPV4_TCP = 0x02
}

export interface HPAIInterface {
  hostProtocol: number;
  address: string;
  port: number;
}

export class HPAI implements HPAIInterface {
  public readonly hostProtocol: number;
  public readonly address: string;
  public readonly port: number;

  constructor(hostProtocol: number, address: string, port: number) {
    this.hostProtocol = hostProtocol;
    this.address = address;
    this.port = port;
  }

  static fromBuffer(buffer: Buffer): HPAI {
    if (buffer.length !== 8) {
      throw new Error(`Invalid buffer length: expected 8 bytes, got ${buffer.length}`);
    }

    const structureLength = buffer.readUInt8(0);
    if (structureLength !== 0x08) {
      throw new Error(`Invalid structure length: expected 0x08, got 0x${structureLength.toString(16)}`);
    }

    const hostProtocol = buffer.readUInt8(1);
    if (hostProtocol !== HostProtocol.IPV4_UDP && hostProtocol !== HostProtocol.IPV4_TCP) {
      throw new Error(`Invalid host protocol: 0x${hostProtocol.toString(16)}`);
    }

    // Read IPv4 address (4 bytes in network byte order)
    const addressBytes = [
      buffer.readUInt8(2),
      buffer.readUInt8(3),
      buffer.readUInt8(4),
      buffer.readUInt8(5)
    ];
    const address = addressBytes.join('.');

    // Validate IPv4 address format
    if (!this.isValidIPv4(address)) {
      throw new Error(`Invalid IPv4 address: ${address}`);
    }

    // Read port number (2 bytes in network byte order)
    const port = buffer.readUInt16BE(6);
    if (port > 65535) {
      throw new Error(`Invalid port number: ${port}`);
    }

    return new HPAI(hostProtocol, address, port);
  }

  toBuffer(): Buffer {
    if (!this.isValid()) {
      throw new Error('Cannot serialize invalid HPAI instance');
    }

    const buffer = Buffer.alloc(8);

    // Write structure length
    buffer.writeUInt8(0x08, 0);

    // Write host protocol
    buffer.writeUInt8(this.hostProtocol, 1);

    // Write IPv4 address (4 bytes in network byte order)
    const addressParts = this.address.split('.').map(part => parseInt(part, 10));
    if (addressParts.length !== 4) {
      throw new Error(`Invalid IPv4 address format: ${this.address}`);
    }
    for (let i = 0; i < 4; i++) {
      const part = addressParts[i]!; // We already validated length is 4
      if (isNaN(part) || part < 0 || part > 255) {
        throw new Error(`Invalid IPv4 address octet: ${part}`);
      }
      buffer.writeUInt8(part, 2 + i);
    }

    // Write port number (2 bytes in network byte order)
    buffer.writeUInt16BE(this.port, 6);

    return buffer;
  }

  isValid(): boolean {
    // Validate host protocol
    if (this.hostProtocol !== HostProtocol.IPV4_UDP && this.hostProtocol !== HostProtocol.IPV4_TCP) {
      return false;
    }

    // Validate IPv4 address
    if (!HPAI.isValidIPv4(this.address)) {
      return false;
    }

    // Validate port range (0 is valid in KNXnet/IP - means use source port)
    if (this.port < 0 || this.port > 65535) {
      return false;
    }

    return true;
  }

  toString(): string {
    const protocol = this.hostProtocol === HostProtocol.IPV4_UDP ? 'UDP' : 'TCP';
    return `${protocol}://${this.address}:${this.port}`;
  }

  private static isValidIPv4(address: string): boolean {
    if (!address || typeof address !== 'string') {
      return false;
    }

    const parts = address.split('.');
    if (parts.length !== 4) {
      return false;
    }

    for (const part of parts) {
      // Check if part is a valid number
      const num = parseInt(part, 10);
      if (isNaN(num) || num < 0 || num > 255) {
        return false;
      }

      // Check for leading zeros (except for '0' itself)
      if (part.length > 1 && part[0] === '0') {
        return false;
      }

      // Check if the string representation matches the parsed number
      if (part !== num.toString()) {
        return false;
      }
    }

    return true;
  }
}