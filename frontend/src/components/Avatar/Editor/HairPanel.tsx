import React from 'react';
import { useCharacterStore } from '../../../store/characterStore';
import ItemGrid from './ItemGrid';

const hairColors = [
  '#4A4A4A', '#2B1A00', '#000000', '#8B4513', '#333333',
  '#FFC0CB', '#FF0000', '#FFFF00', '#00FFFF', '#FF1493',
  '#FFFFFF', '#C0C0C0', '#800080', '#008000', '#000080',
];

const HairPanel: React.FC = () => {
  const { config, updateConfig } = useCharacterStore();

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Hair</h3>
      
      {/* Hair Color */}
      <div>
        <p className="text-xs font-semibold text-gray-600 mb-3">Hair Color</p>
        <div className="flex flex-wrap gap-2">
          {hairColors.map((color) => (
            <button
              key={color}
              onClick={() => updateConfig('hairColor', color)}
              className={`w-10 h-10 rounded-xl border-3 transition-all hover:scale-110 shadow-sm ${
                config.hairColor === color
                  ? 'border-violet-500 ring-2 ring-violet-300 scale-110'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>
      </div>

      <hr className="border-gray-200" />

      {/* Hair Styles */}
      <div>
        <p className="text-xs font-semibold text-gray-600 mb-3">Hair Styles</p>
        <ItemGrid category="hair" />
      </div>
    </div>
  );
};

export default HairPanel;
