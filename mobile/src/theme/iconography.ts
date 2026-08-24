import type { IoniconsIconName } from '@react-native-vector-icons/ionicons/static';

import type { ThemeColors } from './contracts';

export const iconSizes = {
  xs: 16,
  sm: 20,
  md: 24,
  lg: 28,
  xl: 32,
  hero: 48,
} as const;

export type IconSize = (typeof iconSizes)[keyof typeof iconSizes];
export type IconVariant = 'outline' | 'filled';

export type IconTone =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'accent'
  | 'recovery'
  | 'success'
  | 'onAccent'
  | 'warning'
  | 'danger'
  | 'info';

export function resolveIconToneColor(
  tone: IconTone,
  colors: ThemeColors,
): string {
  switch (tone) {
    case 'primary': return colors.textPrimary;
    case 'secondary': return colors.textSecondary;
    case 'tertiary': return colors.textTertiary;
    case 'accent': return colors.accent;
    case 'recovery': return colors.recovery;
    case 'success': return colors.success;
    case 'onAccent': return colors.textOnAccent;
    case 'warning': return colors.warning;
    case 'danger': return colors.danger;
    case 'info': return colors.info;
  }
}

type IconVariants = Readonly<{
  outline: IoniconsIconName;
  filled: IoniconsIconName;
}>;

/**
 * Product semantics mapped to a single visual icon language.
 *
 * Feature code should depend on these names instead of library glyph names so
 * the underlying icon family can evolve without leaking through the app.
 */
export const iconography = {
  home: { outline: 'home-outline', filled: 'home' },
  training: { outline: 'barbell-outline', filled: 'barbell' },
  progress: { outline: 'stats-chart-outline', filled: 'stats-chart' },
  profile: { outline: 'person-outline', filled: 'person' },
  calendar: { outline: 'calendar-outline', filled: 'calendar' },
  today: { outline: 'today-outline', filled: 'today' },
  time: { outline: 'time-outline', filled: 'time' },
  running: { outline: 'walk-outline', filled: 'walk' },
  walking: { outline: 'footsteps-outline', filled: 'footsteps' },
  workout: { outline: 'fitness-outline', filled: 'fitness' },
  trophy: { outline: 'trophy-outline', filled: 'trophy' },
  medal: { outline: 'medal-outline', filled: 'medal' },
  flag: { outline: 'flag-outline', filled: 'flag' },
  lock: { outline: 'lock-closed-outline', filled: 'lock-closed' },
  unlock: { outline: 'lock-open-outline', filled: 'lock-open' },
  heartRate: { outline: 'heart-outline', filled: 'heart' },
  sleep: { outline: 'moon-outline', filled: 'moon' },
  trainingLoad: { outline: 'speedometer-outline', filled: 'speedometer' },
  energy: { outline: 'flash-outline', filled: 'flash' },
  stress: { outline: 'pulse-outline', filled: 'pulse' },
  wellness: { outline: 'pulse-outline', filled: 'pulse' },
  readiness: { outline: 'battery-half-outline', filled: 'battery-half' },
  adjustment: { outline: 'options-outline', filled: 'options' },
  wearable: { outline: 'watch-outline', filled: 'watch' },
  trendUp: { outline: 'arrow-up-outline', filled: 'arrow-up' },
  trendDown: { outline: 'arrow-down-outline', filled: 'arrow-down' },
  mood: { outline: 'happy-outline', filled: 'happy' },
  flame: { outline: 'flame-outline', filled: 'flame' },
  sparkles: { outline: 'sparkles-outline', filled: 'sparkles' },
  location: { outline: 'location-outline', filled: 'location' },
  notification: { outline: 'notifications-outline', filled: 'notifications' },
  history: { outline: 'time-outline', filled: 'time' },
  headset: { outline: 'headset-outline', filled: 'headset' },
  shieldCheck: { outline: 'shield-checkmark-outline', filled: 'shield-checkmark' },
  logout: { outline: 'log-out-outline', filled: 'log-out' },
  settings: { outline: 'settings-outline', filled: 'settings' },
  appearance: { outline: 'contrast-outline', filled: 'contrast' },
  lightMode: { outline: 'sunny-outline', filled: 'sunny' },
  darkMode: { outline: 'moon-outline', filled: 'moon' },
  systemTheme: { outline: 'phone-portrait-outline', filled: 'phone-portrait' },
  info: { outline: 'information-circle-outline', filled: 'information-circle' },
  help: { outline: 'help-circle-outline', filled: 'help-circle' },
  warning: { outline: 'warning-outline', filled: 'warning' },
  check: { outline: 'checkmark-circle-outline', filled: 'checkmark-circle' },
  close: { outline: 'close-outline', filled: 'close' },
  add: { outline: 'add-outline', filled: 'add' },
  backspace: { outline: 'backspace-outline', filled: 'backspace' },
  chevronBack: { outline: 'chevron-back-outline', filled: 'chevron-back' },
  chevronForward: { outline: 'chevron-forward-outline', filled: 'chevron-forward' },
  chevronUp: { outline: 'chevron-up-outline', filled: 'chevron-up' },
  chevronDown: { outline: 'chevron-down-outline', filled: 'chevron-down' },
  play: { outline: 'play-outline', filled: 'play' },
  pause: { outline: 'pause-outline', filled: 'pause' },
  stop: { outline: 'stop-outline', filled: 'stop' },
  refresh: { outline: 'refresh-outline', filled: 'refresh' },
  search: { outline: 'search-outline', filled: 'search' },
  edit: { outline: 'create-outline', filled: 'create' },
  delete: { outline: 'trash-outline', filled: 'trash' },
  share: { outline: 'share-social-outline', filled: 'share-social' },
  visibility: { outline: 'eye-outline', filled: 'eye' },
  visibilityOff: { outline: 'eye-off-outline', filled: 'eye-off' },
  menu: { outline: 'menu-outline', filled: 'menu' },
  more: { outline: 'ellipsis-horizontal-outline', filled: 'ellipsis-horizontal' },
} as const satisfies Record<string, IconVariants>;

export type AppIconName = keyof typeof iconography;

