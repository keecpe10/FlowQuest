import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  ReactFlowProvider,
  MarkerType,
} from 'reactflow';
import type { Connection, Edge, Node } from 'reactflow';
import 'reactflow/dist/style.css';
import axios from 'axios';
import Swal from 'sweetalert2';
import { Play, CheckCircle2, AlertCircle, Trash2, X, RotateCcw, Undo2, Redo2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { nodeTypes } from './components/CustomNodes';
import WaypointEdge from './components/WaypointEdge';
import { useParams } from 'react-router-dom';
import { useAuthStore } from './store/useAuthStore';
import { useHistory } from './hooks/useHistory';
import LiveTimer from './components/LiveTimer';



const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

const edgeTypes = {
  waypoint: WaypointEdge,
};

const getId = () => `dndnode_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

const FlowBuilderCore: React.FC = () => {
  const { id: missionId } = useParams();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const { undo, redo, canUndo, canRedo } = useHistory(nodes, edges, setNodes, setEdges);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ status: 'success' | 'failed', message: string, points: number } | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingNode, setPendingNode] = useState<any>(null);
  const [nodeInputText, setNodeInputText] = useState('');
  
  const token = useAuthStore(state => state.token);
  const user = useAuthStore(state => state.user);

  useEffect(() => {
    const fetchMission = async () => {
      try {
        const response = await axios.get(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/missions/${missionId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.data.started_at) {
          setStartedAt(response.data.started_at);
        }
        
        if (response.data.saved_progress) {
          setNodes(response.data.saved_progress.nodes);
          setEdges(response.data.saved_progress.edges);
          
          // Initial ping to mark as online immediately
          axios.put(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/game/save-progress`, {
            mission_id: parseInt(missionId || '0'),
            nodes: response.data.saved_progress.nodes,
            edges: response.data.saved_progress.edges
          }, {
            headers: { Authorization: `Bearer ${token}` }
          }).catch(console.error);
        } else if (response.data.solution_nodes) {
          // Scramble positions
          const scrambled = response.data.solution_nodes.map((node: Node, index: number) => ({
            ...node,
            position: {
              x: 100 + (index % 3) * 150,
              y: 100 + Math.floor(index / 3) * 100
            }
          }));
          setNodes(scrambled);
          
          // Initial ping to mark as online immediately
          axios.put(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/game/save-progress`, {
            mission_id: parseInt(missionId || '0'),
            nodes: scrambled,
            edges: []
          }, {
            headers: { Authorization: `Bearer ${token}` }
          }).catch(console.error);
        }
      } catch (error) {
        console.error("Failed to fetch mission", error);
      }
    };
    if (missionId && user) fetchMission();
  }, [missionId, token, setNodes, setEdges, user]);

  // Auto-save progress with debounce
  useEffect(() => {
    if (nodes.length === 0 || !user || !missionId) return;
    
    const timeoutId = setTimeout(async () => {
      try {
        await axios.put(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/game/save-progress`, {
          mission_id: parseInt(missionId || '0'),
          nodes,
          edges
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (error) {
        console.error("Failed to save progress", error);
      }
    }, 2000);
    
    return () => clearTimeout(timeoutId);
  }, [nodes, edges, missionId, user, token]);

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
      // Disabled in Puzzle Mode
    },
    []
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
      // Disabled in Puzzle Mode
    },
    []
  );

  const submitFlowchart = async () => {
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const token = useAuthStore.getState().token;
      const response = await axios.post(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/game/submit`, {
        nodes,
        edges,
        mission_id: parseInt(missionId || '1')
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.status === 'success') {
        // Do not clear progress on success so teacher can view the final result
        
        setFeedback({
          status: 'success',
          message: response.data.message,
          points: response.data.points
        });
      } else {
        setFeedback(response.data);
      }
    } catch (error: any) {
      if (error.response && error.response.data) {
        setFeedback(error.response.data);
      } else {
        setFeedback({ status: 'failed', message: 'Network error.', points: 0 });
      }
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };
  
  const clearCanvas = () => {
    // Only clear edges, leave nodes alone in puzzle mode
    setEdges([]);
    setFeedback(null);
  };

  const deleteSelected = () => {
    // Only allow deleting edges in puzzle mode
    setEdges((eds) => eds.filter((e) => !e.selected));
  };
  
  const hasSelectedElements = nodes.some((n) => n.selected) || edges.some((e) => e.selected);

  const resetProgress = async () => {
    const result = await Swal.fire({
      title: 'Reset Puzzle?',
      text: "Are you sure you want to reset the puzzle to its initial state?",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3b82f6',
      cancelButtonColor: '#ef4444',
      confirmButtonText: 'Yes, reset it!',
      cancelButtonText: 'Cancel'
    });

    if (result.isConfirmed) {
      try {
        if (user && missionId) {
          await axios.delete(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/game/save-progress?mission_id=${missionId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
        }
        
        const response = await axios.get(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/missions/${missionId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.data.solution_nodes) {
          const scrambled = response.data.solution_nodes.map((node: Node, index: number) => ({
            ...node,
            position: { x: 100 + (index % 3) * 150, y: 100 + Math.floor(index / 3) * 100 }
          }));
          setNodes(scrambled);
          setEdges([]);
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  return (
    <div className="flex-1 relative w-full h-full bg-slate-50/50" ref={reactFlowWrapper}>
      <AnimatePresence>
        {feedback && (
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="absolute top-6 left-0 right-0 mx-auto w-max z-50 pointer-events-none"
          >
            <div className={`px-6 py-4 rounded-2xl shadow-xl flex items-center gap-4 ${
              feedback.status === 'success' 
                ? 'bg-gradient-to-r from-emerald-500 to-emerald-400 text-white shadow-emerald-500/20' 
                : 'bg-gradient-to-r from-rose-500 to-rose-400 text-white shadow-rose-500/20'
            }`}>
              {feedback.status === 'success' ? <CheckCircle2 size={28} /> : <AlertCircle size={28} />}
              <div>
                <p className="font-bold text-lg">{feedback.message}</p>
                {feedback.points > 0 && (
                  <p className="text-emerald-100 font-medium">+{feedback.points} Points Awarded!</p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-3xl p-6 shadow-2xl w-full max-w-sm border border-slate-100"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-slate-800">
                  {pendingNode?.type === 'decision' ? 'Enter Condition' : 'Enter Instruction'}
                </h3>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              
              <form onSubmit={handleModalSubmit}>
                <input
                  type="text"
                  value={nodeInputText}
                  onChange={(e) => setNodeInputText(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-colors mb-6"
                  placeholder="e.g., Check if x > 5"
                  autoFocus
                />
                
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-5 py-2.5 rounded-xl font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl font-bold text-white bg-primary-600 hover:bg-primary-700 transition-all shadow-lg shadow-primary-600/30 active:scale-95"
                  >
                    Add Node
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
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
          onClick={resetProgress}
          className="px-4 py-2.5 rounded-xl font-medium text-blue-500 hover:bg-blue-50 hover:text-blue-600 transition-colors flex items-center gap-2"
        >
          <RotateCcw size={18} /> Reset Puzzle
        </button>
        <button 
          onClick={clearCanvas}
          className="px-4 py-2.5 rounded-xl font-medium text-rose-500 hover:bg-rose-50 hover:text-rose-600 transition-colors flex items-center gap-2"
        >
          <Trash2 size={18} /> Clear Edges
        </button>
        {hasSelectedElements && (
          <button 
            onClick={deleteSelected}
            className="px-4 py-2.5 rounded-xl font-medium text-amber-500 hover:bg-amber-50 hover:text-amber-600 transition-colors flex items-center gap-2"
          >
            <X size={18} /> Delete Selected
          </button>
        )}
        <div className="w-px h-8 bg-slate-200"></div>
        <button 
          onClick={submitFlowchart}
          disabled={isSubmitting}
          className="px-6 py-2.5 rounded-xl font-bold text-white bg-primary-600 hover:bg-primary-700 transition-all active:scale-95 flex items-center gap-2 shadow-lg shadow-primary-600/30 disabled:opacity-70"
        >
          {isSubmitting ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Play size={18} fill="currentColor" />
          )}
          Run & Verify
        </button>
      </div>
    </div>
  );
};

const FlowBuilder = () => (
    <ReactFlowProvider>
        <FlowBuilderCore />
    </ReactFlowProvider>
)

export default FlowBuilder;
