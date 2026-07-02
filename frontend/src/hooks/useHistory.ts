import { useState, useCallback, useEffect, useRef } from 'react';
import type { Node, Edge } from 'reactflow';

export function useHistory(
  nodes: Node[],
  edges: Edge[],
  setNodes: (nodes: Node[] | ((nds: Node[]) => Node[])) => void,
  setEdges: (edges: Edge[] | ((eds: Edge[]) => Edge[])) => void
) {
  const [history, setHistory] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const skipNextUpdate = useRef(false);

  // Initialize
  useEffect(() => {
    if (history.length === 0 && (nodes.length > 0 || edges.length > 0)) {
      setHistory([{ nodes, edges }]);
      setCurrentIndex(0);
    }
  }, [nodes, edges, history.length]);

  // Debounced save
  useEffect(() => {
    if (skipNextUpdate.current) {
      skipNextUpdate.current = false;
      return;
    }

    if (nodes.length === 0 && edges.length === 0 && history.length === 0) return;

    const timer = setTimeout(() => {
      setHistory((prev) => {
        const past = prev.slice(0, currentIndex + 1);
        const lastState = past[past.length - 1];

        // Don't save if identical (simple JSON compare handles simple React Flow objects)
        if (
          lastState &&
          JSON.stringify(lastState.nodes) === JSON.stringify(nodes) &&
          JSON.stringify(lastState.edges) === JSON.stringify(edges)
        ) {
          return prev;
        }

        const newHistory = [...past, { nodes, edges }];
        setCurrentIndex(newHistory.length - 1);
        return newHistory;
      });
    }, 500);

    return () => clearTimeout(timer);
  }, [nodes, edges, currentIndex, history.length]);

  const undo = useCallback(() => {
    if (currentIndex > 0) {
      skipNextUpdate.current = true;
      const prevIndex = currentIndex - 1;
      setCurrentIndex(prevIndex);
      
      // Deep clone to avoid direct mutation issues
      const prevNodes = JSON.parse(JSON.stringify(history[prevIndex].nodes));
      const prevEdges = JSON.parse(JSON.stringify(history[prevIndex].edges));
      
      setNodes(prevNodes);
      setEdges(prevEdges);
    }
  }, [currentIndex, history, setNodes, setEdges]);

  const redo = useCallback(() => {
    if (currentIndex < history.length - 1) {
      skipNextUpdate.current = true;
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      
      // Deep clone to avoid direct mutation issues
      const nextNodes = JSON.parse(JSON.stringify(history[nextIndex].nodes));
      const nextEdges = JSON.parse(JSON.stringify(history[nextIndex].edges));
      
      setNodes(nextNodes);
      setEdges(nextEdges);
    }
  }, [currentIndex, history, setNodes, setEdges]);

  const canUndo = currentIndex > 0;
  const canRedo = currentIndex < history.length - 1;

  return { undo, redo, canUndo, canRedo };
}
