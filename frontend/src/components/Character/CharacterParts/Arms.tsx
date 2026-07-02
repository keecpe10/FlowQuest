import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group } from 'three';

interface ArmsProps {
  config: any;
  skinColor: string;
  emote?: string | null;
  animation?: string | null;
  bodyScale?: {
    height: number;
    width: number;
    bodyType: number;
  };
}

const Arms: React.FC<ArmsProps> = ({ config, skinColor, emote, animation, bodyScale }) => {
  const leftArmRef = useRef<Group>(null);
  const rightArmRef = useRef<Group>(null);

  useFrame((state) => {
    if (!leftArmRef.current || !rightArmRef.current) return;
    const t = state.clock.getElapsedTime();

    // Default reset
    leftArmRef.current.rotation.set(0, 0, 0);
    rightArmRef.current.rotation.set(0, 0, 0);
    leftArmRef.current.position.set(-0.7, 0.5, 0);
    rightArmRef.current.position.set(0.7, 0.5, 0);

    // Apply scaling positions dynamically if we had bodyScale here...
    // For simplicity, we just use static base + animation offsets

    // 1. ANIMATION (Walking, Running, etc)
    if (animation === 'walk') {
      leftArmRef.current.rotation.x = Math.sin(t * 5) * 0.5;
      rightArmRef.current.rotation.x = Math.sin(t * 5 + Math.PI) * 0.5;
    } else if (animation === 'run' || animation === 'ninja_run') {
      leftArmRef.current.rotation.x = Math.sin(t * 10) * 0.8;
      rightArmRef.current.rotation.x = Math.sin(t * 10 + Math.PI) * 0.8;
      if (animation === 'ninja_run') {
        leftArmRef.current.rotation.x = -1.5;
        rightArmRef.current.rotation.x = -1.5;
      }
    } else if (animation === 'dance') {
      leftArmRef.current.rotation.z = Math.sin(t * 4) * 0.5 + 0.5;
      rightArmRef.current.rotation.z = Math.sin(t * 4 + Math.PI) * -0.5 - 0.5;
    } else if (animation === 'swim') {
      leftArmRef.current.rotation.x = Math.sin(t * 3) * Math.PI;
      rightArmRef.current.rotation.x = Math.sin(t * 3 + Math.PI) * Math.PI;
    } else if (animation === 'climb') {
      leftArmRef.current.rotation.x = 3.14 + Math.sin(t * 4) * 0.5;
      rightArmRef.current.rotation.x = 3.14 + Math.sin(t * 4 + Math.PI) * 0.5;
    }
    
    // 2. EMOTES (Overrides animation)
    if (emote) {
      if (emote === 'wave') {
        rightArmRef.current.rotation.z = -2.5 + Math.sin(t * 10) * 0.5;
      } else if (emote === 'clap') {
        leftArmRef.current.rotation.z = 1.5;
        rightArmRef.current.rotation.z = -1.5;
        leftArmRef.current.position.x = -0.3 + Math.sin(t*10)*0.1;
        rightArmRef.current.position.x = 0.3 - Math.sin(t*10)*0.1;
      } else if (emote === 'cry') {
        leftArmRef.current.rotation.z = 2.5;
        leftArmRef.current.rotation.x = 0.5;
        rightArmRef.current.rotation.z = -2.5;
        rightArmRef.current.rotation.x = 0.5;
        leftArmRef.current.position.y += Math.sin(t*5)*0.05;
        rightArmRef.current.position.y += Math.sin(t*5)*0.05;
      } else if (emote === 'victory') {
        leftArmRef.current.rotation.z = 2.5;
        rightArmRef.current.rotation.z = -2.5;
      } else if (emote === 'point') {
        rightArmRef.current.rotation.z = -1.5;
      } else if (emote === 'sleep') {
        leftArmRef.current.rotation.z = -0.2;
        rightArmRef.current.rotation.z = 0.2;
      } else if (emote === 'dab') {
        leftArmRef.current.rotation.z = 2.5;
        rightArmRef.current.rotation.z = -1.5;
        rightArmRef.current.rotation.y = 1.5;
      }
    }
  });

  const sleeveColor = config?.default_color || skinColor;
  const bodyScaleY = bodyScale ? 0.8 + (bodyScale.height / 100) * 0.6 : 1;
  const shoulderY = 0.7 * bodyScaleY - 0.2;

  return (
    <group>
      {/* Left Arm */}
      <group ref={leftArmRef} position={[-0.7, shoulderY, 0]}>
        <mesh position={[0, -0.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.4, 1.2, 0.4]} />
          <meshStandardMaterial color={sleeveColor} />
        </mesh>
        <mesh position={[0, -1.2, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.38, 0.3, 0.38]} />
          <meshStandardMaterial color={skinColor} />
        </mesh>
      </group>

      {/* Right Arm */}
      <group ref={rightArmRef} position={[0.7, shoulderY, 0]}>
        <mesh position={[0, -0.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.4, 1.2, 0.4]} />
          <meshStandardMaterial color={sleeveColor} />
        </mesh>
        <mesh position={[0, -1.2, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.38, 0.3, 0.38]} />
          <meshStandardMaterial color={skinColor} />
        </mesh>
      </group>
    </group>
  );
};

export default Arms;
