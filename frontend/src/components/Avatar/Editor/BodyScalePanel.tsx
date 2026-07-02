import React from 'react';
import { useCharacterStore } from '../../../store/characterStore';
import type { BodyScale } from '../../../store/characterStore';

const sliders: { key: keyof BodyScale; label: string; icon: string }[] = [
  { key: 'height',     label: 'Height',      icon: '📏' },
  { key: 'width',      label: 'Width',       icon: '↔️' },
  { key: 'headScale',  label: 'Head Size',   icon: '🗣️' },
  { key: 'bodyType',   label: 'Body Type',   icon: '🏋️' },
  { key: 'proportion', label: 'Proportion',  icon: '📐' },
];

const BodyScalePanel: React.FC = () => {
  const { config, updateBodyScale } = useCharacterStore();
  const { bodyScale } = config;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4">
          Body Scale
        </h3>
        <p className="text-xs text-gray-500 mb-6">
          Adjust your avatar's body proportions using the sliders below.
        </p>
      </div>

      <div className="space-y-5">
        {sliders.map((s) => (
          <div key={s.key}>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <span>{s.icon}</span>
                {s.label}
              </label>
              <span className="text-sm font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded">
                {bodyScale[s.key]}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={bodyScale[s.key]}
              onChange={(e) => updateBodyScale(s.key, Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-violet-600"
            />
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
              <span>0</span>
              <span>50</span>
              <span>100</span>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => {
          sliders.forEach((s) => updateBodyScale(s.key, 50));
        }}
        className="w-full py-2 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
      >
        Reset to Default
      </button>
    </div>
  );
};

export default BodyScalePanel;
