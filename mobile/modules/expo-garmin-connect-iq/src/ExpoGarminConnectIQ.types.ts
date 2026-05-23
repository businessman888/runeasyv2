export type GarminDeviceStatus = 'connected' | 'not_connected' | 'not_paired';

export interface GarminDevice {
    /** Identificador estável (UUID iOS / Long.toString Android). */
    id: string;
    /** Modelo do relógio — ex.: "fēnix 7 Pro". */
    name: string;
    status: GarminDeviceStatus;
}

export interface GarminIncomingMessage {
    deviceId: string;
    /** Tipo lógico — definido pelo app no relógio. Ex.: 'WORKOUT_COMPLETE', 'HANDSHAKE_ACK'. */
    type: string;
    payload: unknown;
}

export interface DeviceStatusChangeEvent {
    device: GarminDevice;
}

export interface MessageEvent {
    message: GarminIncomingMessage;
}

export type GarminEventName = 'onMessage' | 'onDeviceStatusChange';
