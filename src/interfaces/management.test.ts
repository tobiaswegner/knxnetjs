import { EventEmitter } from 'events';
import { KNXNetManagementImpl } from './management';
import { KNX_CONSTANTS } from '../constants';
import { CEMIFrame, CEMIMessageCode } from '../frames';
import { CEMIPropertyReadCon } from '../frames/cemi-properties';

// ---------------------------------------------------------------------------
// Mock dgram
// ---------------------------------------------------------------------------
jest.mock('dgram');
import { createSocket } from 'dgram';
const mockCreateSocket = createSocket as jest.MockedFunction<typeof createSocket>;

function makeMockSocket() {
  const emitter = new EventEmitter() as any;

  emitter.bind = jest.fn((_portOrCb?: number | (() => void)) => {
    setImmediate(() => emitter.emit('listening'));
  });
  emitter.address = jest.fn(() => ({
    address: '0.0.0.0',
    port: 12345,
    family: 'IPv4',
  }));
  emitter.send = jest.fn(
    (_buf: Buffer, _port: number, _addr: string, cb?: (err: Error | null) => void) => {
      if (cb) cb(null);
    }
  );
  emitter.close = jest.fn();
  emitter.removeAllListeners = jest.fn(() => {
    EventEmitter.prototype.removeAllListeners.call(emitter);
    return emitter;
  });
  emitter.off = jest.fn((event: string, listener: (...args: any[]) => void) => {
    EventEmitter.prototype.off.call(emitter, event, listener);
    return emitter;
  });
  return emitter;
}

// ---------------------------------------------------------------------------
// Frame construction helpers
// ---------------------------------------------------------------------------

function buildKNXnetIPFrameBuffer(serviceType: number, payload: Buffer): Buffer {
  const totalLength = 6 + payload.length;
  const buf = Buffer.alloc(totalLength);
  buf[0] = 0x06; buf[1] = 0x10;
  buf.writeUInt16BE(serviceType, 2);
  buf.writeUInt16BE(totalLength, 4);
  payload.copy(buf, 6);
  return buf;
}

function buildConnectResponse(
  connectionId: number = 1,
  status: number = 0x00,
  serverIp: string = '192.168.1.1',
  serverPort: number = 3671
): Buffer {
  const ipParts = serverIp.split('.').map(Number);
  const hpai = Buffer.from([
    0x08, 0x01,
    ipParts[0]!, ipParts[1]!, ipParts[2]!, ipParts[3]!,
    (serverPort >> 8) & 0xff, serverPort & 0xff,
  ]);
  const payload = Buffer.allocUnsafe(2 + 8);
  payload[0] = connectionId;
  payload[1] = status;
  hpai.copy(payload, 2);
  return buildKNXnetIPFrameBuffer(KNX_CONSTANTS.SERVICE_TYPES.CONNECT_RESPONSE, payload);
}

function buildDeviceConfigRequest(
  connectionId: number,
  seqCounter: number,
  cemiPayload: Buffer
): Buffer {
  const connHeader = Buffer.from([0x04, connectionId, seqCounter, 0x00]);
  const payload = Buffer.concat([connHeader, cemiPayload]);
  return buildKNXnetIPFrameBuffer(KNX_CONSTANTS.SERVICE_TYPES.DEVICE_CONFIGURATION_REQUEST, payload);
}

function buildTunnelingRequest(
  connectionId: number,
  sequenceCounter: number,
  cemiBuffer: Buffer
): Buffer {
  const connHeader = Buffer.from([0x04, connectionId, sequenceCounter, 0x00]);
  const payload = Buffer.concat([connHeader, cemiBuffer]);
  return buildKNXnetIPFrameBuffer(KNX_CONSTANTS.SERVICE_TYPES.TUNNELLING_REQUEST, payload);
}

function makePropReadConBuffer(data: Buffer = Buffer.from([0x01])): Buffer {
  return new CEMIPropertyReadCon(0x0008, 1, 52, 1, 1, data).toBuffer();
}

// A minimal valid L_DATA_IND cEMI frame
const cemiBuffer = Buffer.from([
  0x29, 0x00, 0xBC, 0x60, 0xD0, 0x11, 0x04, 0x01, 0x02, 0x00, 0x81,
]);

// ---------------------------------------------------------------------------
// Helper: open a connected management instance
// ---------------------------------------------------------------------------
async function openConnected(
  m: KNXNetManagementImpl,
  socket: ReturnType<typeof makeMockSocket>,
  connectionId: number = 1
): Promise<void> {
  const connectResponse = buildConnectResponse(connectionId);
  socket.send = jest.fn(
    (buf: Buffer, _port: number, _addr: string, cb?: (err: Error | null) => void) => {
      if (cb) cb(null);
      const serviceType = buf.readUInt16BE(2);
      if (serviceType === KNX_CONSTANTS.SERVICE_TYPES.CONNECT_REQUEST) {
        setImmediate(() => {
          socket.emit('message', connectResponse, {
            address: '192.168.1.1', port: 3671, family: 'IPv4', size: connectResponse.length,
          });
        });
      }
    }
  );
  await m.open();
  // Switch to silent send after connection (for heartbeat, ACKs etc.)
  socket.send = jest.fn((_buf: Buffer, _port: number, _addr: string, cb?: (err: Error | null) => void) => {
    if (cb) cb(null);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('KNXNetManagementImpl', () => {
  let mockSocket: ReturnType<typeof makeMockSocket>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSocket = makeMockSocket();
    mockCreateSocket.mockReturnValue(mockSocket);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    test('should create with default options', () => {
      const m = new KNXNetManagementImpl('192.168.1.1');
      expect(m).toBeDefined();
    });

    test('should default busmonitor mode to false', () => {
      const m = new KNXNetManagementImpl('192.168.1.1');
      expect(m.isBusmonitorMode()).toBe(false);
    });

    test('should enable busmonitor mode when requested', () => {
      const m = new KNXNetManagementImpl('192.168.1.1', undefined, undefined, true);
      expect(m.isBusmonitorMode()).toBe(true);
    });
  });

  describe('before connection', () => {
    test('send() should throw "not implemented"', async () => {
      const m = new KNXNetManagementImpl('192.168.1.1');
      const frame = CEMIFrame.create(CEMIMessageCode.L_DATA_REQ, 0, 0, Buffer.from([0x00, 0x80]));
      await expect(m.send(frame)).rejects.toThrow(/not implemented/i);
    });

    test('writeProperty() should throw "Not connected"', async () => {
      const m = new KNXNetManagementImpl('192.168.1.1');
      await expect(m.writeProperty(0, 1, 1, 1, 1, Buffer.alloc(1))).rejects.toThrow('Not connected');
    });

    test('readProperty() should throw "Not connected"', async () => {
      const m = new KNXNetManagementImpl('192.168.1.1');
      await expect(m.readProperty(0, 1, 1, 1, 1)).rejects.toThrow('Not connected');
    });

    test('close() should resolve without error when not connected', async () => {
      const m = new KNXNetManagementImpl('192.168.1.1');
      await expect(m.close()).resolves.not.toThrow();
    });
  });

  describe('open()', () => {
    test('should send a CONNECT_REQUEST to the server', async () => {
      const m = new KNXNetManagementImpl('10.0.0.1', 3671);
      const sentServiceTypes: number[] = [];
      mockSocket.send = jest.fn(
        (buf: Buffer, _port: number, _addr: string, cb?: (err: Error | null) => void) => {
          if (cb) cb(null);
          sentServiceTypes.push(buf.readUInt16BE(2));
          if (buf.readUInt16BE(2) === KNX_CONSTANTS.SERVICE_TYPES.CONNECT_REQUEST) {
            setImmediate(() => {
              mockSocket.emit('message', buildConnectResponse(1), {
                address: '10.0.0.1', port: 3671, family: 'IPv4', size: 0,
              });
            });
          }
        }
      );
      await m.open();
      expect(sentServiceTypes).toContain(KNX_CONSTANTS.SERVICE_TYPES.CONNECT_REQUEST);
      await m.close();
    });

    test('should be idempotent (second open() is a no-op)', async () => {
      const m = new KNXNetManagementImpl('10.0.0.1', 3671);
      await openConnected(m, mockSocket);
      const bindCallCount = mockSocket.bind.mock.calls.length;
      await m.open(); // second call — should be a no-op
      expect(mockSocket.bind.mock.calls.length).toBe(bindCallCount);
      await m.close();
    });

    test('should reject when CONNECT_RESPONSE has non-zero status', async () => {
      const errorResponse = buildConnectResponse(0, KNX_CONSTANTS.ERROR_CODES.E_NO_MORE_CONNECTIONS);
      mockSocket.send = jest.fn(
        (_buf: Buffer, _port: number, _addr: string, cb?: (err: Error | null) => void) => {
          if (cb) cb(null);
          setImmediate(() => {
            mockSocket.emit('message', errorResponse, {
              address: '10.0.0.1', port: 3671, family: 'IPv4', size: 0,
            });
          });
        }
      );
      const m = new KNXNetManagementImpl('10.0.0.1', 3671);
      await expect(m.open()).rejects.toThrow(/Connection failed/);
    });

    test('should reject when socket emits an error during setup', async () => {
      mockSocket.bind = jest.fn((_port: number) => {
        setImmediate(() => mockSocket.emit('error', new Error('bind failed')));
      });
      const m = new KNXNetManagementImpl('10.0.0.1', 3671);
      m.on('error', () => {}); // prevent unhandled error throw
      await expect(m.open()).rejects.toThrow('bind failed');
    });
  });

  describe('writeProperty()', () => {
    test('should send a DEVICE_CONFIGURATION_REQUEST', async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
      const m = new KNXNetManagementImpl('10.0.0.1', 3671);
      await openConnected(m, mockSocket);

      const sentServiceTypes: number[] = [];
      mockSocket.send = jest.fn((buf: Buffer, _port: number, _addr: string, cb?: (err: Error | null) => void) => {
        sentServiceTypes.push(buf.readUInt16BE(2));
        if (cb) cb(null);
      });

      const writePromise = m.writeProperty(0x0008, 1, 52, 1, 1, Buffer.from([0x00]));
      await jest.advanceTimersByTimeAsync(2001);
      await writePromise;

      expect(sentServiceTypes).toContain(KNX_CONSTANTS.SERVICE_TYPES.DEVICE_CONFIGURATION_REQUEST);
      await m.close();
    });

    test('should resolve after the 2000ms internal timeout', async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
      const m = new KNXNetManagementImpl('10.0.0.1', 3671);
      await openConnected(m, mockSocket);

      const writePromise = m.writeProperty(0x0008, 1, 52, 1, 1, Buffer.from([0x00]));

      // Should not resolve before 2000ms
      let resolved = false;
      writePromise.then(() => { resolved = true; });

      await jest.advanceTimersByTimeAsync(1999);
      await Promise.resolve(); // flush microtasks
      expect(resolved).toBe(false);

      await jest.advanceTimersByTimeAsync(2);
      await writePromise;
      expect(resolved).toBe(true);

      await m.close();
    });

    test('should reject when socket send fails', async () => {
      const m = new KNXNetManagementImpl('10.0.0.1', 3671);
      await openConnected(m, mockSocket);

      mockSocket.send = jest.fn((_buf: Buffer, _port: number, _addr: string, cb?: (err: Error | null) => void) => {
        if (cb) cb(new Error('network error'));
      });

      await expect(m.writeProperty(0x0008, 1, 52, 1, 1, Buffer.from([0x00]))).rejects.toThrow('network error');
      await m.close();
    });
  });

  describe('readProperty()', () => {
    test('should send a DEVICE_CONFIGURATION_REQUEST with CEMIPropertyReadReq payload', async () => {
      const m = new KNXNetManagementImpl('10.0.0.1', 3671);
      await openConnected(m, mockSocket);

      const sentServiceTypes: number[] = [];
      mockSocket.send = jest.fn((buf: Buffer, _port: number, _addr: string, cb?: (err: Error | null) => void) => {
        sentServiceTypes.push(buf.readUInt16BE(2));
        if (cb) cb(null);
      });

      const readPromise = m.readProperty(0x0008, 1, 52, 1, 1);

      // Inject server response (listener registered before send() was called)
      const deviceConfigMsg = buildDeviceConfigRequest(1, 0, makePropReadConBuffer());
      mockSocket.emit('message', deviceConfigMsg, { address: '10.0.0.1', port: 3671 });

      await readPromise;
      expect(sentServiceTypes).toContain(KNX_CONSTANTS.SERVICE_TYPES.DEVICE_CONFIGURATION_REQUEST);
      await m.close();
    });

    test('should resolve with data from CEMIPropertyReadCon response', async () => {
      const m = new KNXNetManagementImpl('10.0.0.1', 3671);
      await openConnected(m, mockSocket);

      const expectedData = Buffer.from([0xAB, 0xCD]);
      const readPromise = m.readProperty(0x0008, 1, 52, 1, 1);

      // Inject the server's property read confirmation
      const deviceConfigMsg = buildDeviceConfigRequest(1, 0, makePropReadConBuffer(expectedData));
      mockSocket.emit('message', deviceConfigMsg, { address: '10.0.0.1', port: 3671 });

      const result = await readPromise;
      expect(result).toEqual(expectedData);
      await m.close();
    });

    test('should reject after 5000ms with no response', async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
      const m = new KNXNetManagementImpl('10.0.0.1', 3671);
      await openConnected(m, mockSocket);

      const readPromise = m.readProperty(0x0008, 1, 52, 1, 1);
      // Attach assertion handler immediately to avoid unhandled-rejection warning
      const assertionPromise = expect(readPromise).rejects.toThrow('Property read timeout');
      await jest.advanceTimersByTimeAsync(5001);
      await assertionPromise;
      await m.close();
    });

    test('should reject when socket send fails', async () => {
      const m = new KNXNetManagementImpl('10.0.0.1', 3671);
      await openConnected(m, mockSocket);

      mockSocket.send = jest.fn((_buf: Buffer, _port: number, _addr: string, cb?: (err: Error | null) => void) => {
        if (cb) cb(new Error('send failed'));
      });

      await expect(m.readProperty(0x0008, 1, 52, 1, 1)).rejects.toThrow('send failed');
      await m.close();
    });
  });

  describe('incoming DEVICE_CONFIGURATION_REQUEST', () => {
    test('should send a DEVICE_CONFIGURATION_ACK', async () => {
      const m = new KNXNetManagementImpl('10.0.0.1', 3671);
      await openConnected(m, mockSocket);

      const sentServiceTypes: number[] = [];
      mockSocket.send = jest.fn((buf: Buffer, _port: number, _addr: string, cb?: (err: Error | null) => void) => {
        sentServiceTypes.push(buf.readUInt16BE(2));
        if (cb) cb(null);
      });

      const msg = buildDeviceConfigRequest(1, 5, makePropReadConBuffer());
      mockSocket.emit('message', msg, { address: '10.0.0.1', port: 3671 });

      expect(sentServiceTypes).toContain(KNX_CONSTANTS.SERVICE_TYPES.DEVICE_CONFIGURATION_ACK);
      await m.close();
    });

    test('should emit "recv" with a valid CEMIPropertyReadCon', async () => {
      const m = new KNXNetManagementImpl('10.0.0.1', 3671);
      await openConnected(m, mockSocket);

      const received: any[] = [];
      m.on('recv', (f) => received.push(f));

      const data = Buffer.from([0x42]);
      const msg = buildDeviceConfigRequest(1, 0, makePropReadConBuffer(data));
      mockSocket.emit('message', msg, { address: '10.0.0.1', port: 3671 });

      expect(received).toHaveLength(1);
      expect(received[0]!.messageCode).toBe(CEMIMessageCode.M_PROP_READ_CON);
      expect(received[0]!.data).toEqual(data);
      await m.close();
    });

    test('should not emit "recv" and should emit "error" for invalid cEMI payload', async () => {
      const m = new KNXNetManagementImpl('10.0.0.1', 3671);
      await openConnected(m, mockSocket);

      const errors: Error[] = [];
      const received: any[] = [];
      m.on('error', (e) => errors.push(e)); // required to prevent unhandled throw
      m.on('recv', (f) => received.push(f));

      // Buffer with M_PROP_READ_REQ code (0xfc) — fromBuffer will throw for CEMIPropertyReadCon
      const invalidBuf = Buffer.from([0xfc, 0x00, 0x08, 0x01, 0x34, 0x10, 0x01]);
      const msg = buildDeviceConfigRequest(1, 0, invalidBuf);
      mockSocket.emit('message', msg, { address: '10.0.0.1', port: 3671 });

      expect(received).toHaveLength(0);
      expect(errors.length).toBeGreaterThan(0);
      await m.close();
    });
  });

  describe('incoming TUNNELLING_REQUEST', () => {
    test('should send TUNNELLING_ACK and emit "recv"', async () => {
      const m = new KNXNetManagementImpl('10.0.0.1', 3671);
      await openConnected(m, mockSocket);

      const received: any[] = [];
      const sentServiceTypes: number[] = [];
      m.on('recv', (f) => received.push(f));
      mockSocket.send = jest.fn((buf: Buffer, _port: number, _addr: string, cb?: (err: Error | null) => void) => {
        sentServiceTypes.push(buf.readUInt16BE(2));
        if (cb) cb(null);
      });

      mockSocket.emit('message', buildTunnelingRequest(1, 0, cemiBuffer), {
        address: '10.0.0.1', port: 3671,
      });

      expect(sentServiceTypes).toContain(KNX_CONSTANTS.SERVICE_TYPES.TUNNELLING_ACK);
      expect(received).toHaveLength(1);
      expect(received[0]!.messageCode).toBe(CEMIMessageCode.L_DATA_IND);
      await m.close();
    });
  });

  describe('CONNECTIONSTATE_REQUEST handling', () => {
    test('should respond with a CONNECTIONSTATE_RESPONSE', async () => {
      const m = new KNXNetManagementImpl('10.0.0.1', 3671);
      await openConnected(m, mockSocket);

      const sentServiceTypes: number[] = [];
      mockSocket.send = jest.fn((buf: Buffer, _port: number, _addr: string, cb?: (err: Error | null) => void) => {
        sentServiceTypes.push(buf.readUInt16BE(2));
        if (cb) cb(null);
      });

      const payload = Buffer.from([0x01, 0x00]); // connectionId=1, reserved=0
      const connStateReq = buildKNXnetIPFrameBuffer(
        KNX_CONSTANTS.SERVICE_TYPES.CONNECTIONSTATE_REQUEST,
        payload
      );
      mockSocket.emit('message', connStateReq, { address: '10.0.0.1', port: 3671 });

      expect(sentServiceTypes).toContain(KNX_CONSTANTS.SERVICE_TYPES.CONNECTIONSTATE_RESPONSE);
      await m.close();
    });
  });

  describe('close()', () => {
    test('should send DISCONNECT_REQUEST and close the socket', async () => {
      const m = new KNXNetManagementImpl('10.0.0.1', 3671);
      await openConnected(m, mockSocket);

      const sentServiceTypes: number[] = [];
      mockSocket.send = jest.fn((buf: Buffer, _port: number, _addr: string, cb?: (err: Error | null) => void) => {
        sentServiceTypes.push(buf.readUInt16BE(2));
        if (cb) cb(null);
      });

      await m.close();

      expect(sentServiceTypes).toContain(KNX_CONSTANTS.SERVICE_TYPES.DISCONNECT_REQUEST);
      expect(mockSocket.close).toHaveBeenCalled();
    });

    test('should be idempotent (second close() is a no-op)', async () => {
      const m = new KNXNetManagementImpl('10.0.0.1', 3671);
      await openConnected(m, mockSocket);
      await m.close();
      mockSocket.close.mockClear();
      await m.close(); // second close
      expect(mockSocket.close).not.toHaveBeenCalled();
    });
  });
});
