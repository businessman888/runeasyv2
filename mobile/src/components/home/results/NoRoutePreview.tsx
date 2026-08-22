import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, fonts } from "../../../theme";

interface NoRoutePreviewProps {
  isTreadmill: boolean;
}

export const NoRoutePreview = memo(function NoRoutePreview({
  isTreadmill,
}: NoRoutePreviewProps) {
  return (
    <View style={styles.container}>
      <MaterialCommunityIcons
        name={isTreadmill ? "run-fast" : "map-marker-off-outline"}
        size={42}
        color="rgba(235,235,245,0.28)"
      />
      <View style={styles.badge}>
        <MaterialCommunityIcons
          name={isTreadmill ? "map-marker-off-outline" : "map-outline"}
          size={14}
          color={colors.textLight}
        />
        <Text style={styles.badgeText} maxFontSizeMultiplier={1.2}>
          {isTreadmill ? "Esteira · sem rota GPS" : "Rota não disponível"}
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 20,
    backgroundColor: "#12151D",
  },
  badge: {
    marginTop: 10,
    minHeight: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(235,235,245,0.18)",
    backgroundColor: "rgba(14,14,31,0.78)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  badgeText: {
    color: colors.textLight,
    fontFamily: fonts.medium,
    fontSize: 11,
  },
});
