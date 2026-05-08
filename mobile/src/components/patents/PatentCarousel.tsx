import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Carousel, { type ICarouselInstance } from 'react-native-reanimated-carousel';
import { colors, typography, spacing } from '../../theme';
import { PATENTS, PatentDef } from '../../constants/patents';
import { getPatentIndex, isPatentUnlocked } from '../../utils/patents';
import { Patent } from './Patent';

interface PatentCarouselProps {
    currentLevel: number;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const ITEM_WIDTH = 130;
const FOCUSED_SIZE = 110;
const SIDE_SIZE = 78;
const CAROUSEL_HEIGHT = 170;

export function PatentCarousel({ currentLevel }: PatentCarouselProps) {
    const initialIndex = useMemo(() => getPatentIndex(currentLevel), [currentLevel]);
    const [activeIndex, setActiveIndex] = useState(initialIndex);
    const carouselRef = useRef<ICarouselInstance>(null);

    const data = PATENTS;

    const renderItem = ({ item, index }: { item: PatentDef; index: number }) => {
        const isFocused = index === activeIndex;
        const unlocked = isPatentUnlocked(item, currentLevel);
        const size = isFocused ? FOCUSED_SIZE : SIDE_SIZE;

        return (
            <View style={[styles.itemContainer, { opacity: isFocused ? 1 : 0.45 }]}>
                <Patent patent={item} size={size} locked={!unlocked} glow={isFocused && unlocked} />
                <Text
                    style={[
                        styles.patentName,
                        {
                            color: isFocused ? colors.textLight : 'rgba(235,235,245,0.45)',
                            fontSize: isFocused ? 16 : 13,
                        },
                    ]}
                    numberOfLines={1}
                >
                    {item.name}
                </Text>
                {isFocused ? (
                    <Text style={styles.patentRange}>
                        {item.maxLevel === Number.POSITIVE_INFINITY
                            ? `Nível ${item.minLevel}+`
                            : `Nível ${item.minLevel} – ${item.maxLevel}`}
                    </Text>
                ) : null}
            </View>
        );
    };

    return (
        <View style={styles.wrapper}>
            <Carousel
                ref={carouselRef}
                width={ITEM_WIDTH}
                height={CAROUSEL_HEIGHT}
                style={{ width: SCREEN_WIDTH }}
                data={data}
                defaultIndex={initialIndex}
                loop={false}
                onSnapToItem={setActiveIndex}
                mode="parallax"
                modeConfig={{
                    parallaxScrollingScale: 1,
                    parallaxScrollingOffset: 60,
                    parallaxAdjacentItemScale: 0.78,
                }}
                renderItem={renderItem}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        height: CAROUSEL_HEIGHT,
        marginBottom: spacing.lg,
        alignItems: 'center',
        justifyContent: 'center',
    },
    itemContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    patentName: {
        fontWeight: typography.fontWeights.semibold,
        textAlign: 'center',
    },
    patentRange: {
        fontSize: 11,
        color: colors.primary,
        fontWeight: typography.fontWeights.medium,
        textAlign: 'center',
    },
});
