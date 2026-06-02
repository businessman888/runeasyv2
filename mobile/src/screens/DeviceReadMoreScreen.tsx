/**
 * DeviceReadMore route (Profile). Thin wrapper around the reusable
 * `DeviceReadMoreBody` — provider comes from route params and the close (X)
 * pops the modal. Mirrors `DeviceConnectScreen`. The onboarding flow reuses the
 * same body inside a nested <Modal> instead of a route.
 */

import React from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { DeviceReadMoreBody } from '../components/devices/DeviceReadMoreBody';
import type { RootStackParamList } from '../navigation/navigationRef';

type Props = NativeStackScreenProps<RootStackParamList, 'DeviceReadMore'>;

export function DeviceReadMoreScreen({ navigation, route }: Props) {
    const { provider } = route.params;
    return (
        <DeviceReadMoreBody provider={provider} onClose={() => navigation.goBack()} />
    );
}

export default DeviceReadMoreScreen;
