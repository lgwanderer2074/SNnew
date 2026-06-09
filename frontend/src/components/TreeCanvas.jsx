import React, { useEffect, useRef, useImperativeHandle } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  useReactFlow,
  ReactFlowProvider
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import SyntaxNode from "./SyntaxNode";
import { exportCanvasAsPng, exportCanvasAsSvg } from "../utils/export";

// Check if running on a device with a touch screen
const isTouchDevice = () => {
  if (typeof window === "undefined") return false;
  return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
};

// Define the custom node types
const nodeTypes = {
  syntaxNode: SyntaxNode
};

const CanvasInner = React.forwardRef(({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onMerge,
  onProject,
  onSplitBinary,
  onSplitUnary,
  onDeleteSelected,
  readOnly = false,
  width,
  height
}, ref) => {
  const reactFlowWrapper = useRef(null);
  const { fitView, getViewport, setViewport } = useReactFlow();

  // Find currently selected nodes
  const selectedNodes = nodes.filter((n) => n.selected);
  const selectedEdges = edges.filter((e) => e.selected);
  const hasSelection = selectedNodes.length > 0 || selectedEdges.length > 0;

  // Handle Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (event) => {
      // If user is typing in an input field, do not trigger shortcuts
      if (
        document.activeElement.tagName === "INPUT" ||
        document.activeElement.tagName === "TEXTAREA"
      ) {
        return;
      }

      if (readOnly) return;

      const key = event.key.toLowerCase();
      if (key === "m" && selectedNodes.length === 2) {
        event.preventDefault();
        onMerge();
      } else if (key === "p" && selectedNodes.length === 1) {
        event.preventDefault();
        onProject();
      } else if (key === "delete" || key === "backspace") {
        if (hasSelection) {
          event.preventDefault();
          onDeleteSelected();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedNodes, selectedEdges, hasSelection, onMerge, onProject, onDeleteSelected, readOnly]);

  // Automatically fit view when the sentence changes or window resizes
  const wordsKey = nodes
    .filter((n) => n.data?.word)
    .map((n) => n.data.word)
    .join(" ");

  useEffect(() => {
    const handleResize = () => {
      fitView({ padding: 0.15, minZoom: 0.75, duration: 300 });
    };
    window.addEventListener("resize", handleResize);

    const timer = setTimeout(() => {
      fitView({ padding: 0.15, minZoom: 0.75, duration: 300 });
    }, 80);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", handleResize);
    };
  }, [wordsKey, fitView]);

  const handleExportPng = (fileName) => {
    const savedViewport = getViewport();
    // Instantly fit view to contain the entire tree structure
    fitView({ padding: 0.1 });
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (!reactFlowWrapper.current) {
          reject("Wrapper element not found");
          return;
        }
        exportCanvasAsPng(reactFlowWrapper.current, fileName)
          .then(() => {
            setViewport(savedViewport);
            resolve();
          })
          .catch((err) => {
            setViewport(savedViewport);
            reject(err);
          });
      }, 150);
    });
  };

  const handleExportSvg = (fileName) => {
    const savedViewport = getViewport();
    // Instantly fit view to contain the entire tree structure
    fitView({ padding: 0.1 });
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (!reactFlowWrapper.current) {
          reject("Wrapper element not found");
          return;
        }
        exportCanvasAsSvg(reactFlowWrapper.current, fileName)
          .then(() => {
            setViewport(savedViewport);
            resolve();
          })
          .catch((err) => {
            setViewport(savedViewport);
            reject(err);
          });
      }, 150);
    });
  };

  useImperativeHandle(ref, () => ({
    exportPng: handleExportPng,
    exportSvg: handleExportSvg
  }));

  const handleExportClick = () => {
    handleExportPng();
  };

  const handleNodesChange = (changes) => {
    if (readOnly) return;
    let modifiedChanges = [...changes];
    
    if (isTouchDevice()) {
      const selectTrueChange = changes.find(c => c.type === 'select' && c.selected === true);
      if (selectTrueChange) {
        const targetNode = nodes.find(n => n.id === selectTrueChange.id);
        const wasSelected = targetNode ? !!targetNode.selected : false;
        selectTrueChange.selected = !wasSelected;
        
        modifiedChanges = changes.filter(c => {
          if (c.type === 'select') {
            return c.id === selectTrueChange.id;
          }
          return true;
        });
      }
    }
    
    onNodesChange(modifiedChanges);
  };

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }} ref={reactFlowWrapper}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={readOnly ? undefined : handleNodesChange}
        onEdgesChange={readOnly ? undefined : onEdgesChange}
        onConnect={readOnly ? undefined : onConnect}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable={!readOnly}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.2}
        maxZoom={2}
        multiSelectionKeyCode={isTouchDevice() ? () => true : "Shift"}
        defaultEdgeOptions={{
          type: "straight",
          style: { strokeWidth: 2.5 }
        }}
      >
        <Background color="#e2e8f0" gap={16} size={1} />
        <Controls showInteractive={!readOnly} />
      </ReactFlow>

      {/* Floating Toolbar */}
      {!readOnly && (
        <div className="canvas-toolbar">
          {selectedNodes.length === 2 && (
            <button className="btn btn-primary" onClick={onMerge} title="Merge two nodes (M)">
              Merge (Binary)
            </button>
          )}

          {selectedNodes.length === 1 && (
            <>
              <button className="btn btn-primary" onClick={onProject} title="Project one node (P)">
                Project (Unary)
              </button>
              <button className="btn btn-secondary" onClick={onSplitBinary} title="Split Top-Down into 2 children">
                Split Binary
              </button>
              <button className="btn btn-secondary" onClick={onSplitUnary} title="Split Top-Down into 1 child">
                Split Unary
              </button>
            </>
          )}

          {hasSelection && (
            <button className="btn btn-danger" onClick={onDeleteSelected} title="Delete selection (Del)">
              Delete
            </button>
          )}

          <button className="btn btn-secondary" onClick={handleExportClick} title="Download tree image">
            Export Image
          </button>
        </div>
      )}

      {/* Floating toolbar for Read-only (e.g. lecturer watching or student previewing) */}
      {readOnly && (
        <div className="canvas-toolbar">
          <button className="btn btn-secondary" onClick={handleExportClick} title="Download tree image">
            Export Image
          </button>
        </div>
      )}
    </div>
  );
});

// Wrap in ReactFlowProvider to use useReactFlow hooks
const TreeCanvas = React.forwardRef((props, ref) => {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} ref={ref} />
    </ReactFlowProvider>
  );
});

export default TreeCanvas;
