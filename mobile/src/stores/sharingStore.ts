import { create } from 'zustand';
import * as Storage from '../utils/storage';
import { BASE_API_URL } from '../config/api.config';
import { ShareCardData, CardTemplateId } from '../types/sharing.types';

interface SharingState {
  cardData: ShareCardData | null;
  isLoading: boolean;
  error: string | null;
  selectedCard: CardTemplateId;

  fetchCardData: (workoutId: string) => Promise<void>;
  setSelectedCard: (id: CardTemplateId) => void;
  reset: () => void;
}

export const useSharingStore = create<SharingState>((set) => ({
  cardData: null,
  isLoading: false,
  error: null,
  selectedCard: 'compact',

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

  setSelectedCard: (id) => set({ selectedCard: id }),

  reset: () =>
    set({
      cardData: null,
      isLoading: false,
      error: null,
      selectedCard: 'compact',
    }),
}));
