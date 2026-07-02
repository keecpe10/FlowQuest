import React from 'react';
import {
  User, Sliders, Palette, Smile, Scissors, Shirt,
  Crown, Play, Heart, Save
} from 'lucide-react';

export type EditorCategory =
  | 'character' | 'body' | 'skin' | 'face' | 'hair'
  | 'clothing' | 'accessories' | 'animations' | 'emotes' | 'outfits';

interface EditorSidebarProps {
  active: EditorCategory;
  onChange: (cat: EditorCategory) => void;
}

const categories: { id: EditorCategory; label: string; icon: React.ReactNode }[] = [
  { id: 'character',    label: 'Character',    icon: <User size={20} /> },
  { id: 'body',         label: 'Body',         icon: <Sliders size={20} /> },
  { id: 'skin',         label: 'Skin',         icon: <Palette size={20} /> },
  { id: 'face',         label: 'Face',         icon: <Smile size={20} /> },
  { id: 'hair',         label: 'Hair',         icon: <Scissors size={20} /> },
  { id: 'clothing',     label: 'Clothing',     icon: <Shirt size={20} /> },
  { id: 'accessories',  label: 'Accessories',  icon: <Crown size={20} /> },
  { id: 'animations',   label: 'Animations',   icon: <Play size={20} /> },
  { id: 'emotes',       label: 'Emotes',       icon: <Heart size={20} /> },
  { id: 'outfits',      label: 'Outfits',      icon: <Save size={20} /> },
];

const EditorSidebar: React.FC<EditorSidebarProps> = ({ active, onChange }) => {
  return (
    <div className="w-full md:w-20 flex md:flex-col overflow-x-auto md:overflow-x-visible md:overflow-y-auto hide-scrollbar bg-white md:bg-gray-50 border-b md:border-b-0 md:border-r border-gray-200 flex-shrink-0">
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onChange(cat.id)}
          className={`flex flex-col items-center justify-center gap-1 px-3 py-3 md:px-2 md:py-4 min-w-[64px] transition-all whitespace-nowrap ${
            active === cat.id
              ? 'bg-violet-100 text-violet-700 border-b-2 md:border-b-0 md:border-l-4 border-violet-600'
              : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 border-b-2 md:border-b-0 md:border-l-4 border-transparent'
          }`}
          title={cat.label}
        >
          {cat.icon}
          <span className="text-[10px] font-bold leading-tight">{cat.label}</span>
        </button>
      ))}
    </div>
  );
};

export default EditorSidebar;
