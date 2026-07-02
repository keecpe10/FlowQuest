import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import { useCharacterStore } from '../store/characterStore';
import Swal from 'sweetalert2';
import { Archive, CheckCircle, Circle, Search } from 'lucide-react';
import CharacterCanvas from '../components/Character/CharacterCanvas';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';

const Inventory: React.FC = () => {
  const { token } = useAuthStore();
  const { config, equipped, loadFromServer, equipItem, unequipItem } = useCharacterStore();
  
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');

  useEffect(() => {
    if (token) {
      loadFromServer(token);
    }
  }, [token]);

  useEffect(() => {
    if (token) fetchInventory();
  }, [token, category, search, sort]);

  const fetchInventory = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/v1/inventory/`, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          category: category !== 'all' ? category : undefined,
          search: search || undefined,
          sort: sort
        }
      });
      setItems(res.data.inventory);
    } catch (error) {
      console.error(error);
    }
    setLoading(false);
  };

  const handleEquip = async (invItem: any) => {
    try {
      if (invItem.is_equipped) {
        await axios.post(`${API_BASE}/api/v1/inventory/unequip`, 
          { inventory_id: invItem.inventory_id },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        unequipItem(invItem.category, invItem.sub_category);
      } else {
        await axios.post(`${API_BASE}/api/v1/inventory/equip`, 
          { inventory_id: invItem.inventory_id },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        const itemForStore = {
          category: invItem.category,
          sub_category: invItem.sub_category,
          ...invItem.render_config,
          item_id: invItem.item_id
        };
        equipItem(itemForStore);
      }
      fetchInventory(); // Refresh to update equipped status
    } catch (error) {
      console.error(error);
      Swal.fire('Error', 'Failed to change equipment', 'error');
    }
  };

  const categories = ['all', 'hair', 'top', 'bottom', 'shoes', 'accessory', 'emote', 'animation', 'dress', 'jacket', 'cape'];

  const renderThumbnail = (item: any) => {
    const color = item.thumbnail_color || item.render_config?.default_color || '#cccccc';
    return (
      <div className="w-full h-full bg-gray-50 flex items-center justify-center relative overflow-hidden group-hover:bg-gray-100 transition rounded-lg">
        <div style={{ backgroundColor: color }} className="w-12 h-12 rounded-xl shadow-inner border border-black/10 transform rotate-12 group-hover:rotate-0 transition-transform"></div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-20 px-6 pb-12">
      <div className="max-w-7xl mx-auto">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div className="flex items-center">
            <Archive className="mr-3 text-violet-600" size={40} />
            <div>
              <h1 className="text-4xl font-extrabold text-gray-900">My Wardrobe</h1>
              <p className="text-gray-500 mt-2">Manage your items and customize your look.</p>
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
                onClick={() => setCategory(c)}
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
                placeholder="Search inventory..."
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
              <option value="newest">Recent</option>
              <option value="name">Name</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          
          {/* Character Preview Panel */}
          <div className="w-full lg:w-1/3 xl:w-1/4 relative">
            <div className="sticky top-24 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden h-[500px] flex flex-col">
              <div className="p-4 bg-gradient-to-br from-violet-600 to-indigo-600 text-white flex justify-between items-center">
                <h3 className="font-bold">Current Look</h3>
                <a href="/character-creator" className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full transition font-bold">Edit Avatar</a>
              </div>
              <div className="flex-1 w-full bg-gradient-to-b from-gray-50 to-gray-200 relative">
                <CharacterCanvas config={config} equipped={equipped} />
              </div>
              <div className="p-3 bg-gray-50 border-t border-gray-100">
                <p className="text-center text-xs text-gray-500 font-semibold">
                  Tap items to equip/unequip
                </p>
              </div>
            </div>
          </div>

          {/* Inventory Grid */}
          <div className="w-full lg:w-2/3 xl:w-3/4">
            {loading ? (
              <div className="flex justify-center py-20">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600"></div>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {items.map(item => (
                  <div 
                    key={item.inventory_id} 
                    onClick={() => handleEquip(item)}
                    className={`bg-white rounded-xl p-3 cursor-pointer transition-all border-2 relative group flex flex-col ${
                      item.is_equipped ? 'border-violet-500 shadow-md ring-2 ring-violet-200' : 'border-gray-200 hover:border-violet-300 hover:shadow-md'
                    }`}
                  >
                    <div className="absolute top-2 right-2 z-10">
                      {item.is_equipped ? (
                        <CheckCircle className="text-violet-600 bg-white rounded-full" size={20} />
                      ) : (
                        <Circle className="text-gray-300 opacity-0 group-hover:opacity-100 transition" size={20} />
                      )}
                    </div>
                    
                    <div className="h-24 mb-2">
                       {renderThumbnail(item)}
                    </div>
                    
                    <div className="flex-1 flex flex-col">
                      <h3 className="font-bold text-gray-800 text-sm truncate" title={item.name}>{item.name}</h3>
                      <p className="text-[10px] text-gray-500 capitalize">{item.sub_category}</p>
                    </div>
                  </div>
                ))}
                
                {items.length === 0 && (
                  <div className="col-span-full py-20 text-center text-gray-500 bg-white rounded-xl border border-gray-200 border-dashed">
                    You don't have any items in this category yet. Visit the <a href="/shop" className="text-violet-600 font-bold hover:underline">Shop</a>!
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Inventory;
