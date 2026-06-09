import React, { useEffect, useRef } from "react";
import { Handle, Position } from "@xyflow/react";

/**
 * Custom Node for X-Bar Syntax Trees.
 * - Word Node: Displays the static lexical word text (GREEN, no category input, top handle only).
 * - Category Node: Displays an editable input field for the syntactic category label (BLUE, top/bottom handles).
 */
function SyntaxNode({ id, data, selected }) {
  const isWord = data?.isWord || false;
  const word = data?.word || "";
  const category = data?.category || "";
  
  // Validation status
  const isValidated = data?.isValidated || false;
  const isCorrect = data?.isCorrect || false;

  const inputRef = useRef(null);
  const focusedRef = useRef(false);

  // Direct Typing UX: Sticky focus and selection on creation
  useEffect(() => {
    if (data?.autoFocus && inputRef.current && !focusedRef.current) {
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
      focusedRef.current = true;
      return () => clearTimeout(timer);
    }
  }, [data?.autoFocus]);

  // CSS classes based on status and node type
  let nodeClasses = "syntax-node";
  if (isWord) {
    nodeClasses += " word-node";
  } else {
    // Resolve phrase projection color families (case-insensitive)
    const clean = category.trim().toUpperCase();
    if (clean.startsWith("ADV")) {
      nodeClasses += " family-adverb";
    } else if (clean.startsWith("D")) {
      nodeClasses += " family-determiner";
    } else if (clean.startsWith("N")) {
      nodeClasses += " family-noun";
    } else if (clean.startsWith("V")) {
      nodeClasses += " family-verb";
    } else if (clean.startsWith("P")) {
      nodeClasses += " family-prep";
    } else if (clean.startsWith("C")) {
      nodeClasses += " family-comp";
    } else if (clean.startsWith("T") || clean.startsWith("I") || clean === "S") {
      nodeClasses += " family-tense";
    } else if (clean.startsWith("A")) {
      nodeClasses += " family-adj";
    } else {
      nodeClasses += " family-default";
    }
  }

  if (selected) {
    nodeClasses += " selected";
  }
  if (isValidated) {
    if (isCorrect) {
      nodeClasses += " correct";
    } else {
      nodeClasses += " invalid";
    }
  }

  const handleCategoryChange = (e) => {
    if (data?.onCategoryChange) {
      data.onCategoryChange(id, e.target.value);
    }
  };

  // 1. Render Lexical Word (Green, leaf node)
  if (isWord) {
    return (
      <div className={nodeClasses}>
        {/* Top Handle (Target): Allows connecting a parent category node to this word */}
        <Handle
          type="target"
          position={Position.Top}
          style={{ background: "hsl(var(--syntax-green))", width: 6, height: 6 }}
        />
        <span className="node-word">{word}</span>
      </div>
    );
  }

  // 2. Render Syntactic Category Label (Blue, branch/phrasal node)
  return (
    <div className={nodeClasses}>
      {/* Top Handle (Target): Node acts as a child of a parent above it */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: "hsl(var(--syntax-blue))", width: 6, height: 6 }}
      />
      
      {/* Category input - Stop touch/mouse events propagation to prevent canvas dragging */}
      <input
        ref={inputRef}
        type="text"
        className="node-category-input"
        value={category}
        onChange={handleCategoryChange}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onKeyUp={(e) => e.stopPropagation()}
        placeholder="XP"
        title="Type syntactic category (e.g. S, DP, VP, NP, D, N)"
        disabled={data?.disabled}
      />

      {/* Bottom Handle (Source): Phrase nodes act as parents to child nodes below */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: "hsl(var(--syntax-blue))", width: 6, height: 6 }}
      />
    </div>
  );
}

export default React.memo(SyntaxNode);
