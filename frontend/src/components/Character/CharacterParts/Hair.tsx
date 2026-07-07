import React from 'react';

interface HairProps {
  config: any;
  defaultColor: string;
}

const Hair: React.FC<HairProps> = ({ config, defaultColor }) => {
  if (!config) return null;

  const color = defaultColor || config.default_color;
  const shape = config.shape || 'spiky';
  const mat = <meshStandardMaterial color={color} roughness={0.9} />;

  // Render different hair styles
  const renderShape = () => {
    switch (shape) {
      case 'spiky':
        return (
          <group position={[0, 0.5, 0]}>
            <mesh position={[0, 0.2, 0]} rotation={[0.2, 0, 0]}>
              <coneGeometry args={[0.3, 0.8, 4]} />{mat}
            </mesh>
            <mesh position={[-0.2, 0.1, 0.1]} rotation={[0.2, 0, 0.3]}>
              <coneGeometry args={[0.2, 0.6, 4]} />{mat}
            </mesh>
            <mesh position={[0.2, 0.1, 0.1]} rotation={[0.2, 0, -0.3]}>
              <coneGeometry args={[0.2, 0.6, 4]} />{mat}
            </mesh>
          </group>
        );
      case 'short_swept':
        return (
          <mesh position={[0, 0.6, 0.1]} rotation={[0.2, 0.2, 0]}>
            <boxGeometry args={[1.3, 0.5, 1.3]} />{mat}
          </mesh>
        );
      case 'long_straight':
        return (
          <group>
            <mesh position={[0, 0.6, 0]}>
              <boxGeometry args={[1.4, 0.4, 1.4]} />{mat}
            </mesh>
            <mesh position={[0, -0.2, -0.5]}>
              <boxGeometry args={[1.4, 1.5, 0.4]} />{mat}
            </mesh>
          </group>
        );
      case 'ponytail':
        return (
          <group>
            <mesh position={[0, 0.6, 0]}><sphereGeometry args={[0.68, 16, 16]} />{mat}</mesh>
            <mesh position={[0, 0.4, -0.7]} rotation={[-0.5, 0, 0]}><cylinderGeometry args={[0.1, 0.2, 1]} />{mat}</mesh>
          </group>
        );
      case 'buzz':
        return <mesh position={[0, 0.1, 0]}><sphereGeometry args={[0.68, 16, 16]} />{mat}</mesh>;
      case 'afro':
        return <mesh position={[0, 0.5, 0]}><sphereGeometry args={[0.9, 16, 16]} />{mat}</mesh>;
      case 'curly_bob':
        return (
          <group>
            <mesh position={[0, 0.6, 0]}><sphereGeometry args={[0.68, 16, 16]} />{mat}</mesh>
            <mesh position={[-0.5, 0, 0]}><sphereGeometry args={[0.4, 16, 16]} />{mat}</mesh>
            <mesh position={[0.5, 0, 0]}><sphereGeometry args={[0.4, 16, 16]} />{mat}</mesh>
          </group>
        );
      case 'mohawk':
        return <mesh position={[0, 0.8, 0]}><boxGeometry args={[0.2, 0.8, 1.4]} />{mat}</mesh>;
      case 'anime_spiky':
        return (
          <group position={[0, 0.6, 0]}>
            {[...Array(8)].map((_, i) => (
              <mesh key={i} rotation={[Math.random(), Math.random(), Math.random()]}>
                <coneGeometry args={[0.2, 1.2, 4]} />{mat}
              </mesh>
            ))}
          </group>
        );
      case 'cyber_hair':
        return (
          <mesh position={[0, 0.6, 0]}>
            <boxGeometry args={[1.3, 0.4, 1.3]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} wireframe />
          </mesh>
        );
      case 'twin_tails':
        return (
          <group>
            <mesh position={[0, 0.6, 0]}><sphereGeometry args={[0.68, 16, 16]} />{mat}</mesh>
            <mesh position={[-0.7, -0.2, 0]} rotation={[0, 0, -0.5]}><cylinderGeometry args={[0.1, 0.3, 1.2]} />{mat}</mesh>
            <mesh position={[0.7, -0.2, 0]} rotation={[0, 0, 0.5]}><cylinderGeometry args={[0.1, 0.3, 1.2]} />{mat}</mesh>
          </group>
        );
      case 'braid':
        return (
          <group>
            <mesh position={[0, 0.6, 0]}><sphereGeometry args={[0.68, 16, 16]} />{mat}</mesh>
            <group position={[0, 0, -0.7]}>
              <mesh position={[0, -0.2, 0]}><sphereGeometry args={[0.2]} />{mat}</mesh>
              <mesh position={[0, -0.5, 0]}><sphereGeometry args={[0.18]} />{mat}</mesh>
              <mesh position={[0, -0.8, 0]}><sphereGeometry args={[0.15]} />{mat}</mesh>
            </group>
          </group>
        );
      case 'messy_bun':
        return (
          <group>
            <mesh position={[0, 0.6, 0]}><sphereGeometry args={[0.68, 16, 16]} />{mat}</mesh>
            <mesh position={[0, 0.8, -0.5]}><sphereGeometry args={[0.3, 8, 8]} />{mat}</mesh>
          </group>
        );
      case 'wavy':
        return (
          <group>
            <mesh position={[0, 0.6, 0]}><boxGeometry args={[1.4, 0.4, 1.4]} />{mat}</mesh>
            <mesh position={[-0.5, -0.1, -0.2]}><boxGeometry args={[0.4, 1.2, 0.6]} />{mat}</mesh>
            <mesh position={[0.5, -0.1, -0.2]}><boxGeometry args={[0.4, 1.2, 0.6]} />{mat}</mesh>
            <mesh position={[0, -0.1, -0.5]}><boxGeometry args={[1.2, 1.2, 0.4]} />{mat}</mesh>
          </group>
        );
      case 'pixie':
        return (
          <mesh position={[0, 0.6, 0]} rotation={[0.1, 0, 0]}>
            <boxGeometry args={[1.3, 0.4, 1.2]} />{mat}
          </mesh>
        );
      default:
        return (
          <group position={[0, 0.5, 0]}>
            <mesh position={[0, 0.2, 0]} rotation={[0.2, 0, 0]}>
              <coneGeometry args={[0.3, 0.8, 4]} />{mat}
            </mesh>
          </group>
        );
    }
  };

  return <group>{renderShape()}</group>;
};

export default Hair;
