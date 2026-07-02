import React from 'react';
import ItemGrid from './ItemGrid';

const AccessoryPanel: React.FC = () => {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Accessories</h3>
      <p className="text-xs text-gray-500 pb-2">Hats, glasses, masks, bags, and wings.</p>
      
      <div className="pt-2">
        <ItemGrid category="accessory" />
      </div>
    </div>
  );
};

export default AccessoryPanel;
