import React from "react";
import { StyleSheet, View } from "react-native";
import { Skeleton } from "../../Skeleton";
import { colors } from "../../../theme";
import { RESULT_CARD_HEIGHT } from "./WorkoutResultCard";

export function ResultCardsSkeleton() {
  return (
    <View
      style={styles.card}
      accessibilityLabel="Carregando resultados recentes"
    >
      <Skeleton width="100%" height={156} />
      <View style={styles.content}>
        <Skeleton width="50%" height={18} style={{ marginBottom: 7 }} />
        <Skeleton width="34%" height={12} style={{ marginBottom: 22 }} />
        <View style={styles.metrics}>
          <Skeleton width="27%" height={58} />
          <Skeleton width="27%" height={58} />
          <Skeleton width="27%" height={58} />
        </View>
        <Skeleton width="64%" height={44} style={styles.button} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    height: RESULT_CARD_HEIGHT,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: colors.streakDayCard,
  },
  content: { padding: 18 },
  metrics: { flexDirection: "row", justifyContent: "space-between" },
  button: { alignSelf: "center", marginTop: 20, borderRadius: 999 },
});
