import React from 'react';
import { useCharacterStore } from '../../../store/characterStore';

const emotes = [
  { id: 'wave', label: 'Wave', emoji: '👋' },
  { id: 'smile', label: 'Smile', emoji: '😊' },
  { id: 'laugh', label: 'Laugh', emoji: '😂' },
  { id: 'cry', label: 'Cry', emoji: '😢' },
  { id: 'dance_basic', label: 'Dance', emoji: '💃' },
  { id: 'clap', label: 'Clap', emoji: '👏' },
  { id: 'point', label: 'Point', emoji: '👉' },
  { id: 'victory', label: 'Victory', emoji: '✌️' },
  { id: 'dab', label: 'Dab', emoji: '🤙' },
  { id: 'sleep', label: 'Sleep', emoji: '😴' },
  { id: 'breakdance', label: 'Breakdance', emoji: '🕺' },
  { id: 'float', label: 'Float', emoji: '🧘' },
];

const EmotePanel: React.FC = () => {
  const { currentEmote, setEmote } = useCharacterStore();

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
        Emotes
      </h3>
      <p className="text-xs text-gray-500">Select an emote to preview. Click again to stop.</p>

      <div className="grid grid-cols-3 gap-3">
        {emotes.map((emote) => (
          <button
            key={emote.id}
            onClick={() => setEmote(currentEmote === emote.id ? null : emote.id)}
            className={`p-3 rounded-xl border-2 text-center transition-all ${
              currentEmote === emote.id
                ? 'border-pink-500 bg-pink-50 shadow-md'
                : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <div className="text-2xl mb-1">{emote.emoji}</div>
            <div className="text-[10px] font-bold text-gray-700">{emote.label}</div>
          </button>
        ))}
      </div>

      {currentEmote && (
        <button
          onClick={() => setEmote(null)}
          className="w-full py-2 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
        >
          Stop Emote
        </button>
      )}
    </div>
  );
};

export default EmotePanel;
