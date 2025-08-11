import {
  KNXInterfaceType,
  DiscoveryEndpoint,
  KNXBusInterface,
  KNXUSBOptions,
  KNXInterfaceInformation,
} from "./types";

import { KNXNetDiscovery } from "./discovery";
import { KNXUSBImpl } from "./interfaces/usb";
import { KNXNetRoutingImpl } from "./interfaces/routing";
import { KNXNetTunnelingImpl } from "./interfaces/tunneling";
import { KNX_CONSTANTS } from "./constants";

export class KNXInterfaceInformationImpl implements KNXInterfaceInformation {
  public readonly type: KNXInterfaceType;
  public readonly name: string;
  public readonly description?: string;

  // Network interface properties (routing/tunneling)
  public readonly address?: string;
  public readonly port?: number;
  public readonly capabilities?: number;
  public readonly knxAddress?: string;
  public readonly macAddress?: string;
  public readonly serialNumber?: string;
  public readonly friendlyName?: string;

  // USB interface properties
  public readonly devicePath?: string;
  public readonly vendorId?: number;
  public readonly productId?: number;
  public readonly manufacturer?: string;
  public readonly product?: string;

  constructor(info: Omit<KNXInterfaceInformation, 'supportsTunneling' | 'supportsRouting' | 'supportsBusmonitor' | 'toString'>) {
    this.type = info.type;
    this.name = info.name;
    if (info.description !== undefined) this.description = info.description;
    if (info.address !== undefined) this.address = info.address;
    if (info.port !== undefined) this.port = info.port;
    if (info.capabilities !== undefined) this.capabilities = info.capabilities;
    if (info.knxAddress !== undefined) this.knxAddress = info.knxAddress;
    if (info.macAddress !== undefined) this.macAddress = info.macAddress;
    if (info.serialNumber !== undefined) this.serialNumber = info.serialNumber;
    if (info.friendlyName !== undefined) this.friendlyName = info.friendlyName;
    if (info.devicePath !== undefined) this.devicePath = info.devicePath;
    if (info.vendorId !== undefined) this.vendorId = info.vendorId;
    if (info.productId !== undefined) this.productId = info.productId;
    if (info.manufacturer !== undefined) this.manufacturer = info.manufacturer;
    if (info.product !== undefined) this.product = info.product;
  }

  /**
   * Check if this interface supports tunneling
   */
  supportsTunneling(): boolean {
    return (
      this.type === KNXInterfaceType.TUNNELING ||
      (this.type === KNXInterfaceType.ROUTING &&
        this.capabilities !== undefined &&
        (this.capabilities & KNX_CONSTANTS.DEVICE_CAPABILITIES.TUNNELLING) !==
          0)
    );
  }

  /**
   * Check if this interface supports routing
   */
  supportsRouting(): boolean {
    return (
      this.type === KNXInterfaceType.ROUTING ||
      (this.capabilities !== undefined &&
        (this.capabilities & KNX_CONSTANTS.DEVICE_CAPABILITIES.ROUTING) !== 0)
    );
  }

  /**
   * Check if this interface supports busmonitor mode
   */
  supportsBusmonitor(): boolean {
    return this.type === KNXInterfaceType.USB || this.supportsTunneling();
  }

  /**
   * Get a human-readable description of the interface
   */
  toString(): string {
    switch (this.type) {
      case KNXInterfaceType.ROUTING:
        return `KNX Routing (${this.address}:${this.port || 3671}) - ${
          this.name
        }`;
      case KNXInterfaceType.TUNNELING:
        return `KNX Tunneling (${this.address}:${this.port || 3671}) - ${
          this.name
        }`;
      case KNXInterfaceType.USB:
        return `KNX USB (${this.devicePath || "auto-detect"}) - ${this.name}`;
      default:
        return `KNX Interface - ${this.name}`;
    }
  }
}

/**
 * Discover available KNX interfaces (network and USB)
 * @param callback Function called for each discovered interface
 * @param options Discovery options
 */
export async function discoverInterfaces(
  callback: (interfaceInfo: KNXInterfaceInformationImpl) => void,
  options: { timeout?: number; includeUSB?: boolean } = {}
): Promise<void> {
  const { timeout = 3000, includeUSB = true } = options;

  // Discover network interfaces
  const discovery = new KNXNetDiscovery();

  try {
    // Set up discovery event handler
    discovery.on("deviceFound", (endpoint: DiscoveryEndpoint) => {
      // Create routing interface info
      if (endpoint.capabilities & KNX_CONSTANTS.DEVICE_CAPABILITIES.ROUTING) {
        const routingInfo = new KNXInterfaceInformationImpl({
          type: KNXInterfaceType.ROUTING,
          name: endpoint.name,
          description: "KNX/IP Routing Interface",
          address: endpoint.ip,
          port: endpoint.port,
          capabilities: endpoint.capabilities,
          ...(endpoint.knxAddress && { knxAddress: endpoint.knxAddress }),
          ...(endpoint.macAddress && { macAddress: endpoint.macAddress }),
          ...(endpoint.serialNumber && { serialNumber: endpoint.serialNumber }),
          ...(endpoint.friendlyName && { friendlyName: endpoint.friendlyName }),
        });
        callback(routingInfo);
      }

      // Create tunneling interface info
      if (
        endpoint.capabilities & KNX_CONSTANTS.DEVICE_CAPABILITIES.TUNNELLING
      ) {
        const tunnelingInfo = new KNXInterfaceInformationImpl({
          type: KNXInterfaceType.TUNNELING,
          name: endpoint.name,
          description: "KNX/IP Tunneling Interface",
          address: endpoint.ip,
          port: endpoint.port,
          capabilities: endpoint.capabilities,
          ...(endpoint.knxAddress && { knxAddress: endpoint.knxAddress }),
          ...(endpoint.macAddress && { macAddress: endpoint.macAddress }),
          ...(endpoint.serialNumber && { serialNumber: endpoint.serialNumber }),
          ...(endpoint.friendlyName && { friendlyName: endpoint.friendlyName }),
        });
        callback(tunnelingInfo);
      }
    });

    // Start network discovery
    await discovery.discover({ timeout });
  } finally {
    discovery.close();
  }

  // Discover USB interfaces
  if (includeUSB) {
    const usbDevices = KNXUSBImpl.getAvailableDevices();

    for (const device of usbDevices) {
      const usbInfo = new KNXInterfaceInformationImpl({
        type: KNXInterfaceType.USB,
        name:
          device.product ||
          `USB KNX Interface (${device.vendorId?.toString(
            16
          )}:${device.productId?.toString(16)})`,
        description: "USB KNX Interface",
        ...(device.path && { devicePath: device.path }),
        ...(device.vendorId !== undefined && { vendorId: device.vendorId }),
        ...(device.productId !== undefined && { productId: device.productId }),
        ...(device.manufacturer && { manufacturer: device.manufacturer }),
        ...(device.product && { product: device.product }),
      });
      callback(usbInfo);
    }
  }
}

/**
 * Create a KNX interface based on interface information
 * @param interfaceInfo The interface information
 * @param busmonitorMode Whether to enable busmonitor mode (read-only)
 * @returns A KNXBusInterface instance
 */
export function createInterface(
  interfaceInfo: KNXInterfaceInformationImpl,
  busmonitorMode: boolean = false
): KNXBusInterface {
  switch (interfaceInfo.type) {
    case KNXInterfaceType.ROUTING:
      if (busmonitorMode) {
        throw new Error(
          "Busmonitor mode is not supported for routing interfaces. Use tunneling or USB interfaces instead."
        );
      }
      return new KNXNetRoutingImpl(interfaceInfo.address, interfaceInfo.port);

    case KNXInterfaceType.TUNNELING:
      if (!interfaceInfo.address) {
        throw new Error("Address is required for tunneling interfaces");
      }
      return new KNXNetTunnelingImpl(
        interfaceInfo.address,
        interfaceInfo.port,
        undefined, // localPort
        busmonitorMode
      );

    case KNXInterfaceType.USB:
      const usbOptions: KNXUSBOptions = {
        ...(interfaceInfo.devicePath && { devicePath: interfaceInfo.devicePath }),
        busmonitorMode,
      };
      return new KNXUSBImpl(usbOptions);

    default:
      throw new Error(`Unsupported interface type: ${interfaceInfo.type}`);
  }
}
