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
  Animated,
  PanResponder,
  ScrollView,
} from 'react-native';
import ViewShot, { captureRef } from 'react-native-view-shot';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import * as Clipboard from 'expo-clipboard';
import { colors, typography, spacing, borderRadius } from '../../theme';
import { useSharingStore } from '../../stores/sharingStore';
import { ShareCardData, CardTemplateId, StickerTemplateId } from '../../types/sharing.types';
import { CARD_TEMPLATES } from './components/cards';
import { STICKER_TEMPLATES } from './components/stickers';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const MODAL_HEIGHT = SCREEN_HEIGHT * 0.88;
const DISMISS_THRESHOLD = 150;
const CARDS_PER_PAGE = 2;
const CARD_THUMB_WIDTH = (SCREEN_WIDTH - 32 - 32 - 15) / 2; // modal padding 16*2 + inner padding 16*2 + gap
const CARD_THUMB_HEIGHT = CARD_THUMB_WIDTH * 2.3; // ~aspect ratio from Figma (164x379)
const STICKER_THUMB_SIZE = (SCREEN_WIDTH - 32 - 32 - 30) / 3; // 3 columns with gaps

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
  const modalSlideAnim = useRef(new Animated.Value(0)).current;
  const panY = useRef(new Animated.Value(0)).current;
  const [modalActuallyVisible, setModalActuallyVisible] = useState(false);

  // PanResponder for drag-to-dismiss
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 5,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          panY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > DISMISS_THRESHOLD) {
          handleClose();
        } else {
          Animated.spring(panY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 100,
            friction: 10,
          }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (visible && workoutId) {
      fetchCardData(workoutId);
      setModalActuallyVisible(true);
      Animated.spring(modalSlideAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    }
  }, [visible, workoutId]);

  const handleClose = useCallback(() => {
    Animated.timing(modalSlideAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setModalActuallyVisible(false);
      panY.setValue(0);
      reset();
      onClose();
    });
  }, [onClose, reset]);

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
        await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png' });
      } else {
        Alert.alert('Erro', 'Compartilhamento não disponível neste dispositivo');
      }
    } catch {
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
    } catch {
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
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      await Clipboard.setImageAsync(base64);
      Alert.alert('Copiado!', 'Sticker copiado para a área de transferência.');
    } catch {
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

  if (!visible && !modalActuallyVisible) return null;

  return (
    <Modal
      visible={modalActuallyVisible}
      transparent={true}
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      {/* Dark overlay */}
      <View style={styles.overlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={handleClose}
        />

        {/* Modal bottom sheet */}
        <Animated.View
          style={[
            styles.modalContainer,
            {
              transform: [
                {
                  translateY: Animated.add(
                    modalSlideAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [SCREEN_HEIGHT, 0],
                    }),
                    panY
                  ),
                },
              ],
            },
          ]}
        >
          <View style={styles.modalInner}>
            {/* Drag handle */}
            <View {...panResponder.panHandlers} style={styles.dragHandleArea}>
              <View style={styles.dragHandle} />
            </View>

            {/* Header row: tabs + close button */}
            <View style={styles.headerRow}>
              <View style={styles.tabsContainer}>
                <TouchableOpacity
                  style={[
                    styles.tabPill,
                    activeTab === 'stickers' && styles.tabPillActive,
                  ]}
                  onPress={() => setActiveTab('stickers')}
                >
                  <Text
                    style={[
                      styles.tabText,
                      activeTab === 'stickers' && styles.tabTextActive,
                    ]}
                  >
                    Stickers
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.tabPill,
                    activeTab === 'cards' && styles.tabPillActive,
                  ]}
                  onPress={() => setActiveTab('cards')}
                >
                  <Text
                    style={[
                      styles.tabText,
                      activeTab === 'cards' && styles.tabTextActive,
                    ]}
                  >
                    Cards
                  </Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                onPress={handleClose}
                style={styles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel="Fechar modal"
              >
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Content */}
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>Carregando dados...</Text>
              </View>
            ) : error ? (
              <View style={styles.loadingContainer}>
                <Ionicons name="alert-circle" size={40} color={colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : cardData ? (
              activeTab === 'stickers' ? (
                <StickersTab
                  data={cardData}
                  selectedSticker={selectedSticker}
                  onSelectSticker={setSelectedSticker}
                  onLongPress={handleCopySticker}
                  onSave={handleSave}
                  onShare={handleShare}
                />
              ) : (
                <CardsTab
                  data={cardData}
                  selectedCard={selectedCard}
                  onSelectCard={setSelectedCard}
                  cardPages={cardPages}
                  onSave={handleSave}
                  onShare={handleShare}
                />
              )
            ) : null}

            {/* Hidden full-size ViewShot for capture (off-screen) */}
            {cardData && (
              <View style={styles.offScreenCapture} pointerEvents="none">
                <ViewShot
                  ref={viewShotRef}
                  options={{ format: 'png', quality: 1 }}
                  style={activeTab === 'stickers' ? styles.captureSticker : styles.captureCard}
                >
                  {activeTab === 'stickers' ? (
                    <SelectedStickerComponent data={cardData} selectedSticker={selectedSticker} />
                  ) : (
                    <SelectedCardComponent data={cardData} selectedCard={selectedCard} />
                  )}
                </ViewShot>
              </View>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Hidden component resolvers for ViewShot capture ─────────
function SelectedCardComponent({ data, selectedCard }: { data: ShareCardData; selectedCard: CardTemplateId }) {
  const entry = CARD_TEMPLATES.find((c) => c.id === selectedCard) || CARD_TEMPLATES[0];
  const Component = entry.Component;
  return <Component data={data} />;
}

function SelectedStickerComponent({ data, selectedSticker }: { data: ShareCardData; selectedSticker: StickerTemplateId }) {
  const entry = STICKER_TEMPLATES.find((s) => s.id === selectedSticker) || STICKER_TEMPLATES[0];
  const Component = entry.Component;
  return <Component data={data} />;
}

// ─── Stickers Tab ─────────────────────────────────────────────
interface StickersTabProps {
  data: ShareCardData;
  selectedSticker: StickerTemplateId;
  onSelectSticker: (id: StickerTemplateId) => void;
  onLongPress: () => void;
  onSave: () => void;
  onShare: () => void;
}

function StickersTab({
  data,
  selectedSticker,
  onSelectSticker,
  onLongPress,
  onSave,
  onShare,
}: StickersTabProps) {
  return (
    <ScrollView
      style={styles.scrollContent}
      contentContainerStyle={styles.scrollContentInner}
      showsVerticalScrollIndicator={false}
      bounces={false}
      nestedScrollEnabled={true}
    >
      {/* Hint text */}
      <View style={styles.hintRow}>
        <Text style={styles.hintText}>Pressione e segure para copiar</Text>
      </View>

      {/* Stickers grid */}
      <View style={styles.stickerGrid}>
        {STICKER_TEMPLATES.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[
              styles.stickerThumb,
              selectedSticker === item.id && styles.stickerThumbActive,
            ]}
            onPress={() => onSelectSticker(item.id)}
            onLongPress={onLongPress}
            delayLongPress={500}
            accessibilityRole="button"
            accessibilityLabel={item.label}
          >
            <View style={styles.stickerThumbInner}>
              <item.Component data={data} />
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Actions */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={styles.saveButton}
          onPress={onSave}
          accessibilityRole="button"
          accessibilityLabel="Salvar no dispositivo"
        >
          <Ionicons name="save-outline" size={24} color="#0E0E1F" />
          <Text style={styles.saveButtonText}>Salvar no dispositivo</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

// ─── Cards Tab ────────────────────────────────────────────────
interface CardsTabProps {
  data: ShareCardData;
  selectedCard: CardTemplateId;
  onSelectCard: (id: CardTemplateId) => void;
  cardPages: typeof CARD_TEMPLATES[number][][];
  onSave: () => void;
  onShare: () => void;
}

function CardsTab({
  data,
  selectedCard,
  onSelectCard,
  cardPages,
  onSave,
  onShare,
}: CardsTabProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const carouselWidth = SCREEN_WIDTH - 32; // modal horizontal padding

  const handleScroll = useCallback(
    (event: any) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const page = Math.round(offsetX / carouselWidth);
      setCurrentPage(page);
    },
    [carouselWidth]
  );

  return (
    <ScrollView
      style={styles.scrollContent}
      contentContainerStyle={styles.scrollContentInner}
      showsVerticalScrollIndicator={false}
      bounces={false}
      nestedScrollEnabled={true}
    >
      {/* Cards carousel */}
      <FlatList
        data={cardPages}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, i) => `card-page-${i}`}
        onMomentumScrollEnd={handleScroll}
        scrollEnabled={true}
        nestedScrollEnabled={true}
        style={styles.carousel}
        renderItem={({ item: page }) => (
          <View style={[styles.carouselPage, { width: carouselWidth }]}>
            {page.map((entry) => (
              <TouchableOpacity
                key={entry.id}
                style={[
                  styles.cardThumb,
                  selectedCard === entry.id && styles.cardThumbActive,
                ]}
                onPress={() => onSelectCard(entry.id)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={entry.label}
              >
                <View style={styles.cardThumbContent}>
                  <entry.Component data={data} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      />

      {/* Pagination dots */}
      <View style={styles.paginationDots}>
        {cardPages.map((_, i) => (
          <View
            key={`dot-${i}`}
            style={[
              styles.dot,
              currentPage === i && styles.dotActive,
            ]}
          />
        ))}
      </View>

      {/* Share options row */}
      <View style={styles.shareOptionsRow}>
        <ShareOption
          icon="logo-instagram"
          label="Story"
          onPress={onShare}
        />
        <ShareOption
          icon="logo-whatsapp"
          label="Whatsapp"
          onPress={onShare}
        />
        <ShareOptionCustom
          iconName="message-processing"
          label="Mensagem"
          onPress={onShare}
        />
        <ShareOption
          icon="chatbubble-ellipses"
          label="Messenger"
          onPress={onShare}
        />
        <ShareOption
          icon="ellipsis-horizontal-circle"
          label="Mais"
          onPress={onShare}
        />
      </View>

      {/* Save button */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={styles.saveButton}
          onPress={onSave}
          accessibilityRole="button"
          accessibilityLabel="Salvar no dispositivo"
        >
          <Ionicons name="save-outline" size={24} color="#0E0E1F" />
          <Text style={styles.saveButtonText}>Salvar no dispositivo</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

// ─── Share Option Button ──────────────────────────────────────
function ShareOption({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.shareOption}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.shareOptionIcon}>
        <Ionicons name={icon} size={28} color="#FFFFFF" />
      </View>
      <Text style={styles.shareOptionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function ShareOptionCustom({
  iconName,
  label,
  onPress,
}: {
  iconName: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.shareOption}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.shareOptionIcon}>
        <MaterialCommunityIcons name={iconName as any} size={28} color="#FFFFFF" />
      </View>
      <Text style={styles.shareOptionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Overlay
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },

  // Modal container (bottom sheet)
  modalContainer: {
    backgroundColor: '#1C1C2E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    height: MODAL_HEIGHT,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 20,
  },
  modalInner: {
    flex: 1,
  },

  // Drag handle
  dragHandleArea: {
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: '#1C1C2E',
  },
  dragHandle: {
    width: 40,
    height: 5,
    backgroundColor: 'rgba(235, 235, 245, 0.3)',
    borderRadius: 3,
    alignSelf: 'center',
    marginTop: 4,
    marginBottom: 8,
  },

  // Header row
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#15152A',
    borderRadius: 20,
    padding: 3,
    flex: 0,
    alignSelf: 'center',
  },
  tabPill: {
    paddingHorizontal: 20,
    paddingVertical: 6,
    borderRadius: 20,
  },
  tabPillActive: {
    backgroundColor: '#0E0E1F',
    shadowColor: '#000',
    shadowOffset: { width: 1, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  tabText: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 10,
    color: 'rgba(235, 235, 245, 0.6)',
  },
  tabTextActive: {
    color: '#00D4FF',
  },
  closeBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: 'rgba(235, 235, 245, 0.6)',
    fontSize: 14,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
  },

  // Scroll content
  scrollContent: {
    flex: 1,
    paddingHorizontal: 16,
  },
  scrollContentInner: {
    paddingBottom: 20,
    flexGrow: 1,
  },

  // ─── Stickers ───────────────────────
  hintRow: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  hintText: {
    fontFamily: 'Inter',
    fontWeight: '500',
    fontSize: 11,
    color: 'rgba(235, 235, 245, 0.6)',
  },

  stickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 15,
    justifyContent: 'flex-start',
  },
  stickerThumb: {
    width: STICKER_THUMB_SIZE,
    height: STICKER_THUMB_SIZE,
    borderRadius: 15,
    backgroundColor: 'rgba(235, 235, 245, 0.1)',
    borderWidth: 0.6,
    borderColor: 'rgba(235, 235, 245, 0.6)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 1,
    elevation: 2,
  },
  stickerThumbActive: {
    borderColor: '#00D4FF',
    borderWidth: 2,
  },
  stickerThumbInner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ scale: 0.65 }],
  },

  // ─── Cards ──────────────────────────
  carousel: {
    flexGrow: 0,
  },
  carouselPage: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 15,
    paddingVertical: 14,
  },
  cardThumb: {
    width: CARD_THUMB_WIDTH,
    height: CARD_THUMB_HEIGHT,
    borderRadius: 15,
    borderWidth: 0.6,
    borderColor: 'rgba(235, 235, 245, 0.6)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 1,
    elevation: 2,
  },
  cardThumbActive: {
    borderColor: '#00D4FF',
    borderWidth: 2,
  },
  cardThumbContent: {
    flex: 1,
    transform: [{ scale: 0.42 }],
    width: 300,
    height: 400,
    alignSelf: 'center',
  },

  // Pagination
  paginationDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(235, 235, 245, 0.1)',
  },
  dotActive: {
    backgroundColor: '#00D4FF',
  },

  // Share options row
  shareOptionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 16,
  },
  shareOption: {
    alignItems: 'center',
    width: 50,
    gap: 8,
  },
  shareOptionIcon: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareOptionLabel: {
    fontFamily: 'Inter',
    fontWeight: '500',
    fontSize: 8,
    color: '#EBEBF5',
    textAlign: 'center',
  },

  // Off-screen ViewShot for capture
  offScreenCapture: {
    position: 'absolute',
    left: -9999,
    top: 0,
  },
  captureCard: {
    width: 300,
    height: 400,
    backgroundColor: 'transparent',
  },
  captureSticker: {
    width: 140,
    height: 140,
    backgroundColor: 'transparent',
  },

  // Actions
  actionsRow: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#00D4FF',
    paddingVertical: 10,
    paddingHorizontal: 40,
    borderRadius: 20,
    shadowColor: '#00D4FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 6,
  },
  saveButtonText: {
    fontFamily: 'Inter',
    fontWeight: '600',
    fontSize: 14,
    color: '#0E0E1F',
  },
});
