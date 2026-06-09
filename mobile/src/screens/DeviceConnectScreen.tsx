/**
 * DeviceConnect route (Profile). Thin wrapper around the reusable
 * `DeviceConnectBody` in "manage" mode — provider comes from route params and
 * the close (X) pops the modal. The onboarding flow reuses the same body with
 * an `onConnected` callback instead of a route.
 */

import React from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { DeviceConnectBody } from '../components/devices/DeviceConnectBody';
import type { RootStackParamList } from '../navigation/navigationRef';

type Props = NativeStackScreenProps<RootStackParamList, 'DeviceConnect'>;

export function DeviceConnectScreen({ navigation, route }: Props) {
    const { provider, onConnected } = route.params;
    return (
        <DeviceConnectBody
            provider={provider}
            onClose={() => navigation.goBack()}
            // Onboarding mode: advance the quiz flow, then pop this route so the
            // (now advanced) onboarding step is revealed underneath.
            onConnected={
                onConnected
                    ? () => {
                          onConnected();
                          navigation.goBack();
                      }
                    : undefined
            }
            onReadMore={() => navigation.navigate('DeviceReadMore', { provider })}
        />
    );
}

export default DeviceConnectScreen;
