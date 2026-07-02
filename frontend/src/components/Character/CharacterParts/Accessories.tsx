import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group } from 'three';

interface AccessoriesProps {
  items: any[];
  position: 'head' | 'body';
}

const Accessories: React.FC<AccessoriesProps> = ({ items, position }) => {
  if (!items || items.length === 0) return null;

  const renderAccessory = (item: any, index: number) => {
    const color = item.default_color || '#333';
    const shape = item.shape || 'cap';
    const mat = <meshStandardMaterial color={color} />;

    if (position === 'head') {
      switch (shape) {
        case 'cap':
          return (
            <group key={index} position={[0, 0.7, 0]}>
              <mesh><sphereGeometry args={[0.67, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />{mat}</mesh>
              <mesh position={[0, -0.1, 0.4]} rotation={[-0.2, 0, 0]}><boxGeometry args={[0.8, 0.05, 0.6]} />{mat}</mesh>
            </group>
          );
        case 'beanie':
          return <mesh key={index} position={[0, 0.6, 0]}><sphereGeometry args={[0.68, 16, 16, 0, Math.PI * 2, 0, Math.PI / 1.5]} />{mat}</mesh>;
        case 'glasses':
        case 'sunglasses':
          const isSun = shape === 'sunglasses';
          return (
            <group key={index} position={[0, 0.1, 0.64]}>
              <mesh position={[-0.2, 0, 0]}><boxGeometry args={[0.3, 0.15, 0.05]} /><meshStandardMaterial color={isSun ? '#111' : '#fff'} transparent opacity={isSun ? 0.9 : 0.3} /></mesh>
              <mesh position={[0.2, 0, 0]}><boxGeometry args={[0.3, 0.15, 0.05]} /><meshStandardMaterial color={isSun ? '#111' : '#fff'} transparent opacity={isSun ? 0.9 : 0.3} /></mesh>
              <mesh position={[0, 0, 0]}><boxGeometry args={[0.1, 0.02, 0.02]} />{mat}</mesh>
            </group>
          );
        case 'medical_mask':
          return (
            <mesh key={index} position={[0, -0.2, 0.65]} rotation={[-0.1, 0, 0]}>
              <boxGeometry args={[0.6, 0.3, 0.1]} />
              <meshStandardMaterial color="#fff" />
            </mesh>
          );
        case 'headband':
          return <mesh key={index} position={[0, 0.5, 0]} rotation={[1.5, 0, 0]}><torusGeometry args={[0.66, 0.05, 8, 32]} />{mat}</mesh>;
        case 'cat_ears':
          return (
            <group key={index} position={[0, 0.7, 0]}>
              <mesh position={[-0.4, 0, 0]} rotation={[0, 0, 0.4]}><coneGeometry args={[0.15, 0.3, 4]} />{mat}</mesh>
              <mesh position={[0.4, 0, 0]} rotation={[0, 0, -0.4]}><coneGeometry args={[0.15, 0.3, 4]} />{mat}</mesh>
            </group>
          );
        case 'devil_horns':
          return (
            <group key={index} position={[0, 0.7, 0]}>
              <mesh position={[-0.3, 0, 0.2]} rotation={[0.4, 0, -0.2]}><coneGeometry args={[0.08, 0.4, 8]} /><meshStandardMaterial color="#d32f2f" /></mesh>
              <mesh position={[0.3, 0, 0.2]} rotation={[0.4, 0, 0.2]}><coneGeometry args={[0.08, 0.4, 8]} /><meshStandardMaterial color="#d32f2f" /></mesh>
            </group>
          );
        case 'crown':
          return <mesh key={index} position={[0, 0.8, 0]}><cylinderGeometry args={[0.4, 0.3, 0.4, 8]} /><meshStandardMaterial color="#FFD700" metalness={0.8} /></mesh>;
        case 'halo':
          return <mesh key={index} position={[0, 0.9, 0]} rotation={[1.5, 0, 0]}><torusGeometry args={[0.4, 0.05, 8, 32]} /><meshStandardMaterial color="#FFD700" emissive="#FFD700" emissiveIntensity={0.5} /></mesh>;
        case 'scarf':
          return <mesh key={index} position={[0, -0.6, 0]} rotation={[0.2, 0, 0]}><cylinderGeometry args={[0.5, 0.55, 0.3, 16]} />{mat}</mesh>;
        case 'necklace':
          return <mesh key={index} position={[0, -0.5, 0.1]} rotation={[1, 0, 0]}><torusGeometry args={[0.4, 0.02, 8, 32]} /><meshStandardMaterial color="#FFD700" metalness={1} /></mesh>;
        default:
          return null;
      }
    } else {
      switch (shape) {
        case 'backpack':
          return <mesh key={index} position={[0, 0, -0.4]}><boxGeometry args={[0.8, 1, 0.4]} />{mat}</mesh>;
        case 'angel_wings':
          return (
            <group key={index} position={[0, 0, -0.3]}>
              <mesh position={[-0.8, 0.2, 0]} rotation={[0, 0.5, -0.5]}><boxGeometry args={[1.2, 0.4, 0.1]} /><meshStandardMaterial color="#fff" /></mesh>
              <mesh position={[0.8, 0.2, 0]} rotation={[0, -0.5, 0.5]}><boxGeometry args={[1.2, 0.4, 0.1]} /><meshStandardMaterial color="#fff" /></mesh>
            </group>
          );
        case 'dragon_wings':
          return (
            <group key={index} position={[0, 0, -0.3]}>
              <mesh position={[-0.8, 0.2, 0]} rotation={[0, 0.5, -0.5]}><boxGeometry args={[1.2, 0.4, 0.1]} /><meshStandardMaterial color="#8b0000" /></mesh>
              <mesh position={[0.8, 0.2, 0]} rotation={[0, -0.5, 0.5]}><boxGeometry args={[1.2, 0.4, 0.1]} /><meshStandardMaterial color="#8b0000" /></mesh>
            </group>
          );
        case 'shoulder_pads':
          return (
            <group key={index} position={[0, 0.7, 0]}>
              <mesh position={[-0.7, 0, 0]}><sphereGeometry args={[0.3, 16, 16]} />{mat}</mesh>
              <mesh position={[0.7, 0, 0]}><sphereGeometry args={[0.3, 16, 16]} />{mat}</mesh>
            </group>
          );
        case 'pet_cat':
          return (
            <group key={index} position={[-0.6, 0.8, 0]}>
              <mesh><sphereGeometry args={[0.2]} /><meshStandardMaterial color="#333" /></mesh>
              <mesh position={[0, 0.2, 0.1]}><sphereGeometry args={[0.15]} /><meshStandardMaterial color="#333" /></mesh>
            </group>
          );
        case 'pet_dog':
          return (
            <group key={index} position={[0.6, 0.8, 0]}>
              <mesh><sphereGeometry args={[0.2]} /><meshStandardMaterial color="#D2B48C" /></mesh>
              <mesh position={[0, 0.2, 0.1]}><boxGeometry args={[0.2, 0.2, 0.25]} /><meshStandardMaterial color="#D2B48C" /></mesh>
            </group>
          );
        case 'fire_aura':
        case 'ice_aura':
          const isFire = shape === 'fire_aura';
          return (
            <mesh key={index} position={[0, 0, 0]}>
              <sphereGeometry args={[1.8, 32, 32]} />
              <meshStandardMaterial color={isFire ? '#ff4500' : '#00ffff'} emissive={isFire ? '#ff4500' : '#00ffff'} emissiveIntensity={0.5} transparent opacity={0.2} />
            </mesh>
          );
        default:
          return null;
      }
    }
  };

  return <group>{items.map((item, i) => renderAccessory(item, i))}</group>;
};

export default Accessories;
