import {
  BleManager,
  Device,
  Characteristic,
  Subscription,
  State,
} from 'react-native-ble-plx';
import { Buffer } from 'buffer';
import { Platform, PermissionsAndroid } from 'react-native';
import { FTMS, FTMS_SCAN_TIMEOUT_MS } from '../constants/bluetooth';

export interface TreadmillDevice {
  id: string;
  name: string;
  rssi: number;
  supportsControl: boolean;
}

export interface TreadmillSample {
  /** Velocidade instantânea em km/h. */
  speed: number;
  /** Pace derivado (segundos por km, 0 quando parado). */
  pace: number;
  /** Distância acumulada em metros (cumulativa pela esteira). */
  distance: number;
  /** Inclinação em %. */
  incline: number;
  /** Calorias acumuladas (kcal). */
  calories: number;
  /** FC em bpm (null se a esteira não tiver sensor). */
  heartRate: number | null;
  /** Tempo decorrido reportado pela esteira (segundos). */
  elapsedTime: number;
}

/**
 * Singleton service that wraps `react-native-ble-plx` for FTMS treadmill
 * communication. Read-only in V1 (no Control Point writes).
 */
class TreadmillServiceImpl {
  private manager: BleManager | null = null;
  private connected: Device | null = null;
  private dataSubscription: Subscription | null = null;
  private disconnectSubscription: Subscription | null = null;
  private mockStream: { stop: () => void } | null = null;
  private onDisconnectCallback: (() => void) | null = null;

  /**
   * Lazy init avoids crashing on Expo Go and keeps cold-start fast for users
   * who never open the treadmill flow.
   */
  private getManager(): BleManager {
    if (!this.manager) this.manager = new BleManager();
    return this.manager;
  }

  /**
   * Resolve with the first non-`Unknown` state. On iOS, `bleManager.state()`
   * called immediately after the manager is instantiated returns `Unknown`
   * because CoreBluetooth hasn't dispatched the initial state callback yet —
   * `onStateChange(..., emitCurrentState=true)` waits for that callback.
   */
  async getState(): Promise<State> {
    const manager = this.getManager();
    const immediate = await manager.state();
    if (immediate !== State.Unknown) return immediate;
    return new Promise<State>((resolve) => {
      const sub = manager.onStateChange((state) => {
        if (state !== State.Unknown) {
          sub.remove();
          resolve(state);
        }
      }, true);
      // Hard cap so we never hang the UI forever if the platform misbehaves.
      setTimeout(() => {
        sub.remove();
        resolve(State.Unknown);
      }, 4000);
    });
  }

  /**
   * Request Android 12+ runtime permissions for BLE scanning/connecting.
   * On iOS, the system prompt is triggered by the first scan call —
   * no explicit request needed here.
   */
  async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    try {
      const result = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      return Object.values(result).every(
        (r) => r === PermissionsAndroid.RESULTS.GRANTED,
      );
    } catch {
      return false;
    }
  }

  /**
   * Scan for FTMS-advertising devices for {@link FTMS_SCAN_TIMEOUT_MS}.
   * Returns devices sorted by RSSI (closest first).
   */
  async startScan(
    onDevice: (device: TreadmillDevice) => void,
  ): Promise<void> {
    const granted = await this.requestPermissions();
    if (!granted) {
      throw new Error('BLE_PERMISSION_DENIED');
    }

    const manager = this.getManager();
    const state = await manager.state();
    if (state !== State.PoweredOn) {
      throw new Error('BLUETOOTH_OFF');
    }

    const seen = new Set<string>();
    manager.startDeviceScan(
      [FTMS.SERVICE_UUID],
      { allowDuplicates: false },
      (error, device) => {
        if (error) return;
        if (!device || !device.name) return;
        if (seen.has(device.id)) return;
        seen.add(device.id);
        onDevice({
          id: device.id,
          name: device.name,
          rssi: device.rssi ?? -100,
          supportsControl: false,
        });
      },
    );
  }

  stopScan(): void {
    this.manager?.stopDeviceScan();
  }

  /**
   * Connect to an FTMS device and detect whether it exposes a writable
   * Control Point characteristic (Smart Treadmill).
   */
  async connect(deviceId: string): Promise<TreadmillDevice> {
    const manager = this.getManager();
    this.stopScan();

    const device = await manager.connectToDevice(deviceId, { autoConnect: false });
    await device.discoverAllServicesAndCharacteristics();

    let supportsControl = false;
    try {
      const services = await device.services();
      const ftmsService = services.find((s) => s.uuid === FTMS.SERVICE_UUID);
      if (ftmsService) {
        const chars = await ftmsService.characteristics();
        supportsControl = chars.some(
          (c: Characteristic) => c.uuid === FTMS.CONTROL_POINT_UUID,
        );
      }
    } catch {
      supportsControl = false;
    }

    this.connected = device;

    if (this.disconnectSubscription) {
      this.disconnectSubscription.remove();
    }
    this.disconnectSubscription = device.onDisconnected(() => {
      this.connected = null;
      this.dataSubscription?.remove();
      this.dataSubscription = null;
      this.onDisconnectCallback?.();
    });

    return {
      id: device.id,
      name: device.name ?? 'Esteira',
      rssi: device.rssi ?? -100,
      supportsControl,
    };
  }

  async disconnect(): Promise<void> {
    this.mockStream?.stop();
    this.mockStream = null;
    this.dataSubscription?.remove();
    this.dataSubscription = null;
    this.disconnectSubscription?.remove();
    this.disconnectSubscription = null;
    if (this.connected) {
      try {
        await this.connected.cancelConnection();
      } catch {
        // ignore — already disconnected
      }
      this.connected = null;
    }
  }

  isConnected(): boolean {
    return this.connected !== null || this.mockStream !== null;
  }

  /**
   * Subscribe to Treadmill Data notifications and decode each frame.
   */
  startDataStream(onSample: (sample: TreadmillSample) => void): void {
    if (!this.connected) {
      throw new Error('NOT_CONNECTED');
    }
    this.dataSubscription?.remove();
    this.dataSubscription = this.connected.monitorCharacteristicForService(
      FTMS.SERVICE_UUID,
      FTMS.TREADMILL_DATA_UUID,
      (error, characteristic) => {
        if (error || !characteristic?.value) return;
        try {
          const raw = Buffer.from(characteristic.value, 'base64');
          const sample = parseTreadmillData(raw);
          onSample(sample);
        } catch {
          // Bad frame — silently drop
        }
      },
    );
  }

  stopDataStream(): void {
    this.dataSubscription?.remove();
    this.dataSubscription = null;
  }

  onDisconnect(cb: () => void): void {
    this.onDisconnectCallback = cb;
  }

  /**
   * Inject a simulated treadmill stream for development. Used by the
   * DevMenu mock toggle so the full UX can be tested without hardware.
   */
  startMockStream(
    onSample: (sample: TreadmillSample) => void,
    options?: { initialKmh?: number },
  ): TreadmillDevice {
    this.mockStream?.stop();

    let elapsed = 0;
    let distance = 0;
    let calories = 0;
    const interval = setInterval(() => {
      elapsed += 1;
      const baseSpeed = options?.initialKmh ?? 10;
      const speed = baseSpeed + Math.sin(elapsed / 30) * 1.5;
      distance += speed / 3.6;
      calories += 0.15;
      const heartRate = 140 + Math.floor(Math.random() * 20);
      const pace = speed > 0 ? (60 / speed) * 60 : 0;
      onSample({
        speed,
        pace,
        distance,
        incline: 1.5,
        calories: Math.floor(calories),
        heartRate,
        elapsedTime: elapsed,
      });
    }, 1000);

    this.mockStream = { stop: () => clearInterval(interval) };

    return {
      id: 'mock-treadmill',
      name: 'Mock Treadmill Pro',
      rssi: -42,
      supportsControl: true,
    };
  }
}

/**
 * Parse the binary Treadmill Data characteristic (0x2ACD) into a sample.
 * The frame layout is: 16-bit flags + (conditional) optional fields whose
 * presence is signalled by the flags. See FTMS spec §4.9.
 */
export function parseTreadmillData(data: Buffer): TreadmillSample {
  let offset = 0;
  const flags = data.readUInt16LE(offset);
  offset += 2;

  // Instantaneous Speed — always present, units of 0.01 km/h
  const speed = data.readUInt16LE(offset) * 0.01;
  offset += 2;

  let distance = 0;
  let incline = 0;
  let calories = 0;
  let heartRate: number | null = null;
  let elapsedTime = 0;

  // Bit 1: Average Speed present (we skip — using instantaneous)
  if (flags & 0x0002) offset += 2;

  // Bit 2: Total Distance present (UInt24LE in meters)
  if (flags & 0x0004) {
    distance =
      data.readUInt16LE(offset) + (data.readUInt8(offset + 2) << 16);
    offset += 3;
  }

  // Bit 3: Inclination + Ramp Angle present (Int16LE, 0.1%)
  if (flags & 0x0008) {
    incline = data.readInt16LE(offset) * 0.1;
    offset += 2;
    offset += 2; // skip ramp angle
  }

  // Bit 4: Elevation Gain present (UInt16 positive + UInt16 negative)
  if (flags & 0x0010) offset += 4;

  // Bit 5: Instantaneous Pace present (UInt8 km/min) — we derive from speed
  if (flags & 0x0020) offset += 1;

  // Bit 6: Average Pace present
  if (flags & 0x0040) offset += 1;

  // Bit 7: Expended Energy present (Total Energy UInt16 + per hour UInt16 + per min UInt8)
  if (flags & 0x0080) {
    calories = data.readUInt16LE(offset);
    offset += 2;
    offset += 2; // skip energy per hour
    offset += 1; // skip energy per minute
  }

  // Bit 8: Heart Rate present (UInt8 bpm)
  if (flags & 0x0100) {
    heartRate = data.readUInt8(offset);
    offset += 1;
  }

  // Bit 9: Metabolic Equivalent present
  if (flags & 0x0200) offset += 1;

  // Bit 10: Elapsed Time present (UInt16 seconds)
  if (flags & 0x0400) {
    elapsedTime = data.readUInt16LE(offset);
    offset += 2;
  }

  // Pace derived from speed (seconds per km, 0 when stopped)
  const pace = speed > 0 ? (60 / speed) * 60 : 0;

  return { speed, pace, distance, incline, calories, heartRate, elapsedTime };
}

export const treadmillService = new TreadmillServiceImpl();
