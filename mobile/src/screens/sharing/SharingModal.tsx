import React, { useRef, useCallback, useEffect, useMemo } from 'react';
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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ViewShot, { captureRef } from 'react-native-view-shot';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import * as Clipboard from 'expo-clipboard';
import { colors, typography, spacing, borderRadius } from '../../theme';
import { useSharingStore } from '../../stores/sharingStore';
import { ShareCardData, SharingTab, CardTemplateId, StickerTemplateId } from '../../types/sharing.types';
import { CARD_TEMPLATES } from './components/cards';
import { STICKER_TEMPLATES } from './components/stickers';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = 300;
const CARD_HEIGHT = 400;
const STICKER_SIZE = 140;
const CARDS_PER_PAGE = 2;

interface SharingModalProps {
  visible: boolean;
  onClose: () => void;
  workoutId: string;
}

export function SharingModal({ visible, onClose, workoutId }: SharingModalProps) {
  const {
    cardData,
    isLoading,
    error,
    activeTab,
    selectedCard,
    selectedSticker,
    fetchCardData,
    setActiveTab,
    setSelectedCard,
    setSelectedSticker,
    reset,
  } = useSharingStore();

  const viewShotRef = useRef<any>(null);

  useEffect(() => {
    if (visible && workoutId) {
      fetchCardData(workoutId);
    }
    return () => {
      if (!visible) reset();
    };
  }, [visible, workoutId]);

  // Capture and share
  const handleShare = useCallback(async () => {
    if (!viewShotRef.current) return;
    try {
      const uri = await captureRef(viewShotRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          UTI: 'public.png',
        });
      } else {
        Alert.alert('Erro', 'Compartilhamento não disponível neste dispositivo');
      }
    } catch (err) {
      Alert.alert('Erro', 'Falha ao compartilhar imagem');
    }
  }, []);

  // Capture and save to gallery
  const handleSave = useCallback(async () => {
    if (!viewShotRef.current) return;
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão necessária', 'Permita o acesso à galeria para salvar imagens.');
        return;
      }
      const uri = await captureRef(viewShotRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('Salvo!', 'Imagem salva na galeria.');
    } catch (err) {
      Alert.alert('Erro', 'Falha ao salvar imagem');
    }
  }, []);

  // Copy sticker to clipboard (long press)
  const handleCopySticker = useCallback(async () => {
    if (!viewShotRef.current) return;
    try {
      const uri = await captureRef(viewShotRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      // Read as base64 and copy
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64',
      });
      await Clipboard.setImageAsync(base64);
      Alert.alert('Copiado!', 'Sticker copiado para a área de transferência.');
    } catch (err) {
      Alert.alert('Erro', 'Falha ao copiar sticker');
    }
  }, []);

  // Card carousel data — 2 per page
  const cardPages = useMemo(() => {
    const pages: typeof CARD_TEMPLATES[number][][] = [];
    for (let i = 0; i < CARD_TEMPLATES.length; i += CARDS_PER_PAGE) {
      pages.push(CARD_TEMPLATES.slice(i, i + CARDS_PER_PAGE));
    }
    return pages;
  }, []);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={colors.white} />
          </TouchableOpacity>
          <Text style={styles.title}>Compartilhar</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'cards' && styles.tabActive]}
            onPress={() => setActiveTab('cards')}
          >
            <Text style={[styles.tabText, activeTab === 'cards' && styles.tabTextActive]}>
              Cards
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'stickers' && styles.tabActive]}
            onPress={() => setActiveTab('stickers')}
          >
            <Text style={[styles.tabText, activeTab === 'stickers' && styles.tabTextActive]}>
              Stickers
            </Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Carregando dados...</Text>
          </View>
        ) : error ? (
          <View style={styles.loading}>
            <Ionicons name="alert-circle" size={40} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : cardData ? (
          activeTab === 'cards' ? (
            <CardsTab
              data={cardData}
              selectedCard={selectedCard}
              onSelectCard={setSelectedCard}
              viewShotRef={viewShotRef}
              cardPages={cardPages}
            />
          ) : (
            <StickersTab
              data={cardData}
              selectedSticker={selectedSticker}
              onSelectSticker={setSelectedSticker}
              onLongPress={handleCopySticker}
              viewShotRef={viewShotRef}
            />
          )
        ) : null}

        {/* Action buttons */}
        {cardData && (
          <View style={styles.actions}>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Ionicons name="download-outline" size={22} color={colors.white} />
              <Text style={styles.saveBtnText}>Salvar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
              <Ionicons name="share-outline" size={22} color={colors.white} />
              <Text style={styles.shareBtnText}>Compartilhar</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ─── Cards Tab ────────────────────────────────────────────────
interface CardsTabProps {
  data: ShareCardData;
  selectedCard: CardTemplateId;
  onSelectCard: (id: CardTemplateId) => void;
  viewShotRef: React.MutableRefObject<any>;
  cardPages: typeof CARD_TEMPLATES[number][][];
}

function CardsTab({ data, selectedCard, onSelectCard, viewShotRef, cardPages }: CardsTabProps) {
  const selectedEntry = CARD_TEMPLATES.find((c) => c.id === selectedCard) || CARD_TEMPLATES[0];
  const SelectedComponent = selectedEntry.Component;

  return (
    <View style={styles.tabContent}>
      {/* Preview area — gradient is OUTSIDE ViewShot */}
      <View style={styles.previewArea}>
        <LinearGradient
          colors={['#0A0A18', '#1A1A2E', '#0A0A18']}
          style={StyleSheet.absoluteFill}
        />
        <ViewShot
          ref={viewShotRef}
          options={{ format: 'png', quality: 1 }}
          style={styles.viewShot}
        >
          <SelectedComponent data={data} />
        </ViewShot>
      </View>

      {/* Horizontal carousel — 2 per page */}
      <FlatList
        data={cardPages}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, i) => `page-${i}`}
        contentContainerStyle={styles.carouselContent}
        renderItem={({ item: page }) => (
          <View style={styles.carouselPage}>
            {page.map((entry) => (
              <TouchableOpacity
                key={entry.id}
                style={[
                  styles.carouselThumb,
                  selectedCard === entry.id && styles.carouselThumbActive,
                ]}
                onPress={() => onSelectCard(entry.id)}
              >
                <View style={styles.thumbPreview}>
                  <entry.Component data={data} />
                </View>
                <Text
                  style={[
                    styles.thumbLabel,
                    selectedCard === entry.id && styles.thumbLabelActive,
                  ]}
                >
                  {entry.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      />
    </View>
  );
}

// ─── Stickers Tab ─────────────────────────────────────────────
interface StickersTabProps {
  data: ShareCardData;
  selectedSticker: StickerTemplateId;
  onSelectSticker: (id: StickerTemplateId) => void;
  onLongPress: () => void;
  viewShotRef: React.MutableRefObject<any>;
}

function StickersTab({
  data,
  selectedSticker,
  onSelectSticker,
  onLongPress,
  viewShotRef,
}: StickersTabProps) {
  const selectedEntry =
    STICKER_TEMPLATES.find((s) => s.id === selectedSticker) || STICKER_TEMPLATES[0];
  const SelectedComponent = selectedEntry.Component;

  return (
    <View style={styles.tabContent}>
      {/* Preview */}
      <View style={styles.stickerPreviewArea}>
        <LinearGradient
          colors={['#0A0A18', '#1A1A2E', '#0A0A18']}
          style={StyleSheet.absoluteFill}
        />
        <ViewShot
          ref={viewShotRef}
          options={{ format: 'png', quality: 1 }}
          style={styles.stickerViewShot}
        >
          <SelectedComponent data={data} />
        </ViewShot>
      </View>

      {/* Grid */}
      <FlatList
        data={STICKER_TEMPLATES}
        numColumns={3}
        showsVerticalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.stickerGrid}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.stickerThumb,
              selectedSticker === item.id && styles.stickerThumbActive,
            ]}
            onPress={() => onSelectSticker(item.id)}
            onLongPress={onLongPress}
            delayLongPress={500}
          >
            <View style={styles.stickerThumbInner}>
              <item.Component data={data} />
            </View>
            <Text
              style={[
                styles.stickerLabel,
                selectedSticker === item.id && styles.stickerLabelActive,
              ]}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingTop: spacing['3xl'],
    paddingBottom: spacing.md,
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.white,
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
  },
  placeholder: {
    width: 40,
  },

  // Tabs
  tabs: {
    flexDirection: 'row',
    marginHorizontal: spacing.base,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.md,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    color: colors.textSecondary,
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
  },
  tabTextActive: {
    color: colors.white,
  },

  // Loading
  loading: {
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

  // Tab content
  tabContent: {
    flex: 1,
  },

  // Card preview
  previewArea: {
    height: CARD_HEIGHT + spacing.xl * 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.md,
    marginHorizontal: spacing.base,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
  },
  viewShot: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: 'transparent',
  },

  // Carousel
  carouselContent: {
    paddingHorizontal: spacing.base,
  },
  carouselPage: {
    width: SCREEN_WIDTH - spacing.base * 2,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    gap: spacing.md,
  },
  carouselThumb: {
    width: (SCREEN_WIDTH - spacing.base * 2 - spacing.md) / 2,
    aspectRatio: 3 / 4,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
    backgroundColor: colors.card,
    alignItems: 'center',
  },
  carouselThumbActive: {
    borderColor: colors.primary,
  },
  thumbPreview: {
    flex: 1,
    transform: [{ scale: 0.45 }],
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    alignSelf: 'center',
  },
  thumbLabel: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.medium,
    paddingVertical: spacing.xs,
  },
  thumbLabelActive: {
    color: colors.primary,
  },

  // Sticker preview
  stickerPreviewArea: {
    height: STICKER_SIZE + spacing.xl * 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.md,
    marginHorizontal: spacing.base,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
  },
  stickerViewShot: {
    width: STICKER_SIZE,
    height: STICKER_SIZE,
    backgroundColor: 'transparent',
  },

  // Sticker grid
  stickerGrid: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.xl,
  },
  stickerThumb: {
    flex: 1,
    maxWidth: '33.3%',
    alignItems: 'center',
    padding: spacing.xs,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: 'transparent',
    marginBottom: spacing.sm,
  },
  stickerThumbActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(0, 212, 255, 0.05)',
  },
  stickerThumbInner: {
    transform: [{ scale: 0.6 }],
    width: STICKER_SIZE,
    height: STICKER_SIZE,
  },
  stickerLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: typography.fontWeights.medium,
    marginTop: -spacing.sm,
  },
  stickerLabelActive: {
    color: colors.primary,
  },

  // Actions
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing['2xl'],
    paddingTop: spacing.md,
  },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.card,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  saveBtnText: {
    color: colors.white,
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
  },
  shareBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  shareBtnText: {
    color: colors.white,
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.bold,
  },
});
