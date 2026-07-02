import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactFlow, {
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
  ReactFlowProvider,
} from 'reactflow';
import type { Connection, Edge, Node } from 'reactflow';
import 'reactflow/dist/style.css';
import axios from 'axios';
import Swal from 'sweetalert2';
import { Save, Trash2, X, ArrowLeft, Undo2, Redo2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { nodeTypes } from '../components/CustomNodes';
import WaypointEdge from '../components/WaypointEdge';
import Toolbox from '../components/Toolbox';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { useHistory } from '../hooks/useHistory';

const getId = () => `node_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

const edgeTypes = {
  waypoint: WaypointEdge,
};

const TeacherFlowBuilderCore: React.FC = () => {
  const { id: missionId } = useParams();
  const navigate = useNavigate();
  const token = useAuthStore(state => state.token);
  
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const { undo, redo, canUndo, canRedo } = useHistory(nodes, edges, setNodes, setEdges);
  
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ status: 'success' | 'failed', message: string } | null>(null);

  // Modal State for node editing
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingNode, setPendingNode] = useState<any>(null);
  const [nodeInputText, setNodeInputText] = useState('');

  // Load existing solution
  useEffect(() => {
    const fetchMission = async () => {
      try {
        const response = await axios.get(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/missions/${missionId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.data.solution_nodes) {
          setNodes(response.data.solution_nodes);
        }
        if (response.data.solution_edges) {
          setEdges(response.data.solution_edges);
        }
      } catch (error) {
        console.error("Failed to load mission solution", error);
      }
    };
    if (missionId) fetchMission();
  }, [missionId, token, setNodes, setEdges]);

  const onConnect = useCallback(
    async (params: Edge | Connection) => {
      const sourceNode = nodes.find(n => n.id === params.source);
      let label = undefined;

      if (sourceNode?.type === 'decision') {
        const result = await Swal.fire({
          title: 'เลือกประเภทเส้น',
          text: 'เส้นนี้คือ "จริง" หรือ "เท็จ"?',
          icon: 'question',
          showDenyButton: true,
          confirmButtonText: 'จริง (True)',
          denyButtonText: 'เท็จ (False)',
          confirmButtonColor: '#10b981',
          denyButtonColor: '#ef4444',
          allowOutsideClick: false,
        });
        label = result.isConfirmed ? 'จริง' : 'เท็จ';
      }

      setEdges((eds) => addEdge({ 
        ...params, 
        type: 'waypoint',
        label,
        data: { waypoints: [] },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
        style: { stroke: '#94a3b8', strokeWidth: 2 }
      }, eds));
    },
    [nodes, setEdges]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');
      const label = event.dataTransfer.getData('application/reactflow-label');

      if (typeof type === 'undefined' || !type) return;
      if (!reactFlowInstance || !reactFlowWrapper.current) return;

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = reactFlowInstance.project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });
      
      setPendingNode({ type, position, defaultLabel: label, isEdit: false });
      setNodeInputText(label);
      setIsModalOpen(true);
    },
    [reactFlowInstance]
  );

  const handleModalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingNode) return;

    if (pendingNode.isEdit) {
      setNodes((nds) => 
        nds.map((n) => 
          n.id === pendingNode.id 
            ? { ...n, data: { ...n.data, label: nodeInputText } }
            : n
        )
      );
    } else {
      const newNode = {
        id: getId(),
        type: pendingNode.type,
        position: pendingNode.position,
        data: { label: nodeInputText },
      };
      setNodes((nds) => nds.concat(newNode));
    }
    
    setIsModalOpen(false);
    setPendingNode(null);
  };

  const onNodeDoubleClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      setPendingNode({ 
        id: node.id, 
        type: node.type, 
        position: node.position, 
        defaultLabel: node.data.label, 
        isEdit: true 
      });
      setNodeInputText(node.data.label);
      setIsModalOpen(true);
    },
    []
  );

  const saveSolution = async () => {
    setIsSaving(true);
    setFeedback(null);
    try {
      await axios.put(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/missions/${missionId}/solution`, {
        solution_nodes: nodes,
        solution_edges: edges,
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFeedback({ status: 'success', message: 'Solution saved successfully!' });
    } catch (error: any) {
      setFeedback({ status: 'failed', message: 'Failed to save solution.' });
    } finally {
      setIsSaving(false);
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  const clearCanvas = () => {
    setNodes([]);
    setEdges([]);
  };

  const deleteSelected = () => {
    setNodes((nds) => nds.filter((n) => !n.selected));
    setEdges((eds) => eds.filter((e) => !e.selected));
  };
  
  const hasSelectedElements = nodes.some((n) => n.selected) || edges.some((e) => e.selected);

  return (
    <div className="flex h-screen bg-slate-50 w-full overflow-hidden">
      <Toolbox />
      <div className="flex-1 flex flex-col h-full relative" ref={reactFlowWrapper}>
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between z-10 shadow-sm">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-700 transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Mission Designer</h1>
              <p className="text-xs text-slate-500 font-medium">Build the exact solution flowchart for this mission</p>
            </div>
          </div>
          
          <button 
            onClick={saveSolution}
            disabled={isSaving}
            className="px-6 py-2 rounded-xl font-bold text-white bg-primary-600 hover:bg-primary-700 transition-all flex items-center gap-2 shadow-sm disabled:opacity-70"
          >
            <Save size={18} />
            {isSaving ? 'Saving...' : 'Save Solution'}
          </button>
        </header>

        <AnimatePresence>
          {feedback && (
            <motion.div 
              initial={{ opacity: 0, y: -20, x: '-50%' }}
              animate={{ opacity: 1, y: 0, x: '-50%' }}
              exit={{ opacity: 0, y: -20, x: '-50%' }}
              className={`absolute top-20 left-1/2 z-50 px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3 border ${
                feedback.status === 'success' 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}
            >
              <span className="font-bold">{feedback.message}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {isModalOpen && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/20 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-slate-800">
                  {pendingNode?.isEdit ? 'Edit Node Text' : 'Enter Node Text'}
                </h3>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={20} />
                </button>
              </div>
              
              <form onSubmit={handleModalSubmit}>
                <input
                  type="text"
                  value={nodeInputText}
                  onChange={(e) => setNodeInputText(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 mb-6"
                  placeholder="e.g., Check if x > 5"
                  autoFocus
                />
                
                <div className="flex justify-end gap-3">
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl font-bold text-white bg-primary-600 hover:bg-primary-700 w-full"
                  >
                    {pendingNode?.isEdit ? 'Save Changes' : 'Add Node'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={setReactFlowInstance}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onNodeDoubleClick={onNodeDoubleClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={{ type: 'waypoint', style: { stroke: '#94a3b8', strokeWidth: 2 } }}
          snapToGrid={true}
          snapGrid={[16, 16]}
          fitView
        >
          <Controls className="bg-white shadow-lg border-none" />
          <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
        </ReactFlow>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white/90 backdrop-blur-md p-2 rounded-2xl shadow-xl border border-white">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="p-2.5 rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-30 transition-colors"
            title="Undo"
          >
            <Undo2 size={18} />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="p-2.5 rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-30 transition-colors"
            title="Redo"
          >
            <Redo2 size={18} />
          </button>
          <div className="w-px h-8 bg-slate-200"></div>
          <button 
            onClick={clearCanvas}
            className="px-4 py-2 rounded-xl font-medium text-rose-500 hover:bg-rose-50"
          >
            <Trash2 size={18} /> Clear All
          </button>
          {hasSelectedElements && (
            <>
              <div className="w-px h-6 bg-slate-200"></div>
              <button 
                onClick={deleteSelected}
                className="px-4 py-2 rounded-xl font-medium text-amber-500 hover:bg-amber-50"
              >
                <X size={18} /> Delete Selected
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const TeacherFlowBuilder = () => (
  <ReactFlowProvider>
    <TeacherFlowBuilderCore />
  </ReactFlowProvider>
)

export default TeacherFlowBuilder;
