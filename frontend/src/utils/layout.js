/**
 * Dynamic Tree Layout Engine
 * 
 * Arranges syntax tree nodes hierarchically with:
 * - Syncing: Dynamic scaling based on viewport width/height sliders.
 * - Perpendicular alignment: Offsets top-left X coordinates by subtracting half-width,
 *   aligning handles perfectly vertically for unary projections.
 * - Adaptive Gaps: Resolves horizontal collisions by pushing adjacent subtrees apart dynamically.
 */

// Helper to determine the visual width of a node
export function getNodeWidth(node) {
  if (node.data && node.data.isWord) {
    const word = node.data.word || "";
    // Estimate width based on character count to handle long lexical tokens
    return Math.max(90, word.length * 8 + 24);
  }
  return 80; // Category labels have a fixed width of 80px in CSS
}

export function calculateLayout(nodes, edges, width = 960, height = 550) {
  if (!nodes || nodes.length === 0) return [];

  // 1. Create helper maps
  const nodesMap = new Map(nodes.map(n => [n.id, { ...n }]));
  const parentToChildren = new Map(); // parentId -> [childId]
  const childToParent = new Map();    // childId -> parentId
  
  // Helper to find the leftmost word index in a subtree
  const getLeftmostWordIndex = (nodeId) => {
    const node = nodesMap.get(nodeId);
    if (!node) return 9999;
    if (node.data && node.data.isWord) {
      return node.data.wordIndex;
    }
    const childrenIds = parentToChildren.get(nodeId) || [];
    if (childrenIds.length === 0) return 9999;
    const indexes = childrenIds.map(getLeftmostWordIndex);
    return Math.min(...indexes);
  };

  edges.forEach(edge => {
    const parentId = edge.source;
    const childId = edge.target;
    
    if (!parentToChildren.has(parentId)) {
      parentToChildren.set(parentId, []);
    }
    parentToChildren.get(parentId).push(childId);
    childToParent.set(childId, parentId);
  });

  // Sort children of every parent by their leftmost dominated word index
  parentToChildren.forEach((childIds) => {
    childIds.sort((a, b) => {
      const idxA = getLeftmostWordIndex(a);
      const idxB = getLeftmostWordIndex(b);
      if (idxA !== idxB) {
        return idxA - idxB;
      }
      return a.localeCompare(b);
    });
  });

  // 2. Dynamic Viewport Scaling Factors
  const scaleX = width / 960;
  const scaleY = height / 550;

  const LEVEL_HEIGHT = Math.max(55, 80 * scaleY);
  const WORD_Y = Math.max(250, height - 100);
  const siblingGap = Math.max(30, 60 * scaleX);
  const rootGap = Math.max(40, 80 * scaleX);

  // 4. Recursive subtree width measurement
  const subtreeWidths = new Map();
  const visitedForMeasure = new Set();

  const measureSubtree = (nodeId) => {
    if (visitedForMeasure.has(nodeId)) {
      return subtreeWidths.get(nodeId) || 0;
    }
    visitedForMeasure.add(nodeId);

    const node = nodesMap.get(nodeId);
    if (!node) return 0;

    const wNode = getNodeWidth(node);
    const children = parentToChildren.get(nodeId) || [];

    if (children.length === 0) {
      subtreeWidths.set(nodeId, wNode);
      return wNode;
    }

    // Measure children
    const childWidths = children.map(cid => measureSubtree(cid));
    const totalChildrenWidth = childWidths.reduce((sum, w) => sum + w, 0) + siblingGap * (children.length - 1);
    const wSubtree = Math.max(wNode, totalChildrenWidth);
    subtreeWidths.set(nodeId, wSubtree);
    return wSubtree;
  };

  // Measure all nodes
  Array.from(nodesMap.keys()).forEach(nodeId => {
    measureSubtree(nodeId);
  });

  // 5. Identify roots and sort them
  const roots = Array.from(nodesMap.values()).filter(node => !childToParent.has(node.id));

  // Sort roots horizontally by:
  // 1. Dominated leftmost word index (ascending)
  // 2. If same (e.g. 9999), sort category nodes before word nodes
  // 3. If same, sort by node ID to ensure stable ordering
  roots.sort((a, b) => {
    const idxA = getLeftmostWordIndex(a.id);
    const idxB = getLeftmostWordIndex(b.id);
    if (idxA !== idxB) {
      return idxA - idxB;
    }
    const isWordA = a.data?.isWord ? 1 : 0;
    const isWordB = b.data?.isWord ? 1 : 0;
    if (isWordA !== isWordB) {
      return isWordA - isWordB; // Category (0) before word (1)
    }
    return a.id.localeCompare(b.id);
  });

  // 6. Layout roots and recursively their subtrees
  const finalPositions = new Map(); // nodeId -> { x (centerX), y }
  const visitedForLayout = new Set();

  const layoutSubtree = (nodeId, cx, y) => {
    if (visitedForLayout.has(nodeId)) return;
    visitedForLayout.add(nodeId);

    const node = nodesMap.get(nodeId);
    if (!node) return;

    finalPositions.set(nodeId, { x: cx, y });

    const children = parentToChildren.get(nodeId) || [];
    if (children.length === 0) return;

    if (children.length === 1) {
      // Unary projection - align perfectly perpendicular (same X)
      layoutSubtree(children[0], cx, y + LEVEL_HEIGHT);
    } else if (children.length === 2) {
      // Binary branching
      const [c1, c2] = children;
      const w1 = subtreeWidths.get(c1) || 0;
      const w2 = subtreeWidths.get(c2) || 0;

      const dist = w1 / 2 + w2 / 2 + siblingGap;
      const x1 = cx - dist / 2;
      const x2 = cx + dist / 2;

      layoutSubtree(c1, x1, y + LEVEL_HEIGHT);
      layoutSubtree(c2, x2, y + LEVEL_HEIGHT);
    } else {
      // General multi-child spacing
      const childWidths = children.map(cid => subtreeWidths.get(cid) || 0);
      const totalChildrenWidth = childWidths.reduce((sum, w) => sum + w, 0) + siblingGap * (children.length - 1);
      let leftEdge = cx - totalChildrenWidth / 2;

      children.forEach((cid, idx) => {
        const wChild = childWidths[idx];
        const cxChild = leftEdge + wChild / 2;
        layoutSubtree(cid, cxChild, y + LEVEL_HEIGHT);
        leftEdge += wChild + siblingGap;
      });
    }
  };

  let nextLeftX = 100;
  roots.forEach(root => {
    const w = subtreeWidths.get(root.id) || 0;
    const cx = nextLeftX + w / 2;
    
    // Determine initial Y for the root
    let startY = 50;
    if (root.data?.isWord) {
      // Floating word node - position at bottom row
      startY = WORD_Y;
    }

    layoutSubtree(root.id, cx, startY);
    nextLeftX += w + rootGap;
  });

  // Center the layout horizontally within the canvas width
  if (finalPositions.size > 0) {
    let minX = Infinity;
    let maxX = -Infinity;
    finalPositions.forEach((pos, id) => {
      const w = getNodeWidth(nodesMap.get(id));
      minX = Math.min(minX, pos.x - w / 2);
      maxX = Math.max(maxX, pos.x + w / 2);
    });

    const boxCenter = (minX + maxX) / 2;
    const canvasCenter = width / 2;
    const shiftX = canvasCenter - boxCenter;

    finalPositions.forEach((pos) => {
      pos.x += shiftX;
    });
  }

  // 7. Position formatting & perpendicular adjustment
  const updatedNodes = Array.from(nodesMap.values()).map(node => {
    const pos = finalPositions.get(node.id);
    if (pos) {
      const nodeWidth = getNodeWidth(node);
      return {
        ...node,
        position: {
          x: pos.x - nodeWidth / 2,
          y: pos.y
        },
        style: {
          ...node.style,
          width: nodeWidth
        }
      };
    }
    return node;
  });

  return updatedNodes;
}
