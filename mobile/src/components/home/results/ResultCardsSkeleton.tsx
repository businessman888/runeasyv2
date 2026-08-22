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
      <Skeleton width="100%" height={204} />
      <View style={styles.content}>
        <Skeleton width="50%" height={20} style={{ marginBottom: 8 }} />
        <Skeleton width="34%" height={13} style={{ marginBottom: 26 }} />
        <View style={styles.metrics}>
          <Skeleton width="27%" height={72} />
          <Skeleton width="27%" height={72} />
          <Skeleton width="27%" height={72} />
        </View>
        <Skeleton width="64%" height={46} style={styles.button} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    height: RESULT_CARD_HEIGHT,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: colors.streakDayCard,
  },
  content: { padding: 20 },
  metrics: { flexDirection: "row", justifyContent: "space-between" },
  button: { alignSelf: "center", marginTop: 22, borderRadius: 999 },
});
