import { create } from 'zustand';
import * as Storage from '../utils/storage';
import { BASE_API_URL } from '../config/api.config';
import { ShareCardData, SharingTab, CardTemplateId, StickerTemplateId } from '../types/sharing.types';

interface SharingState {
  cardData: ShareCardData | null;
  isLoading: boolean;
  error: string | null;
  activeTab: SharingTab;
  selectedCard: CardTemplateId;
  selectedSticker: StickerTemplateId;

  fetchCardData: (workoutId: string) => Promise<void>;
  setActiveTab: (tab: SharingTab) => void;
  setSelectedCard: (id: CardTemplateId) => void;
  setSelectedSticker: (id: StickerTemplateId) => void;
  reset: () => void;
}

export const useSharingStore = create<SharingState>((set, get) => ({
  cardData: null,
  isLoading: false,
  error: null,
  activeTab: 'cards',
  selectedCard: 'T01',
  selectedSticker: 'S01',

  fetchCardData: async (workoutId: string) => {
    set({ isLoading: true, error: null });

    try {
      const userId = await Storage.getItemAsync('user_id');
      if (!userId) throw new Error('User not authenticated');

      const response = await fetch(
        `${BASE_API_URL}/sharing/workout/${workoutId}/card-data`,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': userId,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch card data: ${response.status}`);
      }

      const json = await response.json();
      set({ cardData: json.data, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedCard: (id) => set({ selectedCard: id }),
  setSelectedSticker: (id) => set({ selectedSticker: id }),

  reset: () =>
    set({
      cardData: null,
      isLoading: false,
      error: null,
      activeTab: 'cards',
      selectedCard: 'T01',
      selectedSticker: 'S01',
    }),
}));
