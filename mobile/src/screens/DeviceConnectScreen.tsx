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
    const { provider } = route.params;
    return (
        <DeviceConnectBody provider={provider} onClose={() => navigation.goBack()} />
    );
}

export default DeviceConnectScreen;
