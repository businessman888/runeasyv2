import React, { useRef, useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  Dimensions,
  ActivityIndicator,
  Alert,
  ScrollView,
  LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ViewShot, { captureRef } from 'react-native-view-shot';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius } from '../../theme';
import { useSharingStore } from '../../stores/sharingStore';
import { CardTemplateId, ShareCardData } from '../../types/sharing.types';
import { getAvailableCards, CardEntry } from './components/cards';
import { CARD_WIDTH, CARD_HEIGHT } from './components/cards/CardBase';
import {
  shareToInstagramStories,
  copyImageToClipboard,
  downloadImageToGallery,
  openSystemShareSheet,
} from './utils/shareHandlers';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PREVIEW_HORIZONTAL_PADDING = spacing.base;
const PREVIEW_VERTICAL_PADDING = spacing.md;

interface SharingModalProps {
  visible: boolean;
  onClose: () => void;
  workoutId: string;
}

export function SharingModal({ visible, onClose, workoutId }: SharingModalProps) {
  const { cardData, isLoading, error, selectedCard, fetchCardData, setSelectedCard, reset } =
    useSharingStore();

  const viewShotRef = useRef<ViewShot>(null);
  const carouselRef = useRef<FlatList<CardEntry>>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [bodyHeight, setBodyHeight] = useState(0);

  useEffect(() => {
    if (visible && workoutId) {
      fetchCardData(workoutId);
    }
  }, [visible, workoutId, fetchCardData]);

  const cards = useMemo(() => getAvailableCards(cardData), [cardData]);

  useEffect(() => {
    if (cards.length > 0 && !cards.some((c) => c.id === selectedCard)) {
      setSelectedCard(cards[0].id);
    }
  }, [cards, selectedCard, setSelectedCard]);

  const currentIndex = useMemo(() => {
    const idx = cards.findIndex((c) => c.id === selectedCard);
    return idx === -1 ? 0 : idx;
  }, [cards, selectedCard]);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const captureCurrent = useCallback(async (): Promise<string | null> => {
    if (!viewShotRef.current) return null;
    setIsCapturing(true);
    try {
      const uri = await captureRef(viewShotRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      return uri;
    } catch {
      Alert.alert('Erro', 'Falha ao gerar imagem do card.');
      return null;
    } finally {
      setIsCapturing(false);
    }
  }, []);

  const handleShareStories = useCallback(async () => {
    const uri = await captureCurrent();
    if (uri) await shareToInstagramStories(uri);
  }, [captureCurrent]);

  const handleClipboard = useCallback(async () => {
    const uri = await captureCurrent();
    if (uri) await copyImageToClipboard(uri);
  }, [captureCurrent]);

  const handleDownload = useCallback(async () => {
    const uri = await captureCurrent();
    if (uri) await downloadImageToGallery(uri);
  }, [captureCurrent]);

  const handleShareMore = useCallback(async () => {
    const uri = await captureCurrent();
    if (uri) await openSystemShareSheet(uri);
  }, [captureCurrent]);

  const handleScroll = useCallback(
    (event: any) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const page = Math.round(offsetX / SCREEN_WIDTH);
      const next = cards[page];
      if (next && next.id !== selectedCard) setSelectedCard(next.id);
    },
    [cards, selectedCard, setSelectedCard],
  );

  const onBodyLayout = useCallback((e: LayoutChangeEvent) => {
    setBodyHeight(e.nativeEvent.layout.height);
  }, []);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
      presentationStyle="overFullScreen"
      transparent
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={handleClose}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={26} color={colors.textLight} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Compartilhar treino</Text>
          <View style={styles.backBtn} />
        </View>

        {/* Body */}
        <View style={styles.body} onLayout={onBodyLayout}>
          {isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Carregando dados...</Text>
            </View>
          ) : error ? (
            <View style={styles.center}>
              <Ionicons name="alert-circle" size={40} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : cardData && bodyHeight > 0 ? (
            <CarouselBody
              cards={cards}
              data={cardData}
              currentIndex={currentIndex}
              onScroll={handleScroll}
              carouselRef={carouselRef}
              viewShotRef={viewShotRef}
              isCapturing={isCapturing}
              bodyHeight={bodyHeight}
            />
          ) : null}
        </View>

        {/* Bottom action bar */}
        <View style={styles.actionBar}>
          <Text style={styles.actionBarLabel}>Compartilhar com</Text>
          <View style={styles.actionRow}>
            <ActionButton
              label="Stories"
              icon={<Ionicons name="logo-instagram" size={28} color={colors.textLight} />}
              onPress={handleShareStories}
              disabled={!cardData || isCapturing}
            />
            <ActionButton
              label="Clipboard"
              icon={<MaterialCommunityIcons name="clipboard-outline" size={28} color={colors.textLight} />}
              onPress={handleClipboard}
              disabled={!cardData || isCapturing}
            />
            <ActionButton
              label="Download"
              icon={<MaterialCommunityIcons name="download-circle-outline" size={28} color={colors.textLight} />}
              onPress={handleDownload}
              disabled={!cardData || isCapturing}
            />
            <ActionButton
              label="Mais"
              icon={<Ionicons name="share-social-outline" size={28} color={colors.textLight} />}
              onPress={handleShareMore}
              disabled={!cardData || isCapturing}
            />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

interface CarouselBodyProps {
  cards: CardEntry[];
  data: ShareCardData;
  currentIndex: number;
  onScroll: (e: any) => void;
  carouselRef: React.RefObject<FlatList<CardEntry> | null>;
  viewShotRef: React.RefObject<ViewShot | null>;
  isCapturing: boolean;
  bodyHeight: number;
}

function CarouselBody({
  cards,
  data,
  currentIndex,
  onScroll,
  carouselRef,
  viewShotRef,
  isCapturing,
  bodyHeight,
}: CarouselBodyProps) {
  const ActiveComponent = cards[currentIndex]?.Component ?? cards[0]?.Component;

  // Available area for the preview within each carousel page
  const availableW = SCREEN_WIDTH - PREVIEW_HORIZONTAL_PADDING * 2;
  const dotsAndScrollMargin = 56; // dots row + breathing room
  const availableH = Math.max(bodyHeight - dotsAndScrollMargin - PREVIEW_VERTICAL_PADDING * 2, 200);

  const scaleW = availableW / CARD_WIDTH;
  const scaleH = availableH / CARD_HEIGHT;
  const scale = Math.min(scaleW, scaleH, 1);
  const renderedW = CARD_WIDTH * scale;
  const renderedH = CARD_HEIGHT * scale;

  return (
    <View style={styles.bodyInner}>
      <FlatList
        ref={carouselRef}
        data={cards}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        onMomentumScrollEnd={onScroll}
        renderItem={({ item }) => (
          <ScrollView
            style={{ width: SCREEN_WIDTH }}
            contentContainerStyle={styles.pageScroll}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            bounces
          >
            <CardPreview renderedW={renderedW} renderedH={renderedH} scale={scale}>
              <item.Component data={data} />
            </CardPreview>
          </ScrollView>
        )}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
      />

      {/* Pagination dots */}
      <View style={styles.dotsRow}>
        {cards.map((c, i) => (
          <View
            key={c.id}
            style={[styles.dot, i === currentIndex && styles.dotActive]}
          />
        ))}
      </View>

      {/* Hidden capture surface — full size, off-screen */}
      {ActiveComponent && (
        <View style={styles.offScreen} pointerEvents="none">
          <ViewShot
            ref={viewShotRef}
            options={{ format: 'png', quality: 1, result: 'tmpfile' }}
            style={styles.captureSurface}
          >
            <ActiveComponent data={data} />
          </ViewShot>
        </View>
      )}

      {isCapturing && (
        <View style={styles.captureOverlay} pointerEvents="none">
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      )}
    </View>
  );
}

interface CardPreviewProps {
  children: React.ReactNode;
  renderedW: number;
  renderedH: number;
  scale: number;
}

function CardPreview({ children, renderedW, renderedH, scale }: CardPreviewProps) {
  return (
    <View
      style={[
        styles.previewFrame,
        {
          width: renderedW,
          height: renderedH,
        },
      ]}
    >
      <CheckerBackground width={renderedW} height={renderedH} />
      <View
        style={{
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          position: 'absolute',
          left: -(CARD_WIDTH - renderedW) / 2,
          top: -(CARD_HEIGHT - renderedH) / 2,
          transform: [{ scale }],
        }}
      >
        {children}
      </View>
    </View>
  );
}

function CheckerBackground({ width, height }: { width: number; height: number }) {
  const cell = 14;
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  const cells: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const dark = (r + c) % 2 === 0;
      cells.push(
        <View
          key={`${r}-${c}`}
          style={{
            position: 'absolute',
            top: r * cell,
            left: c * cell,
            width: cell,
            height: cell,
            backgroundColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.13)',
          }}
        />,
      );
    }
  }
  return <View style={StyleSheet.absoluteFill}>{cells}</View>;
}

interface ActionButtonProps {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
}

function ActionButton({ label, icon, onPress, disabled }: ActionButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.actionBtn, disabled && styles.actionBtnDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.actionIcon}>{icon}</View>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0E0E1F',
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    backgroundColor: '#1C1C2E',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: colors.textLight,
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.semibold,
    letterSpacing: -0.3,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.md,
  },
  errorText: {
    color: colors.error,
    fontSize: typography.fontSizes.md,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  body: {
    flex: 1,
  },
  bodyInner: {
    flex: 1,
  },
  pageScroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: PREVIEW_VERTICAL_PADDING,
    paddingHorizontal: PREVIEW_HORIZONTAL_PADDING,
  },
  previewFrame: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingVertical: spacing.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(235, 235, 245, 0.2)',
  },
  dotActive: {
    backgroundColor: colors.primary,
    width: 22,
  },
  offScreen: {
    position: 'absolute',
    left: -9999,
    top: 0,
  },
  captureSurface: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: 'transparent',
  },
  captureOverlay: {
    position: 'absolute',
    top: spacing.base,
    right: spacing.base,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: borderRadius.full,
    padding: spacing.sm,
  },
  actionBar: {
    backgroundColor: '#1C1C2E',
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  actionBarLabel: {
    color: colors.textLight,
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
  },
  actionBtn: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    minWidth: 60,
  },
  actionBtnDisabled: {
    opacity: 0.4,
  },
  actionIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    color: 'rgba(235, 235, 245, 0.65)',
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    letterSpacing: 0.2,
  },
});
