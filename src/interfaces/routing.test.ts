import { EventEmitter } from 'events';
import { KNXNetRoutingImpl } from './routing';
import { KNX_CONSTANTS } from '../constants';
import { CEMIFrame, CEMIMessageCode } from '../frames';

// ---------------------------------------------------------------------------
// Mock dgram
// ---------------------------------------------------------------------------
jest.mock('dgram');
import { createSocket } from 'dgram';
const mockCreateSocket = createSocket as jest.MockedFunction<typeof createSocket>;

function makeMockSocket() {
  const emitter = new EventEmitter() as any;
  emitter.bind = jest.fn((_port: number, cb?: () => void) => {
    if (cb) setImmediate(() => cb());
  });
  emitter.addMembership = jest.fn();
  emitter.setMulticastTTL = jest.fn();
  emitter.dropMembership = jest.fn();
  emitter.close = jest.fn();
  emitter.send = jest.fn(
    (_buf: Buffer, _port: number, _addr: string, cb?: (err: Error | null) => void) => {
      if (cb) setImmediate(() => cb(null));
    }
  );
  emitter.removeAllListeners = jest.fn(() => {
    EventEmitter.prototype.removeAllListeners.call(emitter);
    return emitter;
  });
  return emitter;
}

// ---------------------------------------------------------------------------
// Helpers: build KNXnetIPFrame buffers for various routing message types
// ---------------------------------------------------------------------------

function buildKNXnetIPFrame(serviceType: number, payload: Buffer): Buffer {
  const totalLength = 6 + payload.length;
  const buf = Buffer.alloc(totalLength);
  buf[0] = 0x06; // header size
  buf[1] = 0x10; // version
  buf.writeUInt16BE(serviceType, 2);
  buf.writeUInt16BE(totalLength, 4);
  payload.copy(buf, 6);
  return buf;
}

// A minimal cEMI L_DATA_IND with hopCount=6 (ctrl2=0x60 so routingCounter != 0)
const cemiBuffer = Buffer.from([
  0x29, 0x00, 0xBC, 0x60, 0xD0, 0x11, 0x04, 0x01, 0x02, 0x00, 0x81,
]);

function buildRoutingIndication(cemi: Buffer = cemiBuffer): Buffer {
  return buildKNXnetIPFrame(KNX_CONSTANTS.SERVICE_TYPES.ROUTING_INDICATION, cemi);
}

function buildRoutingLostMessage(deviceState: number, lostMessages: number): Buffer {
  // payload: [structLen, deviceState, lostHi, lostLo]
  const payload = Buffer.from([0x04, deviceState, (lostMessages >> 8) & 0xff, lostMessages & 0xff]);
  return buildKNXnetIPFrame(KNX_CONSTANTS.SERVICE_TYPES.ROUTING_LOST_MESSAGE, payload);
}

function buildRoutingBusy(deviceState: number, waitTime: number, controlField: number): Buffer {
  // payload: [structLen, deviceState, waitHi, waitLo, ctrlHi, ctrlLo]
  const payload = Buffer.alloc(6);
  payload[0] = 0x06;
  payload[1] = deviceState;
  payload.writeUInt16BE(waitTime, 2);
  payload.writeUInt16BE(controlField, 4);
  return buildKNXnetIPFrame(KNX_CONSTANTS.SERVICE_TYPES.ROUTING_BUSY, payload);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('KNXNetRoutingImpl', () => {
  let mockSocket: ReturnType<typeof makeMockSocket>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSocket = makeMockSocket();
    mockCreateSocket.mockReturnValue(mockSocket);
  });

  describe('constructor', () => {
    test('should use default multicast address and port when none provided', () => {
      // Constructor should not throw
      const routing = new KNXNetRoutingImpl();
      expect(routing).toBeDefined();
    });

    test('should accept custom multicast address and port', () => {
      const routing = new KNXNetRoutingImpl('239.0.0.1', 4000);
      expect(routing).toBeDefined();
    });
  });

  describe('send() before open()', () => {
    test('should throw "Not connected" when called before open()', async () => {
      const routing = new KNXNetRoutingImpl();
      const frame = CEMIFrame.create(
        CEMIMessageCode.L_DATA_REQ,
        0x1234, 0x5678, Buffer.from([0x00, 0x80])
      );
      await expect(routing.send(frame)).rejects.toThrow('Not connected');
    });
  });

  describe('writeProperty() and readProperty()', () => {
    test('writeProperty should throw "not implemented" error', async () => {
      const routing = new KNXNetRoutingImpl();
      await expect(
        routing.writeProperty(0, 1, 1, 1, 1, Buffer.alloc(1))
      ).rejects.toThrow('not implemented for KNX routing connections');
    });

    test('readProperty should throw "not implemented" error', async () => {
      const routing = new KNXNetRoutingImpl();
      await expect(
        routing.readProperty(0, 1, 1, 1, 1)
      ).rejects.toThrow('not implemented for KNX routing connections');
    });
  });

  describe('open()', () => {
    test('should bind to the configured port', async () => {
      const routing = new KNXNetRoutingImpl();
      await routing.open();
      expect(mockSocket.bind).toHaveBeenCalledWith(
        KNX_CONSTANTS.DEFAULT_PORT,
        expect.any(Function)
      );
    });

    test('should join multicast group', async () => {
      const routing = new KNXNetRoutingImpl();
      await routing.open();
      expect(mockSocket.addMembership).toHaveBeenCalledWith(
        KNX_CONSTANTS.DEFAULT_MULTICAST_ADDRESS
      );
    });

    test('should set multicast TTL', async () => {
      const routing = new KNXNetRoutingImpl();
      await routing.open();
      expect(mockSocket.setMulticastTTL).toHaveBeenCalled();
    });

    test('should be idempotent (second open() is a no-op)', async () => {
      const routing = new KNXNetRoutingImpl();
      await routing.open();
      await routing.open();
      expect(mockSocket.bind).toHaveBeenCalledTimes(1);
    });
  });

  describe('send()', () => {
    test('should send a ROUTING_INDICATION frame to the multicast address', async () => {
      const routing = new KNXNetRoutingImpl();
      await routing.open();

      const frame = CEMIFrame.create(
        CEMIMessageCode.L_DATA_IND, 0x1234, 0x0401, Buffer.from([0x00, 0x80])
      );
      await routing.send(frame);

      expect(mockSocket.send).toHaveBeenCalled();
      const [sentBuf, sentPort, sentAddr] = mockSocket.send.mock.calls.at(-1)!;
      expect(sentPort).toBe(KNX_CONSTANTS.DEFAULT_PORT);
      expect(sentAddr).toBe(KNX_CONSTANTS.DEFAULT_MULTICAST_ADDRESS);
      // The sent frame should be a ROUTING_INDICATION
      expect(sentBuf.readUInt16BE(2)).toBe(KNX_CONSTANTS.SERVICE_TYPES.ROUTING_INDICATION);
    });

    test('should propagate send errors', async () => {
      const routing = new KNXNetRoutingImpl();
      await routing.open();

      mockSocket.send.mockImplementation(
        (_buf: Buffer, _port: number, _addr: string, cb: (err: Error | null) => void) => {
          cb(new Error('Network failure'));
        }
      );

      const frame = CEMIFrame.create(
        CEMIMessageCode.L_DATA_IND, 0x1234, 0x0401, Buffer.from([0x00, 0x80])
      );
      await expect(routing.send(frame)).rejects.toThrow('Network failure');
    });
  });

  describe('close()', () => {
    test('should drop multicast membership and close socket', async () => {
      const routing = new KNXNetRoutingImpl();
      await routing.open();
      await routing.close();
      expect(mockSocket.dropMembership).toHaveBeenCalledWith(
        KNX_CONSTANTS.DEFAULT_MULTICAST_ADDRESS
      );
      expect(mockSocket.close).toHaveBeenCalled();
    });

    test('close() before open() should not throw', async () => {
      const routing = new KNXNetRoutingImpl();
      await expect(routing.close()).resolves.not.toThrow();
    });
  });

  describe('incoming ROUTING_INDICATION', () => {
    test('should emit "recv" event with the parsed cEMI frame', async () => {
      const routing = new KNXNetRoutingImpl();
      await routing.open();

      const receivedFrames: CEMIFrame[] = [];
      routing.on('recv', (f) => receivedFrames.push(f));

      const msg = buildRoutingIndication();
      mockSocket.emit('message', msg);

      expect(receivedFrames).toHaveLength(1);
      expect(receivedFrames[0]!.messageCode).toBe(CEMIMessageCode.L_DATA_IND);
    });

    test('should NOT emit "recv" when routingCounter is DONT_ROUTE (0)', async () => {
      const routing = new KNXNetRoutingImpl();
      await routing.open();

      const receivedFrames: CEMIFrame[] = [];
      routing.on('recv', (f) => receivedFrames.push(f));

      // hopCount=0 (ctrl2=0x00) => routingCounter = 0 = DONT_ROUTE
      const cemiDontRoute = Buffer.from([
        0x29, 0x00, 0xBC, 0x00, 0xD0, 0x11, 0x04, 0x01, 0x02, 0x00, 0x81,
      ]);
      const msg = buildRoutingIndication(cemiDontRoute);
      mockSocket.emit('message', msg);

      expect(receivedFrames).toHaveLength(0);
    });
  });

  describe('incoming ROUTING_LOST_MESSAGE', () => {
    test('should emit "lostMessage" event with correct fields', async () => {
      const routing = new KNXNetRoutingImpl();
      await routing.open();

      const events: any[] = [];
      routing.on('lostMessage' as any, (e: any) => events.push(e));

      const msg = buildRoutingLostMessage(0x00, 42);
      mockSocket.emit('message', msg);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ deviceState: 0x00, numberOfLostMessages: 42 });
    });
  });

  describe('incoming ROUTING_BUSY', () => {
    test('should emit "busy" event with correct fields', async () => {
      const routing = new KNXNetRoutingImpl();
      await routing.open();

      const events: any[] = [];
      routing.on('busy' as any, (e: any) => events.push(e));

      const msg = buildRoutingBusy(0x01, 50, 0x0000);
      mockSocket.emit('message', msg);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ waitTime: 50, controlField: 0, busyCounter: 1 });
    });

    test('should track busyCounter across multiple busy events', async () => {
      const routing = new KNXNetRoutingImpl();
      await routing.open();

      const counters: number[] = [];
      routing.on('busy' as any, (e: any) => counters.push(e.busyCounter));

      const msg = buildRoutingBusy(0x01, 50, 0x0000);
      mockSocket.emit('message', msg);
      mockSocket.emit('message', msg);
      mockSocket.emit('message', msg);

      expect(counters).toEqual([1, 2, 3]);
    });
  });

  describe('unknown service type', () => {
    test('should emit error event for unknown service type', async () => {
      const routing = new KNXNetRoutingImpl();
      await routing.open();

      const errors: Error[] = [];
      routing.on('error', (err) => errors.push(err));

      const unknownMsg = buildKNXnetIPFrame(0x9999, Buffer.from([0x01, 0x02]));
      mockSocket.emit('message', unknownMsg);

      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('Unknown service type');
    });
  });
});
