import React from 'react';

interface BodyProps {
  config: any;
  skinColor: string;
  gender?: string;
  bodyScale?: {
    height: number;
    width: number;
    bodyType: number;
  };
}

const Body: React.FC<BodyProps> = ({ config, skinColor, gender, bodyScale }) => {
  // Base scale calculation
  const getScale = () => {
    let scaleX = 1;
    let scaleY = 1;
    let scaleZ = 1;

    if (bodyScale) {
      scaleY = 0.8 + (bodyScale.height / 100) * 0.6; // 0.8 to 1.4
      scaleX = 0.8 + (bodyScale.width / 100) * 0.6;  // 0.8 to 1.4
      scaleZ = 0.8 + (bodyScale.bodyType / 100) * 0.6; // 0.8 to 1.4
    }

    if (gender === 'female') {
      scaleX *= 0.9;
      scaleZ *= 0.9;
    } else if (gender === 'male') {
      scaleX *= 1.1;
      scaleZ *= 1.1;
    }

    return [scaleX, scaleY, scaleZ] as [number, number, number];
  };

  const scale = getScale();
  const color = config?.default_color || skinColor;
  
  // Default box
  let geo = <boxGeometry args={[1, 1.4, 0.6]} />;
  
  if (config?.shape === 'cylinder') {
    geo = <cylinderGeometry args={[0.5, 0.5, 1.4, 16]} />;
  } else if (config?.shape === 'sphere') {
    geo = <sphereGeometry args={[0.7, 32, 32]} />;
  } else if (config?.category === 'dress') {
    geo = <cylinderGeometry args={[0.4, 0.8, 2.0, 16]} />;
    scale[1] *= 1.2; // Longer for dress
  }

  const itemName = (config?.name || '').toLowerCase();
  const isCropTop = itemName.includes('crop');

  const renderTorso = () => {
    if (isCropTop) {
      return (
        <group>
          {/* Upper Top */}
          <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
            <boxGeometry args={[1, 0.7, 0.6]} />
            <meshStandardMaterial color={color} roughness={0.7} />
          </mesh>
          {/* Exposed Midriff (Skin) */}
          <mesh position={[0, -0.35, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.95, 0.7, 0.55]} />
            <meshStandardMaterial color={skinColor} roughness={0.7} />
          </mesh>
        </group>
      );
    }

    return (
      <mesh castShadow receiveShadow>
        {geo}
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
    );
  };

  return (
    <group scale={scale}>
      {renderTorso()}

      
      {/* Jacket Overlay */}
      {config?.category === 'jacket' && (
        <mesh scale={[1.05, 1.05, 1.05]}>
          <boxGeometry args={[1, 1.4, 0.6]} />
          <meshStandardMaterial color={config.default_color || '#333'} roughness={0.9} />
        </mesh>
      )}

      {/* Cape */}
      {config?.category === 'cape' && (
        <mesh position={[0, -0.2, -0.35]} rotation={[-0.2, 0, 0]}>
          <planeGeometry args={[1.2, 2.0]} />
          <meshStandardMaterial color={config.default_color || '#d32f2f'} side={2} />
        </mesh>
      )}
    </group>
  );
};

export default Body;
