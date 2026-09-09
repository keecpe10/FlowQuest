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
  onChange: (v: any) => void;   // {nodes, edges} — เดิมเป็นรายการเส้นล้วน
  disabled?: boolean;
}

// id ของบล็อกคงเดิมจากเฉลย เปลี่ยนแค่ตำแหน่ง (สูตรเดียวกับ FlowBuilder.tsx โหมดปริศนา)
// การตรวจจึงเทียบเส้นกันได้ตรงโดย id แม้ตำแหน่งบนจอจะถูกสลับไปแล้ว
const scramble = (nodes: any[]): Node[] =>
  nodes.map((n, i) => ({
    ...n,
    position: { x: 100 + (i % 3) * 150, y: 100 + Math.floor(i / 3) * 100 },
  }));

// เก็บทั้งตำแหน่งบล็อกที่นักเรียนลากจัดไว้และรูปร่างของเส้น เพื่อให้ผังงานหน้าตา
// เหมือนเดิมเมื่อกลับมาทำต่อหรือเมื่อครูเปิดดูคำตอบ
//
// จุดหักของเส้นเป็นพิกัดสัมบูรณ์ จึงมีความหมายก็ต่อเมื่อบล็อกอยู่ที่เดิม การเก็บ
// ตำแหน่งบล็อกไปด้วยจึงเป็นเงื่อนไขที่ทำให้เก็บจุดหักได้
//
// การให้คะแนนไม่สนใจฟิลด์พวกนี้เลย (ดู extract_connections ฝั่งเซิร์ฟเวอร์ ซึ่งเทียบ
// แค่ source/target/label) คำตอบรูปแบบเก่าที่เป็นรายการเส้นล้วนก็ยังตรวจได้เหมือนเดิม
const cleanAnswer = (ns: Node[], es: Edge[]) => ({
  nodes: ns.map((n) => ({ id: n.id, position: { x: n.position.x, y: n.position.y } })),
  edges: es.map((e) => ({
    source: e.source,
    target: e.target,
    label: typeof e.label === 'string' ? e.label : '',
    sourceHandle: e.sourceHandle ?? null,
    targetHandle: e.targetHandle ?? null,
    data: { waypoints: (e.data?.waypoints ?? []) as { x: number; y: number }[] },
  })),
});

/** แกะคำตอบที่บันทึกไว้ รองรับทั้งรายการเส้นล้วน (ของเดิม และเฉลยของครู)
 *  กับ {nodes, edges} (คำตอบที่นักเรียนบันทึกไว้แบบใหม่) */
const readAnswer = (value: any): { nodes: any[] | null; edges: any[] } => {
  if (Array.isArray(value)) return { nodes: null, edges: value };
  if (value && Array.isArray(value.edges)) {
    return { nodes: Array.isArray(value.nodes) ? value.nodes : null, edges: value.edges };
  }
  return { nodes: null, edges: [] };
};

/**
 * ตัวตอบผังงานในข้อสอบ MCQ — ทำตัวเหมือน FlowBuilder.tsx โหมดปริศนา (student flowchart
 * player): บล็อกมีให้ครบตามเฉลยแต่สลับตำแหน่ง ลากบล็อกได้ ลากเส้นเชื่อมได้ ต่อจากบล็อก
 * ตัดสินใจจะถามจริง/เท็จผ่าน SweetAlert เหมือนกัน แต่ "เพิ่ม/ลบบล็อกไม่ได้" — จึงไม่มี Toolbox
 * ให้ลากบล็อกใหม่ และ onNodesChange กรองการเปลี่ยนแปลงชนิด "remove" ทิ้งเสมอ กันไม่ให้ปุ่ม
 * ลบ/คีย์ลัดของ ReactFlow เผลอลบบล็อกออกจากชุด (ต่างจาก FlowBuilder.tsx ที่ปล่อยผ่านตรง ๆ
 * เพราะสัญญาของข้อสอบต้องให้ id ของบล็อกครบตามเฉลยเสมอ)
 */
const Canvas: React.FC<Props> = ({ metadata, value, onChange, disabled }) => {
  const saved = readAnswer(value);

  // ถ้าเคยบันทึกตำแหน่งที่นักเรียนจัดไว้ ใช้ตำแหน่งนั้น ไม่งั้นค่อยสลับตำแหน่งให้ใหม่
  const savedPos = new Map((saved.nodes || []).map((n: any) => [n.id, n.position]));
  const startNodes = savedPos.size
    ? (metadata?.nodes || []).map((n: any) => ({ ...n, position: savedPos.get(n.id) || n.position }))
    : scramble(metadata?.nodes || []);

  const [nodes, setNodes, onNodesChangeRaw] = useNodesState(startNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    saved.edges.map((e: any, i: number) => ({
      id: `sa${i}`,
      source: e.source,
      target: e.target,
      label: e.label || '',
      type: 'waypoint',
      // คืนจุดต่อที่บันทึกไว้ ทั้งของคำตอบนักเรียนเองและของเฉลยที่ครูออกแบบ
      // (หน้าจบข้อสอบเอาเฉลยมาแสดงผ่านคอมโพเนนต์ตัวเดียวกันนี้)
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
      // คืนจุดหักเฉพาะตอนที่รู้ตำแหน่งบล็อกด้วย ถ้าไม่รู้ (เฉลยของครูซึ่งเซิร์ฟเวอร์
      // ล้างตำแหน่งทิ้งไม่ให้ใบ้ลำดับ) จุดหักจะชี้ไปคนละที่จนเส้นเพี้ยนกว่าเดิม
      data: { waypoints: savedPos.size ? (e.data?.waypoints ?? []) : [] },
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
  // รวมตำแหน่งบล็อกเข้าไปด้วย เพราะจุดหักของเส้นจะมีความหมายก็ต่อเมื่อบล็อกอยู่ที่เดิม
  const lastPushed = useRef(JSON.stringify(cleanAnswer(nodes, edges)));
  useEffect(() => {
    const payload = cleanAnswer(nodes, edges);
    const json = JSON.stringify(payload);
    if (json !== lastPushed.current) {
      lastPushed.current = json;
      onChangeRef.current(payload);
    }
  }, [nodes, edges]);

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
