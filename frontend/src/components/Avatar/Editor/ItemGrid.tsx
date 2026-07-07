import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuthStore } from '../../../store/useAuthStore';
import { useCharacterStore } from '../../../store/characterStore';
import { 
  Coins, Scissors, Zap, Wind, Minus, Circle, Cloud, Star, Box, Shirt, 
  Crown, Glasses, Play, Hexagon 
} from 'lucide-react';
import Swal from 'sweetalert2';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

interface ItemGridProps {
  category: string;
  subCategories?: string[];
  showEquipped?: boolean;
  onPreview?: (item: any) => void;
}

const getShapeIcon = (category: string, shape?: string) => {
  if (category === 'hair') {
    switch (shape) {
      case 'spiky': return <Zap size={20} />;
      case 'short_swept': return <Wind size={20} />;
      case 'long_straight': return <Minus size={20} />;
      case 'ponytail': return <Circle size={20} />;
      case 'afro': return <Cloud size={20} />;
      case 'anime_spiky': return <Star size={20} />;
      case 'mohawk': return <Zap size={20} />;
      case 'curly_bob': return <Cloud size={20} />;
      case 'cyber_hair': return <Hexagon size={20} />;
      default: return <Scissors size={20} />;
    }
  }
  if (category === 'top' || category === 'jacket' || category === 'dress') return <Shirt size={20} />;
  if (category === 'accessory') {
    if (shape?.includes('wings')) return <Wind size={20} />;
    if (shape?.includes('glasses')) return <Glasses size={20} />;
    return <Crown size={20} />;
  }
  if (category === 'emote' || category === 'animation') return <Play size={20} />;
  return <Box size={20} />;
};

const ItemGrid: React.FC<ItemGridProps> = ({ category, subCategories, showEquipped = false, onPreview }) => {
  const { token } = useAuthStore();
  const { equipped, equipItem, unequipItem } = useCharacterStore();
  const [items, setItems] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState('all');

  useEffect(() => {
    fetchData();
  }, [category]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [shopRes, invRes] = await Promise.all([
        axios.get(`${API_BASE}/api/v1/shop/items?category=${category}`),
        axios.get(`${API_BASE}/api/v1/inventory/`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      setItems(shopRes.data.items || []);
      setInventory(
        (invRes.data.inventory || []).filter((i: any) => i.category === category)
      );
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const ownedIds = new Set(inventory.map((i: any) => i.item_id));

  const handleEquipToggle = async (item: any, invItem: any) => {
    try {
      if (invItem?.is_equipped) {
        await axios.post(
          `${API_BASE}/api/v1/inventory/unequip`,
          { inventory_id: invItem.inventory_id },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        unequipItem(item.category, item.sub_category);
      } else if (invItem) {
        await axios.post(
          `${API_BASE}/api/v1/inventory/equip`,
          { inventory_id: invItem.inventory_id },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        equipItem({ ...item.render_config, name: item.name, category: item.category, sub_category: item.sub_category });
      }
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleBuy = async (item: any) => {
    const result = await Swal.fire({
      title: `ซื้อ ${item.name}?`,
      text: `ราคา ${item.price_points} points`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'ซื้อเลย!',
      cancelButtonText: 'ยกเลิก',
    });
    if (result.isConfirmed) {
      try {
        await axios.post(
          `${API_BASE}/api/v1/shop/purchase`,
          { item_id: item.item_id },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        Swal.fire('สำเร็จ!', 'ซื้อไอเทมเรียบร้อย', 'success');
        fetchData();
      } catch (e: any) {
        Swal.fire('ผิดพลาด', e.response?.data?.message || 'ซื้อไม่ได้', 'error');
      }
    }
  };

  const filteredItems = items.filter(
    (i: any) => subTab === 'all' || i.sub_category === subTab
  );

  const uniqueSubs = [...new Set(items.map((i: any) => i.sub_category))];

  const rarityColor = (r: string) => {
    switch (r) {
      case 'legendary': return 'border-yellow-400 bg-yellow-50';
      case 'epic': return 'border-purple-400 bg-purple-50';
      case 'rare': return 'border-blue-400 bg-blue-50';
      default: return 'border-gray-200 bg-white';
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sub-category filter */}
      {uniqueSubs.length > 1 && (
        <div className="flex overflow-x-auto hide-scrollbar gap-1">
          <button
            onClick={() => setSubTab('all')}
            className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition ${
              subTab === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          {uniqueSubs.map((s) => (
            <button
              key={s as string}
              onClick={() => setSubTab(s as string)}
              className={`px-3 py-1 rounded-lg text-xs font-bold capitalize whitespace-nowrap transition ${
                subTab === s ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s as string}
            </button>
          ))}
        </div>
      )}

      {/* Item grid */}
      <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
        {filteredItems.map((item: any) => {
          const owned = ownedIds.has(item.item_id);
          const invItem = inventory.find((i: any) => i.item_id === item.item_id);
          
          let isEquipped = invItem?.is_equipped;
          const itemHash = item.name + '_' + item.render_config?.shape + '_' + item.render_config?.default_color + '_' + item.render_config?.animation_id;
          
          if (!owned) {
              if (item.category === 'accessory') {
                  isEquipped = equipped.accessories?.some((a: any) => (a.name + '_' + a.shape + '_' + a.default_color + '_' + a.animation_id) === itemHash);
              } else {
                  const current = equipped[item.category as keyof typeof equipped] as any;
                  if (current && (current.name + '_' + current.shape + '_' + current.default_color + '_' + current.animation_id) === itemHash) {
                      isEquipped = true;
                  }
              }
          }
          
          const color = item.render_config?.default_color || item.thumbnail_color || '#ccc';

          return (
            <div
              key={item.item_id}
              className={`rounded-xl border-2 overflow-hidden cursor-pointer transition-all group hover:shadow-md ${
                isEquipped ? 'border-violet-500 ring-2 ring-violet-200' : rarityColor(item.rarity)
              }`}
              onClick={() => {
                if (onPreview) onPreview(item);
                if (owned) {
                    handleEquipToggle(item, invItem);
                } else {
                    if (isEquipped) {
                        unequipItem(item.category, item.sub_category);
                    } else {
                        equipItem({ ...item.render_config, name: item.name, category: item.category, sub_category: item.sub_category });
                    }
                }
              }}
            >
              {/* Thumbnail */}
              <div className="h-20 flex items-center justify-center relative bg-gray-50 group-hover:bg-gray-100 transition">
                <div
                  className="w-10 h-10 rounded-lg shadow-inner border border-black/10 transform rotate-6 group-hover:rotate-0 transition-transform flex items-center justify-center text-white mix-blend-luminosity"
                  style={{ backgroundColor: color }}
                >
                  {getShapeIcon(item.category, item.render_config?.shape)}
                </div>
                {isEquipped && (
                  <div className={`absolute top-1 left-1 ${owned ? 'bg-violet-600' : 'bg-pink-500'} text-white text-[8px] font-bold px-1.5 py-0.5 rounded`}>
                    {owned ? 'EQUIPPED' : 'PREVIEW'}
                  </div>
                )}
                <div className="absolute top-1 right-1 text-[8px] font-bold text-gray-500 uppercase">
                  {item.rarity}
                </div>
              </div>

              {/* Info */}
              <div className="p-2">
                <p className="text-xs font-bold text-gray-800 truncate">{item.name}</p>
                {!owned ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBuy(item);
                    }}
                    className="mt-1 w-full flex items-center justify-center gap-1 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded-md transition"
                  >
                    <Coins size={10} />
                    {item.price_points}
                  </button>
                ) : (
                  <p className="text-[10px] text-green-600 font-bold mt-1">
                    {isEquipped ? '✓ Tap to unequip' : 'Tap to equip'}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filteredItems.length === 0 && (
        <div className="text-center text-gray-400 py-8 text-sm">
          No items in this category
        </div>
      )}
    </div>
  );
};

export default ItemGrid;
