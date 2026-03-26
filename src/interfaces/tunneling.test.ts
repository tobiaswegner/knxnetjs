import { EventEmitter } from 'events';
import { KNXNetTunnelingImpl } from './tunneling';
import { KNX_CONSTANTS } from '../constants';
import { CEMIFrame, CEMIMessageCode, KNXnetIPFrame } from '../frames';

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
      if (cb) setImmediate(() => cb(null));
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

function buildTunnelingRequest(
  connectionId: number,
  sequenceCounter: number,
  cemiBuffer: Buffer
): Buffer {
  const connHeader = Buffer.from([0x04, connectionId, sequenceCounter, 0x00]);
  const payload = Buffer.concat([connHeader, cemiBuffer]);
  return buildKNXnetIPFrameBuffer(KNX_CONSTANTS.SERVICE_TYPES.TUNNELLING_REQUEST, payload);
}

function buildTunnelingAck(
  connectionId: number,
  sequenceCounter: number,
  status: number = 0x00
): Buffer {
  const payload = Buffer.from([0x04, connectionId, sequenceCounter, status]);
  return buildKNXnetIPFrameBuffer(KNX_CONSTANTS.SERVICE_TYPES.TUNNELLING_ACK, payload);
}

const cemiBuffer = Buffer.from([
  0x29, 0x00, 0xBC, 0x60, 0xD0, 0x11, 0x04, 0x01, 0x02, 0x00, 0x81,
]);

// ---------------------------------------------------------------------------
// Helper: open a connected tunneling instance
// The socket mock auto-responds to CONNECT_REQUEST with a success response.
// ---------------------------------------------------------------------------
async function openConnected(
  t: KNXNetTunnelingImpl,
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
  await t.open();
  // Switch to silent send after connection (for ACKs etc.)
  socket.send = jest.fn((_buf: Buffer, _port: number, _addr: string, cb?: (err: Error | null) => void) => {
    if (cb) cb(null);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('KNXNetTunnelingImpl', () => {
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
      const t = new KNXNetTunnelingImpl('192.168.1.1');
      expect(t).toBeDefined();
      expect(t.isBusmonitorMode()).toBe(false);
    });

    test('should enable busmonitor mode when requested', () => {
      const t = new KNXNetTunnelingImpl('192.168.1.1', undefined, undefined, true);
      expect(t.isBusmonitorMode()).toBe(true);
    });
  });

  describe('before connection', () => {
    test('send() should throw "Not connected"', async () => {
      const t = new KNXNetTunnelingImpl('192.168.1.1');
      const frame = CEMIFrame.create(CEMIMessageCode.L_DATA_REQ, 0, 0, Buffer.from([0x00, 0x80]));
      await expect(t.send(frame)).rejects.toThrow('Not connected');
    });

    test('writeProperty() should throw "Not connected"', async () => {
      const t = new KNXNetTunnelingImpl('192.168.1.1');
      await expect(t.writeProperty(0, 1, 1, 1, 1, Buffer.alloc(1))).rejects.toThrow('Not connected');
    });

    test('readProperty() should throw "Not connected"', async () => {
      const t = new KNXNetTunnelingImpl('192.168.1.1');
      await expect(t.readProperty(0, 1, 1, 1, 1)).rejects.toThrow('Not connected');
    });

    test('close() should resolve without error when not connected', async () => {
      const t = new KNXNetTunnelingImpl('192.168.1.1');
      await expect(t.close()).resolves.not.toThrow();
    });
  });

  describe('open()', () => {
    test('should send a CONNECT_REQUEST to the server', async () => {
      const t = new KNXNetTunnelingImpl('10.0.0.1', 3671);
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

      await t.open();
      expect(sentServiceTypes).toContain(KNX_CONSTANTS.SERVICE_TYPES.CONNECT_REQUEST);
      await t.close();
    });

    test('should be idempotent (second open() is a no-op)', async () => {
      const t = new KNXNetTunnelingImpl('10.0.0.1', 3671);
      await openConnected(t, mockSocket);
      const bindCallCount = mockSocket.bind.mock.calls.length;
      await t.open(); // second call - should be no-op
      expect(mockSocket.bind.mock.calls.length).toBe(bindCallCount);
      await t.close();
    });

    test('should reject when CONNECT_RESPONSE has non-zero status', async () => {
      const errorResponse = buildConnectResponse(
        0,
        KNX_CONSTANTS.ERROR_CODES.E_NO_MORE_CONNECTIONS
      );
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

      const t = new KNXNetTunnelingImpl('10.0.0.1', 3671);
      await expect(t.open()).rejects.toThrow(/Connection failed/);
    });

    test('should reject when socket emits an error during setup', async () => {
      mockSocket.bind = jest.fn((_port: number) => {
        // emit error instead of listening
        setImmediate(() => mockSocket.emit('error', new Error('bind failed')));
      });

      const t = new KNXNetTunnelingImpl('10.0.0.1', 3671);
      // Must add an error listener or Node.js throws unhandled error, blocking the rejection
      t.on('error', () => {});
      await expect(t.open()).rejects.toThrow('bind failed');
    });
  });

  describe('send() in busmonitor mode', () => {
    test('should throw when trying to send in busmonitor mode', async () => {
      const t = new KNXNetTunnelingImpl('10.0.0.1', 3671, undefined, true);
      await openConnected(t, mockSocket);

      const frame = CEMIFrame.create(CEMIMessageCode.L_DATA_REQ, 0, 0, Buffer.from([0x00, 0x80]));
      await expect(t.send(frame)).rejects.toThrow('busmonitor mode');
      await t.close();
    });
  });

  describe('incoming TUNNELLING_REQUEST', () => {
    test('should emit "recv" for a valid incoming TUNNELLING_REQUEST', async () => {
      const t = new KNXNetTunnelingImpl('10.0.0.1', 3671);
      await openConnected(t, mockSocket);

      const received: CEMIFrame[] = [];
      t.on('recv', (f) => received.push(f));

      mockSocket.emit('message', buildTunnelingRequest(1, 0, cemiBuffer), {
        address: '10.0.0.1', port: 3671,
      });

      expect(received).toHaveLength(1);
      expect(received[0]!.messageCode).toBe(CEMIMessageCode.L_DATA_IND);
      await t.close();
    });

    test('should send a TUNNELLING_ACK in response to TUNNELLING_REQUEST', async () => {
      const t = new KNXNetTunnelingImpl('10.0.0.1', 3671);
      await openConnected(t, mockSocket);

      const sentServiceTypes: number[] = [];
      mockSocket.send = jest.fn((buf: Buffer, _port: number, _addr: string, cb?: (err: Error | null) => void) => {
        sentServiceTypes.push(buf.readUInt16BE(2));
        if (cb) cb(null);
      });

      mockSocket.emit('message', buildTunnelingRequest(1, 0, cemiBuffer), {
        address: '10.0.0.1', port: 3671,
      });

      expect(sentServiceTypes).toContain(KNX_CONSTANTS.SERVICE_TYPES.TUNNELLING_ACK);
      await t.close();
    });

    test('should not emit "recv" for a duplicate sequence (n-1)', async () => {
      const t = new KNXNetTunnelingImpl('10.0.0.1', 3671);
      await openConnected(t, mockSocket);

      const received: CEMIFrame[] = [];
      t.on('recv', (f) => received.push(f));

      // seq=0 is first expected; process it (sets expectedIncoming to 1)
      mockSocket.emit('message', buildTunnelingRequest(1, 0, cemiBuffer), {
        address: '10.0.0.1', port: 3671,
      });
      expect(received).toHaveLength(1);

      // seq=0 again is a duplicate (n-1)
      mockSocket.emit('message', buildTunnelingRequest(1, 0, cemiBuffer), {
        address: '10.0.0.1', port: 3671,
      });
      expect(received).toHaveLength(1); // should NOT increase
      await t.close();
    });

    test('should not emit "recv" when connection ID does not match', async () => {
      const t = new KNXNetTunnelingImpl('10.0.0.1', 3671);
      await openConnected(t, mockSocket);

      const received: CEMIFrame[] = [];
      t.on('recv', (f) => received.push(f));

      // connectionId=99 does not match our connectionId=1
      mockSocket.emit('message', buildTunnelingRequest(99, 0, cemiBuffer), {
        address: '10.0.0.1', port: 3671,
      });

      expect(received).toHaveLength(0);
      await t.close();
    });

    test('should emit error for invalid sequence number', async () => {
      const t = new KNXNetTunnelingImpl('10.0.0.1', 3671);
      await openConnected(t, mockSocket);

      const errors: Error[] = [];
      t.on('error', (e) => errors.push(e));

      // expectedIncoming starts at 0; send sequence 5 (invalid)
      mockSocket.emit('message', buildTunnelingRequest(1, 5, cemiBuffer), {
        address: '10.0.0.1', port: 3671,
      });

      expect(errors.some((e) => e.message.includes('Invalid sequence number'))).toBe(true);
      await t.close();
    });
  });

  describe('sequence number wrapping', () => {
    test('should use incrementing sequence numbers starting from 0', async () => {
      const t = new KNXNetTunnelingImpl('10.0.0.1', 3671);
      await openConnected(t, mockSocket);

      const sentSequences: number[] = [];
      mockSocket.send = jest.fn((buf: Buffer, _port: number, _addr: string, cb?: (err: Error | null) => void) => {
        if (cb) cb(null);
        const service = buf.readUInt16BE(2);
        if (service === KNX_CONSTANTS.SERVICE_TYPES.TUNNELLING_REQUEST) {
          const seq = buf[6 + 2]!; // header(6) + connHeader offset 2
          sentSequences.push(seq);
          setImmediate(() => {
            mockSocket.emit('message', buildTunnelingAck(1, seq, 0x00), {
              address: '10.0.0.1', port: 3671,
            });
          });
        }
      });

      const frame = CEMIFrame.create(CEMIMessageCode.L_DATA_IND, 0x1234, 0x0401, Buffer.from([0x00, 0x80]));
      await t.send(frame);
      await t.send(frame);
      await t.send(frame);

      expect(sentSequences).toEqual([0, 1, 2]);
      await t.close();
    });
  });

  describe('incoming TUNNELLING_ACK', () => {
    test('should resolve send() promise when ACK with E_NO_ERROR is received', async () => {
      const t = new KNXNetTunnelingImpl('10.0.0.1', 3671);
      await openConnected(t, mockSocket);

      mockSocket.send = jest.fn((buf: Buffer, _port: number, _addr: string, cb?: (err: Error | null) => void) => {
        if (cb) cb(null);
        const service = buf.readUInt16BE(2);
        if (service === KNX_CONSTANTS.SERVICE_TYPES.TUNNELLING_REQUEST) {
          const seq = buf[6 + 2]!;
          setImmediate(() => {
            mockSocket.emit('message', buildTunnelingAck(1, seq, 0x00), {
              address: '10.0.0.1', port: 3671,
            });
          });
        }
      });

      const frame = CEMIFrame.create(CEMIMessageCode.L_DATA_IND, 0x1234, 0x0401, Buffer.from([0x00, 0x80]));
      let resolved = false;
      await t.send(frame);
      resolved = true;

      expect(resolved).toBe(true);
      await t.close();
    });
  });

  describe('CONNECTIONSTATE_REQUEST handling', () => {
    test('should respond to a CONNECTIONSTATE_REQUEST with a CONNECTIONSTATE_RESPONSE', async () => {
      const t = new KNXNetTunnelingImpl('10.0.0.1', 3671);
      await openConnected(t, mockSocket);

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
      await t.close();
    });
  });

  describe('incoming sequence processing', () => {
    test('should process sequential frames correctly (seq 0, 1, 2)', async () => {
      const t = new KNXNetTunnelingImpl('10.0.0.1', 3671);
      await openConnected(t, mockSocket);

      const received: number[] = [];
      t.on('recv', (f) => received.push(f.messageCode));

      mockSocket.emit('message', buildTunnelingRequest(1, 0, cemiBuffer), { address: '10.0.0.1', port: 3671 });
      mockSocket.emit('message', buildTunnelingRequest(1, 1, cemiBuffer), { address: '10.0.0.1', port: 3671 });
      mockSocket.emit('message', buildTunnelingRequest(1, 2, cemiBuffer), { address: '10.0.0.1', port: 3671 });

      expect(received).toHaveLength(3);
      await t.close();
    });
  });

  describe('close()', () => {
    test('should send DISCONNECT_REQUEST and clean up socket', async () => {
      const t = new KNXNetTunnelingImpl('10.0.0.1', 3671);
      await openConnected(t, mockSocket);

      const sentServiceTypes: number[] = [];
      mockSocket.send = jest.fn((buf: Buffer, _port: number, _addr: string, cb?: (err: Error | null) => void) => {
        sentServiceTypes.push(buf.readUInt16BE(2));
        if (cb) cb(null);
      });

      await t.close();

      expect(sentServiceTypes).toContain(KNX_CONSTANTS.SERVICE_TYPES.DISCONNECT_REQUEST);
      expect(mockSocket.close).toHaveBeenCalled();
    });
  });
});
