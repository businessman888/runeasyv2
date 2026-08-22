import React, { memo, useCallback, useState } from "react";
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import type { LatestActivityData } from "../../../stores/feedbackStore";
import { RESULT_CARD_HEIGHT } from "./WorkoutResultCard";

interface StackedResultCardsProps {
  results: LatestActivityData[];
  renderCard: (
    item: LatestActivityData,
    index: number,
    isActive: boolean,
  ) => React.ReactElement | null;
}

/**
 * A five-item native horizontal pager with subtle stacked depth.
 *
 * Home already owns the vertical ScrollView, so this intentionally avoids
 * FlatList/VirtualizedList and vertical gestures. Five cards are small enough
 * to render eagerly, and only the active card mounts Mapbox.
 */
export const StackedResultCards = memo(function StackedResultCards({
  results,
  renderCard,
}: StackedResultCardsProps) {
  const [viewportWidth, setViewportWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setViewportWidth(Math.round(event.nativeEvent.layout.width));
  }, []);

  const onMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (viewportWidth <= 0) return;
      const next = Math.max(
        0,
        Math.min(
          results.length - 1,
          Math.round(event.nativeEvent.contentOffset.x / viewportWidth),
        ),
      );
      setActiveIndex(next);
    },
    [results.length, viewportWidth],
  );

  return (
    <View style={styles.deck}>
      {results.length > 1 ? (
        <>
          <View style={[styles.depthLayer, styles.depthLayerBack]} />
          <View style={[styles.depthLayer, styles.depthLayerMiddle]} />
        </>
      ) : null}

      <View style={styles.viewport} onLayout={onLayout}>
        {viewportWidth > 0 ? (
          <ScrollView
            horizontal
            pagingEnabled
            nestedScrollEnabled
            directionalLockEnabled
            showsHorizontalScrollIndicator={false}
            scrollEnabled={results.length > 1}
            onMomentumScrollEnd={onMomentumScrollEnd}
            scrollEventThrottle={16}
            overScrollMode="never"
            bounces={false}
          >
            {results.map((item, index) => (
              <View
                key={item.activity?.id ?? item.workout_id ?? String(index)}
                style={{ width: viewportWidth }}
              >
                {renderCard(item, index, index === activeIndex)}
              </View>
            ))}
          </ScrollView>
        ) : null}
      </View>

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
  deck: {
    height: RESULT_CARD_HEIGHT + 10,
    paddingRight: 8,
  },
  viewport: {
    height: RESULT_CARD_HEIGHT,
    overflow: "hidden",
    borderRadius: 22,
  },
  depthLayer: {
    position: "absolute",
    left: 8,
    right: 0,
    height: RESULT_CARD_HEIGHT - 4,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(235,235,245,0.08)",
  },
  depthLayerBack: {
    top: 9,
    backgroundColor: "rgba(28,28,46,0.42)",
  },
  depthLayerMiddle: {
    top: 5,
    right: 4,
    backgroundColor: "rgba(28,28,46,0.76)",
  },
  counter: {
    position: "absolute",
    right: 18,
    top: 10,
    minHeight: 24,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: "rgba(14,14,31,0.78)",
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
  dotActive: { width: 10, backgroundColor: "#00D4FF" },
});
