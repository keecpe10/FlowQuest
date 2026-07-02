import React, { useCallback, useRef, useMemo } from 'react';
import { BaseEdge, useReactFlow, getSmoothStepPath, Position, EdgeLabelRenderer } from 'reactflow';
import type { EdgeProps } from 'reactflow';

const getDistanceToSegment = (p: any, v: any, w: any) => {
  const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
  if (l2 === 0) return Math.sqrt((p.x - v.x) ** 2 + (p.y - v.y) ** 2);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.sqrt((p.x - (v.x + t * (w.x - v.x))) ** 2 + (p.y - (v.y + t * (w.y - v.y))) ** 2);
};

export default function WaypointEdge({
  id,
  sourceX,
  sourceY,
  sourcePosition = Position.Bottom,
  targetX,
  targetY,
  targetPosition = Position.Top,
  style = {},
  markerEnd,
  data,
  label,
}: EdgeProps) {
  const { setEdges, screenToFlowPosition } = useReactFlow();
  const waypoints = data?.waypoints || [];

  const points = [
    { x: sourceX, y: sourceY, pos: sourcePosition },
    ...waypoints.map((wp: any) => ({ x: wp.x, y: wp.y, pos: null })),
    { x: targetX, y: targetY, pos: targetPosition }
  ];

  const pathSegments = useMemo(() => {
    const segments = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];

      let sPos = p1.pos;
      if (!sPos) {
        sPos = Math.abs(p2.x - p1.x) > Math.abs(p2.y - p1.y) 
          ? (p2.x > p1.x ? Position.Right : Position.Left)
          : (p2.y > p1.y ? Position.Bottom : Position.Top);
      }
      
      let tPos = p2.pos;
      if (!tPos) {
        tPos = Math.abs(p2.x - p1.x) > Math.abs(p2.y - p1.y) 
          ? (p2.x > p1.x ? Position.Left : Position.Right)
          : (p2.y > p1.y ? Position.Top : Position.Bottom);
      }

      const [segmentPath] = getSmoothStepPath({
        sourceX: p1.x,
        sourceY: p1.y,
        sourcePosition: sPos,
        targetX: p2.x,
        targetY: p2.y,
        targetPosition: tPos,
        borderRadius: 0,
      });
      segments.push({ path: segmentPath, isLast: i === points.length - 2 });
    }
    return segments;
  }, [points]);

  const fullPath = useMemo(() => {
    return pathSegments.reduce((acc, seg, i) => {
      if (i === 0) return seg.path;
      return acc + ' ' + seg.path.replace(/^M[^L]+/, '');
    }, '');
  }, [pathSegments]);

  const labelMarkup = useMemo(() => {
    if (!label || points.length < 2) return null;
    const p1 = points[0];
    const p2 = points[1];
    const labelX = (p1.x + p2.x) / 2;
    const labelY = (p1.y + p2.y) / 2;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    let offsetX = 0;
    let offsetY = 0;
    if (Math.abs(dx) > Math.abs(dy)) {
       offsetY = -15; 
    } else {
       offsetX = 15; 
    }
    return (
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX + offsetX}px, ${labelY + offsetY}px)`,
            pointerEvents: 'none',
          }}
          className="text-sm font-bold text-slate-700 bg-white/50 backdrop-blur-sm px-1 rounded nodrag nopan"
        >
          {label}
        </div>
      </EdgeLabelRenderer>
    );
  }, [label, points]);

  const draggingIndex = useRef<number | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent, index: number) => {
    e.stopPropagation();
    draggingIndex.current = index;
    (e.target as Element).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (draggingIndex.current === null) return;
      e.stopPropagation();

      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      
      const snap = 16;
      position.x = Math.round(position.x / snap) * snap;
      position.y = Math.round(position.y / snap) * snap;

      setEdges((edges) =>
        edges.map((edge) => {
          if (edge.id === id) {
            const newWaypoints = [...(edge.data?.waypoints || [])];
            newWaypoints[draggingIndex.current!] = position;
            return {
              ...edge,
              data: {
                ...edge.data,
                waypoints: newWaypoints,
              },
            };
          }
          return edge;
        })
      );
    },
    [id, setEdges, screenToFlowPosition]
  );

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (draggingIndex.current !== null) {
      e.stopPropagation();
      (e.target as Element).releasePointerCapture(e.pointerId);
      draggingIndex.current = null;
    }
  }, []);

  const onEdgePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    
    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      const dist = Math.sqrt(Math.pow(position.x - wp.x, 2) + Math.pow(position.y - wp.y, 2));
      if (dist <= 25) {
        draggingIndex.current = i;
        (e.target as Element).setPointerCapture(e.pointerId);
        return;
      }
    }
    
    const currentPoints = [
      { x: sourceX, y: sourceY },
      ...waypoints,
      { x: targetX, y: targetY }
    ];
    
    let minDistance = Infinity;
    let insertIndex = 0;
    
    for (let i = 0; i < currentPoints.length - 1; i++) {
      const dist = getDistanceToSegment(position, currentPoints[i], currentPoints[i + 1]);
      if (dist < minDistance) {
        minDistance = dist;
        insertIndex = i;
      }
    }
    
    setEdges((edges) =>
      edges.map((edge) => {
        if (edge.id === id) {
          const newWaypoints = [...(edge.data?.waypoints || [])];
          newWaypoints.splice(insertIndex, 0, position);
          return {
            ...edge,
            data: {
              ...edge.data,
              waypoints: newWaypoints,
            },
          };
        }
        return edge;
      })
    );
    
    draggingIndex.current = insertIndex;
    (e.target as Element).setPointerCapture(e.pointerId);
  }, [id, setEdges, screenToFlowPosition, sourceX, sourceY, targetX, targetY, waypoints]);

  const onWaypointDoubleClick = useCallback((e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    setEdges((edges) =>
      edges.map((edge) => {
        if (edge.id === id) {
          const newWaypoints = [...(edge.data?.waypoints || [])];
          newWaypoints.splice(index, 1);
          return {
            ...edge,
            data: {
              ...edge.data,
              waypoints: newWaypoints,
            },
          };
        }
        return edge;
      })
    );
  }, [id, setEdges]);

  return (
    <>
      <g className="react-flow__edge-path">
        {pathSegments.map((seg, i) => (
          <BaseEdge key={i} id={`${id}-${i}`} path={seg.path} style={style} markerEnd={seg.isLast ? markerEnd : undefined} />
        ))}
      </g>
      {labelMarkup}
      
      <path
        d={fullPath}
        fill="none"
        strokeOpacity={0}
        strokeWidth={20}
        className="react-flow__edge-interaction"
        onPointerDown={onEdgePointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ cursor: 'crosshair' }}
      />

      {waypoints.map((wp: any, index: number) => (
        <g
          key={index}
          style={{ cursor: 'crosshair' }}
          onPointerDown={(e) => onPointerDown(e, index)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={(e) => onWaypointDoubleClick(e, index)}
        >
          <circle cx={wp.x} cy={wp.y} r={25} fill="transparent" stroke="transparent" style={{ pointerEvents: 'all' }} />
          <circle
            cx={wp.x}
            cy={wp.y}
            r={6}
            fill="#3b82f6"
            stroke="#ffffff"
            strokeWidth={2}
          />
        </g>
      ))}
    </>
  );
}
