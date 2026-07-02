import React from 'react';
import { useCharacterStore } from '../../../store/characterStore';

const animations = [
  { id: 'idle', label: 'Idle', emoji: '🧍', desc: 'Standing still' },
  { id: 'walk', label: 'Walk', emoji: '🚶', desc: 'Walking slowly' },
  { id: 'run', label: 'Run', emoji: '🏃', desc: 'Running fast' },
  { id: 'jump', label: 'Jump', emoji: '🤸', desc: 'Jumping up' },
  { id: 'sit', label: 'Sit', emoji: '🪑', desc: 'Sitting down' },
  { id: 'dance', label: 'Dance', emoji: '💃', desc: 'Grooving' },
  { id: 'swim', label: 'Swim', emoji: '🏊', desc: 'Swimming' },
  { id: 'climb', label: 'Climb', emoji: '🧗', desc: 'Climbing up' },
];

const AnimationPanel: React.FC = () => {
  const { currentAnimation, setAnimation } = useCharacterStore();

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
        Animations
      </h3>
      <p className="text-xs text-gray-500">Select an animation to preview on your avatar.</p>

      <div className="grid grid-cols-2 gap-3">
        {animations.map((anim) => (
          <button
            key={anim.id}
            onClick={() => setAnimation(anim.id)}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              currentAnimation === anim.id
                ? 'border-violet-500 bg-violet-50 shadow-md'
                : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <div className="text-2xl mb-1">{anim.emoji}</div>
            <div className="text-sm font-bold text-gray-800">{anim.label}</div>
            <div className="text-[10px] text-gray-500">{anim.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default AnimationPanel;
