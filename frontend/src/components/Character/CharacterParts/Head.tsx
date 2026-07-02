import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh } from 'three';

interface HeadProps {
  shape?: string;
  skinColor: string;
  eyeType?: string;
  eyeColor?: string;
  mouthType?: string;
  eyebrowType?: string;
  noseType?: string;
  beardType?: string;
  makeupType?: string;
  expression?: string;
}

const Head: React.FC<HeadProps> = ({ 
  shape = 'round', 
  skinColor, 
  eyeType = 'normal',
  eyeColor = '#000000',
  mouthType = 'smile',
  eyebrowType = 'normal',
  noseType = 'normal',
  beardType = 'none',
  makeupType = 'none',
  expression = 'neutral'
}) => {
  const leftEyeRef = useRef<Mesh>(null);
  const rightEyeRef = useRef<Mesh>(null);

  // Blink animation
  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    // Blink every ~4 seconds, lasting 150ms
    const isBlinking = time % 4 < 0.15;
    
    if (leftEyeRef.current) leftEyeRef.current.scale.y = isBlinking ? 0.1 : 1;
    if (rightEyeRef.current) rightEyeRef.current.scale.y = isBlinking ? 0.1 : 1;
  });

  // Base Head Shape
  const renderHeadShape = () => {
    switch (shape) {
      case 'square': return <boxGeometry args={[1.2, 1.2, 1.2]} />;
      case 'oval': return <sphereGeometry args={[0.65, 32, 32]} />;
      case 'round':
      default: return <sphereGeometry args={[0.65, 32, 32]} />;
    }
  };

  const getHeadScale = () => {
    if (shape === 'oval') return [1, 1.15, 1] as [number, number, number];
    return [1, 1, 1] as [number, number, number];
  };

  // Eyes
  const renderEyes = () => {
    const eyeZ = 0.63;
    const eyeY = 0.1;
    let lGeo = <sphereGeometry args={[0.06]} />;
    let rGeo = <sphereGeometry args={[0.06]} />;
    
    if (eyeType === 'round') {
      lGeo = rGeo = <sphereGeometry args={[0.08]} />;
    } else if (eyeType === 'sleepy') {
      lGeo = rGeo = <boxGeometry args={[0.12, 0.04, 0.02]} />;
    } else if (eyeType === 'wink') {
      rGeo = <boxGeometry args={[0.12, 0.02, 0.02]} />;
    }
    
    const mat = <meshStandardMaterial color={eyeColor} emissive={eyeType==='sparkle'?eyeColor:undefined} emissiveIntensity={eyeType==='sparkle'?0.5:0} />;

    return (
      <group>
        <mesh ref={leftEyeRef} position={[-0.2, eyeY, eyeZ]}>
          {lGeo}{mat}
        </mesh>
        <mesh ref={rightEyeRef} position={[0.2, eyeY, eyeZ]}>
          {rGeo}{mat}
        </mesh>
      </group>
    );
  };

  // Eyebrows
  const renderEyebrows = () => {
    const browZ = 0.62;
    const browY = 0.25;
    let rot = 0;
    let thick = 0.02;
    
    if (eyebrowType === 'thick') thick = 0.05;
    if (eyebrowType === 'thin') thick = 0.01;
    if (eyebrowType === 'angry' || expression === 'angry') rot = -0.2;
    if (eyebrowType === 'sad' || expression === 'sad') rot = 0.2;
    
    return (
      <group>
        <mesh position={[-0.2, browY, browZ]} rotation={[0, 0, rot]}>
          <boxGeometry args={[0.15, thick, 0.02]} />
          <meshStandardMaterial color="#222" />
        </mesh>
        <mesh position={[0.2, browY, browZ]} rotation={[0, 0, -rot]}>
          <boxGeometry args={[0.15, thick, 0.02]} />
          <meshStandardMaterial color="#222" />
        </mesh>
      </group>
    );
  };

  // Mouth
  const renderMouth = () => {
    const mZ = 0.63;
    const mY = -0.15;
    let mouth = <meshStandardMaterial color="#222" />;

    if (mouthType === 'open' || expression === 'surprised') {
      return (
        <mesh position={[0, mY, mZ]}>
          <circleGeometry args={[0.06, 16]} />
          <meshBasicMaterial color="#111" />
        </mesh>
      );
    }
    if (mouthType === 'neutral') {
      return (
        <mesh position={[0, mY, mZ]}>
          <boxGeometry args={[0.15, 0.02, 0.02]} />
          {mouth}
        </mesh>
      );
    }
    // Smile/Frown curve simplified as a rotated torus segment or just a box for now
    const isFrown = mouthType === 'frown' || expression === 'sad' || expression === 'angry';
    return (
      <mesh position={[0, mY + (isFrown ? 0 : 0.02), mZ]} rotation={[0, 0, isFrown ? Math.PI : 0]}>
        <torusGeometry args={[0.08, 0.015, 8, 16, Math.PI]} />
        {mouth}
      </mesh>
    );
  };

  // Nose
  const renderNose = () => {
    let geo = <sphereGeometry args={[0.04]} />;
    if (noseType === 'large') geo = <sphereGeometry args={[0.07]} />;
    if (noseType === 'pointed') geo = <coneGeometry args={[0.04, 0.1]} />;
    if (noseType === 'flat') geo = <boxGeometry args={[0.1, 0.03, 0.02]} />;
    
    return (
      <mesh position={[0, 0, 0.65]} rotation={noseType === 'pointed' ? [Math.PI/2, 0, 0] : [0,0,0]}>
        {geo}
        <meshStandardMaterial color={skinColor} roughness={0.7} />
      </mesh>
    );
  };

  // Beard
  const renderBeard = () => {
    if (beardType === 'none') return null;
    let geo;
    if (beardType === 'stubble') geo = <boxGeometry args={[0.4, 0.2, 0.1]} />;
    if (beardType === 'full') geo = <boxGeometry args={[0.5, 0.3, 0.2]} />;
    if (beardType === 'goatee') geo = <boxGeometry args={[0.15, 0.2, 0.1]} />;
    
    return (
      <mesh position={[0, -0.3, 0.6]}>
        {geo}
        <meshStandardMaterial color="#333" transparent opacity={beardType === 'stubble' ? 0.5 : 1} />
      </mesh>
    );
  };

  // Makeup
  const renderMakeup = () => {
    if (makeupType !== 'blush') return null;
    return (
      <group>
        <mesh position={[-0.25, -0.05, 0.62]}>
          <circleGeometry args={[0.08, 16]} />
          <meshBasicMaterial color="#FF69B4" transparent opacity={0.4} />
        </mesh>
        <mesh position={[0.25, -0.05, 0.62]}>
          <circleGeometry args={[0.08, 16]} />
          <meshBasicMaterial color="#FF69B4" transparent opacity={0.4} />
        </mesh>
      </group>
    );
  };

  return (
    <group scale={getHeadScale()}>
      <mesh castShadow receiveShadow>
        {renderHeadShape()}
        <meshStandardMaterial color={skinColor} roughness={0.6} />
      </mesh>
      {renderEyes()}
      {renderEyebrows()}
      {renderMouth()}
      {renderNose()}
      {renderBeard()}
      {renderMakeup()}
    </group>
  );
};

export default Head;
