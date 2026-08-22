import * as Haptics from 'expo-haptics';

export type HapticFeedback =
  | 'none'
  | 'selection'
  | 'impactLight'
  | 'impactMedium'
  | 'impactHeavy'
  | 'success'
  | 'warning'
  | 'error';

export async function triggerHaptic(
  feedback: HapticFeedback = 'none',
): Promise<void> {
  try {
    switch (feedback) {
      case 'none':
        return;
      case 'selection':
        await Haptics.selectionAsync();
        return;
      case 'impactLight':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return;
      case 'impactMedium':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        return;
      case 'impactHeavy':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        return;
      case 'success':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      case 'warning':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      case 'error':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  } catch {
    // Haptics are progressive enhancement and must never block an action.
  }
}
