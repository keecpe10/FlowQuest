import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, ContactShadows, Environment } from '@react-three/drei';
import CharacterModel from './CharacterModel';
import type { CharacterConfig, EquippedItems } from '../../store/characterStore';
import { useCharacterStore } from '../../store/characterStore';

interface CharacterCanvasProps {
  config: CharacterConfig;
  equipped: EquippedItems;
}

const CharacterCanvas: React.FC<CharacterCanvasProps> = ({ config, equipped }) => {
  const { currentAnimation, currentEmote } = useCharacterStore();

  return (
    <div className="w-full h-full relative">
      <Canvas
        shadows
        camera={{ position: [0, 1.5, 4], fov: 45 }}
        gl={{ preserveDrawingBuffer: true }} // Allows taking screenshots for thumbnails
      >
        <color attach="background" args={['#f3f4f6']} />
        
        <ambientLight intensity={0.6} />
        <directionalLight
          position={[-5, 5, 5]}
          intensity={1}
          castShadow
          shadow-mapSize={1024}
        />
        <directionalLight position={[5, 2, -5]} intensity={0.5} color="#c7d2fe" />

        <Suspense fallback={null}>
          <group position={[0, -1, 0]}>
            <CharacterModel 
              config={config} 
              equipped={equipped} 
              currentAnimation={currentAnimation}
              currentEmote={currentEmote}
            />
            
            {/* Ground / Platform */}
            <mesh position={[0, -0.05, 0]} receiveShadow>
              <cylinderGeometry args={[2, 2.2, 0.1, 32]} />
              <meshStandardMaterial color="#e5e7eb" />
            </mesh>
            
            <ContactShadows
              position={[0, 0, 0]}
              opacity={0.5}
              scale={5}
              blur={2}
              far={2}
            />
          </group>
          <Environment files="/hdri/potsdamer_platz_1k.hdr" />
        </Suspense>

        <OrbitControls
          enablePan={false}
          minDistance={2}
          maxDistance={8}
          maxPolarAngle={Math.PI / 2 + 0.1}
          target={[0, 0.5, 0]}
        />
      </Canvas>
    </div>
  );
};

export default CharacterCanvas;
