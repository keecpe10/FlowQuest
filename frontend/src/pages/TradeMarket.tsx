import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import { useCharacterStore } from '../store/characterStore';
import Swal from 'sweetalert2';
import { ArrowRightLeft, Search, Coins, ArrowUpRight } from 'lucide-react';
import CharacterCanvas from '../components/Character/CharacterCanvas';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const TradeMarket: React.FC = () => {
  const { token, user } = useAuthStore();
  const { config, equipped, loadFromServer } = useCharacterStore();
  
  const [listings, setListings] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showListingModal, setShowListingModal] = useState(false);
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<any>(null);
  const [listPrice, setListPrice] = useState(0);

  useEffect(() => {
    if (token) {
      loadFromServer(token);
      fetchMarket();
      fetchInventory();
    }
  }, [token]);

  const fetchMarket = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/v1/trade/market`);
      setListings(res.data.listings);
    } catch (error) {
      console.error(error);
    }
    setLoading(false);
  };

  const fetchInventory = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/v1/inventory/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setInventory(res.data.inventory.filter((item: any) => !item.is_equipped));
    } catch (error) {
      console.error(error);
    }
  };

  const handleBuy = async (listing: any) => {
    if (listing.seller_id === user?.user_id) {
      Swal.fire('Notice', 'You cannot buy your own listing.', 'info');
      return;
    }

    const result = await Swal.fire({
      title: 'Confirm Purchase',
      text: `Buy ${listing.item_name} from ${listing.seller_name} for ${listing.price_points} points?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, Buy!'
    });

    if (result.isConfirmed) {
      try {
        await axios.post(`${API_BASE}/api/v1/trade/buy`, 
          { trade_id: listing.trade_id },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        Swal.fire('Success', 'Item purchased successfully!', 'success');
        fetchMarket();
        fetchInventory();
      } catch (error: any) {
        Swal.fire('Error', error.response?.data?.message || 'Purchase failed', 'error');
      }
    }
  };

  const handleListSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInventoryItem) return;

    try {
      await axios.post(`${API_BASE}/api/v1/trade/list`, 
        { 
          inventory_id: selectedInventoryItem.inventory_id,
          price_points: listPrice
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      Swal.fire('Success', 'Item listed on the market!', 'success');
      setShowListingModal(false);
      setSelectedInventoryItem(null);
      setListPrice(0);
      fetchMarket();
      fetchInventory();
    } catch (error: any) {
      Swal.fire('Error', error.response?.data?.message || 'Failed to list item', 'error');
    }
  };

  const filteredListings = listings.filter(l => l.item_name.toLowerCase().includes(search.toLowerCase()));

  const renderThumbnail = (item: any) => {
    const color = item.thumbnail_color || item.preview_config?.default_color || '#cccccc';
    return (
      <div className="w-full h-full bg-gray-50 flex items-center justify-center relative overflow-hidden group-hover:bg-gray-100 transition rounded-lg">
        <div style={{ backgroundColor: color }} className="w-12 h-12 rounded-xl shadow-inner border border-black/10 transform rotate-12 group-hover:rotate-0 transition-transform"></div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-20 px-6 pb-12 relative">
      <div className="max-w-7xl mx-auto">
        
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-extrabold text-gray-900 flex items-center">
              <ArrowRightLeft className="mr-3 text-emerald-600" size={40} />
              Trading Market
            </h1>
            <p className="text-gray-500 mt-2">Buy and sell items with other players.</p>
          </div>
          
          <button 
            onClick={() => setShowListingModal(true)}
            className="mt-4 md:mt-0 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-full font-bold shadow-lg flex items-center transition"
          >
            <ArrowUpRight className="mr-2" />
            Sell an Item
          </button>
        </div>

        {/* Search */}
        <div className="mb-8 relative">
          <input 
            type="text" 
            placeholder="Search market for items..." 
            className="w-full bg-white border border-gray-200 rounded-2xl py-4 pl-12 pr-4 shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition outline-none"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <Search className="absolute left-4 top-4 text-gray-400" size={24} />
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredListings.map(listing => (
              <div key={listing.trade_id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 hover:shadow-xl transition-all group relative">
                
                {listing.seller_id === user?.user_id && (
                  <div className="absolute top-2 left-2 z-10 bg-black/50 text-white text-xs px-2 py-1 rounded backdrop-blur font-bold">
                    YOURS
                  </div>
                )}
                
                <div className="bg-gray-100 rounded-xl mb-4 h-40 flex items-center justify-center overflow-hidden">
                   <CharacterCanvas 
                      config={config} 
                      equipped={{...equipped, [listing.category === 'accessory' ? 'accessories' : listing.category]: listing.category === 'accessory' ? [listing.preview_config] : listing.preview_config}}
                    />
                </div>
                
                <h3 className="font-bold text-gray-800 text-lg truncate">{listing.item_name}</h3>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full overflow-hidden bg-gray-200 border border-gray-300 flex-shrink-0 flex items-center justify-center">
                    {listing.seller_avatar ? (
                      <img src={listing.seller_avatar} alt="" className="w-full h-full object-cover scale-150" style={{ objectPosition: 'center 20%' }} />
                    ) : (
                      <span className="text-[10px] text-gray-400">👤</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 truncate">Seller: <span className="font-semibold text-gray-700">{listing.seller_name}</span></p>
                </div>
                
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div className="flex items-center text-yellow-600 font-bold">
                    <Coins size={16} className="mr-1" />
                    {listing.price_points}
                  </div>
                  <button
                    onClick={() => handleBuy(listing)}
                    disabled={listing.seller_id === user?.user_id}
                    className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${
                      listing.seller_id === user?.user_id 
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-emerald-100 hover:bg-emerald-600 hover:text-white text-emerald-700'
                    }`}
                  >
                    Buy
                  </button>
                </div>
              </div>
            ))}
            
            {filteredListings.length === 0 && (
              <div className="col-span-full py-20 text-center text-gray-500 bg-white rounded-xl border border-gray-200 border-dashed">
                No items found on the market.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Listing Modal */}
      {showListingModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h2 className="text-2xl font-bold text-gray-800">List an Item</h2>
              <button onClick={() => setShowListingModal(false)} className="text-gray-400 hover:text-gray-600 p-2">✕</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 flex flex-col md:flex-row gap-6">
              <div className="w-full md:w-1/2">
                <h3 className="font-semibold mb-4 text-gray-700">Select Item (Unequipped)</h3>
                <div className="grid grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-2">
                  {inventory.map(item => (
                    <div 
                      key={item.inventory_id}
                      onClick={() => setSelectedInventoryItem(item)}
                      className={`border-2 rounded-xl p-2 cursor-pointer transition ${
                        selectedInventoryItem?.inventory_id === item.inventory_id 
                          ? 'border-emerald-500 bg-emerald-50' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="h-20 bg-gray-100 rounded-lg mb-2">
                        {renderThumbnail(item)}
                      </div>
                      <p className="text-xs font-bold text-gray-800 truncate">{item.name}</p>
                    </div>
                  ))}
                  {inventory.length === 0 && (
                    <div className="col-span-2 text-sm text-gray-500 text-center py-4">No unequipped items available to list.</div>
                  )}
                </div>
              </div>
              
              <div className="w-full md:w-1/2 flex flex-col">
                <form onSubmit={handleListSubmit} className="flex-1 flex flex-col">
                  {selectedInventoryItem ? (
                    <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-100">
                      <p className="font-bold text-gray-800 mb-1">{selectedInventoryItem.name}</p>
                      <p className="text-sm text-gray-500 capitalize">{selectedInventoryItem.category}</p>
                    </div>
                  ) : (
                    <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-100 text-gray-400 text-center flex items-center justify-center h-20">
                      Select an item first
                    </div>
                  )}
                  
                  <div className="mb-6">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Price (Points)</label>
                    <div className="relative">
                      <input 
                        type="number"
                        min="0"
                        required
                        className="w-full bg-white border border-gray-300 rounded-xl py-3 pl-12 pr-4 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition outline-none"
                        value={listPrice}
                        onChange={e => setListPrice(Number(e.target.value))}
                      />
                      <Coins className="absolute left-4 top-3 text-yellow-500" size={20} />
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Note: A 5% tax will be deducted upon sale.</p>
                  </div>
                  
                  <div className="mt-auto flex justify-end gap-3">
                    <button 
                      type="button" 
                      onClick={() => setShowListingModal(false)}
                      className="px-6 py-2 rounded-xl text-gray-600 font-medium hover:bg-gray-100 transition"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      disabled={!selectedInventoryItem}
                      className="px-6 py-2 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                    >
                      List Item
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TradeMarket;
