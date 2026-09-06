import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background, BackgroundVariant, Controls, MarkerType,
  ReactFlowProvider, addEdge, useEdgesState, useNodesState,
} from 'reactflow';
import type { Connection, Edge, Node } from 'reactflow';
import 'reactflow/dist/style.css';
import Swal from 'sweetalert2';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, X, Undo2, Redo2 } from 'lucide-react';
import { nodeTypes } from '../../CustomNodes';
import WaypointEdge from '../../WaypointEdge';
import Toolbox from '../../Toolbox';
import { useHistory } from '../../../hooks/useHistory';

const edgeTypes = { waypoint: WaypointEdge };

export const emptyFlowchartMeta = () => ({ nodes: [], edges: [] });

const newId = () => `flow_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

interface Props {
  metadata: any;
  onChange: (meta: any) => void;
}

// ส่งขึ้นไปเฉพาะฟิลด์ที่ backend รับ (_clean_flowchart_metadata) — ไม่ยัด state
// ภายในของ ReactFlow (selected, dragging, measured, markerEnd ฯลฯ) ลงฐานข้อมูล
const cleanNodes = (ns: Node[]) => ns.map((n) => ({
  id: n.id,
  type: n.type,
  position: { x: n.position.x, y: n.position.y },
  data: { label: n.data?.label ?? '' },
}));

const cleanEdges = (es: Edge[]) => es.map((e) => ({
  source: e.source,
  target: e.target,
  label: typeof e.label === 'string' ? e.label : '',
}));

const edgeStyle = {
  markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
  style: { stroke: '#94a3b8', strokeWidth: 2 },
};

/**
 * ตัวแก้โจทย์ผังงานในฟอร์มครู — ทำตัวเหมือน TeacherFlowBuilder (มิชชันผังงานเดี่ยว)
 * ให้มากที่สุด: ลากบล็อกจาก Toolbox, โมดัลตั้งชื่อบล็อกตัวเดียวกันทั้งวางใหม่/ดับเบิลคลิกแก้,
 * ถามจริง/เท็จตอนต่อเส้นจากบล็อกตัดสินใจ, undo/redo, ล้างทั้งหมด, ลบที่เลือก
 *
 * ต่างจาก TeacherFlowBuilder ตรงที่ไม่มีปุ่มบันทึก/หัวหน้า — ฝังอยู่ในการ์ดคำถาม
 * และรายงานการเปลี่ยนแปลงผ่าน onChange เท่านั้น ไม่รู้จัก axios หรือ mission id
 */
const Canvas: React.FC<Props> = ({ metadata, onChange }) => {
  const meta = metadata && Array.isArray(metadata.nodes) ? metadata : emptyFlowchartMeta();

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(meta.nodes as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    (meta.edges as any[]).map((e, i) => ({
      id: `e${i}`,
      source: e.source,
      target: e.target,
      label: e.label || '',
      type: 'waypoint',
      data: { waypoints: [] },
      ...edgeStyle,
    }))
  );
  const [flowInstance, setFlowInstance] = useState<any>(null);
  const { undo, redo, canUndo, canRedo } = useHistory(nodes, edges, setNodes, setEdges);

  // โมดัลตั้งชื่อบล็อก — ตัวเดียวกันทั้งตอนวางบล็อกใหม่และดับเบิลคลิกแก้ข้อความเดิม
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingNode, setPendingNode] = useState<any>(null);
  const [nodeInputText, setNodeInputText] = useState('');

  // รายงานขึ้น QuestionForm จาก effect เท่านั้น ไม่เรียก onChange จากภายใน updater
  // ของ setNodes/setEdges (จะชนกับการเรนเดอร์ของคอมโพเนนต์แม่) — เทียบ JSON กับ
  // ครั้งก่อนหน้าเพื่อไม่ให้ยิง onChange ตอนแค่คลิกเลือกโหนด (selected เปลี่ยนแต่
  // payload ที่เก็บจริงเหมือนเดิม) และ onChange ถูกเก็บผ่าน ref กันไม่ให้การเรนเดอร์
  // ใหม่ของฟอร์มแม่ (ที่ทำให้ onChange เป็นฟังก์ชันคนละตัว) ไปยิง effect ซ้ำ
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const lastPushed = useRef(JSON.stringify({ nodes: cleanNodes(nodes), edges: cleanEdges(edges) }));
  useEffect(() => {
    const payload = { nodes: cleanNodes(nodes), edges: cleanEdges(edges) };
    const json = JSON.stringify(payload);
    if (json !== lastPushed.current) {
      lastPushed.current = json;
      onChangeRef.current(payload);
    }
  }, [nodes, edges]);

  const onConnect = useCallback(async (params: Edge | Connection) => {
    const source = nodes.find((n) => n.id === params.source);
    let label: string | undefined;
    if (source?.type === 'decision') {
      const res = await Swal.fire({
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
      label = res.isConfirmed ? 'จริง' : 'เท็จ';
    }
    setEdges((eds) => addEdge({
      ...params, type: 'waypoint', label, data: { waypoints: [] }, ...edgeStyle,
    }, eds));
  }, [nodes, setEdges]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const type = event.dataTransfer.getData('application/reactflow');
    const label = event.dataTransfer.getData('application/reactflow-label');
    if (!type || !flowInstance || !wrapperRef.current) return;

    const bounds = wrapperRef.current.getBoundingClientRect();
    const position = flowInstance.project({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    });

    setPendingNode({ type, position, isEdit: false });
    setNodeInputText(label);
    setIsModalOpen(true);
  }, [flowInstance]);

  const onNodeDoubleClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setPendingNode({ id: node.id, isEdit: true });
    setNodeInputText(node.data?.label ?? '');
    setIsModalOpen(true);
  }, []);

  const handleModalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingNode) return;

    if (pendingNode.isEdit) {
      setNodes((nds) => nds.map((n) => (
        n.id === pendingNode.id ? { ...n, data: { ...n.data, label: nodeInputText } } : n
      )));
    } else {
      setNodes((nds) => nds.concat({
        id: newId(),
        type: pendingNode.type,
        position: pendingNode.position,
        data: { label: nodeInputText },
      } as Node));
    }

    setIsModalOpen(false);
    setPendingNode(null);
  };

  const clearCanvas = () => {
    setNodes([]);
    setEdges([]);
  };

  // ลบโหนดที่เลือกแล้วต้องลบเส้นที่เกาะโหนดนั้นไปด้วย แม้เส้นเองจะไม่ได้ถูกเลือกก็ตาม
  // ไม่งั้นจะเหลือเส้นที่ชี้ไปยัง id ที่ไม่มีอยู่แล้ว ซึ่ง backend ปฏิเสธด้วย 400
  const deleteSelected = () => {
    const removedIds = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
    setNodes((nds) => nds.filter((n) => !n.selected));
    setEdges((eds) => eds.filter((e) => (
      !e.selected && !removedIds.has(e.source) && !removedIds.has(e.target)
    )));
  };

  const hasSelected = nodes.some((n) => n.selected) || edges.some((e) => e.selected);

  const types = useMemo(() => nodeTypes, []);
  const eTypes = useMemo(() => edgeTypes, []);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border-2 border-slate-200 overflow-hidden flex h-[520px]">
        <div className="shrink-0 overflow-y-auto">
          <Toolbox />
        </div>

        <div className="flex-1 relative" ref={wrapperRef}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setFlowInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeDoubleClick={onNodeDoubleClick}
            nodeTypes={types}
            edgeTypes={eTypes}
            snapToGrid
            snapGrid={[16, 16]}
            fitView
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>

          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white/95 backdrop-blur-md p-1.5 rounded-2xl shadow-lg border border-slate-200">
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              title="เลิกทำ"
              className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-30 transition-colors"
            >
              <Undo2 size={16} />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!canRedo}
              title="ทำซ้ำ"
              className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 disabled:opacity-30 transition-colors"
            >
              <Redo2 size={16} />
            </button>
            <div className="w-px h-6 bg-slate-200" />
            <button
              type="button"
              onClick={clearCanvas}
              className="px-3 py-1.5 rounded-xl text-sm font-medium text-rose-500 hover:bg-rose-50 flex items-center gap-1 transition-colors"
            >
              <Trash2 size={14} /> ล้างทั้งหมด
            </button>
            {hasSelected && (
              <button
                type="button"
                onClick={deleteSelected}
                className="px-3 py-1.5 rounded-xl text-sm font-medium text-amber-600 hover:bg-amber-50 flex items-center gap-1 transition-colors"
              >
                <X size={14} /> ลบที่เลือก
              </button>
            )}
          </div>

          <AnimatePresence>
            {isModalOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/20 backdrop-blur-sm"
              >
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="bg-white rounded-2xl shadow-2xl p-5 w-full max-w-xs"
                >
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-bold text-slate-800">
                      {pendingNode?.isEdit ? 'แก้ไขข้อความบล็อก' : 'ข้อความในบล็อก'}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <form onSubmit={handleModalSubmit}>
                    <input
                      type="text"
                      value={nodeInputText}
                      onChange={(e) => setNodeInputText(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-400 mb-4 text-sm"
                      placeholder="เช่น ตรวจสอบว่า x > 5"
                      autoFocus
                    />
                    <button
                      type="submit"
                      className="w-full px-4 py-2 rounded-xl font-bold text-white bg-violet-600 hover:bg-violet-700 transition-colors text-sm"
                    >
                      {pendingNode?.isEdit ? 'บันทึก' : 'เพิ่มบล็อก'}
                    </button>
                  </form>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <p className="text-sm text-slate-500">
        {nodes.length < 2 || edges.length < 1
          ? 'ต้องมีบล็อกอย่างน้อย 2 บล็อกและเส้นอย่างน้อย 1 เส้น — ข้อนี้จะถูกเก็บเป็นข้อร่าง'
          : `เฉลยมี ${nodes.length} บล็อก ${edges.length} เส้น — นักเรียนจะได้บล็อกชุดนี้แบบสลับตำแหน่งแล้วลากเส้นเอง`}
      </p>
    </div>
  );
};

const FlowchartQuestionEditor: React.FC<Props> = (props) => (
  <ReactFlowProvider>
    <Canvas {...props} />
  </ReactFlowProvider>
);

export default FlowchartQuestionEditor;
