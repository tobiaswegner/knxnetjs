import { KNXInterfaceInformationImpl, createInterface } from './interface-discovery';
import { KNXInterfaceType } from './types';
import { KNX_CONSTANTS } from './constants';

// Mock the heavy dependencies so tests stay unit-level
jest.mock('./discovery');
jest.mock('./interfaces/usb');
jest.mock('./interfaces/routing');
jest.mock('./interfaces/tunneling');

import { KNXNetDiscovery } from './discovery';
import { KNXUSBImpl } from './interfaces/usb';
import { KNXNetRoutingImpl } from './interfaces/routing';
import { KNXNetTunnelingImpl } from './interfaces/tunneling';

const MockedKNXNetDiscovery = KNXNetDiscovery as jest.MockedClass<typeof KNXNetDiscovery>;
const MockedKNXUSBImpl = KNXUSBImpl as jest.MockedClass<typeof KNXUSBImpl>;

// ---------------------------------------------------------------------------
// KNXInterfaceInformationImpl
// ---------------------------------------------------------------------------
describe('KNXInterfaceInformationImpl', () => {
  describe('supportsTunneling()', () => {
    test('should return true for TUNNELING type', () => {
      const info = new KNXInterfaceInformationImpl({
        type: KNXInterfaceType.TUNNELING,
        name: 'Test',
        address: '10.0.0.1',
      });
      expect(info.supportsTunneling()).toBe(true);
    });

    test('should return true for ROUTING type with TUNNELLING capability bit set', () => {
      const info = new KNXInterfaceInformationImpl({
        type: KNXInterfaceType.ROUTING,
        name: 'Test',
        address: '10.0.0.1',
        capabilities: KNX_CONSTANTS.DEVICE_CAPABILITIES.TUNNELLING,
      });
      expect(info.supportsTunneling()).toBe(true);
    });

    test('should return false for ROUTING type without TUNNELLING capability', () => {
      const info = new KNXInterfaceInformationImpl({
        type: KNXInterfaceType.ROUTING,
        name: 'Test',
        address: '10.0.0.1',
        capabilities: KNX_CONSTANTS.DEVICE_CAPABILITIES.ROUTING,
      });
      expect(info.supportsTunneling()).toBe(false);
    });

    test('should return false for ROUTING type with no capabilities', () => {
      const info = new KNXInterfaceInformationImpl({
        type: KNXInterfaceType.ROUTING,
        name: 'Test',
        address: '10.0.0.1',
      });
      expect(info.supportsTunneling()).toBe(false);
    });

    test('should return false for USB type', () => {
      const info = new KNXInterfaceInformationImpl({
        type: KNXInterfaceType.USB,
        name: 'Test',
      });
      expect(info.supportsTunneling()).toBe(false);
    });
  });

  describe('supportsRouting()', () => {
    test('should return true for ROUTING type', () => {
      const info = new KNXInterfaceInformationImpl({
        type: KNXInterfaceType.ROUTING,
        name: 'Test',
        address: '224.0.23.12',
      });
      expect(info.supportsRouting()).toBe(true);
    });

    test('should return true for TUNNELING type with ROUTING capability bit', () => {
      const info = new KNXInterfaceInformationImpl({
        type: KNXInterfaceType.TUNNELING,
        name: 'Test',
        address: '10.0.0.1',
        capabilities: KNX_CONSTANTS.DEVICE_CAPABILITIES.ROUTING,
      });
      expect(info.supportsRouting()).toBe(true);
    });

    test('should return false for TUNNELING type without ROUTING capability', () => {
      const info = new KNXInterfaceInformationImpl({
        type: KNXInterfaceType.TUNNELING,
        name: 'Test',
        address: '10.0.0.1',
        capabilities: KNX_CONSTANTS.DEVICE_CAPABILITIES.TUNNELLING,
      });
      expect(info.supportsRouting()).toBe(false);
    });

    test('should return false for USB type', () => {
      const info = new KNXInterfaceInformationImpl({
        type: KNXInterfaceType.USB,
        name: 'Test',
      });
      expect(info.supportsRouting()).toBe(false);
    });
  });

  describe('supportsBusmonitor()', () => {
    test('should return true for USB type', () => {
      const info = new KNXInterfaceInformationImpl({
        type: KNXInterfaceType.USB,
        name: 'Test',
      });
      expect(info.supportsBusmonitor()).toBe(true);
    });

    test('should return true for TUNNELING type (supportsTunneling => supportsBusmonitor)', () => {
      const info = new KNXInterfaceInformationImpl({
        type: KNXInterfaceType.TUNNELING,
        name: 'Test',
        address: '10.0.0.1',
      });
      expect(info.supportsBusmonitor()).toBe(true);
    });

    test('should return false for ROUTING type without tunneling capability', () => {
      const info = new KNXInterfaceInformationImpl({
        type: KNXInterfaceType.ROUTING,
        name: 'Test',
        address: '10.0.0.1',
        capabilities: KNX_CONSTANTS.DEVICE_CAPABILITIES.ROUTING,
      });
      expect(info.supportsBusmonitor()).toBe(false);
    });
  });

  describe('toString()', () => {
    test('should include address and port for ROUTING type', () => {
      const info = new KNXInterfaceInformationImpl({
        type: KNXInterfaceType.ROUTING,
        name: 'My Router',
        address: '192.168.1.1',
        port: 3671,
      });
      const str = info.toString();
      expect(str).toContain('KNX Routing');
      expect(str).toContain('192.168.1.1');
      expect(str).toContain('3671');
      expect(str).toContain('My Router');
    });

    test('should use default port 3671 for ROUTING when port is not set', () => {
      const info = new KNXInterfaceInformationImpl({
        type: KNXInterfaceType.ROUTING,
        name: 'Router',
        address: '192.168.1.1',
      });
      expect(info.toString()).toContain('3671');
    });

    test('should include address for TUNNELING type', () => {
      const info = new KNXInterfaceInformationImpl({
        type: KNXInterfaceType.TUNNELING,
        name: 'My Tunnel',
        address: '10.0.0.5',
        port: 3671,
      });
      const str = info.toString();
      expect(str).toContain('KNX Tunneling');
      expect(str).toContain('10.0.0.5');
      expect(str).toContain('My Tunnel');
    });

    test('should show devicePath for USB type', () => {
      const info = new KNXInterfaceInformationImpl({
        type: KNXInterfaceType.USB,
        name: 'My USB',
        devicePath: '/dev/hidraw0',
      });
      const str = info.toString();
      expect(str).toContain('KNX USB');
      expect(str).toContain('/dev/hidraw0');
      expect(str).toContain('My USB');
    });

    test('should show "auto-detect" for USB type without devicePath', () => {
      const info = new KNXInterfaceInformationImpl({
        type: KNXInterfaceType.USB,
        name: 'USB',
      });
      expect(info.toString()).toContain('auto-detect');
    });
  });

  describe('property storage', () => {
    test('should store optional properties when provided', () => {
      const info = new KNXInterfaceInformationImpl({
        type: KNXInterfaceType.TUNNELING,
        name: 'Device',
        address: '10.0.0.1',
        port: 3671,
        knxAddress: '1.1.1',
        macAddress: 'AA:BB:CC:DD:EE:FF',
        serialNumber: '000000000001',
        friendlyName: 'My Device',
        capabilities: 0x06,
      });

      expect(info.knxAddress).toBe('1.1.1');
      expect(info.macAddress).toBe('AA:BB:CC:DD:EE:FF');
      expect(info.serialNumber).toBe('000000000001');
      expect(info.friendlyName).toBe('My Device');
      expect(info.capabilities).toBe(0x06);
    });

    test('should store USB-specific properties', () => {
      const info = new KNXInterfaceInformationImpl({
        type: KNXInterfaceType.USB,
        name: 'USB Device',
        devicePath: '/dev/hidraw0',
        vendorId: 0x147b,
        productId: 0x5020,
        manufacturer: 'Acme Corp',
        product: 'KNX USB',
      });

      expect(info.devicePath).toBe('/dev/hidraw0');
      expect(info.vendorId).toBe(0x147b);
      expect(info.productId).toBe(0x5020);
      expect(info.manufacturer).toBe('Acme Corp');
      expect(info.product).toBe('KNX USB');
    });

    test('should not store undefined properties', () => {
      const info = new KNXInterfaceInformationImpl({
        type: KNXInterfaceType.TUNNELING,
        name: 'Minimal',
        address: '10.0.0.1',
      });

      expect(info.port).toBeUndefined();
      expect(info.knxAddress).toBeUndefined();
      expect(info.macAddress).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// createInterface()
// ---------------------------------------------------------------------------
describe('createInterface()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should create a KNXNetRoutingImpl for ROUTING type', () => {
    const info = new KNXInterfaceInformationImpl({
      type: KNXInterfaceType.ROUTING,
      name: 'Test',
      address: '224.0.23.12',
      port: 3671,
    });
    const iface = createInterface(info);
    expect(iface).toBeInstanceOf(KNXNetRoutingImpl);
  });

  test('should create a KNXNetTunnelingImpl for TUNNELING type', () => {
    const info = new KNXInterfaceInformationImpl({
      type: KNXInterfaceType.TUNNELING,
      name: 'Test',
      address: '10.0.0.1',
      port: 3671,
    });
    const iface = createInterface(info);
    expect(iface).toBeInstanceOf(KNXNetTunnelingImpl);
  });

  test('should create a KNXUSBImpl for USB type', () => {
    const info = new KNXInterfaceInformationImpl({
      type: KNXInterfaceType.USB,
      name: 'Test',
    });
    const iface = createInterface(info);
    expect(iface).toBeInstanceOf(KNXUSBImpl);
  });

  test('should pass busmonitorMode to KNXNetTunnelingImpl', () => {
    const info = new KNXInterfaceInformationImpl({
      type: KNXInterfaceType.TUNNELING,
      name: 'Test',
      address: '10.0.0.1',
    });
    createInterface(info, true);
    expect(KNXNetTunnelingImpl).toHaveBeenCalledWith(
      '10.0.0.1',
      undefined,
      undefined,
      true // busmonitorMode
    );
  });

  test('should pass busmonitorMode to KNXUSBImpl', () => {
    const info = new KNXInterfaceInformationImpl({
      type: KNXInterfaceType.USB,
      name: 'Test',
      devicePath: '/dev/hidraw0',
    });
    createInterface(info, true);
    expect(KNXUSBImpl).toHaveBeenCalledWith(
      expect.objectContaining({ busmonitorMode: true })
    );
  });

  test('should throw when busmonitorMode is requested for ROUTING', () => {
    const info = new KNXInterfaceInformationImpl({
      type: KNXInterfaceType.ROUTING,
      name: 'Test',
      address: '224.0.23.12',
    });
    expect(() => createInterface(info, true)).toThrow(
      'Busmonitor mode is not supported for routing interfaces'
    );
  });

  test('should throw when address is missing for TUNNELING', () => {
    const info = new KNXInterfaceInformationImpl({
      type: KNXInterfaceType.TUNNELING,
      name: 'Test',
      // no address
    });
    expect(() => createInterface(info)).toThrow(
      'Address is required for tunneling interfaces'
    );
  });
});
