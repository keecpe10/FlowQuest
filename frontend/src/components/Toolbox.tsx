import React from 'react';

const Toolbox = () => {
  const onDragStart = (event: React.DragEvent, nodeType: string, label: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.setData('application/reactflow-label', label);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="w-64 bg-white border-r border-slate-200 p-4 shadow-sm h-full flex flex-col gap-4 z-20">
      <h3 className="font-bold text-slate-800 mb-2">Flowchart Symbols</h3>
      
      <div 
        className="cursor-grab p-3 border-2 border-slate-300 rounded-full bg-slate-100 text-center text-sm font-semibold hover:border-slate-800 transition-colors"
        onDragStart={(event) => onDragStart(event, 'terminal', 'Start/End')}
        draggable
      >
        Terminal (Start/End)
      </div>

      <div 
        className="cursor-grab p-3 border-2 border-blue-300 rounded-lg bg-blue-50 text-center text-sm font-semibold hover:border-blue-600 transition-colors"
        onDragStart={(event) => onDragStart(event, 'process', 'Process')}
        draggable
      >
        Process Block
      </div>

      <div 
        className="cursor-grab flex items-center justify-center h-16 hover:opacity-80 transition-opacity"
        onDragStart={(event) => onDragStart(event, 'decision', 'Decision')}
        draggable
      >
        <div className="relative flex items-center justify-center w-16 h-16">
          <div className="absolute w-11 h-11 bg-amber-400 border-2 border-amber-600 rotate-45 shadow-sm"></div>
          <span className="relative z-10 text-white font-bold text-[10px] text-center leading-tight">Decision<br/>(If/Else)</span>
        </div>
      </div>

      <div 
        className="cursor-grab p-3 border-2 border-emerald-300 bg-emerald-50 text-center text-sm font-semibold hover:border-emerald-600 transition-colors transform -skew-x-12 mx-2"
        onDragStart={(event) => onDragStart(event, 'io', 'Input/Output')}
        draggable
      >
        <div className="transform skew-x-12">Input/Output</div>
      </div>

      <div 
        className="cursor-grab relative flex items-center justify-center p-3 h-12 hover:opacity-80 transition-opacity mx-2"
        onDragStart={(event) => onDragStart(event, 'display', 'Display')}
        draggable
      >
        <div className="absolute inset-0 bg-purple-50 rounded-r-full border-2 border-purple-300 shadow-sm" style={{ clipPath: 'polygon(15% 0, 100% 0, 100% 100%, 15% 100%, 0 50%)' }}></div>
        <div className="relative z-10 text-xs font-semibold text-slate-800 text-center ml-2">Display</div>
      </div>

      <div 
        className="cursor-grab relative flex items-center justify-center p-3 h-12 hover:opacity-80 transition-opacity mx-2"
        onDragStart={(event) => onDragStart(event, 'manual_input', 'Manual Input')}
        draggable
      >
        <div className="absolute inset-0 bg-pink-50 border-2 border-pink-300 shadow-sm" style={{ clipPath: 'polygon(0 20%, 100% 0, 100% 100%, 0 100%)' }}></div>
        <div className="relative z-10 text-xs font-semibold text-slate-800 text-center mt-1">Manual Input</div>
      </div>
      
      <div 
        className="cursor-grab p-3 w-16 h-16 mx-auto border-2 border-indigo-300 bg-indigo-50 text-center text-xs font-semibold hover:border-indigo-600 transition-colors rounded-full flex items-center justify-center flex-col leading-tight"
        onDragStart={(event) => onDragStart(event, 'connector', '')}
        draggable
      >
        <span className="text-[10px]">On-page<br/>Connector</span>
      </div>
      
      <div className="mt-auto p-4 bg-slate-50 rounded-xl text-xs text-slate-500 border border-slate-200">
        <p className="font-bold text-slate-700 mb-1">How to play:</p>
        Drag and drop symbols onto the canvas to build your algorithm!
      </div>
    </div>
  );
};

export default Toolbox;
