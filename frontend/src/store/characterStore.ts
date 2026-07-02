import { create } from 'zustand';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';

// ─── Types ───────────────────────────────────────────────

export interface BodyScale {
  height: number;     // 0-100
  width: number;      // 0-100
  headScale: number;  // 0-100
  bodyType: number;   // 0-100
  proportion: number; // 0-100
}

export interface CharacterConfig {
  gender: string;
  skinColor: string;
  headShape: string;
  eyeType: string;
  eyeColor: string;
  mouthType: string;
  eyebrowType: string;
  noseType: string;
  beardType: string;
  makeupType: string;
  expression: string;
  hairColor: string;
  bodyScale: BodyScale;
  body_config: any;
}

export interface Outfit {
  outfit_id: number;
  name: string;
  outfit_data: any;
  is_favorite: boolean;
  thumbnail_data: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface EquippedItems {
  hair: any;
  top: any;
  bottom: any;
  shoes: any;
  dress: any;
  jacket: any;
  cape: any;
  accessories: any[];
  emote: any;
  animation: any;
}

interface CharacterStore {
  config: CharacterConfig;
  equipped: EquippedItems;
  isLoading: boolean;

  // Animation & Emote
  currentAnimation: string;
  currentEmote: string | null;

  // Outfits
  outfits: Outfit[];

  // Config
  updateConfig: (key: keyof CharacterConfig, value: any) => void;
  updateBodyScale: (key: keyof BodyScale, value: number) => void;
  loadFromServer: (token: string) => Promise<void>;
  saveToServer: (token: string, thumbnailData?: string) => Promise<void>;

  // Equip
  equipItem: (item: any) => void;
  unequipItem: (category: string, subCategory?: string) => void;

  // Animation
  setAnimation: (anim: string) => void;
  setEmote: (emote: string | null) => void;

  // Outfits
  loadOutfits: (token: string) => Promise<void>;
  saveOutfit: (name: string, token: string, thumbnailData?: string) => Promise<void>;
  deleteOutfit: (outfitId: number, token: string) => Promise<void>;
  applyOutfit: (outfitId: number, token: string) => Promise<void>;
  duplicateOutfit: (outfitId: number, token: string) => Promise<void>;
  toggleOutfitFavorite: (outfitId: number, token: string) => Promise<void>;
}

// ─── Defaults ────────────────────────────────────────────

const defaultBodyScale: BodyScale = {
  height: 50,
  width: 50,
  headScale: 50,
  bodyType: 50,
  proportion: 50,
};

const defaultConfig: CharacterConfig = {
  gender: 'unspecified',
  skinColor: '#FFD3B6',
  headShape: 'round',
  eyeType: 'normal',
  eyeColor: '#000000',
  mouthType: 'smile',
  eyebrowType: 'normal',
  noseType: 'normal',
  beardType: 'none',
  makeupType: 'none',
  expression: 'neutral',
  hairColor: '#4A4A4A',
  bodyScale: defaultBodyScale,
  body_config: {},
};

const defaultEquipped: EquippedItems = {
  hair: null,
  top: null,
  bottom: null,
  shoes: null,
  dress: null,
  jacket: null,
  cape: null,
  accessories: [],
  emote: null,
  animation: null,
};

// ─── Store ───────────────────────────────────────────────

export const useCharacterStore = create<CharacterStore>((set, get) => ({
  config: defaultConfig,
  equipped: defaultEquipped,
  isLoading: false,
  currentAnimation: 'idle',
  currentEmote: null,
  outfits: [],

  // ── Config ──

  updateConfig: (key, value) => {
    set((state) => ({
      config: { ...state.config, [key]: value },
    }));
  },

  updateBodyScale: (key, value) => {
    set((state) => ({
      config: {
        ...state.config,
        bodyScale: { ...state.config.bodyScale, [key]: value },
      },
    }));
  },

  // ── Equip ──

  equipItem: (item) => {
    set((state) => {
      const category = item.category;
      if (category === 'accessory') {
        const newAccessories = state.equipped.accessories.filter(
          (a) => a.sub_category !== item.sub_category
        );
        newAccessories.push(item);
        return { equipped: { ...state.equipped, accessories: newAccessories } };
      } else {
        return { equipped: { ...state.equipped, [category]: item } };
      }
    });
  },

  unequipItem: (category, subCategory) => {
    set((state) => {
      if (category === 'accessory') {
        return {
          equipped: {
            ...state.equipped,
            accessories: state.equipped.accessories.filter(
              (a) => a.sub_category !== subCategory
            ),
          },
        };
      } else {
        return { equipped: { ...state.equipped, [category]: null } };
      }
    });
  },

  // ── Animation ──

  setAnimation: (anim) => set({ currentAnimation: anim }),
  setEmote: (emote) => set({ currentEmote: emote }),

  // ── Server Sync ──

  loadFromServer: async (token) => {
    set({ isLoading: true });
    try {
      const response = await axios.get(`${API_BASE}/api/v1/character/`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const { config, equipped } = response.data;
      set({
        config: {
          gender: config.gender || 'unspecified',
          skinColor: config.skin_color,
          headShape: config.head_shape,
          eyeType: config.eye_type,
          eyeColor: config.eye_color,
          mouthType: config.mouth_type,
          eyebrowType: config.eyebrow_type,
          noseType: config.nose_type || 'normal',
          beardType: config.beard_type || 'none',
          makeupType: config.makeup_type || 'none',
          expression: config.expression || 'neutral',
          hairColor: config.hair_color,
          bodyScale: {
            height: config.body_height ?? 50,
            width: config.body_width ?? 50,
            headScale: config.head_scale ?? 50,
            bodyType: config.body_type ?? 50,
            proportion: config.proportion ?? 50,
          },
          body_config: config.body_config || {},
        },
        equipped: {
          hair: equipped?.hair || null,
          top: equipped?.top || null,
          bottom: equipped?.bottom || null,
          shoes: equipped?.shoes || null,
          dress: equipped?.dress || null,
          jacket: equipped?.jacket || null,
          cape: equipped?.cape || null,
          accessories: equipped?.accessories || [],
          emote: equipped?.emote || null,
          animation: equipped?.animation || null,
        },
        isLoading: false,
      });
    } catch (error) {
      console.error('Error loading character:', error);
      set({ isLoading: false });
    }
  },

  saveToServer: async (token, thumbnailData?: string) => {
    const { config } = get();
    try {
      await axios.put(
        `${API_BASE}/api/v1/character/`,
        {
          gender: config.gender,
          skin_color: config.skinColor,
          head_shape: config.headShape,
          eye_type: config.eyeType,
          eye_color: config.eyeColor,
          mouth_type: config.mouthType,
          eyebrow_type: config.eyebrowType,
          nose_type: config.noseType,
          beard_type: config.beardType,
          makeup_type: config.makeupType,
          expression: config.expression,
          hair_color: config.hairColor,
          body_height: config.bodyScale.height,
          body_width: config.bodyScale.width,
          head_scale: config.bodyScale.headScale,
          body_type: config.bodyScale.bodyType,
          proportion: config.bodyScale.proportion,
          body_config: config.body_config,
          avatar_url: thumbnailData,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Update local auth store user avatar if it exists
      const savedUserStr = localStorage.getItem('user');
      if (savedUserStr && thumbnailData) {
        try {
          const savedUser = JSON.parse(savedUserStr);
          savedUser.avatar_url = thumbnailData;
          localStorage.setItem('user', JSON.stringify(savedUser));
        } catch (e) {}
      }
    } catch (error) {
      console.error('Error saving character:', error);
    }
  },

  // ── Outfits ──

  loadOutfits: async (token) => {
    try {
      const res = await axios.get(`${API_BASE}/api/v1/outfits/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      set({ outfits: res.data.outfits });
    } catch (error) {
      console.error('Error loading outfits:', error);
    }
  },

  saveOutfit: async (name, token, thumbnailData) => {
    try {
      await axios.post(
        `${API_BASE}/api/v1/outfits/`,
        { name, thumbnail_data: thumbnailData },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      get().loadOutfits(token);
    } catch (error) {
      console.error('Error saving outfit:', error);
    }
  },

  deleteOutfit: async (outfitId, token) => {
    try {
      await axios.delete(`${API_BASE}/api/v1/outfits/${outfitId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      set((state) => ({
        outfits: state.outfits.filter((o) => o.outfit_id !== outfitId),
      }));
    } catch (error) {
      console.error('Error deleting outfit:', error);
    }
  },

  applyOutfit: async (outfitId, token) => {
    try {
      await axios.post(
        `${API_BASE}/api/v1/outfits/${outfitId}/apply`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Reload character to reflect changes
      get().loadFromServer(token);
    } catch (error) {
      console.error('Error applying outfit:', error);
    }
  },

  duplicateOutfit: async (outfitId, token) => {
    try {
      await axios.post(
        `${API_BASE}/api/v1/outfits/${outfitId}/duplicate`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      get().loadOutfits(token);
    } catch (error) {
      console.error('Error duplicating outfit:', error);
    }
  },

  toggleOutfitFavorite: async (outfitId, token) => {
    try {
      const res = await axios.put(
        `${API_BASE}/api/v1/outfits/${outfitId}/favorite`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      set((state) => ({
        outfits: state.outfits.map((o) =>
          o.outfit_id === outfitId
            ? { ...o, is_favorite: res.data.is_favorite }
            : o
        ),
      }));
    } catch (error) {
      console.error('Error toggling outfit favorite:', error);
    }
  },
}));
