import React, { memo, useCallback, useEffect, useState } from "react";
import {
  AccessibilityInfo,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  View,
} from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import type { LatestActivityData } from "../../../stores/feedbackStore";
import { RESULT_CARD_HEIGHT } from "./WorkoutResultCard";

const CARD_PEEK = 30;
const CARD_STEP = RESULT_CARD_HEIGHT - CARD_PEEK;

interface CardItemProps {
  index: number;
  scrollY: SharedValue<number>;
  reduceMotion: boolean;
  children: React.ReactNode;
}

function CardItem({ index, scrollY, reduceMotion, children }: CardItemProps) {
  const animatedStyle = useAnimatedStyle(() => {
    if (reduceMotion) return { transform: [{ scale: 1 }], opacity: 1 };
    const distance = Math.abs(scrollY.value / CARD_STEP - index);
    return {
      transform: [
        {
          scale: interpolate(
            distance,
            [0, 1, 2],
            [1, 0.965, 0.94],
            Extrapolation.CLAMP,
          ),
        },
      ],
      opacity: interpolate(
        distance,
        [0, 1.4, 2.5],
        [1, 0.84, 0.55],
        Extrapolation.CLAMP,
      ),
    };
  }, [index, reduceMotion]);

  return (
    <Animated.View style={[styles.item, animatedStyle]}>
      {children}
    </Animated.View>
  );
}

interface StackedResultCardsProps {
  results: LatestActivityData[];
  renderCard: (
    item: LatestActivityData,
    index: number,
    isActive: boolean,
  ) => React.ReactElement | null;
}

export const StackedResultCards = memo(function StackedResultCards({
  results,
  renderCard,
}: StackedResultCardsProps) {
  const scrollY = useSharedValue(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (activeIndex >= results.length) setActiveIndex(0);
  }, [activeIndex, results.length]);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const updateActiveIndex = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.max(
        0,
        Math.min(
          results.length - 1,
          Math.round(event.nativeEvent.contentOffset.y / CARD_STEP),
        ),
      );
      setActiveIndex(next);
    },
    [results.length],
  );

  return (
    <View
      style={styles.viewport}
      accessibilityLabel={`${results.length} resultados recentes. Deslize verticalmente para navegar.`}
    >
      <Animated.FlatList
        data={results}
        keyExtractor={(item) =>
          item.activity?.id ?? item.workout_id ?? "result"
        }
        renderItem={({ item, index }) => (
          <CardItem index={index} scrollY={scrollY} reduceMotion={reduceMotion}>
            {renderCard(item, index, index === activeIndex)}
          </CardItem>
        )}
        onScroll={onScroll}
        onMomentumScrollEnd={updateActiveIndex}
        onScrollEndDrag={updateActiveIndex}
        scrollEventThrottle={16}
        snapToInterval={CARD_STEP}
        snapToAlignment="start"
        decelerationRate="fast"
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        scrollEnabled={results.length > 1}
        contentContainerStyle={styles.content}
        removeClippedSubviews={false}
        initialNumToRender={Math.min(results.length, 3)}
        windowSize={3}
      />
      {results.length > 1 ? (
        <View
          style={styles.counter}
          accessible
          accessibilityLiveRegion="polite"
          accessibilityLabel={`${activeIndex + 1} de ${results.length}`}
        >
          {results.map((item, index) => (
            <View
              key={item.activity?.id ?? String(index)}
              style={[styles.dot, index === activeIndex && styles.dotActive]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  viewport: { height: RESULT_CARD_HEIGHT + CARD_PEEK + 16 },
  content: { paddingBottom: CARD_PEEK + 16 },
  item: { height: RESULT_CARD_HEIGHT, marginBottom: -CARD_PEEK },
  counter: {
    position: "absolute",
    right: 12,
    top: 12,
    paddingHorizontal: 8,
    minHeight: 24,
    borderRadius: 999,
    backgroundColor: "rgba(14,14,31,0.72)",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(235,235,245,0.32)",
  },
  dotActive: { width: 12, backgroundColor: "#00D4FF" },
});
