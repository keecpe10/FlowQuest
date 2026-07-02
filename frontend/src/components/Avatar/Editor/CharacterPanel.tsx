import React from 'react';
import { useCharacterStore } from '../../../store/characterStore';

const genders = [
  { id: 'male', label: 'Male', emoji: '👦' },
  { id: 'female', label: 'Female', emoji: '👧' },
  { id: 'unspecified', label: 'Unspecified', emoji: '👤' },
];

const CharacterPanel: React.FC = () => {
  const { config, updateConfig } = useCharacterStore();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-2">
          Gender
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Select a gender to set your avatar's base model. This affects the default proportions slightly.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {genders.map((g) => (
          <button
            key={g.id}
            onClick={() => updateConfig('gender', g.id)}
            className={`p-4 rounded-xl border-2 text-center transition-all ${
              config.gender === g.id
                ? 'border-violet-500 bg-violet-50 text-violet-700 shadow-md scale-105'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <div className="text-4xl mb-2">{g.emoji}</div>
            <div className="text-sm font-bold">{g.label}</div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default CharacterPanel;
