import React, { useMemo } from 'react';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import { colors, useThemeSubscription } from '../../theme';

interface SparklineProps {
    data: number[];
    width?: number;
    height?: number;
    color?: string;
    fill?: boolean;
}

/**
 * Tiny inline SVG sparkline for performance cards.
 * Renders a smooth area chart with a stroke on top.
 */
export function Sparkline({
    data,
    width = 60,
    height = 22,
    color = colors.primary,
    fill = true,
}: SparklineProps) {
    useThemeSubscription();
    const { strokePath, areaPath } = useMemo(() => {
        if (!data || data.length < 2) {
            return { strokePath: '', areaPath: '' };
        }
        const max = Math.max(...data, 0.0001);
        const min = Math.min(...data, 0);
        const range = max - min || 1;
        const step = data.length > 1 ? width / (data.length - 1) : width;

        const points = data.map((value, i) => {
            const x = i * step;
            const y = height - ((value - min) / range) * height;
            return { x, y };
        });

        const stroke = points
            .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
            .join(' ');

        const area = `${stroke} L${width},${height} L0,${height} Z`;

        return { strokePath: stroke, areaPath: area };
    }, [data, width, height]);

    if (!strokePath) return null;

    return (
        <Svg width={width} height={height}>
            <Defs>
                <LinearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0%" stopColor={color} stopOpacity={0.5} />
                    <Stop offset="100%" stopColor={color} stopOpacity={0} />
                </LinearGradient>
            </Defs>
            {fill && <Path d={areaPath} fill="url(#sparkGrad)" />}
            <Path
                d={strokePath}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </Svg>
    );
}
