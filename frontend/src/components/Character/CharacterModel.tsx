import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group } from 'three';
import type { CharacterConfig, EquippedItems } from '../../store/characterStore';
import Head from './CharacterParts/Head';
import Body from './CharacterParts/Body';
import Arms from './CharacterParts/Arms';
import Legs from './CharacterParts/Legs';
import Hair from './CharacterParts/Hair';
import Accessories from './CharacterParts/Accessories';

interface CharacterModelProps {
  config: CharacterConfig;
  equipped: EquippedItems;
  currentAnimation?: string;
  currentEmote?: string | null;
}

const CharacterModel: React.FC<CharacterModelProps> = ({ config, equipped, currentAnimation = 'idle', currentEmote = null }) => {
  const group = useRef<Group>(null);
  
  // Animation override from equipped items or global state
  const anim = currentEmote ? null : (equipped.animation?.render_config?.animation_id || currentAnimation);
  const emote = currentEmote || equipped.emote?.render_config?.animation_id || null;

  const skinColor = config.skinColor || '#FFD3B6';
  const bodyScaleY = config.bodyScale ? 0.8 + (config.bodyScale.height / 100) * 0.6 : 1;
  const headScaleY = config.bodyScale ? 0.8 + (config.bodyScale.headScale / 100) * 0.4 : 1;
  const bodyY = config.bodyScale ? 0.7 + ((config.bodyScale.proportion - 50)/100)*0.5 : 0.7;
  const legScaleY = config.bodyScale ? 0.8 + (config.bodyScale.proportion / 100) * 0.4 : 1;
  
  const legY = bodyY - 0.7 * bodyScaleY;
  const headY = bodyY + 0.7 * bodyScaleY + 0.4;
  
  const globalScale = 0.85;
  const lowestPoint = legY - 1.2 * legScaleY - 0.2;
  const baseY = -lowestPoint * globalScale;

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.getElapsedTime();
    
    // Reset positions
    group.current.position.y = baseY;
    group.current.rotation.set(0, 0, 0);

    // Apply global root motions
    if (anim === 'idle' && !emote) {
      group.current.position.y = baseY + Math.sin(t * 2) * 0.02;
    } else if (anim === 'walk') {
      group.current.position.y = baseY + Math.abs(Math.sin(t * 5)) * 0.05;
    } else if (anim === 'run' || anim === 'ninja_run') {
      group.current.position.y = baseY + Math.abs(Math.sin(t * 10)) * 0.1;
      if (anim === 'ninja_run') group.current.rotation.x = 0.2; // Lean forward
    } else if (anim === 'jump') {
      // Root jump is handled in Legs.tsx and here slightly
      group.current.position.y = baseY + Math.max(0, Math.sin(t * 5) * 1.5);
    } else if (anim === 'sit') {
      group.current.position.y = baseY - 0.5;
    } else if (anim === 'swim') {
      group.current.rotation.x = 1.5; // Horizontal
      group.current.position.y = baseY + 1;
    } else if (anim === 'climb') {
      group.current.position.y = baseY + (t % 2) - 1; // Simulate moving up
    }

    if (emote === 'float') {
       group.current.position.y = baseY + Math.sin(t * 2) * 0.5 + 1;
    }
  });

  return (
    <group ref={group} scale={[globalScale, globalScale, globalScale]} dispose={null}>
      {/* Head & Face & Hair */}
      <group position={[0, headY, 0]} scale={[headScaleY, headScaleY, headScaleY]}>
        <Head 
          shape={config.headShape} 
          skinColor={skinColor}
          eyeType={config.eyeType}
          eyeColor={config.eyeColor}
          mouthType={config.mouthType}
          eyebrowType={config.eyebrowType}
          noseType={config.noseType}
          beardType={config.beardType}
          makeupType={config.makeupType}
          expression={config.expression}
        />
        <Hair 
          config={equipped.hair} 
          defaultColor={config.hairColor}
        />
        <Accessories items={equipped.accessories?.filter(a => ['hat', 'glasses', 'mask', 'headwear', 'headband', 'neck'].includes(a?.sub_category))} position="head" />
      </group>

      {/* Body / Torso */}
      <group position={[0, bodyY, 0]}>
        <Body 
          config={equipped.dress || equipped.jacket || equipped.cape || equipped.top} 
          skinColor={skinColor} 
          gender={config.gender}
          bodyScale={config.bodyScale}
        />
        <Accessories items={equipped.accessories?.filter(a => ['back', 'shoulder', 'aura'].includes(a?.sub_category))} position="body" />
      </group>

      {/* Arms */}
      <group position={[0, bodyY, 0]}>
        <Arms 
          config={equipped.jacket || equipped.top} 
          skinColor={skinColor} 
          emote={emote} 
          animation={anim}
          bodyScale={config.bodyScale}
        />
      </group>

      {/* Legs & Shoes */}
      <group position={[0, legY, 0]}>
        <Legs 
          bottomConfig={equipped.dress ? null : equipped.bottom} 
          shoeConfig={equipped.shoes} 
          skinColor={skinColor}
          animation={anim}
          emote={emote}
          bodyScale={config.bodyScale}
        />
      </group>
    </group>
  );
};

export default CharacterModel;
