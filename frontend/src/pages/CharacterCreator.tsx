import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useCharacterStore } from '../store/characterStore';
import CharacterCanvas from '../components/Character/CharacterCanvas';
import EditorSidebar from '../components/Avatar/Editor/EditorSidebar';
import type { EditorCategory } from '../components/Avatar/Editor/EditorSidebar';
import CharacterPanel from '../components/Avatar/Editor/CharacterPanel';
import BodyScalePanel from '../components/Avatar/Editor/BodyScalePanel';
import SkinColorPanel from '../components/Avatar/Editor/SkinColorPanel';
import FacePanel from '../components/Avatar/Editor/FacePanel';
import HairPanel from '../components/Avatar/Editor/HairPanel';
import ClothingPanel from '../components/Avatar/Editor/ClothingPanel';
import AccessoryPanel from '../components/Avatar/Editor/AccessoryPanel';
import AnimationPanel from '../components/Avatar/Editor/AnimationPanel';
import EmotePanel from '../components/Avatar/Editor/EmotePanel';
import OutfitPanel from '../components/Avatar/Editor/OutfitPanel';
import Swal from 'sweetalert2';
import { Save, RefreshCw } from 'lucide-react';

const CharacterCreator: React.FC = () => {
  const { token } = useAuthStore();
  const { config, equipped, isLoading, loadFromServer, saveToServer } = useCharacterStore();
  const [activeCategory, setActiveCategory] = useState<EditorCategory>('character');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (token) {
      loadFromServer(token);
    }
  }, [token]);

  const handleSave = async () => {
    if (!token) return;
    setIsSaving(true);
    try {
      let thumbnailData = '';
      const canvas = document.querySelector('canvas');
      if (canvas) {
        thumbnailData = canvas.toDataURL('image/jpeg', 0.5);
      }
      
      await saveToServer(token, thumbnailData);
      Swal.fire({
        title: 'Saved!',
        text: 'Your avatar settings have been updated.',
        icon: 'success',
        timer: 2000,
        showConfirmButton: false
      });
    } catch (e) {
      Swal.fire('Error', 'Failed to save avatar', 'error');
    }
    setIsSaving(false);
  };

  const renderActivePanel = () => {
    switch (activeCategory) {
      case 'character': return <CharacterPanel />;
      case 'body': return <BodyScalePanel />;
      case 'skin': return <SkinColorPanel />;
      case 'face': return <FacePanel />;
      case 'hair': return <HairPanel />;
      case 'clothing': return <ClothingPanel />;
      case 'accessories': return <AccessoryPanel />;
      case 'animations': return <AnimationPanel />;
      case 'emotes': return <EmotePanel />;
      case 'outfits': return <OutfitPanel />;
      default: return <CharacterPanel />;
    }
  };

  if (isLoading && !config.gender) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-100 flex flex-col md:flex-row pt-16">
      
      {/* LEFT AREA: Editor Controls (Responsive: top on mobile, left on desktop) */}
      <div className="flex-1 flex flex-col md:flex-row bg-white border-r border-gray-200 shadow-sm relative z-10 h-[50vh] md:h-[calc(100vh-4rem)]">
        
        {/* Sidebar Navigation */}
        <EditorSidebar active={activeCategory} onChange={setActiveCategory} />

        {/* Dynamic Panel Content */}
        <div className="flex-1 p-4 md:p-6 overflow-y-auto hide-scrollbar bg-white">
          <div className="max-w-md mx-auto">
            {renderActivePanel()}
          </div>
        </div>
      </div>

      {/* RIGHT AREA: 3D Preview (Responsive: bottom on mobile, right on desktop) */}
      <div className="flex-1 md:flex-[1.2] lg:flex-[1.5] relative bg-gradient-to-br from-gray-100 to-gray-200 h-[50vh] md:h-auto border-t md:border-t-0 border-gray-300">
        <CharacterCanvas config={config} equipped={equipped} />

        {/* Floating Actions */}
        <div className="absolute top-4 right-4 flex gap-2">
           <button
            onClick={() => loadFromServer(token!)}
            className="bg-white/80 backdrop-blur text-gray-700 p-2.5 rounded-full shadow-md hover:bg-white transition flex items-center justify-center group"
            title="Reset to saved"
          >
            <RefreshCw size={20} className="group-hover:rotate-180 transition-transform duration-500" />
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-full font-bold shadow-lg transition ${
              isSaving 
                ? 'bg-gray-400 text-white cursor-not-allowed'
                : 'bg-violet-600 hover:bg-violet-700 text-white hover:scale-105'
            }`}
          >
            <Save size={20} />
            {isSaving ? 'Saving...' : 'Save Avatar'}
          </button>
        </div>
      </div>

    </div>
  );
};

export default CharacterCreator;
