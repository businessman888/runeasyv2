/**
 * DashedDivider — a crisp dotted/dashed horizontal rule.
 *
 * React Native's `borderStyle: 'dashed'` is unreliable cross-platform (iOS
 * ignores dash sizing, and it bleeds on rounded containers). We draw the line
 * with react-native-svg instead, measuring the available width via onLayout so
 * the dash pattern renders consistently. Mirrors the Figma dividers
 * (strokeDasharray [4,4] / [5,5], color #EBEBF5 @10%).
 */
import React, { useState } from 'react';
import { View, LayoutChangeEvent, ViewStyle } from 'react-native';
import Svg, { Line } from 'react-native-svg';

interface DashedDividerProps {
    color?: string;
    /** [dashLength, gapLength] */
    dash?: [number, number];
    thickness?: number;
    style?: ViewStyle;
}

export function DashedDivider({
    color = 'rgba(235, 235, 245, 0.1)',
    dash = [4, 4],
    thickness = 1,
    style,
}: DashedDividerProps) {
    const [width, setWidth] = useState(0);

    const onLayout = (e: LayoutChangeEvent) => {
        const w = e.nativeEvent.layout.width;
        if (w && w !== width) setWidth(w);
    };

    return (
        <View onLayout={onLayout} style={[{ height: thickness, width: '100%' }, style]}>
            {width > 0 && (
                <Svg width={width} height={thickness}>
                    <Line
                        x1={0}
                        y1={thickness / 2}
                        x2={width}
                        y2={thickness / 2}
                        stroke={color}
                        strokeWidth={thickness}
                        strokeDasharray={dash.join(',')}
                    />
                </Svg>
            )}
        </View>
    );
}
