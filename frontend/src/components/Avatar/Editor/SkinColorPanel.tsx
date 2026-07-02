import React, { useState } from 'react';
import { useCharacterStore } from '../../../store/characterStore';

const presetColors = [
  '#FDEBD0', '#FDDCB5', '#FFD3B6', '#F5C6A0', '#E8B78E',
  '#D4A574', '#C4956A', '#B07D56', '#8D6748', '#6B4E37',
  '#4A3728', '#3D2B1F', '#2C1F15',
];

const SkinColorPanel: React.FC = () => {
  const { config, updateConfig } = useCharacterStore();
  const [customMode, setCustomMode] = useState(false);
  const [hue, setHue] = useState(25);
  const [sat, setSat] = useState(60);
  const [light, setLight] = useState(75);

  const applyHSL = (h: number, s: number, l: number) => {
    setHue(h);
    setSat(s);
    setLight(l);
    updateConfig('skinColor', `hsl(${h}, ${s}%, ${l}%)`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-2">
          Skin Color
        </h3>
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setCustomMode(false)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              !customMode ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Preset
          </button>
          <button
            onClick={() => setCustomMode(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              customMode ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Custom
          </button>
        </div>
      </div>

      {!customMode ? (
        <div className="grid grid-cols-5 gap-3">
          {presetColors.map((color) => (
            <button
              key={color}
              onClick={() => updateConfig('skinColor', color)}
              className={`w-12 h-12 rounded-xl border-3 transition-all hover:scale-110 shadow-sm ${
                config.skinColor === color
                  ? 'border-violet-500 ring-2 ring-violet-300 scale-110'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {/* HSL Sliders */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">
              Hue ({hue}°)
            </label>
            <input
              type="range"
              min={0}
              max={360}
              value={hue}
              onChange={(e) => applyHSL(Number(e.target.value), sat, light)}
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{
                background: 'linear-gradient(to right, hsl(0,60%,75%), hsl(60,60%,75%), hsl(120,60%,75%), hsl(180,60%,75%), hsl(240,60%,75%), hsl(300,60%,75%), hsl(360,60%,75%))',
              }}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">
              Saturation ({sat}%)
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={sat}
              onChange={(e) => applyHSL(hue, Number(e.target.value), light)}
              className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-violet-600"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">
              Lightness ({light}%)
            </label>
            <input
              type="range"
              min={10}
              max={95}
              value={light}
              onChange={(e) => applyHSL(hue, sat, Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-violet-600"
            />
          </div>

          {/* Preview */}
          <div className="flex items-center gap-3">
            <div
              className="w-16 h-16 rounded-xl border-2 border-gray-200 shadow-inner"
              style={{ backgroundColor: config.skinColor }}
            />
            <div className="text-sm text-gray-600">
              <p className="font-mono text-xs">{config.skinColor}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SkinColorPanel;
