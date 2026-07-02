import React, { useState } from 'react';
import { useCharacterStore } from '../../../store/characterStore';

const eyeTypes = [
  { id: 'normal', label: 'Normal', emoji: '👁️' },
  { id: 'round', label: 'Round', emoji: '⭕' },
  { id: 'sleepy', label: 'Sleepy', emoji: '😴' },
  { id: 'angry', label: 'Angry', emoji: '😠' },
  { id: 'wink', label: 'Wink', emoji: '😉' },
  { id: 'sparkle', label: 'Sparkle', emoji: '✨' },
];

const eyeColors = ['#000000', '#3B2507', '#1B4332', '#1E3A5F', '#5B21B6', '#9D174D', '#065F46', '#78350F'];

const eyebrowTypes = [
  { id: 'normal', label: 'Normal' },
  { id: 'thick', label: 'Thick' },
  { id: 'thin', label: 'Thin' },
  { id: 'angry', label: 'Angry' },
  { id: 'sad', label: 'Sad' },
];

const mouthTypes = [
  { id: 'smile', label: 'Smile', emoji: '😊' },
  { id: 'open', label: 'Open', emoji: '😮' },
  { id: 'neutral', label: 'Neutral', emoji: '😐' },
  { id: 'frown', label: 'Frown', emoji: '☹️' },
  { id: 'grin', label: 'Grin', emoji: '😁' },
];

const noseTypes = [
  { id: 'normal', label: 'Normal' },
  { id: 'large', label: 'Large' },
  { id: 'pointed', label: 'Pointed' },
  { id: 'flat', label: 'Flat' },
];

const beardTypes = [
  { id: 'none', label: 'None' },
  { id: 'stubble', label: 'Stubble' },
  { id: 'full', label: 'Full' },
  { id: 'goatee', label: 'Goatee' },
];

const makeupTypes = [
  { id: 'none', label: 'None' },
  { id: 'blush', label: 'Blush' },
  { id: 'eyeliner', label: 'Eyeliner' },
];

const expressions = [
  { id: 'neutral', label: 'Neutral', emoji: '😐' },
  { id: 'happy', label: 'Happy', emoji: '😊' },
  { id: 'sad', label: 'Sad', emoji: '😢' },
  { id: 'angry', label: 'Angry', emoji: '😠' },
  { id: 'surprised', label: 'Surprised', emoji: '😲' },
];

const headShapes = [
  { id: 'round', label: 'Round' },
  { id: 'square', label: 'Square' },
  { id: 'oval', label: 'Oval' },
];

type FaceTab = 'head' | 'eyes' | 'eyebrows' | 'mouth' | 'nose' | 'beard' | 'makeup' | 'expression';

const FacePanel: React.FC = () => {
  const { config, updateConfig } = useCharacterStore();
  const [tab, setTab] = useState<FaceTab>('head');

  const tabs: { id: FaceTab; label: string }[] = [
    { id: 'head', label: 'Head' },
    { id: 'eyes', label: 'Eyes' },
    { id: 'eyebrows', label: 'Brows' },
    { id: 'mouth', label: 'Mouth' },
    { id: 'nose', label: 'Nose' },
    { id: 'beard', label: 'Beard' },
    { id: 'makeup', label: 'Makeup' },
    { id: 'expression', label: 'Expr.' },
  ];

  const renderOptionGrid = (
    items: { id: string; label: string; emoji?: string }[],
    currentValue: string,
    configKey: keyof typeof config
  ) => (
    <div className="grid grid-cols-3 gap-3">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => updateConfig(configKey, item.id)}
          className={`px-3 py-3 rounded-xl text-center transition-all border-2 ${
            currentValue === item.id
              ? 'border-violet-500 bg-violet-50 text-violet-700 shadow-md'
              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
          }`}
        >
          {item.emoji && <div className="text-2xl mb-1">{item.emoji}</div>}
          <div className="text-xs font-bold">{item.label}</div>
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Face</h3>

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

      {/* Content */}
      <div className="pt-2">
        {tab === 'head' && renderOptionGrid(headShapes, config.headShape, 'headShape')}
        {tab === 'eyes' && (
          <div className="space-y-4">
            {renderOptionGrid(eyeTypes, config.eyeType, 'eyeType')}
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2">Eye Color</p>
              <div className="flex flex-wrap gap-2">
                {eyeColors.map((color) => (
                  <button
                    key={color}
                    onClick={() => updateConfig('eyeColor', color)}
                    className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${
                      config.eyeColor === color ? 'border-violet-500 ring-2 ring-violet-300' : 'border-gray-200'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        {tab === 'eyebrows' && renderOptionGrid(eyebrowTypes, config.eyebrowType, 'eyebrowType')}
        {tab === 'mouth' && renderOptionGrid(mouthTypes, config.mouthType, 'mouthType')}
        {tab === 'nose' && renderOptionGrid(noseTypes, config.noseType, 'noseType')}
        {tab === 'beard' && renderOptionGrid(beardTypes, config.beardType, 'beardType')}
        {tab === 'makeup' && renderOptionGrid(makeupTypes, config.makeupType, 'makeupType')}
        {tab === 'expression' && renderOptionGrid(expressions, config.expression, 'expression')}
      </div>
    </div>
  );
};

export default FacePanel;
