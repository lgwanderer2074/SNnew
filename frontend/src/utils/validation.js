/**
 * Syntax Tree Validation Engine
 * 
 * Compares the student's graph structure with the teacher's answer key.
 * Uses recursive subtree matching to identify correct and incorrect nodes.
 */
import { calculateLayout } from "./layout.js";

// Helper to stringify a subtree for exact matching
export function serializeSubtree(subtree) {
  if (!subtree) return "";
  return JSON.stringify(subtree);
}

/**
 * Builds a recursive representation of a subtree starting from a node.
 * Edges point from parent to child (source = parent, target = child).
 */
export function buildSubtreeRep(nodeId, nodesMap, edgesFromParent, wordNodesMap) {
  const node = nodesMap.get(nodeId);
  if (!node) return null;

  // 1. If it's a word node (leaf)
  if (node.data && node.data.isWord) {
    return {
      type: "word",
      index: node.data.wordIndex,
      word: node.data.word
    };
  }

  // Find children
  const childEdges = edgesFromParent.get(nodeId) || [];
  const childIds = childEdges.map(e => e.target);
  const childrenReps = childIds
    .map(cid => buildSubtreeRep(cid, nodesMap, edgesFromParent, wordNodesMap))
    .filter(Boolean);

  // If no children, it's a floating node
  if (childrenReps.length === 0) {
    return {
      type: "floating",
      id: nodeId,
      category: (node.data.category || "").trim().toUpperCase()
    };
  }

  // If 1 child (unary projection)
  if (childrenReps.length === 1) {
    return {
      type: "unary",
      category: (node.data.category || "").trim().toUpperCase(),
      child: childrenReps[0]
    };
  }

  // If 2 children (binary branch)
  if (childrenReps.length === 2) {
    // Sort children by their left-most word index to ensure canonical ordering
    const getLeftmostIndex = (rep) => {
      if (rep.type === "word") return rep.index;
      if (rep.type === "unary") return getLeftmostIndex(rep.child);
      if (rep.type === "binary") {
        const indexes = rep.children.map(getLeftmostIndex);
        return Math.min(...indexes);
      }
      if (rep.type === "floating") return 9999;
      return 9999;
    };

    childrenReps.sort((a, b) => getLeftmostIndex(a) - getLeftmostIndex(b));

    return {
      type: "binary",
      category: (node.data.category || "").trim().toUpperCase(),
      children: childrenReps
    };
  }

  // More than 2 children is structurally invalid in X-bar theory
  return {
    type: "invalid_branching",
    category: (node.data.category || "").trim().toUpperCase()
  };
}

/**
 * Checks if a subtree representation contains any floating nodes.
 */
export function hasFloatingNodes(rep) {
  if (!rep) return false;
  if (rep.type === "floating") return true;
  if (rep.type === "unary") return hasFloatingNodes(rep.child);
  if (rep.type === "binary") return rep.children.some(hasFloatingNodes);
  return false;
}

/**
 * Validates the student's canvas against the teacher's key.
 * Returns an object with:
 * - invalidNodeIds: Set of node IDs that are incorrect.
 * - correctNodeIds: Set of node IDs that are correct.
 * - isComplete: boolean indicating if the target tree is fully built and correct.
 */
export function validateStudentTree(studentNodes, studentEdges, teacherAnswerKey) {
  const invalidNodeIds = new Set();
  const correctNodeIds = new Set();
  
  if (!teacherAnswerKey) {
    return { invalidNodeIds, correctNodeIds, isComplete: false };
  }

  // 1. Build maps for student nodes and edges
  const nodesMap = new Map(studentNodes.map(n => [n.id, n]));
  const edgesFromParent = new Map(); // parentId -> [edges]
  
  studentEdges.forEach(edge => {
    if (!edgesFromParent.has(edge.source)) {
      edgesFromParent.set(edge.source, []);
    }
    edgesFromParent.get(edge.source).push(edge);
  });

  const wordNodes = studentNodes.filter(n => n.data && n.data.isWord);
  const wordNodesMap = new Map(wordNodes.map(w => [w.id, w]));

  // 2. Build teacher's answer key subtrees
  const teacherSubtreeStrings = new Set(
    teacherAnswerKey.subtrees.map(st => serializeSubtree(st))
  );

  // 3. For each student node, compute its subtree representation and validate
  studentNodes.forEach(node => {
    // Word nodes are always correct
    if (node.data && node.data.isWord) {
      correctNodeIds.add(node.id);
      return;
    }

    // Phrase/category nodes
    const rep = buildSubtreeRep(node.id, nodesMap, edgesFromParent, wordNodesMap);
    if (!rep) return;

    // If it's a floating phrase node (no children), or contains floating subnodes, keep it neutral
    if (rep.type === "floating" || hasFloatingNodes(rep)) {
      return; // Neutral state
    }

    // If category is blank, it's neutral
    if (!node.data.category || node.data.category.trim() === "") {
      return;
    }

    // Check if the student's subtree exists in the teacher's correct subtrees
    const repStr = serializeSubtree(rep);
    if (teacherSubtreeStrings.has(repStr)) {
      correctNodeIds.add(node.id);
    } else {
      invalidNodeIds.add(node.id);
    }
  });

  // 4. Check if the target tree is complete
  // To be complete, the student must have built the root subtree matching the teacher's root.
  const teacherRootStr = serializeSubtree(teacherAnswerKey.rootSubtree);
  
  let isComplete = false;
  // Check if any student node matches the teacher's root
  studentNodes.forEach(node => {
    if (node.data && node.data.isWord) return;
    const rep = buildSubtreeRep(node.id, nodesMap, edgesFromParent, wordNodesMap);
    if (rep && serializeSubtree(rep) === teacherRootStr) {
      isComplete = true;
    }
  });

  // Complete is only true if we found the root AND there are no active errors on the canvas
  if (invalidNodeIds.size > 0) {
    isComplete = false;
  }

  return {
    invalidNodeIds,
    correctNodeIds,
    isComplete
  };
}

/**
 * Extracts all unique subtrees from a root node representation (for teacher setup).
 */
export function extractAllSubtrees(rootRep) {
  const subtrees = [];
  
  function traverse(rep) {
    if (!rep) return;
    subtrees.push(rep);
    if (rep.type === "unary") {
      traverse(rep.child);
    } else if (rep.type === "binary") {
      rep.children.forEach(traverse);
    }
  }

  traverse(rootRep);
  return subtrees;
}

/**
 * Reconstructs a full set of React Flow nodes and edges from a teacher's answer key subtree representation.
 * Automatically runs the layout algorithm to position nodes beautifully.
 */
export function convertSubtreeToNodesAndEdges(rootSubtree, exportWidth = 960, exportHeight = 550) {
  const nodes = [];
  const edges = [];
  let nodeCounter = 0;

  function traverse(rep, parentId = null) {
    if (!rep) return;
    const nodeId = rep.type === "word" ? `word_${rep.index}` : `ans_node_${nodeCounter++}`;
    
    if (rep.type === "word") {
      nodes.push({
        id: nodeId,
        type: "syntaxNode",
        position: { x: 0, y: 0 },
        data: {
          isWord: true,
          wordIndex: rep.index,
          word: rep.word,
          isValidated: true,
          isCorrect: true
        }
      });
    } else {
      nodes.push({
        id: nodeId,
        type: "syntaxNode",
        position: { x: 0, y: 0 },
        data: {
          isWord: false,
          category: rep.category,
          isValidated: true,
          isCorrect: true,
          disabled: true
        }
      });
    }

    if (parentId) {
      edges.push({
        id: `edge_${parentId}_${nodeId}`,
        source: parentId,
        target: nodeId,
        type: "straight",
        style: { stroke: "#16a34a", strokeWidth: 2.5 } // Green stroke indicating correct layout
      });
    }

    if (rep.type === "unary") {
      traverse(rep.child, nodeId);
    } else if (rep.type === "binary") {
      // Sort children by left-most index to ensure canonical order in layout
      const getLeftmostIndex = (childRep) => {
        if (childRep.type === "word") return childRep.index;
        if (childRep.type === "unary") return getLeftmostIndex(childRep.child);
        if (childRep.type === "binary") {
          return Math.min(...childRep.children.map(getLeftmostIndex));
        }
        return 9999;
      };
      
      const sortedChildren = [...rep.children].sort((a, b) => getLeftmostIndex(a) - getLeftmostIndex(b));
      sortedChildren.forEach(child => traverse(child, nodeId));
    }
  }

  traverse(rootSubtree);
  
  // Apply visual layout structure
  const positionedNodes = calculateLayout(nodes, edges, exportWidth, exportHeight);
  return { nodes: positionedNodes, edges };
}
