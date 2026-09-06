import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import ReactFlow, {
  Background, BackgroundVariant, Controls, MarkerType,
  ReactFlowProvider, addEdge, useEdgesState, useNodesState,
} from 'reactflow';
import type { Connection, Edge, Node, NodeChange } from 'reactflow';
import 'reactflow/dist/style.css';
import Swal from 'sweetalert2';
import { nodeTypes } from '../../CustomNodes';
import WaypointEdge from '../../WaypointEdge';

const edgeTypes = { waypoint: WaypointEdge };

interface Props {
  metadata: any;
  value: any;
  onChange: (v: any[]) => void;
  disabled?: boolean;
}

// id ของบล็อกคงเดิมจากเฉลย เปลี่ยนแค่ตำแหน่ง (สูตรเดียวกับ FlowBuilder.tsx โหมดปริศนา)
// การตรวจจึงเทียบเส้นกันได้ตรงโดย id แม้ตำแหน่งบนจอจะถูกสลับไปแล้ว
const scramble = (nodes: any[]): Node[] =>
  nodes.map((n, i) => ({
    ...n,
    position: { x: 100 + (i % 3) * 150, y: 100 + Math.floor(i / 3) * 100 },
  }));

const cleanEdges = (es: Edge[]) => es.map((e) => ({
  source: e.source,
  target: e.target,
  label: typeof e.label === 'string' ? e.label : '',
}));

/**
 * ตัวตอบผังงานในข้อสอบ MCQ — ทำตัวเหมือน FlowBuilder.tsx โหมดปริศนา (student flowchart
 * player): บล็อกมีให้ครบตามเฉลยแต่สลับตำแหน่ง ลากบล็อกได้ ลากเส้นเชื่อมได้ ต่อจากบล็อก
 * ตัดสินใจจะถามจริง/เท็จผ่าน SweetAlert เหมือนกัน แต่ "เพิ่ม/ลบบล็อกไม่ได้" — จึงไม่มี Toolbox
 * ให้ลากบล็อกใหม่ และ onNodesChange กรองการเปลี่ยนแปลงชนิด "remove" ทิ้งเสมอ กันไม่ให้ปุ่ม
 * ลบ/คีย์ลัดของ ReactFlow เผลอลบบล็อกออกจากชุด (ต่างจาก FlowBuilder.tsx ที่ปล่อยผ่านตรง ๆ
 * เพราะสัญญาของข้อสอบต้องให้ id ของบล็อกครบตามเฉลยเสมอ)
 */
const Canvas: React.FC<Props> = ({ metadata, value, onChange, disabled }) => {
  const [nodes, setNodes, onNodesChangeRaw] = useNodesState(scramble(metadata?.nodes || []));
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    (Array.isArray(value) ? value : []).map((e: any, i: number) => ({
      id: `sa${i}`,
      source: e.source,
      target: e.target,
      label: e.label || '',
      type: 'waypoint',
      data: { waypoints: [] },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
      style: { stroke: '#94a3b8', strokeWidth: 2 },
    }))
  );

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChangeRaw(changes.filter((c) => c.type !== 'remove'));
  }, [onNodesChangeRaw]);

  // ส่งเส้นขึ้นไปเมื่อ edges เปลี่ยนจริง ๆ เท่านั้น (เทียบ JSON กับครั้งก่อน) — ห้ามเรียก
  // onChange ข้างในตัวอัปเดตของ setEdges เพราะนั่นคือการสั่ง parent อัปเดต state ระหว่างที่
  // React กำลังเรนเดอร์คอมโพเนนต์นี้อยู่ (จะเจอคำเตือน "Cannot update a component while
  // rendering a different component") — เก็บ onChange ไว้ใน ref เพราะ parent ส่ง closure
  // ใหม่มาทุก render ถ้าใส่ฟังก์ชันตรง ๆ ใน deps effect จะวนไม่จบ
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const lastPushed = useRef(JSON.stringify(cleanEdges(edges)));
  useEffect(() => {
    const payload = cleanEdges(edges);
    const json = JSON.stringify(payload);
    if (json !== lastPushed.current) {
      lastPushed.current = json;
      onChangeRef.current(payload);
    }
  }, [edges]);

  const onConnect = useCallback(async (params: Edge | Connection) => {
    if (disabled) return;
    const source = nodes.find((n) => n.id === params.source);
    let label: string | undefined;
    if (source?.type === 'decision') {
      const res = await Swal.fire({
        title: 'เลือกประเภทเส้น', text: 'เส้นนี้คือ "จริง" หรือ "เท็จ"?',
        icon: 'question', showDenyButton: true,
        confirmButtonText: 'จริง (True)', denyButtonText: 'เท็จ (False)',
        confirmButtonColor: '#10b981', denyButtonColor: '#ef4444',
        allowOutsideClick: false,
      });
      label = res.isConfirmed ? 'จริง' : 'เท็จ';
    }
    setEdges((eds) => addEdge({
      ...params, type: 'waypoint', label, data: { waypoints: [] },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
      style: { stroke: '#94a3b8', strokeWidth: 2 },
    }, eds));
  }, [disabled, nodes, setEdges]);

  const types = useMemo(() => nodeTypes, []);
  const eTypes = useMemo(() => edgeTypes, []);

  return (
    <div className="h-[28rem] rounded-xl border-2 border-slate-200 overflow-hidden bg-white">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={disabled ? undefined : onNodesChange}
        onEdgesChange={disabled ? undefined : onEdgesChange}
        onConnect={disabled ? undefined : onConnect}
        nodeTypes={types}
        edgeTypes={eTypes}
        snapToGrid
        snapGrid={[16, 16]}
        fitView
        nodesDraggable={!disabled}
        nodesConnectable={!disabled}
        elementsSelectable={!disabled}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
};

const FlowchartAnswer: React.FC<Props> = (props) => (
  <ReactFlowProvider>
    <Canvas {...props} />
  </ReactFlowProvider>
);

export default FlowchartAnswer;
