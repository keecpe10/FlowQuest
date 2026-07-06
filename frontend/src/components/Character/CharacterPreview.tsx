import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, OrbitControls, ContactShadows } from '@react-three/drei';
import CharacterModel from './CharacterModel';
import type { CharacterConfig } from '../../store/characterStore';

interface CharacterPreviewProps {
  config: CharacterConfig;
  equipped: any;
  className?: string;
  currentAnimation?: string;
}

const CharacterPreview: React.FC<CharacterPreviewProps> = ({ 
  config, 
  equipped, 
  className = "w-24 h-24",
  currentAnimation
}) => {
  return (
    <div className={`relative ${className} bg-gray-100 rounded-lg overflow-hidden`}>
      <Canvas shadows camera={{ position: [0, 1, 4], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[3, 5, 3]} intensity={1} castShadow />
        <directionalLight position={[-3, 3, -2]} intensity={0.3} color="#b4c7ff" />
        
        <Suspense fallback={null}>
          <group position={[0, -0.6, 0]} scale={0.6}>
            <CharacterModel 
              config={config} 
              equipped={equipped} 
              currentAnimation={currentAnimation}
            />
          </group>
          <Environment files="/hdri/potsdamer_platz_1k.hdr" />
        </Suspense>

        <ContactShadows 
          position={[0, -0.6, 0]} 
          opacity={0.3} 
          scale={5} 
          blur={2} 
          far={4} 
        />
        
        <OrbitControls 
          enableZoom={false} 
          enablePan={false} 
          autoRotate 
          autoRotateSpeed={1} 
          target={[0, 0, 0]}
        />
      </Canvas>
    </div>
  );
};

export default CharacterPreview;
