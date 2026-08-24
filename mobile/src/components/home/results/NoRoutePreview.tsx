import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, fonts, createThemeStyles, useThemeSubscription } from "../../../theme";
import { semanticColors } from "../../../theme/semanticColors";

interface NoRoutePreviewProps {
  isTreadmill: boolean;
}

export const NoRoutePreview = memo(function NoRoutePreview({
  isTreadmill,
}: NoRoutePreviewProps) {
  useThemeSubscription();
  return (
    <View style={styles.container}>
      <MaterialCommunityIcons
        name={isTreadmill ? "run-fast" : "map-marker-off-outline"}
        size={42}
        color={semanticColors.textTertiary}
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

const styles = createThemeStyles(() => ({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 20,
    backgroundColor: semanticColors.surface1,
  },
  badge: {
    marginTop: 10,
    minHeight: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: semanticColors.borderStrong,
    backgroundColor: semanticColors.surface2,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  badgeText: {
    color: semanticColors.textPrimary,
    fontFamily: fonts.medium,
    fontSize: 11,
  },
}));
