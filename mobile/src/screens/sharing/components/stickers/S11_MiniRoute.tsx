import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ShareCardData } from '../../../../types/sharing.types';
import { RouteSvg } from '../RouteSvg';
import { RouteNoData } from '../RouteNoData';
import { StickerBase } from './StickerBase';

interface Props { data: ShareCardData; }

/** S11 — Mini GPS route sticker */
export function S11_MiniRoute({ data }: Props) {
  return (
    <StickerBase>
      {data.routePoints ? (
        <RouteSvg points={data.routePoints} width={120} height={120} padding={8} />
      ) : (
        <RouteNoData width={120} height={120} />
      )}
    </StickerBase>
  );
}
