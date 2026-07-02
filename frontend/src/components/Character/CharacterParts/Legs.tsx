import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group } from 'three';

interface LegsProps {
  bottomConfig: any;
  shoeConfig: any;
  skinColor: string;
  animation?: string | null;
  emote?: string | null;
  bodyScale?: {
    proportion: number;
  };
}

const Legs: React.FC<LegsProps> = ({ bottomConfig, shoeConfig, skinColor, animation, emote, bodyScale }) => {
  const leftLegRef = useRef<Group>(null);
  const rightLegRef = useRef<Group>(null);
  const mainGroupRef = useRef<Group>(null);

  // Apply body proportions
  const legScaleY = bodyScale ? 0.8 + (bodyScale.proportion / 100) * 0.4 : 1; // 0.8 to 1.2
  
  useFrame((state) => {
    if (!leftLegRef.current || !rightLegRef.current || !mainGroupRef.current) return;
    const t = state.clock.getElapsedTime();

    leftLegRef.current.rotation.set(0, 0, 0);
    rightLegRef.current.rotation.set(0, 0, 0);
    mainGroupRef.current.position.y = 0; // Reset overall height
    
    // 1. ANIMATION
    if (animation === 'walk') {
      leftLegRef.current.rotation.x = Math.sin(t * 5 + Math.PI) * 0.5;
      rightLegRef.current.rotation.x = Math.sin(t * 5) * 0.5;
    } else if (animation === 'run' || animation === 'ninja_run') {
      leftLegRef.current.rotation.x = Math.sin(t * 10 + Math.PI) * 0.8;
      rightLegRef.current.rotation.x = Math.sin(t * 10) * 0.8;
    } else if (animation === 'jump') {
      mainGroupRef.current.position.y = Math.max(0, Math.sin(t * 5) * 1.5);
      leftLegRef.current.rotation.x = -0.5;
      rightLegRef.current.rotation.x = -0.5;
    } else if (animation === 'sit') {
      mainGroupRef.current.position.y = -0.5;
      leftLegRef.current.rotation.x = -1.5;
      rightLegRef.current.rotation.x = -1.5;
    } else if (animation === 'dance') {
      leftLegRef.current.rotation.x = Math.sin(t * 4) * 0.2;
      rightLegRef.current.rotation.x = Math.sin(t * 4 + Math.PI) * 0.2;
    } else if (animation === 'swim') {
      leftLegRef.current.rotation.x = Math.sin(t * 3 + Math.PI) * 0.5;
      rightLegRef.current.rotation.x = Math.sin(t * 3) * 0.5;
    } else if (animation === 'climb') {
      leftLegRef.current.rotation.x = Math.sin(t * 4 + Math.PI) * 0.5;
      rightLegRef.current.rotation.x = Math.sin(t * 4) * 0.5;
    }

    // 2. EMOTES
    if (emote === 'dance_basic') {
      mainGroupRef.current.position.y = Math.abs(Math.sin(t * 10)) * 0.2;
    } else if (emote === 'sleep') {
      leftLegRef.current.rotation.x = 1.5;
      rightLegRef.current.rotation.x = 1.5;
      mainGroupRef.current.position.y = -1.2;
    } else if (emote === 'breakdance') {
      mainGroupRef.current.position.y = -1;
      leftLegRef.current.rotation.z = Math.sin(t * 10);
      rightLegRef.current.rotation.z = -Math.sin(t * 10);
      mainGroupRef.current.rotation.y = t * 5;
    } else if (emote === 'float') {
      mainGroupRef.current.position.y = Math.sin(t * 2) * 0.5 + 1;
      leftLegRef.current.rotation.x = -1.5;
      leftLegRef.current.rotation.z = 0.5;
      rightLegRef.current.rotation.x = -1.5;
      rightLegRef.current.rotation.z = -0.5;
    }
  });

  const pantsColor = bottomConfig?.default_color || '#333';
  const shoeColor = shoeConfig?.default_color || '#111';

  return (
    <group ref={mainGroupRef}>
      {/* Left Leg */}
      <group ref={leftLegRef} position={[-0.25, 0, 0]}>
        {/* Pants/Leg */}
        <mesh position={[0, -0.6 * legScaleY, 0]} scale={[1, legScaleY, 1]} castShadow receiveShadow>
          <boxGeometry args={[0.45, 1.2, 0.45]} />
          <meshStandardMaterial color={pantsColor} />
        </mesh>
        {/* Shoe */}
        <mesh position={[0, -1.2 * legScaleY - 0.1, 0.1]} castShadow receiveShadow>
          <boxGeometry args={[0.5, 0.2, 0.6]} />
          <meshStandardMaterial color={shoeColor} />
        </mesh>
      </group>

      {/* Right Leg */}
      <group ref={rightLegRef} position={[0.25, 0, 0]}>
        {/* Pants/Leg */}
        <mesh position={[0, -0.6 * legScaleY, 0]} scale={[1, legScaleY, 1]} castShadow receiveShadow>
          <boxGeometry args={[0.45, 1.2, 0.45]} />
          <meshStandardMaterial color={pantsColor} />
        </mesh>
        {/* Shoe */}
        <mesh position={[0, -1.2 * legScaleY - 0.1, 0.1]} castShadow receiveShadow>
          <boxGeometry args={[0.5, 0.2, 0.6]} />
          <meshStandardMaterial color={shoeColor} />
        </mesh>
      </group>
    </group>
  );
};

export default Legs;
