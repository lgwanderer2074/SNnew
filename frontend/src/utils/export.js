import { toPng, toSvg } from "html-to-image";

/**
 * Exports the React Flow canvas viewport as a PNG image.
 */
export function exportCanvasAsPng(reactFlowElement, fileName = "syntax-tree.png") {
  if (!reactFlowElement) {
    console.error("React Flow element not found for export");
    return Promise.reject("Element not found");
  }

  // Define styling options for Clean Light Mode
  const options = {
    backgroundColor: "#ffffff", // Clean white background for light mode
    style: {
      transform: "scale(1)",
      transformOrigin: "top left",
      width: "100%",
      height: "100%"
    },
    filter: (node) => {
      // Exclude panel controls, handles, or floating toolbars in the download
      if (node.classList && (
        node.classList.contains("react-flow__panel") || 
        node.classList.contains("canvas-toolbar") ||
        node.classList.contains("react-flow__controls")
      )) {
        return false;
      }
      return true;
    }
  };

  return toPng(reactFlowElement, options)
    .then((dataUrl) => {
      const link = document.createElement("a");
      link.download = fileName;
      link.href = dataUrl;
      link.click();
      return true;
    })
    .catch((error) => {
      console.error("Error exporting syntax tree as PNG:", error);
      throw error;
    });
}

/**
 * Exports the React Flow canvas viewport as an SVG image.
 */
export function exportCanvasAsSvg(reactFlowElement, fileName = "syntax-tree.svg") {
  if (!reactFlowElement) {
    console.error("React Flow element not found for export");
    return Promise.reject("Element not found");
  }

  // Define styling options for Clean Light Mode
  const options = {
    backgroundColor: "#ffffff",
    style: {
      transform: "scale(1)",
      transformOrigin: "top left",
      width: "100%",
      height: "100%"
    },
    filter: (node) => {
      if (node.classList && (
        node.classList.contains("react-flow__panel") || 
        node.classList.contains("canvas-toolbar") ||
        node.classList.contains("react-flow__controls")
      )) {
        return false;
      }
      return true;
    }
  };

  return toSvg(reactFlowElement, options)
    .then((dataUrl) => {
      const link = document.createElement("a");
      link.download = fileName;
      link.href = dataUrl;
      link.click();
      return true;
    })
    .catch((error) => {
      console.error("Error exporting syntax tree as SVG:", error);
      throw error;
    });
}
