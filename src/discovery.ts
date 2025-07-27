import { EventEmitter } from "events";
import { createSocket, Socket, RemoteInfo } from "dgram";
import { DiscoveryEndpoint, DiscoveryOptions, HPAI } from "./types";
import { KNX_CONSTANTS } from "./constants";

export class KNXNetDiscovery extends EventEmitter {
  private socket: Socket | undefined;
  private discoveredDevices: Map<string, DiscoveryEndpoint> = new Map();
  private searchTimeout: NodeJS.Timeout | undefined;

  constructor() {
    super();
  }

  async discover(options: DiscoveryOptions = {}): Promise<DiscoveryEndpoint[]> {
    const timeout =
      options.timeout || KNX_CONSTANTS.DISCOVERY.DEFAULT_SEARCH_TIMEOUT;
    const searchResponseTimeout =
      options.searchResponseTimeout ||
      KNX_CONSTANTS.DISCOVERY.SEARCH_RESPONSE_TIMEOUT;

    this.discoveredDevices.clear();

    return new Promise((resolve, reject) => {
      this.setupSocket()
        .then(() => {
          this.sendSearchRequest();

          // Set timeout for collecting responses
          this.searchTimeout = setTimeout(() => {
            this.cleanup();
            const devices = Array.from(this.discoveredDevices.values());
            resolve(devices);
          }, timeout);

          // Listen for responses
          this.socket!.on("message", (msg, rinfo) => {
            try {
              this.handleSearchResponse(msg, rinfo);
            } catch (error) {
              this.emit("error", error);
            }
          });
        })
        .catch(reject);
    });
  }

  private async setupSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = createSocket({ type: "udp4", reuseAddr: true });

      this.socket.on("error", (err) => {
        this.emit("error", err);
        reject(err);
      });

      this.socket.on("listening", () => {
        resolve();
      });

      this.socket.bind(0); // Bind to any available port
    });
  }

  private sendSearchRequest(): void {
    if (!this.socket) {
      throw new Error("Socket not initialized");
    }

    const searchFrame = this.createSearchRequestFrame();

    this.socket.send(
      searchFrame,
      KNX_CONSTANTS.DEFAULT_PORT,
      KNX_CONSTANTS.DEFAULT_MULTICAST_ADDRESS,
      (err) => {
        if (err) {
          this.emit("error", err);
        }
      }
    );
  }

  private createSearchRequestFrame(): Buffer {
    // KNXnet/IP Header (6 bytes)
    const header = Buffer.allocUnsafe(6);
    header.writeUInt8(KNX_CONSTANTS.HEADER_SIZE, 0); // Header size
    header.writeUInt8(KNX_CONSTANTS.KNXNETIP_VERSION, 1); // Version
    header.writeUInt16BE(KNX_CONSTANTS.SERVICE_TYPES.SEARCH_REQUEST, 2); // Service type
    header.writeUInt16BE(14, 4); // Total length (6 + 8)

    // Discovery endpoint HPAI (8 bytes)
    const hpai = this.createHPAI();

    return Buffer.concat([header, hpai]);
  }

  private createHPAI(): Buffer {
    const hpai = Buffer.allocUnsafe(8);
    hpai.writeUInt8(8, 0); // Structure length
    hpai.writeUInt8(0x01, 1); // Host protocol (UDP)

    // Use 0.0.0.0 to indicate any interface
    hpai.writeUInt8(0, 2); // IP address
    hpai.writeUInt8(0, 3);
    hpai.writeUInt8(0, 4);
    hpai.writeUInt8(0, 5);

    const port = this.socket?.address()?.port || 0;
    hpai.writeUInt16BE(port, 6); // Port

    return hpai;
  }

  private handleSearchResponse(msg: Buffer, rinfo: RemoteInfo): void {
    if (msg.length < KNX_CONSTANTS.HEADER_SIZE) {
      return;
    }

    const headerSize = msg.readUInt8(0);
    const version = msg.readUInt8(1);
    const serviceType = msg.readUInt16BE(2);
    const totalLength = msg.readUInt16BE(4);

    if (
      headerSize !== KNX_CONSTANTS.HEADER_SIZE ||
      version !== KNX_CONSTANTS.KNXNETIP_VERSION ||
      serviceType !== KNX_CONSTANTS.SERVICE_TYPES.SEARCH_RESPONSE
    ) {
      return;
    }

    try {
      const endpoint = this.parseSearchResponse(msg, rinfo);
      const key = `${endpoint.ip}:${endpoint.port}`;

      if (!this.discoveredDevices.has(key)) {
        this.discoveredDevices.set(key, endpoint);
        this.emit("deviceFound", endpoint);
      }
    } catch (error) {
      this.emit("error", error);
    }
  }

  private parseSearchResponse(
    msg: Buffer,
    rinfo: RemoteInfo
  ): DiscoveryEndpoint {
    let offset = KNX_CONSTANTS.HEADER_SIZE;

    // Parse Control Endpoint HPAI
    const controlHpaiLength = msg.readUInt8(offset);
    const controlEndpoint = this.parseHPAI(msg, offset);
    offset += controlHpaiLength;

    // Parse Device Information DIB
    const deviceInfoLength = msg.readUInt8(offset);
    const deviceInfoDescType = msg.readUInt8(offset + 1);
    
    if (deviceInfoDescType !== 0x01) {
      throw new Error(`Expected Device Info DIB (0x01), got 0x${deviceInfoDescType.toString(16)}`);
    }

    const deviceInfo = this.parseDeviceInfoDIB(msg, offset + 2, deviceInfoLength - 2);
    offset += deviceInfoLength;

    // Parse Supported Service Families DIB
    const serviceFamiliesLength = msg.readUInt8(offset);
    const serviceFamiliesDescType = msg.readUInt8(offset + 1);
    
    if (serviceFamiliesDescType !== 0x02) {
      throw new Error(`Expected Service Families DIB (0x02), got 0x${serviceFamiliesDescType.toString(16)}`);
    }

    const serviceFamilies = this.parseServiceFamiliesDIB(
      msg,
      offset + 2,
      serviceFamiliesLength - 2
    );

    return {
      name: deviceInfo.friendlyName || `KNX Device ${rinfo.address}`,
      ip: rinfo.address,
      port: controlEndpoint.port,
      capabilities: this.calculateCapabilities(serviceFamilies),
      deviceState: deviceInfo.deviceStatus || 0,
      knxAddress: deviceInfo.knxAddress,
      macAddress: deviceInfo.macAddress,
      serialNumber: deviceInfo.serialNumber,
      projectInstallationId: deviceInfo.projectInstallationId,
      friendlyName: deviceInfo.friendlyName,
    };
  }

  private parseHPAI(msg: Buffer, offset: number): HPAI {
    const length = msg.readUInt8(offset);
    const hostProtocol = msg.readUInt8(offset + 1);

    const ip = [
      msg.readUInt8(offset + 2),
      msg.readUInt8(offset + 3),
      msg.readUInt8(offset + 4),
      msg.readUInt8(offset + 5),
    ].join(".");

    const port = msg.readUInt16BE(offset + 6);

    return {
      hostProtocol,
      address: ip,
      port,
    };
  }

  private parseDeviceInfoDIB(msg: Buffer, offset: number, length: number): any {
    const info: any = {};

    if (length < 50) {
      throw new Error(`Device Info DIB too short: ${length} bytes, expected at least 50`);
    }

    // KNX medium (1 byte) + Device status (1 byte)
    const knxMedium = msg.readUInt8(offset);
    info.deviceStatus = msg.readUInt8(offset + 1);

    // KNX Individual Address (2 bytes)
    const knxAddr = msg.readUInt16BE(offset + 2);
    info.knxAddress = `${(knxAddr >> 12) & 0x0f}.${(knxAddr >> 8) & 0x0f}.${knxAddr & 0xff}`;

    // Project Installation ID (2 bytes)
    info.projectInstallationId = msg.readUInt16BE(offset + 4);

    // Serial Number (6 bytes)
    const serialBytes = msg.subarray(offset + 6, offset + 12);
    info.serialNumber = Array.from(serialBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();

    // Routing Multicast Address (4 bytes) - skip for now
    // offset + 12 to offset + 16

    // MAC Address (6 bytes)
    const mac = msg.subarray(offset + 16, offset + 22);
    info.macAddress = Array.from(mac)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(":")
      .toUpperCase();

    // Device Friendly Name (30 bytes)
    const nameBytes = msg.subarray(offset + 22, offset + 52);
    const nullIndex = nameBytes.indexOf(0);
    const nameLength = nullIndex >= 0 ? nullIndex : nameBytes.length;
    info.friendlyName = nameBytes.subarray(0, nameLength).toString("utf8").trim();

    return info;
  }

  private parseServiceFamiliesDIB(
    msg: Buffer,
    offset: number,
    length: number
  ): number[] {
    const families: number[] = [];

    // Each service family entry is 2 bytes (family ID + version)
    for (let i = 0; i < length; i += 2) {
      if (i + 1 < length) {
        const family = msg.readUInt8(offset + i);
        const version = msg.readUInt8(offset + i + 1);
        families.push(family);
      }
    }

    return families;
  }

  private calculateCapabilities(serviceFamilies: number[]): number {
    let capabilities = 0;

    for (const family of serviceFamilies) {
      switch (family) {
        case 0x02: // KNXnet/IP Core - basic protocol services
          // Core is fundamental but doesn't map to a specific capability flag
          break;
        case 0x03: // KNXnet/IP Device Management
          capabilities |= KNX_CONSTANTS.DEVICE_CAPABILITIES.DEVICE_MANAGEMENT;
          break;
        case 0x04: // KNXnet/IP Tunnelling
          capabilities |= KNX_CONSTANTS.DEVICE_CAPABILITIES.TUNNELLING;
          break;
        case 0x05: // KNXnet/IP Routing
          capabilities |= KNX_CONSTANTS.DEVICE_CAPABILITIES.ROUTING;
          break;
        case 0x06: // KNXnet/IP Remote Logging
          capabilities |= KNX_CONSTANTS.DEVICE_CAPABILITIES.REMOTE_LOGGING;
          break;
        case 0x07: // KNXnet/IP Remote Configuration and Diagnosis
          capabilities |=
            KNX_CONSTANTS.DEVICE_CAPABILITIES.REMOTE_CONFIGURATION;
          break;
        case 0x08: // KNXnet/IP Object Server
          capabilities |= KNX_CONSTANTS.DEVICE_CAPABILITIES.OBJECT_SERVER;
          break;
      }
    }

    return capabilities;
  }

  private cleanup(): void {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = undefined;
    }

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.close();
      this.socket = undefined;
    }
  }

  close(): void {
    this.cleanup();
  }
}
