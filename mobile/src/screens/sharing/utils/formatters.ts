/**
 * Format seconds into "MM:SS" pace string (per km)
 */
export function formatPace(secondsPerKm: number): string {
  if (!secondsPerKm || secondsPerKm <= 0) return '-:--';
  const min = Math.floor(secondsPerKm / 60);
  const sec = Math.floor(secondsPerKm % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

/**
 * Format seconds into "HH:MM:SS" or "MM:SS" duration string
 */
export function formatDuration(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds <= 0) return '0:00';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Format distance in km with 1 or 2 decimal places
 */
export function formatDistance(km: number): string {
  if (!km || km <= 0) return '0.0';
  return km >= 10 ? km.toFixed(1) : km.toFixed(2);
}

/**
 * Format date string to "DD MMM YYYY" in Portuguese
 */
export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const months = [
    'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
    'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
  ];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Format date to short weekday + day (e.g., "Seg, 14")
 */
export function formatShortDate(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  return `${weekdays[date.getDay()]}, ${date.getDate()}`;
}

/**
 * Format elevation gain
 */
export function formatElevation(meters: number | null): string {
  if (meters === null || meters === undefined) return '-m';
  return `${Math.round(meters)}m`;
}

/**
 * Format heart rate
 */
export function formatHeartRate(bpm: number | null): string {
  if (bpm === null || bpm === undefined) return '-bpm';
  return `${Math.round(bpm)}bpm`;
}

/**
 * Map hero_tone to emoji
 */
export function toneEmoji(tone: string): string {
  switch (tone) {
    case 'celebration': return '🎉';
    case 'encouragement': return '💪';
    case 'improvement': return '📈';
    case 'caution': return '⚡';
    default: return '🏃';
  }
}

/**
 * Map workout type to label
 */
export function workoutTypeLabel(type: string): string {
  const map: Record<string, string> = {
    easy: 'Corrida Leve',
    moderate: 'Corrida Moderada',
    long_run: 'Longão',
    interval: 'Intervalado',
    tempo: 'Tempo Run',
    recovery: 'Recuperação',
    race: 'Prova',
    fartlek: 'Fartlek',
    rest: 'Descanso',
  };
  return map[type] || type;
}
