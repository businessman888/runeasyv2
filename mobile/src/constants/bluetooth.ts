/**
 * Bluetooth FTMS (Fitness Machine Service) constants.
 *
 * FTMS is a Bluetooth SIG standard that lets fitness apps talk to gym
 * equipment in a vendor-neutral way. We use it to read live data from
 * treadmills (speed, distance, incline, calories, heart rate).
 *
 * V1: read-only (Treadmill Data char). V2 may add Control Point writes
 * to drive target speed/incline during interval workouts.
 *
 * Reference: https://www.bluetooth.com/specifications/specs/fitness-machine-service-1-0/
 */

export const FTMS = {
  /** Fitness Machine Service (16-bit: 0x1826). */
  SERVICE_UUID: '00001826-0000-1000-8000-00805f9b34fb',
  /** Treadmill Data characteristic (notify). */
  TREADMILL_DATA_UUID: '00002acd-0000-1000-8000-00805f9b34fb',
  /** Fitness Machine Control Point (write — V2 only). */
  CONTROL_POINT_UUID: '00002ad9-0000-1000-8000-00805f9b34fb',
  /** Fitness Machine Status (notify). */
  MACHINE_STATUS_UUID: '00002ada-0000-1000-8000-00805f9b34fb',
  /** Supported Speed Range (read). */
  SUPPORTED_SPEED_RANGE_UUID: '00002ad4-0000-1000-8000-00805f9b34fb',
  /** Supported Inclination Range (read). */
  SUPPORTED_INCLINE_RANGE_UUID: '00002ad5-0000-1000-8000-00805f9b34fb',
} as const;

/** How long to scan for FTMS devices before giving up (ms). */
export const FTMS_SCAN_TIMEOUT_MS = 10_000;

/** Slider bounds for the manual treadmill mode (km/h). */
export const MANUAL_TREADMILL_SPEED = {
  MIN: 3,
  MAX: 22,
  DEFAULT: 8,
  STEP_SMALL: 0.1,
  STEP_LARGE: 1,
} as const;
