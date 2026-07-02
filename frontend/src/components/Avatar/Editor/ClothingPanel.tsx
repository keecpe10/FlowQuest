import React, { useState } from 'react';
import ItemGrid from './ItemGrid';

const ClothingPanel: React.FC = () => {
  const [tab, setTab] = useState('top');

  const tabs = [
    { id: 'top', label: 'Tops' },
    { id: 'bottom', label: 'Bottoms' },
    { id: 'shoes', label: 'Shoes' },
    { id: 'dress', label: 'Dresses' },
    { id: 'jacket', label: 'Jackets' },
    { id: 'cape', label: 'Capes' },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Clothing</h3>
      
      {/* Sub-tabs */}
      <div className="flex overflow-x-auto hide-scrollbar gap-1 pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition ${
              tab === t.id
                ? 'bg-violet-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="pt-2">
        <ItemGrid category={tab} />
      </div>
    </div>
  );
};

export default ClothingPanel;
