import { parseArgs, formatCapabilities, formatInterfaceResult } from './cli';
import { KNX_CONSTANTS } from './constants';

// ---------------------------------------------------------------------------
// parseArgs()
// ---------------------------------------------------------------------------
describe('parseArgs()', () => {
  const origArgv = process.argv;

  beforeEach(() => {
    process.argv = ['node', 'knxnetjs'];
  });

  afterEach(() => {
    process.argv = origArgv;
  });

  function setArgs(...args: string[]) {
    process.argv = ['node', 'knxnetjs', ...args];
  }

  test('returns empty options when no arguments are provided', () => {
    expect(parseArgs()).toEqual({});
  });

  test('--help sets help: true', () => {
    setArgs('--help');
    expect(parseArgs().help).toBe(true);
  });

  test('-h sets help: true', () => {
    setArgs('-h');
    expect(parseArgs().help).toBe(true);
  });

  test('--address sets multicastAddress', () => {
    setArgs('--address', '224.0.23.12');
    expect(parseArgs().multicastAddress).toBe('224.0.23.12');
  });

  test('-a sets multicastAddress', () => {
    setArgs('-a', '224.0.0.1');
    expect(parseArgs().multicastAddress).toBe('224.0.0.1');
  });

  test('--port parses port as integer', () => {
    setArgs('--port', '3672');
    expect(parseArgs().port).toBe(3672);
  });

  test('-p parses port as integer', () => {
    setArgs('-p', '4000');
    expect(parseArgs().port).toBe(4000);
  });

  test('--tunnel sets tunnel address', () => {
    setArgs('--tunnel', '192.168.1.100');
    expect(parseArgs().tunnel).toBe('192.168.1.100');
  });

  test('-t sets tunnel address with port suffix preserved', () => {
    setArgs('-t', '192.168.1.100:3672');
    expect(parseArgs().tunnel).toBe('192.168.1.100:3672');
  });

  test('--timeout parses timeout as integer', () => {
    setArgs('--timeout', '5000');
    expect(parseArgs().timeout).toBe(5000);
  });

  test('--busmonitor sets busmonitor: true', () => {
    setArgs('--busmonitor');
    expect(parseArgs().busmonitor).toBe(true);
  });

  test('-u sets usb: true', () => {
    setArgs('-u');
    expect(parseArgs().usb).toBe(true);
  });

  test('--usb sets usb: true', () => {
    setArgs('--usb');
    expect(parseArgs().usb).toBe(true);
  });

  test('--usb-device sets usbDevice path', () => {
    setArgs('--usb-device', '/dev/hidraw0');
    expect(parseArgs().usbDevice).toBe('/dev/hidraw0');
  });

  test('--interface-object parses hex value', () => {
    setArgs('--interface-object', '0x0008');
    expect(parseArgs().interfaceObject).toBe(8);
  });

  test('--object-instance parses as integer', () => {
    setArgs('--object-instance', '2');
    expect(parseArgs().objectInstance).toBe(2);
  });

  test('--property-id parses as integer', () => {
    setArgs('--property-id', '52');
    expect(parseArgs().propertyId).toBe(52);
  });

  test('--elements parses as integer', () => {
    setArgs('--elements', '3');
    expect(parseArgs().numberOfElements).toBe(3);
  });

  test('--start-index parses as integer', () => {
    setArgs('--start-index', '1');
    expect(parseArgs().startIndex).toBe(1);
  });

  test('--data stores raw string value', () => {
    setArgs('--data', '00FF');
    expect(parseArgs().data).toBe('00FF');
  });

  test('command tokens (dump, discover, writeProperty, readProperty) are silently ignored', () => {
    setArgs('dump', '--port', '3671');
    const opts = parseArgs();
    expect(opts.port).toBe(3671);
    // No 'dump' key on options
    expect((opts as any).dump).toBeUndefined();
  });

  test('unknown flag calls process.exit(1)', () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    setArgs('--unknown-flag');
    parseArgs();
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errSpy.mockRestore();
  });

  test('multiple flags parsed together', () => {
    setArgs('-t', '10.0.0.1', '--port', '3672', '--busmonitor', '--timeout', '5000');
    const opts = parseArgs();
    expect(opts.tunnel).toBe('10.0.0.1');
    expect(opts.port).toBe(3672);
    expect(opts.busmonitor).toBe(true);
    expect(opts.timeout).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// formatCapabilities()
// ---------------------------------------------------------------------------
describe('formatCapabilities()', () => {
  test('returns "None" when capabilities is 0', () => {
    expect(formatCapabilities(0)).toBe('None');
  });

  test('returns "Device Management" for DEVICE_MANAGEMENT bit', () => {
    const result = formatCapabilities(KNX_CONSTANTS.DEVICE_CAPABILITIES.DEVICE_MANAGEMENT);
    expect(result).toContain('Device Management');
  });

  test('returns "Tunnelling" for TUNNELLING bit', () => {
    const result = formatCapabilities(KNX_CONSTANTS.DEVICE_CAPABILITIES.TUNNELLING);
    expect(result).toContain('Tunnelling');
  });

  test('returns "Routing" for ROUTING bit', () => {
    const result = formatCapabilities(KNX_CONSTANTS.DEVICE_CAPABILITIES.ROUTING);
    expect(result).toContain('Routing');
  });

  test('returns "Remote Logging" for REMOTE_LOGGING bit', () => {
    const result = formatCapabilities(KNX_CONSTANTS.DEVICE_CAPABILITIES.REMOTE_LOGGING);
    expect(result).toContain('Remote Logging');
  });

  test('returns "Remote Config" for REMOTE_CONFIGURATION bit', () => {
    const result = formatCapabilities(KNX_CONSTANTS.DEVICE_CAPABILITIES.REMOTE_CONFIGURATION);
    expect(result).toContain('Remote Config');
  });

  test('returns "Object Server" for OBJECT_SERVER bit', () => {
    const result = formatCapabilities(KNX_CONSTANTS.DEVICE_CAPABILITIES.OBJECT_SERVER);
    expect(result).toContain('Object Server');
  });

  test('combines multiple capabilities as comma-separated list', () => {
    const caps =
      KNX_CONSTANTS.DEVICE_CAPABILITIES.DEVICE_MANAGEMENT |
      KNX_CONSTANTS.DEVICE_CAPABILITIES.TUNNELLING |
      KNX_CONSTANTS.DEVICE_CAPABILITIES.ROUTING;
    const result = formatCapabilities(caps);
    expect(result).toContain('Device Management');
    expect(result).toContain('Tunnelling');
    expect(result).toContain('Routing');
    expect(result.split(', ').length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// formatInterfaceResult()
// ---------------------------------------------------------------------------
describe('formatInterfaceResult()', () => {
  function makeInterface(overrides: Record<string, any> = {}): any {
    return {
      name: 'Test Device',
      type: 'tunneling',
      supportsRouting: () => false,
      supportsTunneling: () => true,
      supportsBusmonitor: () => false,
      ...overrides,
    };
  }

  test('includes device name in output', () => {
    const result = formatInterfaceResult(makeInterface({ name: 'My KNX Router' }));
    expect(result).toContain('My KNX Router');
  });

  test('includes type in uppercase', () => {
    const result = formatInterfaceResult(makeInterface({ type: 'routing' }));
    expect(result).toContain('ROUTING');
  });

  test('includes address and port when present', () => {
    const result = formatInterfaceResult(makeInterface({
      address: '192.168.1.50',
      port: 3671,
    }));
    expect(result).toContain('192.168.1.50');
    expect(result).toContain('3671');
  });

  test('uses default port 3671 when port is not set', () => {
    const result = formatInterfaceResult(makeInterface({ address: '10.0.0.1' }));
    expect(result).toContain('3671');
  });

  test('includes protocol label when protocol is 1 (UDP)', () => {
    const result = formatInterfaceResult(makeInterface({
      address: '10.0.0.1',
      port: 3671,
      protocol: 1,
    }));
    expect(result).toContain('UDP');
  });

  test('includes protocol label when protocol is 2 (TCP)', () => {
    const result = formatInterfaceResult(makeInterface({
      address: '10.0.0.1',
      port: 3671,
      protocol: 2,
    }));
    expect(result).toContain('TCP');
  });

  test('includes capabilities section when capabilities are present', () => {
    const result = formatInterfaceResult(makeInterface({
      capabilities: KNX_CONSTANTS.DEVICE_CAPABILITIES.TUNNELLING,
    }));
    expect(result).toContain('Capabilities');
    expect(result).toContain('Tunnelling');
  });

  test('includes KNX address when present', () => {
    const result = formatInterfaceResult(makeInterface({ knxAddress: '1.1.1' }));
    expect(result).toContain('1.1.1');
  });

  test('includes MAC address when present', () => {
    const result = formatInterfaceResult(makeInterface({ macAddress: 'AA:BB:CC:DD:EE:FF' }));
    expect(result).toContain('AA:BB:CC:DD:EE:FF');
  });

  test('includes USB device path when present', () => {
    const result = formatInterfaceResult(makeInterface({
      type: 'usb',
      devicePath: '/dev/hidraw0',
    }));
    expect(result).toContain('/dev/hidraw0');
  });

  test('includes formatted USB vendor:product ID when both are present', () => {
    const result = formatInterfaceResult(makeInterface({
      type: 'usb',
      vendorId: 0x147b,
      productId: 0x5120,
    }));
    expect(result).toContain('147b:5120');
  });

  test('includes description when present', () => {
    const result = formatInterfaceResult(makeInterface({ description: 'Main building interface' }));
    expect(result).toContain('Main building interface');
  });

  test('includes supported features based on supports* methods', () => {
    const result = formatInterfaceResult(makeInterface({
      supportsRouting: () => true,
      supportsTunneling: () => true,
      supportsBusmonitor: () => true,
    }));
    expect(result).toContain('Routing');
    expect(result).toContain('Tunneling');
    expect(result).toContain('Busmonitor');
  });

  test('omits Supported line when no features are supported', () => {
    const result = formatInterfaceResult(makeInterface({
      supportsRouting: () => false,
      supportsTunneling: () => false,
      supportsBusmonitor: () => false,
    }));
    expect(result).not.toContain('Supported:');
  });

  test('shows manufacturer and product for USB interfaces', () => {
    const result = formatInterfaceResult(makeInterface({
      type: 'usb',
      manufacturer: 'Weinzierl',
      product: 'KNX USB Interface',
    }));
    expect(result).toContain('Weinzierl');
    expect(result).toContain('KNX USB Interface');
  });

  test('output ends with "Status: Available"', () => {
    const result = formatInterfaceResult(makeInterface());
    expect(result).toContain('Status: Available');
  });
});
