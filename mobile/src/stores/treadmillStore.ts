/**
 * Treadmill (esteira) BLE + manual state.
 *
 * Smart mode: connects to an FTMS treadmill, decodes Treadmill Data frames
 * and exposes the latest sample. Manual mode: user adjusts speed with a
 * slider and we compute distance × time client-side.
 *
 * This store is intentionally separate from `useTracking` — that hook owns
 * GPS / outdoor flow and must keep working untouched.
 */

import { create } from 'zustand';
import { Platform } from 'react-native';
import {
  treadmillService,
  TreadmillDevice,
  TreadmillSample,
} from '../services/treadmillService';
import { MANUAL_TREADMILL_SPEED } from '../constants/bluetooth';
import { useDevMenuStore } from './devMenuStore';

export type TreadmillMode = 'smart' | 'manual';

export type BluetoothState =
  | 'unknown'
  | 'unsupported'
  | 'unauthorized'
  | 'off'
  | 'on';

interface TreadmillState {
  // Scanning
  isScanning: boolean;
  scanError: string | null;
  foundDevices: TreadmillDevice[];

  // Connection
  isConnecting: boolean;
  isConnected: boolean;
  connectedDevice: TreadmillDevice | null;
  connectionError: string | null;
  /** true if the BLE link dropped during a session — UI shows a banner. */
  unexpectedDisconnect: boolean;

  // Live data
  currentSample: TreadmillSample | null;
  bluetoothState: BluetoothState;

  // Mode
  mode: TreadmillMode;
  manualSpeedKmh: number;

  // Actions
  refreshBluetoothState: () => Promise<void>;
  startScan: () => Promise<void>;
  stopScan: () => void;
  connectDevice: (device: TreadmillDevice) => Promise<boolean>;
  disconnect: () => Promise<void>;
  setMode: (mode: TreadmillMode) => void;
  setManualSpeed: (kmh: number) => void;
  bumpManualSpeed: (delta: number) => void;
  acknowledgeDisconnect: () => void;
  reset: () => void;
  /** Used by `useTreadmillTracking` to set the latest manual or FTMS sample. */
  _setSample: (sample: TreadmillSample | null) => void;
}

const initialState = {
  isScanning: false,
  scanError: null,
  foundDevices: [] as TreadmillDevice[],
  isConnecting: false,
  isConnected: false,
  connectedDevice: null,
  connectionError: null,
  unexpectedDisconnect: false,
  currentSample: null,
  bluetoothState: 'unknown' as BluetoothState,
  mode: 'manual' as TreadmillMode,
  manualSpeedKmh: MANUAL_TREADMILL_SPEED.DEFAULT,
};

const clampSpeed = (kmh: number): number =>
  Math.max(
    MANUAL_TREADMILL_SPEED.MIN,
    Math.min(MANUAL_TREADMILL_SPEED.MAX, Math.round(kmh * 10) / 10),
  );

export const useTreadmillStore = create<TreadmillState>((set, get) => ({
  ...initialState,

  refreshBluetoothState: async () => {
    if (Platform.OS === 'web') {
      set({ bluetoothState: 'unsupported' });
      return;
    }
    try {
      const state = await treadmillService.getState();
      switch (state) {
        case 'PoweredOn':
          set({ bluetoothState: 'on' });
          break;
        case 'PoweredOff':
          set({ bluetoothState: 'off' });
          break;
        case 'Unauthorized':
          set({ bluetoothState: 'unauthorized' });
          break;
        case 'Unsupported':
          set({ bluetoothState: 'unsupported' });
          break;
        default:
          set({ bluetoothState: 'unknown' });
      }
    } catch {
      set({ bluetoothState: 'unknown' });
    }
  },

  startScan: async () => {
    set({
      isScanning: true,
      scanError: null,
      foundDevices: [],
    });

    // Dev-only: mock FTMS device for testing without hardware.
    const mockEnabled = useDevMenuStore.getState().mockTreadmillEnabled;
    if (mockEnabled) {
      setTimeout(() => {
        set({
          foundDevices: [
            {
              id: 'mock-treadmill',
              name: 'Mock Treadmill Pro',
              rssi: -42,
              supportsControl: true,
            },
          ],
          isScanning: false,
        });
      }, 800);
      return;
    }

    try {
      await treadmillService.startScan((device) => {
        set((s) => {
          if (s.foundDevices.some((d) => d.id === device.id)) return s;
          const next = [...s.foundDevices, device].sort(
            (a, b) => b.rssi - a.rssi,
          );
          return { foundDevices: next };
        });
      });
      // Auto-stop after the scan timeout
      setTimeout(() => {
        if (get().isScanning) {
          treadmillService.stopScan();
          set({ isScanning: false });
        }
      }, 10_000);
    } catch (error: any) {
      const message: string = error?.message ?? 'SCAN_FAILED';
      set({
        isScanning: false,
        scanError: message,
        bluetoothState:
          message === 'BLUETOOTH_OFF'
            ? 'off'
            : message === 'BLE_PERMISSION_DENIED'
              ? 'unauthorized'
              : get().bluetoothState,
      });
    }
  },

  stopScan: () => {
    treadmillService.stopScan();
    set({ isScanning: false });
  },

  connectDevice: async (device) => {
    set({ isConnecting: true, connectionError: null });

    // Mock path — feed simulated FTMS samples into the store.
    if (device.id === 'mock-treadmill') {
      const connected = treadmillService.startMockStream((sample) => {
        useTreadmillStore.getState()._setSample(sample);
      });
      set({
        isConnecting: false,
        isConnected: true,
        connectedDevice: connected,
        mode: 'smart',
      });
      return true;
    }

    try {
      const connected = await treadmillService.connect(device.id);
      treadmillService.onDisconnect(() => {
        // BLE link dropped — fall back to manual mode so the user can keep
        // running. The Running screen banner reads `unexpectedDisconnect`
        // and surfaces the fallback explicitly so they're not confused by
        // metrics going stale.
        set({
          isConnected: false,
          connectedDevice: null,
          mode: 'manual',
          unexpectedDisconnect: true,
        });
      });
      treadmillService.startDataStream((sample) => {
        useTreadmillStore.getState()._setSample(sample);
      });
      set({
        isConnecting: false,
        isConnected: true,
        connectedDevice: connected,
        mode: 'smart',
        unexpectedDisconnect: false,
      });
      return true;
    } catch (error: any) {
      set({
        isConnecting: false,
        isConnected: false,
        connectedDevice: null,
        connectionError: error?.message ?? 'CONNECT_FAILED',
      });
      return false;
    }
  },

  disconnect: async () => {
    await treadmillService.disconnect();
    set({
      isConnected: false,
      connectedDevice: null,
      currentSample: null,
      mode: 'manual',
    });
  },

  setMode: (mode) => set({ mode }),

  setManualSpeed: (kmh) => set({ manualSpeedKmh: clampSpeed(kmh) }),

  bumpManualSpeed: (delta) =>
    set((s) => ({ manualSpeedKmh: clampSpeed(s.manualSpeedKmh + delta) })),

  acknowledgeDisconnect: () => set({ unexpectedDisconnect: false }),

  reset: () => {
    treadmillService.stopScan();
    treadmillService.stopDataStream();
    set({ ...initialState });
  },

  _setSample: (sample) => set({ currentSample: sample }),
}));
