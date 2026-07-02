import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import ReactFlow, { Background, Controls, MiniMap } from 'reactflow';
import 'reactflow/dist/style.css';
import { useAuthStore } from '../store/useAuthStore';
import { ArrowLeft } from 'lucide-react';
import { nodeTypes as initialNodeTypes } from '../components/CustomNodes';
import WaypointEdge from '../components/WaypointEdge';

const initialEdgeTypes = {
  waypoint: WaypointEdge,
};

const StudentFlowchartView = () => {
  const { id: missionId, studentId } = useParams();
  const token = useAuthStore(state => state.token);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [studentName, setStudentName] = useState('');
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const nodeTypes = React.useMemo(() => initialNodeTypes, []);
  const edgeTypes = React.useMemo(() => initialEdgeTypes, []);

  useEffect(() => {
    const fetchFlowchart = async () => {
      try {
        const response = await axios.get(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/missions/${missionId}/students/${studentId}/flowchart`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setNodes(response.data.nodes || []);
        setEdges(response.data.edges || []);
        setStudentName(response.data.student_name);
        setStatus(response.data.status);
      } catch (error) {
        console.error("Failed to fetch student flowchart", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    if (missionId && studentId && token) {
      fetchFlowchart();
    }
  }, [missionId, studentId, token]);

  return (
    <div className="min-h-screen flex flex-col font-sans w-full bg-slate-50">
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shadow-sm z-10 flex-shrink-0">
        <div className="flex items-center gap-4">
          <Link to={`/teacher/mission/${missionId}/progress`}>
            <button className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors">
              <ArrowLeft size={20} />
            </button>
          </Link>
          <div>
            <h1 className="text-lg font-bold text-slate-800">ผลงานของ: {studentName || 'กำลังโหลด...'}</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              สถานะ: <span className="font-semibold text-slate-600">{status === 'completed' ? 'ผ่านแล้ว' : status === 'not_started' ? 'ยังไม่เริ่ม' : 'กำลังทำ'}</span>
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full relative">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : nodes.length === 0 ? (
           <div className="flex items-center justify-center h-full text-slate-500 flex-col gap-2 absolute inset-0">
             <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
               <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><line x1="9" x2="15" y1="9" y2="9"/><line x1="9" x2="15" y1="15" y2="15"/></svg>
             </div>
             <p>นักเรียนยังไม่ได้เริ่มทำหรือยังไม่มีผังงาน</p>
           </div>
        ) : (
          <div className="absolute inset-0">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
            >
              <Background color="#94a3b8" gap={16} size={1} />
              <Controls showInteractive={false} />
              <MiniMap />
            </ReactFlow>
          </div>
        )}
      </main>
    </div>
  );
};

export default StudentFlowchartView;
