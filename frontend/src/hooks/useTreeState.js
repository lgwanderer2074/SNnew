/* eslint-disable */
import { useState, useCallback, useEffect } from "react";
import { applyNodeChanges, applyEdgeChanges } from "@xyflow/react";
import { calculateLayout } from "../utils/layout";

// Helper to generate unique IDs
const generateId = () => `node_${Math.random().toString(36).substr(2, 9)}`;

/**
 * Custom React hook to manage syntax tree state.
 */
export function useTreeState(initialSentence = "", exportWidth = 960, exportHeight = 550) {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [sentence, setSentence] = useState(initialSentence);

  // Handle category edits for category nodes
  const updateCategory = useCallback((nodeId, newCategory) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              category: newCategory,
              // Reset validation status since category has changed
              isValidated: false,
              isCorrect: false
            }
          };
        }
        return node;
      })
    );
  }, []);

  // Bind category edits to node.data
  const bindCategoryChange = useCallback((nodeList) => {
    return nodeList.map(node => {
      if (node.data && !node.data.onCategoryChange) {
        return {
          ...node,
          data: {
            ...node.data,
            onCategoryChange: updateCategory
          }
        };
      }
      return node;
    });
  }, [updateCategory]);

  // Wrap setNodes to always bind callback and calculate layout
  const setNodesWithLayout = useCallback((updater, currentEdges = edges) => {
    setNodes((prevNodes) => {
      let nextNodes = typeof updater === "function" ? updater(prevNodes) : updater;
      nextNodes = bindCategoryChange(nextNodes);
      return calculateLayout(nextNodes, currentEdges, exportWidth, exportHeight);
    });
  }, [edges, bindCategoryChange, exportWidth, exportHeight]);



  // Initialize nodes based on sentence input
  const initializeSentence = useCallback((text) => {
    setSentence(text);
    if (!text || text.trim() === "") {
      setNodes([]);
      setEdges([]);
      return;
    }

    const words = text.trim().split(/\s+/);
    
    // Create leaf word nodes (separate from category nodes, no category in data)
    const wordNodes = words.map((word, index) => ({
      id: `word_${index}`,
      type: "syntaxNode",
      position: { x: index * 240 + 100, y: 400 },
      data: {
        isWord: true,
        wordIndex: index,
        word: word,
        isValidated: false,
        isCorrect: false
      }
    }));

    // Create corresponding blank category nodes above the word nodes
    const catNodes = words.map((_, index) => ({
      id: `cat_${index}`,
      type: "syntaxNode",
      position: { x: index * 240 + 100, y: 320 },
      data: {
        isWord: false,
        category: "",
        isValidated: false,
        isCorrect: false
      }
    }));

    const catEdges = words.map((_, index) => ({
      id: `edge_cat_${index}_word_${index}`,
      source: `cat_${index}`,
      target: `word_${index}`,
      type: "straight",
      style: { stroke: "#94a3b8", strokeWidth: 2.5 }
    }));

    const allNodes = [...wordNodes, ...catNodes];

    setEdges(catEdges);
    setNodesWithLayout(allNodes, catEdges);
  }, [exportWidth, exportHeight, setNodesWithLayout]);

  // Sync initial sentence on load
  useEffect(() => {
    if (initialSentence) {
      initializeSentence(initialSentence);
    }
  }, [initialSentence, initializeSentence]);

  // Sync layout dynamically when export width/height sliders are dragged
  useEffect(() => {
    if (nodes.length > 0) {
      setNodes((nds) => calculateLayout(nds, edges, exportWidth, exportHeight));
    }
  }, [exportWidth, exportHeight]);

  // Standard React Flow changes
  const onNodesChange = useCallback((changes) => {
    setNodes((nds) => {
      // Apply base changes
      let nextNodes = applyNodeChanges(changes, nds);
      
      // Move descendant subtree together with dragged parent
      const positionChanges = changes.filter(c => c.type === 'position' && c.position);
      if (positionChanges.length > 0) {
        const changeMap = new Map(positionChanges.map(c => [c.id, c]));
        
        nextNodes = nextNodes.map(node => {
          if (changeMap.has(node.id)) return node;
          
          let current = node.id;
          let shiftX = 0;
          let shiftY = 0;
          const visited = new Set();
          
          while (current && !visited.has(current)) {
            visited.add(current);
            const parentEdge = edges.find(e => e.target === current);
            const parentId = parentEdge ? parentEdge.source : null;
            
            if (parentId && changeMap.has(parentId)) {
              const change = changeMap.get(parentId);
              const oldNode = nds.find(n => n.id === parentId);
              if (oldNode && change.position) {
                shiftX = change.position.x - oldNode.position.x;
                shiftY = change.position.y - oldNode.position.y;
                break;
              }
            }
            current = parentId;
          }
          
          if (shiftX !== 0 || shiftY !== 0) {
            return {
              ...node,
              position: {
                x: node.position.x + shiftX,
                y: node.position.y + shiftY
              }
            };
          }
          return node;
        });
      }

      nextNodes = bindCategoryChange(nextNodes);
      
      // Bypass calculateLayout during active drag interaction
      const isDragChange = changes.some(c => c.type === 'position' && c.dragging);
      if (isDragChange) {
        return nextNodes;
      }
      
      return calculateLayout(nextNodes, edges, exportWidth, exportHeight);
    });
  }, [edges, bindCategoryChange, exportWidth, exportHeight]);

  const onEdgesChange = useCallback((changes) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  // Helper to check for cycles
  const willCreateCycle = useCallback((sourceId, targetId, currentEdges) => {
    const visited = new Set();
    const queue = [targetId];

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === sourceId) return true;
      visited.add(current);

      const children = currentEdges
        .filter((e) => e.source === current)
        .map((e) => e.target);

      for (const child of children) {
        if (!visited.has(child)) {
          queue.push(child);
        }
      }
    }
    return false;
  }, []);

  // Connect parent to child (dragging edge on canvas)
  const onConnect = useCallback((connection) => {
    const { source, target } = connection;
    if (source === target) return;

    setEdges((prevEdges) => {
      // 1. Enforce X-bar rule: Target node (child) can only have 1 parent
      const cleanEdges = prevEdges.filter((e) => e.target !== target);

      // 2. Prevent cycle creation
      if (willCreateCycle(source, target, cleanEdges)) {
        alert("Cannot connect: this operation would create a cycle.");
        return prevEdges;
      }

      // 3. Enforce X-bar rule: Source node (parent) can have at most 2 children
      const parentChildCount = cleanEdges.filter((e) => e.source === source).length;
      if (parentChildCount >= 2) {
        alert("Cannot connect: X-bar nodes can have at most 2 children (binary branching).");
        return prevEdges;
      }

      const newEdges = [
        ...cleanEdges,
        {
          id: `edge_${source}_${target}`,
          source,
          target,
          type: "straight",
          // Explicit inline stroke styling ensures lines are captured during image export
          style: { stroke: "#94a3b8", strokeWidth: 2.5 }
        }
      ];

      // Re-trigger layout based on new connection
      setNodes((prevNodes) => calculateLayout(prevNodes, newEdges, exportWidth, exportHeight));
      return newEdges;
    });
  }, [willCreateCycle, exportWidth, exportHeight]);

  // Dynamically ADD a new word to the sentence canvas at any point
  const addWord = useCallback((wordText, insertAtIndex) => {
    if (!wordText || wordText.trim() === "") return;
    const cleanWord = wordText.trim();

    const wordNodes = nodes.filter((n) => n.data?.isWord);
    const categoryNodes = nodes.filter((n) => !n.data?.isWord);

    wordNodes.sort((a, b) => a.data.wordIndex - b.data.wordIndex);

    let idx = typeof insertAtIndex === "number" ? insertAtIndex : wordNodes.length;
    if (idx < 0) idx = 0;
    if (idx > wordNodes.length) idx = wordNodes.length;

    // Shift subsequent words
    const updatedWordNodes = wordNodes.map((n) => {
      if (n.data.wordIndex >= idx) {
        return {
          ...n,
          data: {
            ...n.data,
            wordIndex: n.data.wordIndex + 1
          }
        };
      }
      return n;
    });

    // New word node (no category input, text-only, green)
    const newWordId = `word_${Math.random().toString(36).substr(2, 9)}`;
    const newWordNode = {
      id: newWordId,
      type: "syntaxNode",
      position: { x: idx * 240 + 100, y: 400 },
      data: {
        isWord: true,
        wordIndex: idx,
        word: cleanWord,
        isValidated: false,
        isCorrect: false
      }
    };

    // New blank category node directly above the new word
    const newCatId = `cat_${Math.random().toString(36).substr(2, 9)}`;
    const newCatNode = {
      id: newCatId,
      type: "syntaxNode",
      position: { x: idx * 240 + 100, y: 320 },
      data: {
        isWord: false,
        category: "",
        isValidated: false,
        isCorrect: false
      }
    };

    const newEdge = {
      id: `edge_${newCatId}_${newWordId}`,
      source: newCatId,
      target: newWordId,
      type: "straight",
      style: { stroke: "#94a3b8", strokeWidth: 2.5 }
    };

    const nextNodes = [...categoryNodes, ...updatedWordNodes, newWordNode, newCatNode];
    const nextEdges = [...edges, newEdge];

    // Recompile sentence string
    const sortedWords = [...updatedWordNodes, newWordNode]
      .sort((a, b) => a.data.wordIndex - b.data.wordIndex)
      .map((n) => n.data.word);
    setSentence(sortedWords.join(" "));

    setEdges(nextEdges);
    setNodesWithLayout(nextNodes, nextEdges);
  }, [nodes, edges, setNodesWithLayout]);

  // Binary Merge (Bottom-Up)
  const mergeSelected = useCallback(() => {
    const selected = nodes.filter((n) => n.selected);
    if (selected.length !== 2) return;

    const [child1, child2] = selected;
    const parentId = generateId();

    const parentNode = {
      id: parentId,
      type: "syntaxNode",
      position: {
        x: (child1.position.x + child2.position.x) / 2,
        y: Math.min(child1.position.y, child2.position.y) - 80
      },
      selected: true,
      data: {
        isWord: false,
        category: "",
        isValidated: false,
        isCorrect: false,
        autoFocus: true
      }
    };

    // Deselect old children, select new parent
    const updatedNodes = nodes.map((n) => {
      if (n.id === child1.id || n.id === child2.id) {
        return { ...n, selected: false };
      }
      return n;
    });

    const newEdges = [
      ...edges,
      { 
        id: `edge_${parentId}_${child1.id}`, 
        source: parentId, 
        target: child1.id, 
        type: "straight", 
        style: { stroke: "#94a3b8", strokeWidth: 2.5 } 
      },
      { 
        id: `edge_${parentId}_${child2.id}`, 
        source: parentId, 
        target: child2.id, 
        type: "straight", 
        style: { stroke: "#94a3b8", strokeWidth: 2.5 } 
      }
    ];

    const allNodes = [...updatedNodes, parentNode];
    setEdges(newEdges);
    setNodesWithLayout(allNodes, newEdges);
  }, [nodes, edges, setNodesWithLayout]);

  // Unary Projection (Bottom-Up)
  const projectSelected = useCallback(() => {
    const selected = nodes.filter((n) => n.selected);
    if (selected.length !== 1) return;

    const child = selected[0];
    const parentId = generateId();

    const parentNode = {
      id: parentId,
      type: "syntaxNode",
      position: {
        x: child.position.x,
        y: child.position.y - 80
      },
      selected: true,
      data: {
        isWord: false,
        category: "",
        isValidated: false,
        isCorrect: false,
        autoFocus: true
      }
    };

    // Deselect old child, select new parent
    const updatedNodes = nodes.map((n) => {
      if (n.id === child.id) {
        return { ...n, selected: false };
      }
      return n;
    });

    const newEdges = [
      ...edges,
      { 
        id: `edge_${parentId}_${child.id}`, 
        source: parentId, 
        target: child.id, 
        type: "straight", 
        style: { stroke: "#94a3b8", strokeWidth: 2.5 } 
      }
    ];

    const allNodes = [...updatedNodes, parentNode];
    setEdges(newEdges);
    setNodesWithLayout(allNodes, newEdges);
  }, [nodes, edges, setNodesWithLayout]);

  // Binary Split (Top-Down)
  const splitBinary = useCallback(() => {
    const selected = nodes.filter((n) => n.selected);
    if (selected.length !== 1) return;

    const parent = selected[0];
    if (parent.data?.isWord) return;

    const existingChildren = edges.filter((e) => e.source === parent.id);
    if (existingChildren.length > 0) {
      alert("This node already has children. Delete existing edges first.");
      return;
    }

    const child1Id = generateId();
    const child2Id = generateId();

    const childNodes = [
      {
        id: child1Id,
        type: "syntaxNode",
        position: { x: parent.position.x - 75, y: parent.position.y + 80 },
        data: { isWord: false, category: "", isValidated: false, isCorrect: false, autoFocus: true }
      },
      {
        id: child2Id,
        type: "syntaxNode",
        position: { x: parent.position.x + 75, y: parent.position.y + 80 },
        data: { isWord: false, category: "", isValidated: false, isCorrect: false }
      }
    ];

    const newEdges = [
      ...edges,
      { 
        id: `edge_${parent.id}_${child1Id}`, 
        source: parent.id, 
        target: child1Id, 
        type: "straight", 
        style: { stroke: "#94a3b8", strokeWidth: 2.5 } 
      },
      { 
        id: `edge_${parent.id}_${child2Id}`, 
        source: parent.id, 
        target: child2Id, 
        type: "straight", 
        style: { stroke: "#94a3b8", strokeWidth: 2.5 } 
      }
    ];

    setEdges(newEdges);
    setNodesWithLayout([...nodes, ...childNodes], newEdges);
  }, [nodes, edges, setNodesWithLayout]);

  // Unary Split (Top-Down)
  const splitUnary = useCallback(() => {
    const selected = nodes.filter((n) => n.selected);
    if (selected.length !== 1) return;

    const parent = selected[0];
    if (parent.data?.isWord) return;

    const existingChildren = edges.filter((e) => e.source === parent.id);
    if (existingChildren.length > 0) {
      alert("This node already has children. Delete existing edges first.");
      return;
    }

    const childId = generateId();

    const childNode = {
      id: childId,
      type: "syntaxNode",
      position: { x: parent.position.x, y: parent.position.y + 80 },
      data: { isWord: false, category: "", isValidated: false, isCorrect: false, autoFocus: true }
    };

    const newEdges = [
      ...edges,
      { 
        id: `edge_${parent.id}_${childId}`, 
        source: parent.id, 
        target: childId, 
        type: "straight", 
        style: { stroke: "#94a3b8", strokeWidth: 2.5 } 
      }
    ];

    setEdges(newEdges);
    setNodesWithLayout([...nodes, childNode], newEdges);
  }, [nodes, edges, setNodesWithLayout]);

  // Delete Selection (Sever attached edges & resolve stale references)
  const deleteSelected = useCallback(() => {
    const selectedNodeIds = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
    const selectedEdgeIds = new Set(edges.filter((e) => e.selected).map((e) => e.id));

    // Identify deleted word nodes
    const deletedWordNodes = nodes.filter((n) => n.selected && n.data?.isWord);

    // Remove deleted nodes
    const remainingNodes = nodes.filter((n) => !selectedNodeIds.has(n.id));

    // Remove deleted edges and edges connected to deleted nodes
    const remainingEdges = edges.filter(
      (e) =>
        !selectedEdgeIds.has(e.id) &&
        !selectedNodeIds.has(e.source) &&
        !selectedNodeIds.has(e.target)
    );

    // If word nodes were deleted, reindex the remaining word nodes and sync the sentence state
    let nextNodes = remainingNodes;
    if (deletedWordNodes.length > 0) {
      const remainingWordNodes = remainingNodes.filter((n) => n.data?.isWord);
      remainingWordNodes.sort((a, b) => a.data.wordIndex - b.data.wordIndex);
      
      const reindexedWordNodes = remainingWordNodes.map((n, newIdx) => ({
        ...n,
        data: {
          ...n.data,
          wordIndex: newIdx
        }
      }));

      const remainingCategoryNodes = remainingNodes.filter((n) => !n.data?.isWord);
      nextNodes = [...remainingCategoryNodes, ...reindexedWordNodes];

      // Update sentence string
      const sortedWords = reindexedWordNodes.map((n) => n.data.word);
      setSentence(sortedWords.join(" "));
    }

    setEdges(remainingEdges);
    // Explicitly pass remainingEdges to avoid using stale state in layout recalculations
    setNodesWithLayout(nextNodes, remainingEdges);
  }, [nodes, edges, setNodesWithLayout]);

  // Create floating root node (Top-Down start)
  const createRootNode = useCallback(() => {
    const rootId = generateId();
    const x = 100 + Math.random() * 300;
    const y = 50;

    const rootNode = {
      id: rootId,
      type: "syntaxNode",
      position: { x, y },
      selected: true,
      data: {
        isWord: false,
        category: "",
        isValidated: false,
        isCorrect: false,
        autoFocus: true
      }
    };

    setNodesWithLayout([...nodes, rootNode], edges);
  }, [nodes, edges, setNodesWithLayout]);

  // Clear entire canvas except sentence words
  const clearTree = useCallback(() => {
    if (window.confirm("Are you sure you want to clear your current tree?")) {
      initializeSentence(sentence);
    }
  }, [sentence, initializeSentence]);

  // Add category change handler binding on node list load
  useEffect(() => {
    setNodes((nds) => bindCategoryChange(nds));
  }, [bindCategoryChange]);

  return {
    nodes,
    edges,
    sentence,
    setNodes,
    setEdges,
    setNodesWithLayout,
    initializeSentence,
    updateCategory,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addWord,
    mergeSelected,
    projectSelected,
    splitBinary,
    splitUnary,
    deleteSelected,
    createRootNode,
    clearTree
  };
}
