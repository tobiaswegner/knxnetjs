import { EventEmitter } from "events";
import * as HID from "node-hid";
import { KNXBusInterface, KNXUSBOptions } from "../types";
import { CEMIFrame, KNXUSBTransferFrame, CEMIMessageCode } from "../frames";
import { KNXHIDReport } from "../frames/knx-hid-report";
import { KNXUSBTransferEMIId } from "../frames/knx-usb-transfer";
import {
  CEMIPropertyWrite,
  CEMIPropertyReadReq,
  CEMIPropertyReadCon,
  DPT_CommMode,
  Properties,
} from "../frames/cemi-properties";

export class KNXUSBImpl extends EventEmitter implements KNXBusInterface {
  private hidDevice?: HID.HID;
  private isConnected = false;
  private readonly options: Required<KNXUSBOptions>;
  private buffer = Buffer.alloc(0);

  constructor(options: KNXUSBOptions = {}) {
    super();
    this.options = {
      devicePath: options.devicePath || "",
      baudRate: options.baudRate || 0, // Not used for HID
      autoConnect: options.autoConnect ?? true,
      busmonitorMode: options.busmonitorMode ?? false,
    };
  }

  async open(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    const device = this.findKNXDevice();
    if (!device) {
      throw new Error(
        "No USB KNX HID device found. Please connect a USB KNX interface and ensure proper drivers are installed."
      );
    }

    try {
      this.hidDevice = new HID.HID(device.path!);

      this.hidDevice.on("data", (data: Buffer) => {
        this.handleIncomingData(data);
      });

      this.hidDevice.on("error", (error: Error) => {
        this.emit("error", error);
      });

      // Initialize the device
      await this.initializeDevice();

      this.isConnected = true;
    } catch (error) {
      throw new Error(
        `Failed to open USB KNX HID device: ${(error as Error).message}`
      );
    }
  }

  async send(frame: CEMIFrame): Promise<void> {
    if (!this.isConnected || !this.hidDevice) {
      throw new Error("USB KNX device not connected");
    }

    if (this.options.busmonitorMode) {
      throw new Error(
        "Cannot send frames in busmonitor mode - this is a monitor-only connection"
      );
    }

    const hidFrame = this.createHIDFrame(frame.toBuffer());

    return new Promise((resolve, reject) => {
      try {
        this.hidDevice!.write(hidFrame);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  async close(): Promise<void> {
    if (this.hidDevice && this.isConnected) {
      try {
        this.hidDevice.close();
      } catch (error) {
        this.emit("error", error);
      }
      this.isConnected = false;
    }
  }

  async writeProperty(
    interfaceObject: number,
    objectInstance: number,
    propertyId: number,
    numberOfElements: number,
    startIndex: number,
    data: Buffer
  ): Promise<void> {
    if (!this.isConnected || !this.hidDevice) {
      throw new Error("USB KNX device not connected");
    }

    const propertyWrite = new CEMIPropertyWrite(
      interfaceObject,
      objectInstance,
      propertyId,
      numberOfElements,
      startIndex,
      data
    );

    const usbFrame = KNXUSBTransferFrame.createForCEMI(propertyWrite.toBuffer());
    const hidFrame = this.createHIDFrame(usbFrame.toBuffer());

    return new Promise((resolve, reject) => {
      try {
        this.hidDevice!.write(hidFrame);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  async readProperty(
    interfaceObject: number,
    objectInstance: number,
    propertyId: number,
    numberOfElements: number,
    startIndex: number
  ): Promise<Buffer> {
    if (!this.isConnected || !this.hidDevice) {
      throw new Error("USB KNX device not connected");
    }

    const propertyRead = new CEMIPropertyReadReq(
      interfaceObject,
      objectInstance,
      propertyId,
      numberOfElements,
      startIndex
    );

    const usbFrame = KNXUSBTransferFrame.createForCEMI(propertyRead.toBuffer());
    const hidFrame = this.createHIDFrame(usbFrame.toBuffer());

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Property read timeout"));
      }, 5000);

      // Set up one-time response listener for property read confirmation
      const responseHandler = (frame: CEMIFrame) => {
        if (frame.messageCode === CEMIMessageCode.M_PROP_READ_CON) {
          clearTimeout(timeout);
          this.off("recv", responseHandler);
          // Return the frame data which contains the property value
          resolve(frame.data);
        }
      };

      this.on("recv", responseHandler);

      try {
        this.hidDevice!.write(hidFrame);
      } catch (error) {
        clearTimeout(timeout);
        this.off("recv", responseHandler);
        reject(error);
      }
    });
  }

  /**
   * Check if this connection is in busmonitor mode
   */
  isBusmonitorMode(): boolean {
    return this.options.busmonitorMode;
  }

  /**
   * Get available KNX USB devices
   */
  static getAvailableDevices(): HID.Device[] {
    const devices = HID.devices();

    // Filter for known KNX USB interface vendor/product IDs
    return devices.filter((device: HID.Device) => {
      // Common KNX USB interface vendors
      const knownVendors = [
        0x147b, // Weinzierl Engineering (KNX USB interface)
        0x16d0, // MCS Electronics (various KNX interfaces)
        0x0e77, // Siemens (some KNX products)
        0x0403, // FTDI (used by some KNX manufacturers)
      ];

      // Known product IDs for KNX interfaces
      const knownProducts = [
        0x0001, // Weinzierl KNX USB Interface
        0x0002, // Weinzierl KNX USB Interface 810
        0x6001, // FTDI-based interfaces
      ];

      return (
        knownVendors.includes(device.vendorId || 0) ||
        knownProducts.includes(device.productId || 0) ||
        (device.product && device.product.toLowerCase().includes("knx"))
      );
    });
  }

  on(event: "recv", listener: (frame: CEMIFrame) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: "close", listener: () => void): this;
  on(event: "reset", listener: () => void): this;
  on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  private findKNXDevice(): HID.Device | null {
    if (this.options.devicePath) {
      // If specific path provided, try to use it
      const devices = HID.devices();
      const device = devices.find(
        (d: HID.Device) => d.path === this.options.devicePath
      );
      return device || null;
    }

    // Auto-detect KNX devices
    const knxDevices = KNXUSBImpl.getAvailableDevices();

    if (knxDevices.length === 0) {
      return null;
    }

    // Return the first available KNX device
    return knxDevices[0] || null;
  }

  private async initializeDevice(): Promise<void> {
    if (!this.hidDevice) {
      throw new Error("HID device not available");
    }

    // Send initialization command to the USB interface
    // This varies by manufacturer but typically involves:
    // 1. Reset command
    // 2. Set mode (normal vs busmonitor)
    const initCommands: KNXUSBTransferFrame[] = [];

    // Create reset command using M_RESET_REQ message code
    initCommands.push(
      KNXUSBTransferFrame.createForCEMI(
        Buffer.from([CEMIMessageCode.M_RESET_REQ])
      )
    );

    // Set active emi service
    initCommands.push(
      KNXUSBTransferFrame.createForBusAccess(
        0x03, // service device feature set
        0x05, // feature active emi type
        Buffer.from([KNXUSBTransferEMIId.cEMI])
      )
    );

    initCommands.push(
      KNXUSBTransferFrame.createForCEMI(
        new CEMIPropertyWrite(
          0x0008,
          1,
          Properties.PID_COMM_MODE,
          1,
          1,
          Buffer.from([
            this.options.busmonitorMode
              ? DPT_CommMode.DataLinkLayerBusmonitor
              : DPT_CommMode.DataLinkLayer,
          ])
        ).toBuffer()
      )
    );

    // Send initialization commands with delays
    for (const frame of initCommands) {
      try {
        // Wrap USB Transfer Frame in HID Report
        const hidReport = new KNXHIDReport(frame.toBuffer());
        this.hidDevice.write(hidReport.toBuffer());

        // Wait between commands to allow device processing
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        throw new Error(
          `Failed to initialize USB device: ${(error as Error).message}`
        );
      }
    }
  }

  private handleIncomingData(data: Buffer): void {
    const reportId = data[0];

    // check if report id is 1
    if (reportId === 0x01) {
      const packetType = data[1]!;
      const dataLength = data[2]!;

      if (packetType & 0x01) {
        // start of packet, start with new buffer
        this.buffer = Buffer.from(data, 0, dataLength);
      } else {
        // Append new data to buffer
        this.buffer = Buffer.concat([
          this.buffer,
          data.subarray(0, dataLength),
        ]);
      }

      if (packetType & 0x02) {
        // Process complete frames from buffer
        this.processBuffer();
      }
    }
  }

  private processBuffer(): void {
    if (this.buffer.length > 3) {
      const dataLength = this.buffer[2]!;
      const frame = this.buffer.subarray(3, 3 + dataLength);

      if (!frame) {
        return; // Not enough data for a complete frame
      }

      try {
        this.handleFrame(frame);
      } catch (error) {
        this.emit(
          "error",
          new Error(`Frame processing error: ${(error as Error).message}`)
        );
      }
    }
  }

  private handleFrame(hidFrame: Buffer): void {
    try {
      const frame = KNXUSBTransferFrame.fromBuffer(hidFrame);

      switch (frame.body.emiMessageCode) {
        case CEMIMessageCode.L_DATA_IND:
          const cemiFrame = CEMIFrame.fromBuffer(
            Buffer.concat([
              Buffer.from([frame.body.emiMessageCode]),
              frame.body.data,
            ])
          );
          if (cemiFrame.isValid()) {
            this.emit("recv", cemiFrame);
          }
          break;
        case CEMIMessageCode.L_BUSMON_IND:
          const busmonFrame = CEMIFrame.fromBuffer(
            Buffer.concat([
              Buffer.from([frame.body.emiMessageCode]),
              frame.body.data,
            ])
          );
          if (busmonFrame.isValid()) {
            this.emit("recv", busmonFrame);
          }
          break;
        case CEMIMessageCode.M_RESET_IND:
          this.emit("reset");
          break;
        default:
          break;
      }
    } catch (error) {
      this.emit(
        "error",
        new Error(`Frame conversion error: ${(error as Error).message}`)
      );
    }
  }

  private convertHIDToCEMI(hidFrame: Buffer): Buffer | null {
    // Convert USB HID frame to standard cEMI frame using KNX USB Transfer Protocol
    // Skip HID report header (first 2 bytes: report ID and packet length)
    if (hidFrame.length < 2) {
      return null;
    }

    const packetLength = hidFrame[1];
    if (
      !packetLength ||
      packetLength === 0 ||
      hidFrame.length < packetLength + 2
    ) {
      return null;
    }

    // Extract KNX USB Transfer Protocol frame (skip HID header)
    const transferProtocolData = hidFrame.subarray(2, packetLength + 2);

    try {
      if (!KNXUSBTransferFrame.isValid(transferProtocolData)) {
        return null; // Not a valid KNX USB Transfer Protocol frame
      }

      const transferFrame =
        KNXUSBTransferFrame.fromBuffer(transferProtocolData);
      return transferFrame.getCEMIData();
    } catch (error) {
      return null; // Invalid frame
    }
  }

  private createHIDFrame(cemiData: Buffer): Buffer {
    // Create KNX USB Transfer Protocol frame for cEMI data
    const transferFrame = KNXUSBTransferFrame.createForCEMI(cemiData);

    return new KNXHIDReport(transferFrame.toBuffer()).toBuffer();
  }

  private padHIDFrame(frame: Buffer): Buffer {
    // Many HID devices expect fixed-size reports (typically 64 bytes)
    const reportSize = 64;

    if (frame.length >= reportSize) {
      return frame;
    }

    const paddedFrame = Buffer.alloc(reportSize);
    frame.copy(paddedFrame);

    return paddedFrame;
  }
}
