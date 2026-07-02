import React from 'react';
import { Handle, Position } from 'reactflow';

export const TerminalNode = ({ data }: any) => {
  return (
    <div className="relative flex items-center justify-center px-4 py-2 shadow-md rounded-full bg-slate-800 text-white font-bold text-sm border-2 border-slate-900 w-32 min-h-[48px] text-center">
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-slate-400" />
      {data.label}
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-blue-400" />
    </div>
  );
};

export const ProcessNode = ({ data }: any) => {
  return (
    <div className="relative flex items-center justify-center px-4 py-3 shadow-md rounded-lg bg-blue-500 text-white font-medium text-sm border-2 border-blue-600 w-40 min-h-[56px] text-center">
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-blue-200" />
      {data.label}
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-blue-200" />
    </div>
  );
};

export const DecisionNode = ({ data }: any) => {
  return (
    <div className="relative flex items-center justify-center w-32 h-32">
      <div className="absolute w-24 h-24 bg-amber-500 border-2 border-amber-600 rotate-45 shadow-md rounded-sm"></div>
      <div className="relative text-white font-bold text-sm z-10 text-center px-2">
        {data.label}
      </div>
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-amber-200" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="w-3 h-3 bg-amber-200" />
      <Handle type="source" position={Position.Right} id="right" className="w-3 h-3 bg-amber-200" />
      <Handle type="source" position={Position.Left} id="left" className="w-3 h-3 bg-amber-200" />
    </div>
  );
};

export const InputOutputNode = ({ data }: any) => {
  return (
    <div className="relative flex items-center justify-center w-40 min-h-[56px] text-center">
      {/* Skewed Background */}
      <div className="absolute inset-0 bg-emerald-500 shadow-md border-2 border-emerald-600 transform -skew-x-12 rounded-sm"></div>
      
      {/* Content */}
      <div className="relative z-10 text-white font-medium text-sm px-4 py-3">
        {data.label}
      </div>
      
      {/* Handles */}
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-emerald-200 z-10" />
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-emerald-200 z-10" />
    </div>
  );
};

export const ConnectorNode = () => {
  return (
    <div className="w-8 h-8 shadow-md bg-white border-4 border-slate-700 rounded-full flex items-center justify-center">
      <Handle type="target" position={Position.Top} id="top-target" className="w-2 h-2 bg-slate-700 top-[-4px]" />
      <Handle type="source" position={Position.Top} id="top-source" className="w-2 h-2 bg-slate-700 top-[-4px]" />
      
      <Handle type="target" position={Position.Bottom} id="bottom-target" className="w-2 h-2 bg-slate-700 bottom-[-4px]" />
      <Handle type="source" position={Position.Bottom} id="bottom-source" className="w-2 h-2 bg-slate-700 bottom-[-4px]" />
      
      <Handle type="target" position={Position.Left} id="left-target" className="w-2 h-2 bg-slate-700 left-[-4px]" />
      <Handle type="source" position={Position.Left} id="left-source" className="w-2 h-2 bg-slate-700 left-[-4px]" />
      
      <Handle type="target" position={Position.Right} id="right-target" className="w-2 h-2 bg-slate-700 right-[-4px]" />
      <Handle type="source" position={Position.Right} id="right-source" className="w-2 h-2 bg-slate-700 right-[-4px]" />
    </div>
  );
};

export const DisplayNode = ({ data }: any) => {
  return (
    <div className="relative flex items-center justify-center w-40 min-h-[56px] text-center">
      {/* Background Shape */}
      <div 
        className="absolute inset-0 bg-purple-500 shadow-md rounded-r-full"
        style={{ 
          clipPath: 'polygon(15% 0, 100% 0, 100% 100%, 15% 100%, 0 50%)'
        }}
      ></div>
      {/* Border approximation using a slightly larger element behind */}
      <div 
        className="absolute inset-[-2px] bg-purple-600 -z-10 rounded-r-full"
        style={{ 
          clipPath: 'polygon(15% 0, 100% 0, 100% 100%, 15% 100%, 0 50%)'
        }}
      ></div>

      <div className="relative z-10 text-white font-medium text-sm px-6 py-3 ml-2">
        {data.label}
      </div>
      
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-purple-200 z-10" />
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-purple-200 z-10" />
    </div>
  );
};

export const ManualInputNode = ({ data }: any) => {
  return (
    <div className="relative flex items-center justify-center w-40 min-h-[56px] text-center">
      {/* Slanted Top Background */}
      <div 
        className="absolute inset-0 bg-pink-500 shadow-md"
        style={{ 
          clipPath: 'polygon(0 20%, 100% 0, 100% 100%, 0 100%)',
          border: '2px solid #db2777' // pink-600 approx, clipPath hides standard borders sometimes, but we'll use a wrapper or just accept no border on top slant
        }}
      ></div>
      {/* To simulate border with clip-path, we can use a slightly larger element behind it, or just rely on shadow and color */}
      <div 
        className="absolute inset-[-2px] bg-pink-600 -z-10"
        style={{ 
          clipPath: 'polygon(0 20%, 100% 0, 100% 100%, 0 100%)',
        }}
      ></div>
      
      {/* Content */}
      <div className="relative z-10 text-white font-medium text-sm px-4 py-3 mt-1">
        {data.label}
      </div>
      
      {/* Handles */}
      <Handle type="target" position={Position.Top} className="w-3 h-3 bg-pink-200 z-10" style={{ top: '10%' }} />
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-pink-200 z-10" />
    </div>
  );
};

export const nodeTypes = {
  terminal: TerminalNode,
  process: ProcessNode,
  decision: DecisionNode,
  io: InputOutputNode,
  display: DisplayNode,
  manual_input: ManualInputNode,
  connector: ConnectorNode,
};
