import React, { useEffect, useState } from 'react';
import { useCharacterStore } from '../../../store/characterStore';
import { useAuthStore } from '../../../store/useAuthStore';
import { Save, Trash2, Copy, Star, Play } from 'lucide-react';
import Swal from 'sweetalert2';

const OutfitPanel: React.FC = () => {
  const { token } = useAuthStore();
  const {
    outfits, loadOutfits, saveOutfit, deleteOutfit,
    applyOutfit, duplicateOutfit, toggleOutfitFavorite,
  } = useCharacterStore();
  const [newName, setNewName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (token) loadOutfits(token);
  }, [token]);

  const handleSave = async () => {
    const name = newName.trim() || `Outfit ${outfits.length + 1}`;
    if (token) {
      setIsSaving(true);
      // Capture canvas thumbnail
      let thumbnailData = '';
      const canvas = document.querySelector('canvas');
      if (canvas) {
        thumbnailData = canvas.toDataURL('image/jpeg', 0.5);
      }
      
      await saveOutfit(name, token, thumbnailData);
      setNewName('');
      setIsSaving(false);
      Swal.fire('สำเร็จ!', `บันทึกชุด "${name}" เรียบร้อย`, 'success');
    }
  };

  const handleDelete = async (id: number, name: string) => {
    const result = await Swal.fire({
      title: `ลบชุด "${name}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'ลบเลย',
      cancelButtonText: 'ยกเลิก',
    });
    if (result.isConfirmed && token) {
      await deleteOutfit(id, token);
    }
  };

  const handleApply = async (id: number) => {
    if (token) {
      await applyOutfit(id, token);
      Swal.fire('สำเร็จ!', 'ใส่ชุดเรียบร้อย', 'success');
    }
  };

  return (
    <div className="space-y-5">
      <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Outfits</h3>

      {/* Save new outfit */}
      <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-violet-700 mb-2">Save Current Look</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Outfit name..."
            className="flex-1 text-sm border border-violet-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-violet-400 focus:border-violet-400 outline-none bg-white"
          />
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg transition flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={14} />
            <span className="text-xs font-bold">{isSaving ? 'Saving...' : 'Save'}</span>
          </button>
        </div>
      </div>

      {/* Outfit list */}
      <div className="space-y-3">
        {outfits.length === 0 ? (
          <div className="text-center text-gray-400 py-8 text-sm">
            No saved outfits yet. Save your current look above!
          </div>
        ) : (
          outfits.map((outfit) => (
            <div
              key={outfit.outfit_id}
              className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3 hover:shadow-md transition"
            >
              {/* Thumbnail */}
              <div className="w-12 h-12 bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg flex-shrink-0 flex items-center justify-center text-gray-400 overflow-hidden relative">
                {outfit.thumbnail_data ? (
                  <img src={outfit.thumbnail_data} alt="" className="w-full h-full object-cover scale-150" style={{ objectPosition: 'center top' }} />
                ) : (
                  '👤'
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-800 truncate">{outfit.name}</p>
                <p className="text-[10px] text-gray-400">
                  {outfit.updated_at ? new Date(outfit.updated_at).toLocaleDateString() : ''}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => handleApply(outfit.outfit_id)}
                  className="p-2 text-violet-600 hover:bg-violet-50 rounded-lg transition"
                  title="Apply"
                >
                  <Play size={14} />
                </button>
                <button
                  onClick={() => token && toggleOutfitFavorite(outfit.outfit_id, token)}
                  className={`p-2 rounded-lg transition ${
                    outfit.is_favorite ? 'text-yellow-500 bg-yellow-50' : 'text-gray-400 hover:bg-gray-50'
                  }`}
                  title="Favorite"
                >
                  <Star size={14} fill={outfit.is_favorite ? 'currentColor' : 'none'} />
                </button>
                <button
                  onClick={() => token && duplicateOutfit(outfit.outfit_id, token)}
                  className="p-2 text-gray-400 hover:bg-gray-50 rounded-lg transition"
                  title="Duplicate"
                >
                  <Copy size={14} />
                </button>
                <button
                  onClick={() => handleDelete(outfit.outfit_id, outfit.name)}
                  className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default OutfitPanel;
