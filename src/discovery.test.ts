import { EventEmitter } from 'events';
import { KNXNetDiscovery } from './discovery';
import { KNX_CONSTANTS } from './constants';

// ---------------------------------------------------------------------------
// Mock dgram
// ---------------------------------------------------------------------------
jest.mock('dgram');
import { createSocket } from 'dgram';
const mockCreateSocket = createSocket as jest.MockedFunction<typeof createSocket>;

/** Build a controllable fake UDP socket */
function makeMockSocket() {
  const emitter = new EventEmitter() as any;
  emitter.bind = jest.fn((_port: number) => {
    // Emit 'listening' on the next tick so setup promise resolves
    setImmediate(() => emitter.emit('listening'));
  });
  emitter.address = jest.fn(() => ({ address: '0.0.0.0', port: 54321, family: 'IPv4' }));
  emitter.send = jest.fn(
    (_buf: Buffer, _port: number, _addr: string, cb?: (err: Error | null) => void) => {
      if (cb) setImmediate(() => cb(null));
    }
  );
  emitter.close = jest.fn();
  emitter.removeAllListeners = jest.fn(() => emitter);
  return emitter;
}

// ---------------------------------------------------------------------------
// Helper: build a SEARCH_RESPONSE KNXnetIPFrame buffer
// ---------------------------------------------------------------------------
function buildSearchResponse(opts: {
  ip?: string;
  port?: number;
  friendlyName?: string;
  serviceFamilies?: { id: number; version: number }[];
}) {
  const ip = opts.ip ?? '192.168.1.1';
  const port = opts.port ?? 3671;
  const friendlyName = opts.friendlyName ?? 'Test KNX Device';
  const families = opts.serviceFamilies ?? [
    { id: 0x04, version: 0x01 }, // Tunneling
    { id: 0x05, version: 0x01 }, // Routing
  ];

  // --- Control Endpoint HPAI (8 bytes) ---
  const ipParts = ip.split('.').map(Number);
  const hpai = Buffer.from([
    0x08, 0x01,
    ipParts[0]!, ipParts[1]!, ipParts[2]!, ipParts[3]!,
    (port >> 8) & 0xff, port & 0xff,
  ]);

  // --- Device Info DIB (2 + 52 = 54 bytes) ---
  const deviceInfoData = Buffer.alloc(52, 0);
  deviceInfoData[0] = 0x02; // KNX medium (TP)
  deviceInfoData[1] = 0x00; // device status
  deviceInfoData.writeUInt16BE(0x1101, 2); // KNX address 1.1.1
  deviceInfoData.writeUInt16BE(0x0001, 4); // project installation ID
  // serial (bytes 6-11): 00 00 00 00 00 01
  deviceInfoData[11] = 0x01;
  // routing multicast (bytes 12-15): 00 00 00 00
  // MAC (bytes 16-21): AA BB CC DD EE FF
  Buffer.from([0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF]).copy(deviceInfoData, 16);
  // friendly name (bytes 22-51): up to 30 bytes, null-terminated
  Buffer.from(friendlyName.slice(0, 30)).copy(deviceInfoData, 22);

  const deviceInfoDib = Buffer.concat([
    Buffer.from([0x36, 0x01]), // length=54, type=Device Info
    deviceInfoData,
  ]);

  // --- Service Families DIB ---
  const famData = Buffer.alloc(families.length * 2);
  for (let i = 0; i < families.length; i++) {
    famData[i * 2] = families[i]!.id;
    famData[i * 2 + 1] = families[i]!.version;
  }
  const sfLength = 2 + famData.length;
  const sfDib = Buffer.concat([
    Buffer.from([sfLength, 0x02]), // length, type=Service Families
    famData,
  ]);

  // --- Payload = HPAI + DeviceInfoDIB + ServiceFamiliesDIB ---
  const payload = Buffer.concat([hpai, deviceInfoDib, sfDib]);

  // --- KNXnetIPFrame header ---
  const totalLength = 6 + payload.length;
  const header = Buffer.alloc(6);
  header[0] = 0x06; // header size
  header[1] = 0x10; // protocol version
  header.writeUInt16BE(KNX_CONSTANTS.SERVICE_TYPES.SEARCH_RESPONSE, 2);
  header.writeUInt16BE(totalLength, 4);

  return { frame: Buffer.concat([header, payload]), remoteAddress: ip };
}

// ---------------------------------------------------------------------------
// Helper to run a discover() test with fake timers
// Emits the message after the socket is set up, then advances time past timeout
// ---------------------------------------------------------------------------
async function runDiscover(
  timeout: number,
  messageToEmit?: { frame: Buffer; remoteAddress: string }
): Promise<any[]> {
  const discovery = new KNXNetDiscovery();
  let mockSocket!: ReturnType<typeof makeMockSocket>;
  mockCreateSocket.mockImplementationOnce(() => {
    mockSocket = makeMockSocket();
    return mockSocket;
  });

  const promise = discovery.discover({ timeout });

  // Let the socket set up (setImmediate in bind fires 'listening')
  await jest.advanceTimersByTimeAsync(0);

  if (messageToEmit) {
    const { frame, remoteAddress } = messageToEmit;
    mockSocket.emit('message', frame, {
      address: remoteAddress,
      port: 3671,
      family: 'IPv4',
      size: frame.length,
    });
  }

  // Advance past the timeout
  await jest.advanceTimersByTimeAsync(timeout + 50);
  return promise;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('KNXNetDiscovery', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    // Default: each new test gets a fresh mock socket
    const socket = makeMockSocket();
    mockCreateSocket.mockReturnValue(socket);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('discover()', () => {
    test('should resolve with empty array when no responses arrive', async () => {
      const devices = await runDiscover(100);
      expect(devices).toEqual([]);
    });

    test('should send a SEARCH_REQUEST on the socket', async () => {
      let capturedSocket!: ReturnType<typeof makeMockSocket>;
      mockCreateSocket.mockImplementationOnce(() => {
        capturedSocket = makeMockSocket();
        return capturedSocket;
      });

      const promise = discovery_instance();
      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(150);
      await promise;

      expect(capturedSocket.send).toHaveBeenCalled();
      const [sentBuf] = capturedSocket.send.mock.calls[0]!;
      expect((sentBuf as Buffer).readUInt16BE(2)).toBe(KNX_CONSTANTS.SERVICE_TYPES.SEARCH_REQUEST);

      function discovery_instance() {
        return new KNXNetDiscovery().discover({ timeout: 100 });
      }
    });

    test('should discover a device when a valid SEARCH_RESPONSE is received', async () => {
      const resp = buildSearchResponse({
        friendlyName: 'My KNX Router',
        ip: '10.0.0.5',
        port: 3671,
        serviceFamilies: [{ id: 0x04, version: 0x01 }],
      });
      const devices = await runDiscover(200, resp);
      expect(devices).toHaveLength(1);
      expect(devices[0]!.ip).toBe('10.0.0.5');
      expect(devices[0]!.port).toBe(3671);
      expect(devices[0]!.friendlyName).toBe('My KNX Router');
    });

    test('should deduplicate devices with the same IP:port', async () => {
      const resp = buildSearchResponse({ ip: '10.0.0.1' });

      const discovery = new KNXNetDiscovery();
      let socket!: ReturnType<typeof makeMockSocket>;
      mockCreateSocket.mockImplementationOnce(() => {
        socket = makeMockSocket();
        return socket;
      });

      const promise = discovery.discover({ timeout: 200 });
      await jest.advanceTimersByTimeAsync(0);

      const rinfo = { address: resp.remoteAddress, port: 3671, family: 'IPv4', size: resp.frame.length };
      socket.emit('message', resp.frame, rinfo);
      socket.emit('message', resp.frame, rinfo); // duplicate

      await jest.advanceTimersByTimeAsync(250);
      const devices = await promise;

      expect(devices).toHaveLength(1);
    });

    test('should emit deviceFound event for each unique device', async () => {
      const resp = buildSearchResponse({ ip: '10.0.0.2' });

      const discovery = new KNXNetDiscovery();
      let socket!: ReturnType<typeof makeMockSocket>;
      mockCreateSocket.mockImplementationOnce(() => {
        socket = makeMockSocket();
        return socket;
      });

      const foundDevices: any[] = [];
      discovery.on('deviceFound', (ep) => foundDevices.push(ep));

      const promise = discovery.discover({ timeout: 200 });
      await jest.advanceTimersByTimeAsync(0);
      socket.emit('message', resp.frame, { address: resp.remoteAddress, port: 3671, family: 'IPv4', size: resp.frame.length });
      await jest.advanceTimersByTimeAsync(250);
      await promise;

      expect(foundDevices).toHaveLength(1);
      expect(foundDevices[0]!.ip).toBe('10.0.0.2');
    });

    test('should ignore messages with wrong service type', async () => {
      const discovery = new KNXNetDiscovery();
      let socket!: ReturnType<typeof makeMockSocket>;
      mockCreateSocket.mockImplementationOnce(() => {
        socket = makeMockSocket();
        return socket;
      });

      const promise = discovery.discover({ timeout: 200 });
      await jest.advanceTimersByTimeAsync(0);

      // Build a frame with SEARCH_REQUEST service type (not a SEARCH_RESPONSE)
      const frame = Buffer.alloc(14);
      frame[0] = 0x06; frame[1] = 0x10;
      frame.writeUInt16BE(KNX_CONSTANTS.SERVICE_TYPES.SEARCH_REQUEST, 2);
      frame.writeUInt16BE(14, 4);
      socket.emit('message', frame, { address: '10.0.0.1', port: 3671 });

      await jest.advanceTimersByTimeAsync(250);
      const devices = await promise;
      expect(devices).toHaveLength(0);
    });

    test('should close the socket after discovery completes', async () => {
      const discovery = new KNXNetDiscovery();
      let socket!: ReturnType<typeof makeMockSocket>;
      mockCreateSocket.mockImplementationOnce(() => {
        socket = makeMockSocket();
        return socket;
      });
      const promise = discovery.discover({ timeout: 100 });
      await jest.advanceTimersByTimeAsync(150);
      await promise;
      expect(socket.close).toHaveBeenCalled();
    });

    test('close() should not throw when called before discover()', () => {
      const discovery = new KNXNetDiscovery();
      expect(() => discovery.close()).not.toThrow();
    });
  });

  describe('device capabilities parsing', () => {
    async function discoverWith(families: { id: number; version: number }[]) {
      const resp = buildSearchResponse({ serviceFamilies: families });
      const devices = await runDiscover(200, resp);
      return devices[0]!.capabilities;
    }

    test('should set TUNNELLING capability when family 0x04 is present', async () => {
      const caps = await discoverWith([{ id: 0x04, version: 0x01 }]);
      expect(caps & KNX_CONSTANTS.DEVICE_CAPABILITIES.TUNNELLING).toBeTruthy();
    });

    test('should set ROUTING capability when family 0x05 is present', async () => {
      const caps = await discoverWith([{ id: 0x05, version: 0x01 }]);
      expect(caps & KNX_CONSTANTS.DEVICE_CAPABILITIES.ROUTING).toBeTruthy();
    });

    test('should set DEVICE_MANAGEMENT capability when family 0x03 is present', async () => {
      const caps = await discoverWith([{ id: 0x03, version: 0x01 }]);
      expect(caps & KNX_CONSTANTS.DEVICE_CAPABILITIES.DEVICE_MANAGEMENT).toBeTruthy();
    });

    test('should set REMOTE_LOGGING capability when family 0x06 is present', async () => {
      const caps = await discoverWith([{ id: 0x06, version: 0x01 }]);
      expect(caps & KNX_CONSTANTS.DEVICE_CAPABILITIES.REMOTE_LOGGING).toBeTruthy();
    });

    test('should set REMOTE_CONFIGURATION capability when family 0x07 is present', async () => {
      const caps = await discoverWith([{ id: 0x07, version: 0x01 }]);
      expect(caps & KNX_CONSTANTS.DEVICE_CAPABILITIES.REMOTE_CONFIGURATION).toBeTruthy();
    });

    test('should set OBJECT_SERVER capability when family 0x08 is present', async () => {
      const caps = await discoverWith([{ id: 0x08, version: 0x01 }]);
      expect(caps & KNX_CONSTANTS.DEVICE_CAPABILITIES.OBJECT_SERVER).toBeTruthy();
    });

    test('should combine multiple capabilities', async () => {
      const caps = await discoverWith([
        { id: 0x04, version: 0x01 },
        { id: 0x05, version: 0x01 },
      ]);
      expect(caps & KNX_CONSTANTS.DEVICE_CAPABILITIES.TUNNELLING).toBeTruthy();
      expect(caps & KNX_CONSTANTS.DEVICE_CAPABILITIES.ROUTING).toBeTruthy();
    });

    test('should return 0 capabilities when only Core family (0x02) is present', async () => {
      const caps = await discoverWith([{ id: 0x02, version: 0x01 }]);
      expect(caps).toBe(0);
    });
  });

  describe('device info parsing', () => {
    test('should parse KNX individual address', async () => {
      // KNX address 0x1101 => area=1, line=1, device=1 => "1.1.1"
      const devices = await runDiscover(200, buildSearchResponse({ ip: '10.0.0.3' }));
      expect(devices[0]!.knxAddress).toBe('1.1.1');
    });

    test('should parse MAC address', async () => {
      const devices = await runDiscover(200, buildSearchResponse({ ip: '10.0.0.4' }));
      expect(devices[0]!.macAddress).toBe('AA:BB:CC:DD:EE:FF');
    });

    test('should parse serial number', async () => {
      const devices = await runDiscover(200, buildSearchResponse({ ip: '10.0.0.5' }));
      // Serial was set to 00 00 00 00 00 01
      expect(devices[0]!.serialNumber).toBe('000000000001');
    });

    test('should use rinfo.address as the device IP', async () => {
      const { frame } = buildSearchResponse({ ip: '10.0.0.1' });

      const discovery = new KNXNetDiscovery();
      let socket!: ReturnType<typeof makeMockSocket>;
      mockCreateSocket.mockImplementationOnce(() => {
        socket = makeMockSocket();
        return socket;
      });

      const promise = discovery.discover({ timeout: 200 });
      await jest.advanceTimersByTimeAsync(0);
      // Emit with a different address than what's in the HPAI
      socket.emit('message', frame, { address: '192.168.100.50', port: 3671, family: 'IPv4', size: frame.length });
      await jest.advanceTimersByTimeAsync(250);
      const devices = await promise;

      expect(devices[0]!.ip).toBe('192.168.100.50');
    });

    test('should fall back to "KNX Device <ip>" when friendly name is empty', async () => {
      const devices = await runDiscover(200, buildSearchResponse({ friendlyName: '', ip: '10.5.6.7' }));
      expect(devices[0]!.name).toBe('KNX Device 10.5.6.7');
    });
  });

  describe('error handling', () => {
    test('should emit error event on malformed SEARCH_RESPONSE payload', async () => {
      const discovery = new KNXNetDiscovery();
      let socket!: ReturnType<typeof makeMockSocket>;
      mockCreateSocket.mockImplementationOnce(() => {
        socket = makeMockSocket();
        return socket;
      });

      const errors: Error[] = [];
      discovery.on('error', (err) => errors.push(err));

      const promise = discovery.discover({ timeout: 200 });
      await jest.advanceTimersByTimeAsync(0);

      // Build a frame with SEARCH_RESPONSE service type but too-short/invalid payload
      const badFrame = Buffer.alloc(10);
      badFrame[0] = 0x06; badFrame[1] = 0x10;
      badFrame.writeUInt16BE(KNX_CONSTANTS.SERVICE_TYPES.SEARCH_RESPONSE, 2);
      badFrame.writeUInt16BE(10, 4);
      socket.emit('message', badFrame, { address: '10.0.0.1', port: 3671 });

      await jest.advanceTimersByTimeAsync(250);
      await promise;

      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
