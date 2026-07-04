import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import { useCharacterStore } from '../store/characterStore';
import Swal from 'sweetalert2';
import { ShoppingBag, Coins, Search, Filter, Shirt, Scissors, Smile, Activity, Star } from 'lucide-react';
import CharacterCanvas from '../components/Character/CharacterCanvas';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const Shop: React.FC = () => {
  const { token } = useAuthStore();
  const { config, equipped, loadFromServer } = useCharacterStore();
  
  const [items, setItems] = useState<any[]>([]);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [loading, setLoading] = useState(true);
  const [points, setPoints] = useState(0);
  const [previewItem, setPreviewItem] = useState<any>(null);

  useEffect(() => {
    if (token) {
      loadFromServer(token);
      fetchPoints();
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchItems();
    }
  }, [token, category, search, sort]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/v1/shop/items`, {
        params: {
          category: category !== 'all' ? category : undefined,
          search: search || undefined,
          sort: sort
        }
      });
      setItems(res.data.items);
    } catch (error) {
      console.error(error);
    }
    setLoading(false);
  };

  const fetchPoints = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/v1/users/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPoints(res.data.user.points);
    } catch (error) {
      console.error(error);
    }
  };

  const handlePurchase = async (item: any) => {
    const result = await Swal.fire({
      title: 'ยืนยันการสั่งซื้อ',
      text: `คุณต้องการซื้อ ${item.name} ในราคา ${item.price_points} แต้ม ใช่หรือไม่?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#8b5cf6',
      cancelButtonColor: '#ef4444',
      confirmButtonText: 'ใช่, ซื้อเลย!',
      cancelButtonText: 'ยกเลิก'
    });

    if (result.isConfirmed) {
      try {
        const res = await axios.post(`${API_BASE}/api/v1/shop/purchase`, 
          { item_id: item.item_id },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setPoints(res.data.new_balance);
        Swal.fire('สำเร็จ!', 'ซื้อไอเทมเรียบร้อยแล้ว', 'success');
      } catch (error: any) {
        Swal.fire('เกิดข้อผิดพลาด', error.response?.data?.message || 'การสั่งซื้อล้มเหลว', 'error');
      }
    }
  };

  const categories = ['all', 'hair', 'top', 'bottom', 'shoes', 'accessory', 'emote', 'animation', 'dress', 'jacket', 'cape'];

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'hair': return <Scissors size={32} className="text-gray-400" />;
      case 'top': case 'dress': case 'jacket': return <Shirt size={32} className="text-gray-400" />;
      case 'emote': return <Smile size={32} className="text-gray-400" />;
      case 'animation': return <Activity size={32} className="text-gray-400" />;
      default: return <Star size={32} className="text-gray-400" />;
    }
  };

  const renderThumbnail = (item: any) => {
    if (item.image_url) {
      return (
        <div className="w-full h-full bg-gray-50 flex items-center justify-center relative overflow-hidden group-hover:bg-gray-100 transition">
          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
          <div className="absolute top-2 right-2 bg-white/90 backdrop-blur px-1.5 py-0.5 rounded text-[10px] font-bold shadow-sm uppercase z-10 text-gray-600">
            {item.rarity}
          </div>
        </div>
      );
    }

    const color = item.thumbnail_color || item.render_config?.default_color || '#cccccc';
    return (
      <div className="w-full h-full bg-gray-50 flex items-center justify-center relative overflow-hidden group-hover:bg-gray-100 transition">
        <div style={{ backgroundColor: color }} className="absolute inset-0 opacity-20"></div>
        <div className="z-10 bg-white p-3 rounded-full shadow-sm group-hover:scale-110 transition-transform">
          {getCategoryIcon(item.category)}
        </div>
        <div className="absolute top-2 right-2 bg-white/90 backdrop-blur px-1.5 py-0.5 rounded text-[10px] font-bold shadow-sm uppercase z-10 text-gray-600">
          {item.rarity}
        </div>
      </div>
    );
  };

  // Merge equipped with preview
  const getPreviewEquipped = () => {
    let current = { ...equipped };
    if (previewItem) {
      const renderConfig = previewItem.render_config || {};
      if (previewItem.category === 'accessory') {
        current.accessories = [...(current.accessories || []), renderConfig];
      } else {
        current[previewItem.category as keyof typeof current] = renderConfig;
      }
    }
    return current;
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-20 px-6 pb-12">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-4xl font-extrabold text-gray-900 flex items-center">
              <ShoppingBag className="mr-3 text-violet-600" size={40} />
              Avatar Shop
            </h1>
            <p className="text-gray-500 mt-2">Spend your hard-earned points on new outfits and styles!</p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-md flex items-center border border-gray-100 self-start md:self-auto">
            <Coins className="text-yellow-500 mr-2" size={28} />
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase">แต้มคงเหลือ</p>
              <p className="text-2xl font-bold text-gray-800">{points} แต้ม</p>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col md:flex-row gap-4 mb-6 items-center">
          {/* Categories Tab Bar */}
          <div className="flex overflow-x-auto hide-scrollbar bg-white p-1 rounded-xl shadow-sm border border-gray-200 gap-1 flex-1 w-full md:w-auto">
             {categories.map(c => (
              <button
                key={c}
                onClick={() => {
                  setCategory(c);
                  setPreviewItem(null);
                }}
                className={`px-4 py-2 rounded-lg font-bold text-sm transition capitalize whitespace-nowrap ${
                  category === c ? 'bg-violet-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="flex gap-2 w-full md:w-auto">
            {/* Search */}
            <div className="relative flex-1 md:w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input 
                type="text" 
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none text-sm"
              />
            </div>
            
            {/* Sort */}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:ring-2 focus:ring-violet-500 outline-none"
            >
              <option value="newest">Newest</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="name">Name</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          
          {/* Shop Items Grid (Left side) */}
          <div className="w-full lg:w-2/3 xl:w-3/4">
            {loading ? (
              <div className="flex justify-center py-20">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600"></div>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
                {items.map(item => (
                  <div 
                    key={item.item_id} 
                    className={`bg-white rounded-xl shadow-sm border-2 hover:shadow-md transition cursor-pointer flex flex-col group overflow-hidden ${
                      previewItem?.item_id === item.item_id ? 'border-violet-500 ring-2 ring-violet-200' : 'border-gray-200 hover:border-violet-300'
                    }`}
                    onClick={() => setPreviewItem(item)}
                  >
                    <div className="h-24">
                      {renderThumbnail(item)}
                    </div>
                    
                    <div className="p-3 flex flex-col flex-1">
                      <h3 className="text-sm font-bold text-gray-800 capitalize truncate" title={item.name}>{item.name}</h3>
                      <p className="text-[10px] text-gray-500 capitalize mb-2">{item.sub_category}</p>
                      
                      <div className="flex items-center justify-between mt-auto">
                        <div className="flex items-center text-gray-700 font-bold text-xs">
                          <Coins size={12} className="mr-1 text-yellow-500" />
                          {item.price_points}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                
                {items.length === 0 && (
                  <div className="col-span-full py-20 text-center text-gray-500 bg-white rounded-xl border border-gray-200 border-dashed">
                    No items found.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3D Preview (Right side) */}
          <div className="w-full lg:w-1/3 xl:w-1/4 relative">
             <div className="sticky top-24 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden flex flex-col h-[500px]">
                <div className="p-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                  <h3 className="font-bold text-gray-800">ตัวอย่าง (ทดลองสวมใส่)</h3>
                </div>
                
                <div className="flex-1 bg-gradient-to-b from-gray-50 to-gray-200 relative">
                  <CharacterCanvas 
                    config={config} 
                    equipped={getPreviewEquipped()}
                  />
                </div>

                {previewItem && (
                  <div className="p-4 bg-white border-t border-gray-100">
                    <h4 className="font-bold text-gray-900 mb-1">{previewItem.name}</h4>
                    <div className="flex justify-between items-center mb-4">
                       <span className="text-sm text-gray-500 capitalize">{previewItem.sub_category}</span>
                       <div className="flex items-center text-yellow-600 font-bold">
                          <Coins size={16} className="mr-1" />
                          {previewItem.price_points}
                        </div>
                    </div>
                    <button
                      onClick={() => handlePurchase(previewItem)}
                      disabled={points < previewItem.price_points}
                      className={`w-full py-3 rounded-xl font-bold transition flex items-center justify-center ${
                        points >= previewItem.price_points 
                          ? 'bg-violet-600 hover:bg-violet-700 text-white shadow-md hover:scale-105' 
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {points >= previewItem.price_points ? 'ซื้อไอเทม' : 'แต้มไม่พอ'}
                    </button>
                  </div>
                )}
                {!previewItem && (
                  <div className="p-4 bg-white border-t border-gray-100 text-center text-gray-500 text-sm">
                    คลิกที่ไอเทมเพื่อทดลองสวมใส่
                  </div>
                )}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Shop;
