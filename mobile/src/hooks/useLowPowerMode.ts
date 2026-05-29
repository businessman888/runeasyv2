import { useEffect, useState } from 'react';
import * as Battery from 'expo-battery';

/**
 * Detecta se o aparelho está em modo de economia de bateria
 * (iOS Low Power Mode / Android battery saver), que pode reduzir a
 * frequência e a precisão das atualizações de GPS durante o tracking.
 *
 * Retorna o estado atual e reage a mudanças em tempo real via listener.
 */
export function useLowPowerMode(): boolean {
  const [isLowPower, setIsLowPower] = useState(false);

  useEffect(() => {
    let mounted = true;

    Battery.isLowPowerModeEnabledAsync()
      .then((enabled) => {
        if (mounted) setIsLowPower(enabled);
      })
      .catch(() => {
        /* silencioso — em alguns devices/emuladores a API pode falhar */
      });

    const subscription = Battery.addLowPowerModeListener(({ lowPowerMode }) => {
      setIsLowPower(lowPowerMode);
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return isLowPower;
}
