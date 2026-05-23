import { NativeModule, requireNativeModule } from 'expo';

import type {
    GarminDevice,
    GarminDeviceStatus,
    GarminEventName,
    DeviceStatusChangeEvent,
    MessageEvent,
} from './ExpoGarminConnectIQ.types';

declare class ExpoGarminConnectIQModule extends NativeModule<{
    onMessage: (event: MessageEvent) => void;
    onDeviceStatusChange: (event: DeviceStatusChangeEvent) => void;
}> {
    // Lifecycle
    initialize(appUuid: string, storeUuid: string | null): Promise<void>;
    shutdown(): Promise<void>;

    // Discovery
    isGarminConnectInstalled(): Promise<boolean>;
    openGarminConnectStore(): Promise<void>;
    getKnownDevices(): Promise<GarminDevice[]>;
    getDeviceStatus(deviceId: string): Promise<GarminDeviceStatus>;

    // App on watch
    isAppInstalledOnDevice(deviceId: string): Promise<boolean>;
    openAppStoreOnDevice(deviceId: string): Promise<void>;

    // Messaging
    sendMessage(deviceId: string, payload: object): Promise<void>;
}

// JS-side fallback for env without the native module (Expo Go, web, simulator without SDK).
const NO_NATIVE_MSG =
    '[ExpoGarminConnectIQ] Native module not available. Run `npx expo prebuild` and ' +
    'rebuild a development build with the Garmin SDK installed in mobile/modules/expo-garmin-connect-iq/';

function makeStub(): ExpoGarminConnectIQModule {
    const stub: Partial<ExpoGarminConnectIQModule> = {
        initialize: async () => {
            console.warn(NO_NATIVE_MSG);
        },
        shutdown: async () => {},
        isGarminConnectInstalled: async () => false,
        openGarminConnectStore: async () => {
            console.warn(NO_NATIVE_MSG);
        },
        getKnownDevices: async () => [],
        getDeviceStatus: async () => 'not_paired' as GarminDeviceStatus,
        isAppInstalledOnDevice: async () => false,
        openAppStoreOnDevice: async () => {
            console.warn(NO_NATIVE_MSG);
        },
        sendMessage: async () => {
            console.warn(NO_NATIVE_MSG);
        },
        addListener: () => ({ remove: () => {} }) as unknown as { remove: () => void },
        removeAllListeners: () => {},
    };
    return stub as unknown as ExpoGarminConnectIQModule;
}

let mod: ExpoGarminConnectIQModule;
try {
    mod = requireNativeModule<ExpoGarminConnectIQModule>('ExpoGarminConnectIQ');
} catch {
    mod = makeStub();
}

export default mod;
export type { GarminEventName };
