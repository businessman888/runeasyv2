/**
 * Minimal ambient typings for `react-native-ble-plx`.
 *
 * This file unblocks the TypeScript checker before the package is actually
 * installed via `npm install` in the next CI / dev iteration. Once the
 * package is on disk, the upstream `.d.ts` shipped with the library will
 * be picked up automatically and supersede these stubs (it lives under
 * `node_modules/react-native-ble-plx/lib/typescript/`).
 *
 * Only the surface area we use in `services/treadmillService.ts` is
 * declared here. Do NOT add unrelated members — the official typings are
 * already accurate; this file should disappear in practice.
 */

declare module 'react-native-ble-plx' {
  export enum State {
    Unknown = 'Unknown',
    Resetting = 'Resetting',
    Unsupported = 'Unsupported',
    Unauthorized = 'Unauthorized',
    PoweredOff = 'PoweredOff',
    PoweredOn = 'PoweredOn',
  }

  export interface Subscription {
    remove(): void;
  }

  export interface Characteristic {
    uuid: string;
    value?: string | null;
  }

  export interface Service {
    uuid: string;
    characteristics(): Promise<Characteristic[]>;
  }

  export interface Device {
    id: string;
    name?: string | null;
    rssi?: number | null;
    discoverAllServicesAndCharacteristics(): Promise<Device>;
    services(): Promise<Service[]>;
    cancelConnection(): Promise<Device>;
    onDisconnected(cb: (error: any, device: Device) => void): Subscription;
    monitorCharacteristicForService(
      serviceUUID: string,
      characteristicUUID: string,
      listener: (error: any, characteristic: Characteristic | null) => void,
    ): Subscription;
  }

  export interface ScanOptions {
    allowDuplicates?: boolean;
  }

  export interface ConnectionOptions {
    autoConnect?: boolean;
  }

  export class BleManager {
    constructor();
    state(): Promise<State>;
    onStateChange(
      listener: (state: State) => void,
      emitCurrentState?: boolean,
    ): Subscription;
    startDeviceScan(
      uuids: string[] | null,
      options: ScanOptions | null,
      listener: (error: any, device: Device | null) => void,
    ): void;
    stopDeviceScan(): void;
    connectToDevice(deviceId: string, options?: ConnectionOptions): Promise<Device>;
  }
}
