/* eslint-disable */
import React, { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import {
  HelpCircle,
  Play,
  Users,
  ArrowLeft,
  Trash2,
  Plus,
  Download,
  Trophy,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  PlusCircle,
  FileImage,
  Sparkles,
  Upload,
  BookOpen,
  Award,
  Moon,
  Sun
} from "lucide-react";
import TreeCanvas from "./components/TreeCanvas";
import { useTreeState } from "./hooks/useTreeState";
import {
  validateStudentTree,
  buildSubtreeRep,
  extractAllSubtrees,
  serializeSubtree,
  convertSubtreeToNodesAndEdges
} from "./utils/validation";
import { exportCanvasAsPng, exportCanvasAsSvg } from "./utils/export";

// Setup Socket connection (point to backend port 3001)
const BACKEND_URL = `http://${window.location.hostname}:3001`;

function App() {
  // Operational Modes state:
  // landing
  // building (Lecturer Building mode)
  // host_practice_lobby (Lecturer monitoring practice progress)
  // host_game_setup (Lecturer building game target tree)
  // host_game_lobby (Lecturer waiting for game students)
  // host_game_gameplay (Lecturer public leaderboard)
  // student_practice_gameplay (Student Practice mode canvas)
  // student_practice_complete (Student finished practice)
  // student_game_lobby (Student waiting in game lobby)
  // student_game_gameplay (Student Game mode canvas)
  // student_game_complete (Student submitted game tree)
  const [mode, setMode] = useState("landing");

  // Dark mode – persists in localStorage, respects system preference on first visit
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem("theme");
    if (saved) return saved === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  const [socket, setSocket] = useState(null);
  
  // Sentence inputs
  const [inputText, setInputText] = useState("");
  
  // Dynamic word form state
  const [newWordText, setNewWordText] = useState("");
  const [insertIndexSelection, setInsertIndexSelection] = useState("end");

  // Canvas Viewport Export Resizing states
  const [exportWidth, setExportWidth] = useState(960);
  const [exportHeight, setExportHeight] = useState(550);
  
  // Game lobby / Session states
  const [roomPin, setRoomPin] = useState("");
  const [nickname, setNickname] = useState("");
  const [joinedStudents, setJoinedStudents] = useState([]);
  const [gameStartTime, setGameStartTime] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [roomType, setRoomType] = useState(""); // "practice" | "game"
  
  // Practice package state (array of tree configuration objects)
  const [practiceUploads, setPracticeUploads] = useState([]);
  const [practicePackage, setPracticePackage] = useState([]);
  const [currentPracticeIndex, setCurrentPracticeIndex] = useState(0);
  const [showPracticeAnswer, setShowPracticeAnswer] = useState(false);
  const [isPracticeComplete, setIsPracticeComplete] = useState(false);

  // Answer Key details for active sentence
  const [answerKey, setAnswerKey] = useState(null);

  // Student specific completion (Game mode)
  const [studentCompletionTime, setStudentCompletionTime] = useState(0);
  const [studentMistakes, setStudentMistakes] = useState(0);
  const [isSettingsExpanded, setIsSettingsExpanded] = useState(false);
  const [isGameSubmitted, setIsGameSubmitted] = useState(false);

  // New game package states
  const [gameUploads, setGameUploads] = useState([]);
  const [currentGameIndex, setCurrentGameIndex] = useState(0);
  const [accumulatedGameMistakes, setAccumulatedGameMistakes] = useState(0);
  const [accumulatedGameTime, setAccumulatedGameTime] = useState(0);

  // Helper boolean to determine if the active session is a practice session
  const isPracticeSession = roomType === "practice" || (practicePackage && practicePackage.length > 0);

  // Refs
  const timerRef = useRef(null);
  const canvasWrapperRef = useRef(null);
  const canvasRef = useRef(null);

  // Canvas State using custom hook
  const tree = useTreeState("", exportWidth, exportHeight);

  // Initialize Socket connection
  useEffect(() => {
    const newSocket = io(BACKEND_URL);
    setSocket(newSocket);

    newSocket.on("connect", () => {
      console.log("Connected to server via WebSocket");
    });

    newSocket.on("room_closed", ({ reason }) => {
      alert(reason || "Room closed.");
      resetAppState();
    });

    return () => {
      newSocket.close();
    };
  }, []);

  // Set up socket listeners based on active room
  useEffect(() => {
    if (!socket) return;

    socket.on("lobby_update", (data) => {
      console.log("Socket event lobby_update received:", data);
      
      const incomingRoomType = data.roomType || data.type || data.mode || "";
      const incomingPackage = data.package || data.pkg || [];
      const students = data.students || [];
      const status = data.status || "";

      setJoinedStudents(students);

      if (incomingRoomType === "practice") {
        setRoomType("practice");
        if (incomingPackage && incomingPackage.length > 0) {
          setPracticePackage(incomingPackage);
          if (mode === "student_game_lobby" || mode === "landing") {
            setCurrentPracticeIndex(0);
            setAnswerKey(incomingPackage[0]);
            tree.initializeSentence(incomingPackage[0].sentence);
            setMode("student_practice_gameplay");
          }
        }
      } else if (incomingRoomType === "game") {
        setRoomType("game");
        if (incomingPackage && incomingPackage.length > 0) {
          setPracticePackage(incomingPackage);
        }
        if (status === "playing" && mode === "student_game_lobby") {
          setCurrentGameIndex(0);
          setAccumulatedGameMistakes(0);
          setAccumulatedGameTime(0);
          if (incomingPackage && incomingPackage.length > 0) {
            setAnswerKey(incomingPackage[0]);
            tree.initializeSentence(incomingPackage[0].sentence);
          }
          setGameStartTime(Date.now());
          setMode("student_game_gameplay");
        }
      }
    });

    socket.on("game_start", ({ startTime }) => {
      setGameStartTime(startTime);
      setCurrentGameIndex(0);
      setAccumulatedGameMistakes(0);
      setAccumulatedGameTime(0);
      if (practicePackage && practicePackage.length > 0) {
        setAnswerKey(practicePackage[0]);
        tree.initializeSentence(practicePackage[0].sentence);
      }
      setMode("student_game_gameplay");
    });

    socket.on("host_progress_update", ({ students }) => {
      setJoinedStudents(students);
    });

    return () => {
      socket.off("lobby_update");
      socket.off("game_start");
      socket.off("host_progress_update");
    };
  }, [socket, mode, tree.initializeSentence, practicePackage]);

  // Defensive state synchronization for Practice Mode: Bypass lobby state under all circumstances
  useEffect(() => {
    const isPractice = roomType === "practice";
    if (isPractice && (mode === "student_game_lobby" || mode === "landing")) {
      if (practicePackage && practicePackage.length > 0) {
        const firstPractice = practicePackage[0];
        if (firstPractice) {
          setAnswerKey(firstPractice);
          tree.initializeSentence(firstPractice.sentence);
        }
        setMode("student_practice_gameplay");
      }
    }
  }, [roomType, mode, practicePackage, tree.initializeSentence]);

  // Client-Side Timer ticking (for student during game)
  useEffect(() => {
    if (mode === "student_game_gameplay" && gameStartTime && !isGameSubmitted) {
      timerRef.current = setInterval(() => {
        setElapsedTime(Date.now() - gameStartTime);
      }, 100);
    } else {
      clearInterval(timerRef.current);
    }

    return () => clearInterval(timerRef.current);
  }, [mode, gameStartTime, isGameSubmitted]);

  const resetAppState = () => {
    setMode("landing");
    setRoomPin("");
    setNickname("");
    setJoinedStudents([]);
    setGameStartTime(null);
    setElapsedTime(0);
    setAnswerKey(null);
    tree.initializeSentence("");
    setNewWordText("");
    setInsertIndexSelection("end");
    setIsPracticeComplete(false);
    setPracticeUploads([]);
    setPracticePackage([]);
    setCurrentPracticeIndex(0);
    setShowPracticeAnswer(false);
    setRoomType("");
    setIsGameSubmitted(false);
    setGameUploads([]);
    setCurrentGameIndex(0);
    setAccumulatedGameMistakes(0);
    setAccumulatedGameTime(0);
  };

  // 1. BUILDING MODE OPERATIONS
  const startBuildingMode = () => {
    if (!inputText.trim()) {
      alert("Please enter a sentence first.");
      return;
    }
    tree.initializeSentence(inputText);
    setMode("building");
  };

  // Generate the answer key representation and download JSON
  const handleExportJson = () => {
    // Find candidate root nodes (nodes with no parents)
    const rootNodes = tree.nodes.filter(node => {
      const hasParent = tree.edges.some(e => e.target === node.id);
      return !hasParent;
    });

    const wordNodes = tree.nodes.filter(n => n.data?.isWord);
    if (wordNodes.length === 0) {
      alert("Please build a tree with the sentence words first.");
      return;
    }

    const nodesMap = new Map(tree.nodes.map(n => [n.id, n]));
    const edgesFromParent = new Map();
    tree.edges.forEach(edge => {
      if (!edgesFromParent.has(edge.source)) edgesFromParent.set(edge.source, []);
      edgesFromParent.get(edge.source).push(edge);
    });
    const wordNodesMap = new Map(wordNodes.map(w => [w.id, w]));

    let mainRoot = null;
    let rootSubtree = null;

    for (const root of rootNodes) {
      const rep = buildSubtreeRep(root.id, nodesMap, edgesFromParent, wordNodesMap);
      
      const getSpanIndices = (nodeRep) => {
        if (!nodeRep) return [];
        if (nodeRep.type === "word") return [nodeRep.index];
        if (nodeRep.type === "unary") return getSpanIndices(nodeRep.child);
        if (nodeRep.type === "binary") return [...getSpanIndices(nodeRep.children[0]), ...getSpanIndices(nodeRep.children[1])];
        return [];
      };

      const spans = getSpanIndices(rep);
      if (spans.length === wordNodes.length && !root.data?.isWord) {
        mainRoot = root;
        rootSubtree = rep;
        break;
      }
    }

    if (!mainRoot || !rootSubtree) {
      alert("Error: Your tree must contain a single top phrase node (e.g. CP, TP, or S) that dominates all sentence words.");
      return;
    }

    const missingCategory = tree.nodes.some(n => !n.data.isWord && (!n.data.category || n.data.category.trim() === ""));
    if (missingCategory) {
      alert("Please make sure all syntactic category nodes have a label assigned.");
      return;
    }

    const subtrees = extractAllSubtrees(rootSubtree);
    const key = {
      sentence: tree.sentence,
      rootSubtree,
      subtrees
    };

    // Trigger file download
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(key, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `syntax-tree-key-${tree.sentence.replace(/\s+/g, "-")}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // 2. HOST PRACTICE MODE OPERATIONS
  const handlePracticeFilesChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const loadedKeys = [];
    let loadedCount = 0;

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const importedData = JSON.parse(event.target.result);
          if (Array.isArray(importedData)) {
            importedData.forEach((item) => {
              if (item.sentence && item.rootSubtree && item.subtrees) {
                loadedKeys.push(item);
              }
            });
          } else if (importedData.sentence && importedData.rootSubtree && importedData.subtrees) {
            loadedKeys.push(importedData);
          }
        } catch (err) {
          console.error("Error parsing practice file:", err);
        }

        loadedCount++;
        if (loadedCount === files.length) {
          setPracticeUploads((prev) => [...prev, ...loadedKeys]);
          alert(`Successfully uploaded ${loadedKeys.length} sentence key(s).`);
        }
      };
      reader.readAsText(file);
    });
    e.target.value = null; // Reset file input
  };

  const handleHostPracticeRoom = () => {
    if (practiceUploads.length === 0) {
      alert("Please upload at least one syntax tree configuration JSON file.");
      return;
    }

    socket.emit("host_create_room", { 
      roomType: "practice", 
      package: practiceUploads,
      pkg: practiceUploads,
      practicePackage: practiceUploads
    }, (res) => {
      if (res.success) {
        setRoomPin(res.pin);
        setPracticePackage(practiceUploads);
        setRoomType("practice");
        setMode("host_practice_lobby");
      } else {
        alert("Failed to create Practice room.");
      }
    });
  };

  const handleGameFilesChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const loadedKeys = [];
    let loadedCount = 0;

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const importedData = JSON.parse(event.target.result);
          if (Array.isArray(importedData)) {
            importedData.forEach((item) => {
              if (item.sentence && item.rootSubtree && item.subtrees) {
                loadedKeys.push(item);
              }
            });
          } else if (importedData.sentence && importedData.rootSubtree && importedData.subtrees) {
            loadedKeys.push(importedData);
          }
        } catch (err) {
          console.error("Error parsing game file:", err);
        }

        loadedCount++;
        if (loadedCount === files.length) {
          setGameUploads((prev) => [...prev, ...loadedKeys]);
          alert(`Successfully uploaded ${loadedKeys.length} sentence key(s).`);
        }
      };
      reader.readAsText(file);
    });
    e.target.value = null; // Reset file input
  };

  const handleHostGameRoomDirect = () => {
    if (gameUploads.length === 0) {
      alert("Please upload at least one syntax tree configuration JSON file.");
      return;
    }

    setAnswerKey(gameUploads[0]);
    tree.initializeSentence(gameUploads[0].sentence);
    setRoomType("game");
    setPracticePackage(gameUploads);

    socket.emit("host_create_room", { 
      roomType: "game", 
      package: gameUploads,
      pkg: gameUploads,
      practicePackage: gameUploads
    }, (res) => {
      if (res.success) {
        setRoomPin(res.pin);
        setMode("host_game_lobby");
      } else {
        alert("Failed to create Game room.");
      }
    });
  };

  // 3. HOST GAME MODE OPERATIONS
  const startHostGameSetup = () => {
    if (!inputText.trim()) {
      alert("Please enter a sentence first.");
      return;
    }
    tree.initializeSentence(inputText);
    setMode("host_game_setup");
  };

  const handleHostGameRoom = () => {
    const rootNodes = tree.nodes.filter(node => {
      const hasParent = tree.edges.some(e => e.target === node.id);
      return !hasParent;
    });

    const wordNodes = tree.nodes.filter(n => n.data?.isWord);
    if (wordNodes.length === 0) {
      alert("Please build a tree with the sentence words first.");
      return;
    }

    const nodesMap = new Map(tree.nodes.map(n => [n.id, n]));
    const edgesFromParent = new Map();
    tree.edges.forEach(edge => {
      if (!edgesFromParent.has(edge.source)) edgesFromParent.set(edge.source, []);
      edgesFromParent.get(edge.source).push(edge);
    });
    const wordNodesMap = new Map(wordNodes.map(w => [w.id, w]));

    let mainRoot = null;
    let rootSubtree = null;

    for (const root of rootNodes) {
      const rep = buildSubtreeRep(root.id, nodesMap, edgesFromParent, wordNodesMap);
      
      const getSpanIndices = (nodeRep) => {
        if (!nodeRep) return [];
        if (nodeRep.type === "word") return [nodeRep.index];
        if (nodeRep.type === "unary") return getSpanIndices(nodeRep.child);
        if (nodeRep.type === "binary") return [...getSpanIndices(nodeRep.children[0]), ...getSpanIndices(nodeRep.children[1])];
        return [];
      };

      const spans = getSpanIndices(rep);
      if (spans.length === wordNodes.length && !root.data?.isWord) {
        mainRoot = root;
        rootSubtree = rep;
        break;
      }
    }

    if (!mainRoot || !rootSubtree) {
      alert("Error: Your tree must contain a single top phrase node (e.g. CP, TP, or S) that dominates all sentence words.");
      return;
    }

    const missingCategory = tree.nodes.some(n => !n.data.isWord && (!n.data.category || n.data.category.trim() === ""));
    if (missingCategory) {
      alert("Please make sure all syntactic category nodes have a label assigned.");
      return;
    }

    const subtrees = extractAllSubtrees(rootSubtree);
    const key = {
      rootSubtree,
      subtrees,
      sentence: tree.sentence
    };

    setAnswerKey(key);
    setRoomType("game");

    socket.emit("host_create_room", { roomType: "game", sentence: tree.sentence, answerKey: key }, (res) => {
      if (res.success) {
        setRoomPin(res.pin);
        setMode("host_game_lobby");
      } else {
        alert("Failed to create Game room.");
      }
    });
  };

  const handleStartGame = () => {
    if (joinedStudents.length === 0) {
      alert("Wait for at least one student to join.");
      return;
    }
    socket.emit("host_start_game", { pin: roomPin }, (res) => {
      if (res.success) {
        setMode("host_game_gameplay");
      }
    });
  };

  // 4. STUDENT JOIN OPERATIONS
  const handleJoinRoom = () => {
    if (!roomPin || !nickname) {
      alert("Please enter both the Room PIN and Nickname.");
      return;
    }
    socket.emit("student_join_room", { pin: roomPin, nickname }, (res) => {
      console.log("student_join_room response payload received:", res);
      if (res && res.success) {
        setRoomPin(roomPin);
        
        const roomTypeVal = res.roomType || res.type || res.mode || "";
        setRoomType(roomTypeVal);
        
        const pkgVal = res.package || res.pkg || [];

        if (roomTypeVal === "practice") {
          setPracticePackage(pkgVal);
          setCurrentPracticeIndex(0);
          if (pkgVal && pkgVal[0]) {
            setAnswerKey(pkgVal[0]);
            tree.initializeSentence(pkgVal[0].sentence);
          }
          // Bypass waiting lobby entirely for Practice Mode
          setMode("student_practice_gameplay");
        } else {
          // Game Mode
          setPracticePackage(pkgVal);
          setCurrentGameIndex(0);
          setAccumulatedGameMistakes(0);
          setAccumulatedGameTime(0);

          if (pkgVal && pkgVal.length > 0) {
            setAnswerKey(pkgVal[0]);
            tree.initializeSentence(pkgVal[0].sentence);
          } else {
            setAnswerKey(res.answerKey);
            tree.initializeSentence(res.sentence);
          }

          if (res.status === "playing") {
            setGameStartTime(Date.now());
            setMode("student_game_gameplay");
          } else {
            setMode("student_game_lobby");
          }
        }
      } else {
        alert(res?.error || "Failed to join room.");
      }
    });
  };

  // 5. STUDENT GAMEPLAY OPERATIONS
  const handleNextPracticeSentence = () => {
    const nextIdx = currentPracticeIndex + 1;
    if (nextIdx < practicePackage.length) {
      setCurrentPracticeIndex(nextIdx);
      setAnswerKey(practicePackage[nextIdx]);
      tree.initializeSentence(practicePackage[nextIdx].sentence);
      setIsPracticeComplete(false); // Reset complete banner
      
      // Notify server of progress
      socket.emit("student_practice_progress", {
        pin: roomPin,
        currentIndex: nextIdx,
        completed: false
      });
    }
  };

  const handlePrevPracticeSentence = () => {
    const prevIdx = currentPracticeIndex - 1;
    if (prevIdx >= 0) {
      setCurrentPracticeIndex(prevIdx);
      setAnswerKey(practicePackage[prevIdx]);
      tree.initializeSentence(practicePackage[prevIdx].sentence);
      setIsPracticeComplete(false); // Reset complete banner
      
      // Notify server of progress
      socket.emit("student_practice_progress", {
        pin: roomPin,
        currentIndex: prevIdx,
        completed: false
      });
    }
  };

  const handleFinishPractice = () => {
    socket.emit("student_practice_progress", {
      pin: roomPin,
      currentIndex: currentPracticeIndex,
      completed: true
    });
    setMode("student_practice_complete");
  };

  const handleSubmitTree = () => {
    if (!answerKey) return;
    
    const { invalidNodeIds, correctNodeIds } = validateStudentTree(
      tree.nodes,
      tree.edges,
      answerKey
    );

    // Accuracy-First scoring logic: mistakes = incorrect tags + missing nodes
    const mistakes = invalidNodeIds.size + Math.max(0, answerKey.subtrees.length - correctNodeIds.size);
    const finalTime = elapsedTime;

    const isLastSentence = !practicePackage || practicePackage.length <= 1 || currentGameIndex === practicePackage.length - 1;

    if (isLastSentence) {
      const totalMistakes = accumulatedGameMistakes + mistakes;
      const totalTime = accumulatedGameTime + finalTime;

      socket.emit("student_submit_tree", { pin: roomPin, mistakes: totalMistakes, completionTime: totalTime }, (res) => {
        if (res.success) {
          setStudentCompletionTime(totalTime);
          setStudentMistakes(totalMistakes);
          setIsGameSubmitted(true);
        } else {
          alert(res.error || "Failed to submit tree.");
        }
      });
    } else {
      // Intermediate sentence submission in Game package
      setStudentCompletionTime(finalTime);
      setStudentMistakes(mistakes);
      setIsGameSubmitted(true);
    }
  };

  // 6. REAL-TIME VALIDATION PROCESSORS
  // Practice Mode: Real-time visual feedback (turns incorrect nodes RED)
  useEffect(() => {
    if (mode !== "student_practice_gameplay" || !answerKey) {
      return;
    }

    const { invalidNodeIds, correctNodeIds, isComplete } = validateStudentTree(
      tree.nodes,
      tree.edges,
      answerKey
    );

    setIsPracticeComplete(isComplete);

    let hasChanged = false;
    const nextNodes = tree.nodes.map((node) => {
      const isWord = node.data?.isWord;
      const isNeutral = !isWord && !invalidNodeIds.has(node.id) && !correctNodeIds.has(node.id);
      const isBlank = !isWord && (!node.data.category || node.data.category.trim() === "");
      
      const expectedValidated = isNeutral || isBlank ? false : true;
      const targetCorrect = isWord || correctNodeIds.has(node.id);
      const targetInvalid = !isWord && invalidNodeIds.has(node.id);
      const finalCorrect = targetCorrect && !targetInvalid;
      
      const currentValidated = node.data?.isValidated || false;
      const currentCorrect = node.data?.isCorrect || false;

      if (
        currentValidated !== expectedValidated ||
        currentCorrect !== finalCorrect
      ) {
        hasChanged = true;
        return {
          ...node,
          data: {
            ...node.data,
            isValidated: expectedValidated,
            isCorrect: finalCorrect
          }
        };
      }
      return node;
    });

    if (hasChanged) {
      tree.setNodes(nextNodes);
    }
  }, [tree.nodes, tree.edges, mode, answerKey]);

  // Game Mode: Quiet background updates to the lecturer dashboard (No student-facing highlights)
  useEffect(() => {
    if (mode !== "student_game_gameplay" || !answerKey || !socket) {
      return;
    }

    const { correctNodeIds } = validateStudentTree(
      tree.nodes,
      tree.edges,
      answerKey
    );

    socket.emit("student_progress", {
      pin: roomPin,
      totalNodes: tree.nodes.length,
      correctNodes: correctNodeIds.size
    });
  }, [tree.nodes, tree.edges, mode, answerKey, socket, roomPin]);

  // 7. EXPORT IMAGE UTILITIES
  const downloadPng = () => {
    if (canvasRef.current) {
      canvasRef.current.exportPng(`syntax-tree-${Date.now()}.png`)
        .catch(() => alert("Export to PNG failed."));
    }
  };

  const downloadSvg = () => {
    if (canvasRef.current) {
      canvasRef.current.exportSvg(`syntax-tree-${Date.now()}.svg`)
        .catch(() => alert("Export to SVG failed."));
    }
  };

  const setPresetDimensions = (width, height) => {
    setExportWidth(width);
    setExportHeight(height);
  };

  // Helper to color correct/incorrect edges (Practice mode only)
  const getValidatedEdges = () => {
    if (mode !== "student_practice_gameplay" || !answerKey) {
      return tree.edges.map((edge) => ({
        ...edge,
        style: { stroke: "#94a3b8", strokeWidth: 2.5 }
      }));
    }

    const { invalidNodeIds, correctNodeIds } = validateStudentTree(
      tree.nodes,
      tree.edges,
      answerKey
    );

    return tree.edges.map((edge) => {
      const isSourceInvalid = invalidNodeIds.has(edge.source);
      const isTargetInvalid = invalidNodeIds.has(edge.target);
      const isSourceCorrect = correctNodeIds.has(edge.source);
      const isTargetCorrect = correctNodeIds.has(edge.target);

      let className = "";
      let style = { strokeWidth: 2.5 };

      if (isSourceInvalid || isTargetInvalid) {
        className = "invalid";
        style.stroke = "#dc2626"; // red
      } else if (isSourceCorrect && isTargetCorrect) {
        className = "correct";
        style.stroke = "#16a34a"; // green
      } else {
        style.stroke = "#94a3b8"; // slate
      }

      return {
        ...edge,
        className,
        style
      };
    });
  };

  const formatTime = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const milliseconds = ms % 1000;
    return `${seconds}.${milliseconds.toString().padStart(3, "0")}s`;
  };

  // 8. DYNAMIC WORD ACTIONS
  const handleAddWordSubmit = (e) => {
    e.preventDefault();
    if (!newWordText.trim()) return;

    let idx = tree.nodes.filter(n => n.data?.isWord).length;
    if (insertIndexSelection === "start") {
      idx = 0;
    } else if (insertIndexSelection.startsWith("after_")) {
      idx = parseInt(insertIndexSelection.replace("after_", "")) + 1;
    }

    tree.addWord(newWordText.trim(), idx);
    setNewWordText("");
  };

  const handleAddNullSymbol = () => {
    let idx = tree.nodes.filter(n => n.data?.isWord).length;
    if (insertIndexSelection === "start") {
      idx = 0;
    } else if (insertIndexSelection.startsWith("after_")) {
      idx = parseInt(insertIndexSelection.replace("after_", "")) + 1;
    }

    tree.addWord("∅", idx);
  };

  const wordNodesSorted = tree.nodes
    .filter(n => n.data?.isWord)
    .sort((a, b) => a.data.wordIndex - b.data.wordIndex);

  // 9. ACCORDION SETTINGS PANEL
  const renderExportPanel = () => {
    return (
      <div className="export-panel" style={{ marginTop: "1rem" }}>
        <div 
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", userSelect: "none" }}
          onClick={() => setIsSettingsExpanded(!isSettingsExpanded)}
        >
          <h4 style={{ fontSize: "0.9rem", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "6px" }}>
            <FileImage size={15} style={{ color: "hsl(var(--primary))" }} /> Aspect-Ratio & Export Settings
          </h4>
          <span style={{ 
            transform: isSettingsExpanded ? "rotate(180deg)" : "rotate(0deg)", 
            transition: "transform 0.2s ease",
            display: "inline-block",
            fontWeight: "bold",
            fontSize: "1rem",
            color: "hsl(var(--primary))"
          }}>
            ▼
          </span>
        </div>
        
        {isSettingsExpanded && (
          <div style={{ marginTop: "1rem", borderTop: "1px solid hsl(var(--border-color))", paddingTop: "1rem" }}>
            <div className="slider-group">
              <label>Canvas Width</label>
              <input
                type="range"
                min="400"
                max="1600"
                value={exportWidth}
                onChange={(e) => setExportWidth(parseInt(e.target.value))}
              />
              <span className="slider-val">{exportWidth}px</span>
            </div>
            <div className="slider-group">
              <label>Canvas Height</label>
              <input
                type="range"
                min="300"
                max="1000"
                value={exportHeight}
                onChange={(e) => setExportHeight(parseInt(e.target.value))}
              />
              <span className="slider-val">{exportHeight}px</span>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "hsl(var(--text-muted))" }}>Presets:</span>
              <button className="btn btn-secondary" style={{ padding: "0.25rem 0.6rem", fontSize: "0.8rem", minHeight: "32px" }} onClick={() => setPresetDimensions(1120, 630)}>
                Widescreen 16:9
              </button>
              <button className="btn btn-secondary" style={{ padding: "0.25rem 0.6rem", fontSize: "0.8rem", minHeight: "32px" }} onClick={() => setPresetDimensions(960, 720)}>
                PowerPoint 4:3
              </button>
              <button className="btn btn-secondary" style={{ padding: "0.25rem 0.6rem", fontSize: "0.8rem", minHeight: "32px" }} onClick={() => setPresetDimensions(800, 500)}>
                Square Compact
              </button>
              
              <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}>
                <button className="btn btn-primary" style={{ minHeight: "32px" }} onClick={downloadPng}>
                  <Download size={15} /> Export PNG
                </button>
                <button className="btn btn-secondary" style={{ minHeight: "32px" }} onClick={downloadSvg}>
                  <FileImage size={15} /> Export SVG
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <h1 className="logo" onClick={resetAppState} style={{ cursor: "pointer" }}>
          <Sparkles size={20} /> Syntax Tree Builder & Challenge
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button
            className="btn btn-secondary"
            onClick={() => setDarkMode(d => !d)}
            title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            style={{ width: 38, height: 38, padding: 0, borderRadius: "var(--radius-full)", minHeight: 38, flexShrink: 0 }}
          >
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          {mode !== "landing" && (
            <button className="btn btn-secondary" onClick={resetAppState}>
              <ArrowLeft size={16} /> Exit Mode
            </button>
          )}
        </div>
      </header>

      {/* Main Workspace Router */}
      <main className="main-content">
        
        {/* LANDING SCREEN */}
        {mode === "landing" && (
          <div style={{ maxWidth: 1200, margin: "1.5rem auto", width: "100%", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            
            {/* Header info */}
            <div className="glass-card" style={{ textAlign: "center", padding: "2.75rem 2rem", position: "relative", overflow: "hidden" }}>
              {/* Decorative gradient orbs */}
              <div style={{ position: "absolute", top: 0, right: 0, width: 240, height: 240, background: "radial-gradient(circle, hsla(var(--primary)/0.08) 0%, transparent 70%)", pointerEvents: "none" }} />
              <div style={{ position: "absolute", bottom: 0, left: 0, width: 180, height: 180, background: "radial-gradient(circle, hsla(var(--accent)/0.06) 0%, transparent 70%)", pointerEvents: "none" }} />
              <h2 className="text-gradient" style={{ fontSize: "2.5rem", marginBottom: "0.75rem", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.1, position: "relative" }}>
                Syntax Tree Builder & Challenge
              </h2>
              <p style={{ color: "hsl(var(--text-muted))", fontSize: "1.05rem", lineHeight: 1.7, maxWidth: "640px", margin: "0 auto", position: "relative" }}>
                Construct, export, and validate syntax tree structures based on X-bar theory. Join self-paced practice rooms or compete in live classroom challenges.
              </p>
            </div>

            {/* Unified 4-Card Dashboard Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.5rem" }}>
              
              {/* 1. BUILDING MODE CARD */}
              <div className="glass-card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  <div className="icon-badge">
                    <Sparkles size={20} style={{ color: "hsl(var(--primary))" }} />
                  </div>
                  <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.5rem", color: "hsl(var(--text-primary))" }}>
                    Building mode
                  </h3>
                  <p style={{ color: "hsl(var(--text-muted))", fontSize: "0.85rem", marginBottom: "1.25rem", lineHeight: 1.5 }}>
                    Type a sentence to construct a syntax tree from scratch on the free canvas and export your configuration key as a JSON file.
                  </p>
                  <div className="form-group" style={{ marginBottom: "1rem" }}>
                    <label className="form-label">Enter Sentence</label>
                    <input
                      type="text"
                      className="input-text"
                      placeholder="e.g. Ella thinks that syntax is fun"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                    />
                  </div>
                </div>
                <button 
                  className="btn btn-primary" 
                  onClick={startBuildingMode}
                  disabled={!inputText.trim()}
                  style={{ width: "100%" }}
                >
                  Launch Canvas
                </button>
              </div>

              {/* 2. HOST PRACTICE SESSION CARD */}
              <div className="glass-card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  <div className="icon-badge">
                    <BookOpen size={20} style={{ color: "hsl(var(--primary))" }} />
                  </div>
                  <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.5rem", color: "hsl(var(--text-primary))" }}>
                    Host Practice Session
                  </h3>
                  <p style={{ color: "hsl(var(--text-muted))", fontSize: "0.85rem", marginBottom: "1.25rem", lineHeight: 1.5 }}>
                    Upload a package of pre-built syntax tree JSON keys to host a self-paced class assignment with real-time student progress tracking.
                  </p>
                  
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}>
                    <input
                      type="file"
                      multiple
                      accept=".json"
                      id="practice-files-upload"
                      style={{ display: "none" }}
                      onChange={handlePracticeFilesChange}
                    />
                    <label htmlFor="practice-files-upload" className="btn btn-secondary" style={{ cursor: "pointer", width: "100%", minHeight: "44px", display: "inline-flex", justifyContent: "center" }}>
                      <Upload size={14} /> Upload JSON Keys
                    </label>

                    {practiceUploads.length > 0 && (
                      <div style={{ borderTop: "1px solid hsl(var(--border-color))", paddingTop: "0.5rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                          <span style={{ fontSize: "0.75rem", fontWeight: 700 }}>Package ({practiceUploads.length}):</span>
                          <button style={{ background: "transparent", border: "none", color: "hsl(var(--error))", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer" }} onClick={() => setPracticeUploads([])}>Clear</button>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", maxHeight: "80px", overflowY: "auto" }}>
                          {practiceUploads.map((u, i) => (
                            <div key={i} style={{ fontSize: "0.7rem", background: "hsl(var(--bg-main))", padding: "0.2rem 0.4rem", borderRadius: "var(--radius-sm)", border: "1px solid hsl(var(--border-color))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {i + 1}. "{u.sentence}"
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <button 
                  className="btn btn-primary" 
                  onClick={handleHostPracticeRoom}
                  disabled={practiceUploads.length === 0}
                  style={{ width: "100%" }}
                >
                  Host Practice Room
                </button>
              </div>

              {/* 3. HOST GAME CHALLENGE CARD */}
              <div className="glass-card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  <div className="icon-badge">
                    <Award size={20} style={{ color: "hsl(var(--primary))" }} />
                  </div>
                  <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.5rem", color: "hsl(var(--text-primary))" }}>
                    Host Game Challenge
                  </h3>
                  <p style={{ color: "hsl(var(--text-muted))", fontSize: "0.85rem", marginBottom: "1.25rem", lineHeight: 1.5 }}>
                    Type a sentence and construct its target syntax tree live, OR upload pre-built syntax tree JSON keys to host.
                  </p>
                  <div className="form-group" style={{ marginBottom: "0.75rem" }}>
                    <label className="form-label">Enter Game Sentence</label>
                    <input
                      type="text"
                      className="input-text"
                      placeholder="e.g. syntax is fun"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      disabled={gameUploads.length > 0}
                    />
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}>
                    <input
                      type="file"
                      multiple
                      accept=".json"
                      id="game-files-upload"
                      style={{ display: "none" }}
                      onChange={handleGameFilesChange}
                    />
                    <label htmlFor="game-files-upload" className="btn btn-secondary" style={{ cursor: "pointer", width: "100%", minHeight: "44px", display: "inline-flex", justifyContent: "center" }}>
                      <Upload size={14} /> Upload JSON Keys
                    </label>

                    {gameUploads.length > 0 && (
                      <div style={{ borderTop: "1px solid hsl(var(--border-color))", paddingTop: "0.5rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                          <span style={{ fontSize: "0.75rem", fontWeight: 700 }}>Package ({gameUploads.length}):</span>
                          <button style={{ background: "transparent", border: "none", color: "hsl(var(--error))", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer" }} onClick={() => setGameUploads([])}>Clear</button>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", maxHeight: "80px", overflowY: "auto" }}>
                          {gameUploads.map((u, i) => (
                            <div key={i} style={{ fontSize: "0.7rem", background: "hsl(var(--bg-main))", padding: "0.2rem 0.4rem", borderRadius: "var(--radius-sm)", border: "1px solid hsl(var(--border-color))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {i + 1}. "{u.sentence}"
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {gameUploads.length > 0 ? (
                  <button 
                    className="btn btn-primary" 
                    onClick={handleHostGameRoomDirect}
                    style={{ width: "100%" }}
                  >
                    Host Game Room (מארח)
                  </button>
                ) : (
                  <button 
                    className="btn btn-primary" 
                    onClick={startHostGameSetup}
                    disabled={!inputText.trim()}
                    style={{ width: "100%" }}
                  >
                    Configure & Host
                  </button>
                )}
              </div>

              {/* 4. JOIN A SESSION CARD */}
              <div className="glass-card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  <div className="icon-badge success">
                    <Users size={20} style={{ color: "hsl(var(--success))" }} />
                  </div>
                  <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.5rem", color: "hsl(var(--text-primary))" }}>
                    Join a session
                  </h3>
                  <p style={{ color: "hsl(var(--text-muted))", fontSize: "0.85rem", marginBottom: "1.25rem", lineHeight: 1.5 }}>
                    Join a practice session or a game challenge room hosted by your lecturer. Enter the PIN and your nickname to join.
                  </p>
                  
                  <div className="form-group" style={{ marginBottom: "0.5rem" }}>
                    <label className="form-label">Room PIN</label>
                    <input
                      type="text"
                      className="input-text"
                      placeholder="e.g. 1234"
                      maxLength={4}
                      value={roomPin}
                      onChange={(e) => setRoomPin(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: "1rem" }}>
                    <label className="form-label">Student Nickname</label>
                    <input
                      type="text"
                      className="input-text"
                      placeholder="Enter your nickname"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                    />
                  </div>
                </div>
                
                <button
                  className="btn btn-primary"
                  onClick={handleJoinRoom}
                  disabled={!roomPin.trim() || !nickname.trim()}
                  style={{ width: "100%", background: "hsl(var(--success))" }}
                >
                  Join Session (הצטרפות)
                </button>
              </div>

            </div>
          </div>
        )}

        {/* BUILDING MODE CANVAS */}
        {mode === "building" && (
          <div className="gameplay-layout">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
              <div>
                <h2 style={{ fontSize: "1.4rem", fontWeight: 700, color: "hsl(var(--primary))" }}>Building mode</h2>
                <p style={{ color: "hsl(var(--text-muted))", fontSize: "0.9rem" }}>Sentence: "{tree.sentence}"</p>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button className="btn btn-secondary" onClick={tree.createRootNode}>
                  <Plus size={16} /> Add Root (Top-Down)
                </button>
                <button className="btn btn-secondary" onClick={handleExportJson} title="Export this syntax configuration key as JSON">
                  <Download size={15} /> Export Tree Configuration
                </button>
                <button className="btn btn-secondary" onClick={tree.clearTree}>
                  <RefreshCw size={16} /> Reset
                </button>
              </div>
            </div>

            {/* Word Manager Bar */}
            <div className="word-manager-bar">
              <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "hsl(var(--text-primary))", marginRight: "0.5rem" }}>
                Sentence Words:
              </span>
              {wordNodesSorted.map((n) => (
                <span key={n.id} className="word-pill">
                  {n.data.word}
                </span>
              ))}

              <form onSubmit={handleAddWordSubmit} className="add-word-form">
                <input
                  type="text"
                  placeholder="New word..."
                  className="input-text"
                  style={{ width: "110px" }}
                  value={newWordText}
                  onChange={(e) => setNewWordText(e.target.value)}
                />
                <select
                  className="input-text"
                  value={insertIndexSelection}
                  onChange={(e) => setInsertIndexSelection(e.target.value)}
                >
                  <option value="end">Append at end</option>
                  <option value="start">Insert at start</option>
                  {wordNodesSorted.map((n, idx) => (
                    <option key={n.id} value={`after_${idx}`}>
                      Insert after "{n.data.word}"
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn btn-primary" style={{ padding: "0.25rem 0.6rem", fontSize: "0.85rem" }}>
                  <PlusCircle size={14} /> Add
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: "0.25rem 0.6rem", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                  onClick={handleAddNullSymbol}
                >
                  <PlusCircle size={14} /> Add Null (∅)
                </button>
              </form>
            </div>

            {/* Resizable Canvas Viewport */}
            <div
              className="canvas-wrapper"
              ref={canvasWrapperRef}
              style={{ 
                width: isSettingsExpanded ? `${exportWidth}px` : "100%",
                height: isSettingsExpanded ? `${exportHeight}px` : "100%",
                flex: isSettingsExpanded ? "none" : "1"
              }}
            >
              <TreeCanvas
                ref={canvasRef}
                nodes={tree.nodes}
                edges={getValidatedEdges()}
                onNodesChange={tree.onNodesChange}
                onEdgesChange={tree.onEdgesChange}
                onConnect={tree.onConnect}
                onMerge={tree.mergeSelected}
                onProject={tree.projectSelected}
                onSplitBinary={tree.splitBinary}
                onSplitUnary={tree.splitUnary}
                onDeleteSelected={tree.deleteSelected}
                width={exportWidth}
                height={exportHeight}
              />
            </div>

            {renderExportPanel()}
          </div>
        )}

        {/* HOST PRACTICE MONITORING LOBBY */}
        {mode === "host_practice_lobby" && (
          <div style={{ maxWidth: 850, margin: "2rem auto", width: "100%" }} className="glass-card">
            <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
              <span className="badge-lobby">Practice Session Active</span>
              <p style={{ fontSize: "0.7rem", color: "hsl(var(--text-muted))", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, marginTop: "1.25rem", marginBottom: "0.35rem" }}>Room PIN</p>
              <div className="pin-display">{roomPin}</div>
              <p style={{ color: "hsl(var(--text-muted))", fontSize: "0.9rem", marginTop: "0.75rem" }}>
                Students join this practice room on their own devices using the room PIN.
              </p>
            </div>

            <div style={{ borderTop: "1px solid hsl(var(--border-color))", paddingTop: "1.25rem", display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "1.5rem" }}>
              <div>
                <h3 style={{ fontWeight: 700, fontSize: "1.05rem", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Users size={16} /> Students Connected ({joinedStudents.length})
                </h3>
                
                {joinedStudents.length === 0 ? (
                  <div style={{ padding: "2rem", textAlign: "center", color: "hsl(var(--text-muted))", border: "1px dashed hsl(var(--border-color))", borderRadius: "var(--radius-md)" }}>
                    Waiting for students to connect...
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "250px", overflowY: "auto" }}>
                    {joinedStudents.map((student, idx) => {
                      const idxVal = student.progress ? (student.progress.currentIndex || 0) : 0;
                      return (
                        <div key={idx} style={{ padding: "0.6rem 0.8rem", background: "hsl(var(--bg-main))", border: "1px solid hsl(var(--border-color))", borderRadius: "var(--radius-md)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontWeight: 600 }}>{student.nickname}</span>
                          <span style={{ fontSize: "0.85rem", color: "hsl(var(--text-muted))" }}>
                            {student.completed ? (
                              <span style={{ color: "hsl(var(--success))", fontWeight: 700 }}>Finished 🎉</span>
                            ) : (
                              `Currently parsing: Sentence ${idxVal + 1} / ${practicePackage.length}`
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <h3 style={{ fontWeight: 700, fontSize: "1.05rem", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <BookOpen size={16} /> Practice Package Contents
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "250px", overflowY: "auto" }}>
                  {practicePackage.map((item, idx) => (
                    <div key={idx} style={{ fontSize: "0.85rem", padding: "0.5rem", background: "hsl(var(--bg-main))", border: "1px solid hsl(var(--border-color))", borderRadius: "var(--radius-md)" }}>
                      {idx + 1}. "{item.sentence}"
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "center" }}>
              <button className="btn btn-secondary" onClick={resetAppState}>
                Close Room
              </button>
            </div>
          </div>
        )}

        {/* HOST GAME SETUP */}
        {mode === "host_game_setup" && (
          <div className="gameplay-layout">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
              <div>
                <h2 style={{ fontSize: "1.4rem", fontWeight: 700 }}>Configure Game Target Tree</h2>
                <p style={{ color: "hsl(var(--text-muted))", fontSize: "0.9rem" }}>Sentence: "{tree.sentence}"</p>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button className="btn btn-secondary" onClick={tree.createRootNode}>
                  <Plus size={16} /> Add Root
                </button>
                <button className="btn btn-secondary" onClick={tree.clearTree}>
                  <RefreshCw size={16} /> Reset
                </button>
                <button className="btn btn-primary" onClick={handleHostGameRoom}>
                  Create Room & Host
                </button>
              </div>
            </div>

            {/* Word Manager Bar */}
            <div className="word-manager-bar">
              <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "hsl(var(--text-primary))", marginRight: "0.5rem" }}>
                Sentence Words:
              </span>
              {wordNodesSorted.map((n) => (
                <span key={n.id} className="word-pill">
                  {n.data.word}
                </span>
              ))}

              <form onSubmit={handleAddWordSubmit} className="add-word-form">
                <input
                  type="text"
                  placeholder="New word..."
                  className="input-text"
                  style={{ width: "110px" }}
                  value={newWordText}
                  onChange={(e) => setNewWordText(e.target.value)}
                />
                <select
                  className="input-text"
                  value={insertIndexSelection}
                  onChange={(e) => setInsertIndexSelection(e.target.value)}
                >
                  <option value="end">Append at end</option>
                  <option value="start">Insert at start</option>
                  {wordNodesSorted.map((n, idx) => (
                    <option key={n.id} value={`after_${idx}`}>
                      Insert after "{n.data.word}"
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn btn-primary" style={{ padding: "0.25rem 0.6rem", fontSize: "0.85rem" }}>
                  <PlusCircle size={14} /> Add
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: "0.25rem 0.6rem", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                  onClick={handleAddNullSymbol}
                >
                  <PlusCircle size={14} /> Add Null (∅)
                </button>
              </form>
            </div>

            <div className="canvas-wrapper" style={{ width: "100%", height: "100%" }}>
              <TreeCanvas
                ref={canvasRef}
                nodes={tree.nodes}
                edges={getValidatedEdges()}
                onNodesChange={tree.onNodesChange}
                onEdgesChange={tree.onEdgesChange}
                onConnect={tree.onConnect}
                onMerge={tree.mergeSelected}
                onProject={tree.projectSelected}
                onSplitBinary={tree.splitBinary}
                onSplitUnary={tree.splitUnary}
                onDeleteSelected={tree.deleteSelected}
              />
            </div>
          </div>
        )}

        {/* HOST GAME LOBBY */}
        {mode === "host_game_lobby" && (
          <div style={{ maxWidth: 750, margin: "2rem auto", width: "100%" }} className="glass-card">
            <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
              <span className="badge-lobby">Game Lobby</span>
              <p style={{ fontSize: "0.7rem", color: "hsl(var(--text-muted))", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, marginTop: "1.25rem", marginBottom: "0.35rem" }}>Room PIN</p>
              <div className="pin-display">{roomPin}</div>
              <p style={{ color: "hsl(var(--text-muted))", fontSize: "0.9rem", marginTop: "0.75rem" }}>
                Students join this challenge on their own devices using the Room PIN.
              </p>
              <p style={{ fontWeight: 600, fontSize: "1rem", marginTop: "0.5rem", color: "hsl(var(--text-primary))" }}>
                Target Sentence: "{tree.sentence}"
              </p>
            </div>

            <div style={{ borderTop: "1px solid hsl(var(--border-color))", paddingTop: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <h3 style={{ fontWeight: 700, fontSize: "1.05rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Users size={16} /> Students Connected ({joinedStudents.length})
                </h3>
                <button
                  className="btn btn-primary"
                  onClick={handleStartGame}
                  disabled={joinedStudents.length === 0}
                >
                  <Play size={14} /> Start Game
                </button>
              </div>

              {joinedStudents.length === 0 ? (
                <div style={{ padding: "2rem", textAlign: "center", color: "hsl(var(--text-muted))", border: "1px dashed hsl(var(--border-color))", borderRadius: "var(--radius-md)" }}>
                  Waiting for students to join...
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "0.5rem" }}>
                  {joinedStudents.map((s, idx) => (
                    <div key={idx} style={{ padding: "0.5rem", background: "hsl(var(--bg-main))", border: "1px solid hsl(var(--border-color))", borderRadius: "var(--radius-md)", textAlign: "center", fontWeight: 600, fontSize: "0.85rem" }}>
                      {s.nickname}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* HOST GAMEPLAY (Public Leaderboard - strictly Rank and Nickname, Mistakes & Time are Hidden) */}
        {mode === "host_game_gameplay" && (
          <div className="lobby-grid">
            <div className="glass-card">
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.25rem" }}>
                <Trophy size={22} style={{ color: "hsl(var(--primary))" }} />
                <h2 className="text-gradient" style={{ fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.02em" }}>
                  Live Leaderboard
                </h2>
              </div>
              <p style={{ color: "hsl(var(--text-muted))", marginBottom: "1.25rem", fontSize: "0.875rem" }}>
                Sentence: "{tree.sentence}" &nbsp;·&nbsp; PIN: <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "hsl(var(--primary))" }}>{roomPin}</span>
              </p>

              <div className="leaderboard-list">
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid hsl(var(--border-color))" }}>
                      <th style={{ padding: "0.65rem 1rem", fontWeight: 700, fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "hsl(var(--text-muted))", width: "110px" }}>Rank</th>
                      <th style={{ padding: "0.65rem 1rem", fontWeight: 700, fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "hsl(var(--text-muted))" }}>Student</th>
                    </tr>
                  </thead>
                  <tbody>
                    {joinedStudents.map((student, index) => {
                      const medals = ["🥇", "🥈", "🥉"];
                      const rankLabel = index < 3 ? `${medals[index]} ${["1st","2nd","3rd"][index]}` : `#${index + 1}`;
                      const medalBg = index === 0
                        ? (darkMode ? "hsla(45,90%,55%,0.13)" : "hsla(45,100%,95%,0.9)")
                        : index === 1
                        ? (darkMode ? "hsla(220,15%,60%,0.1)" : "hsla(220,20%,96%,0.9)")
                        : index === 2
                        ? (darkMode ? "hsla(25,80%,55%,0.11)" : "hsla(25,80%,96%,0.9)")
                        : student.completed
                          ? (darkMode ? "hsla(152,65%,52%,0.1)" : "hsla(140,100%,98%,0.6)")
                          : "transparent";
                      const rankColor = index === 0
                        ? (darkMode ? "#f59e0b" : "#b45309")
                        : index === 1
                        ? (darkMode ? "#94a3b8" : "#6b7280")
                        : index === 2
                        ? (darkMode ? "#d97706" : "#92400e")
                        : "hsl(var(--primary))";
                      return (
                        <tr
                          key={index}
                          style={{
                            borderBottom: `1px solid hsl(var(--border-color))`,
                            background: medalBg,
                            transition: "background 0.2s"
                          }}
                        >
                          <td style={{ padding: "0.9rem 1rem", fontWeight: 800, fontSize: "1rem", color: rankColor, letterSpacing: "0.01em" }}>
                            {rankLabel}
                          </td>
                          <td style={{ padding: "0.9rem 1rem", fontWeight: 600, fontSize: "1.05rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            {student.nickname}
                            {student.completed ? (
                              <span className="badge-active">Submitted</span>
                            ) : (
                              <span className="badge-lobby">Building…</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Answer Key preview for the host */}
            <div className="glass-card" style={{ display: "flex", flexDirection: "column", height: 500, padding: "1.25rem" }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.75rem" }}>Answer Key Preview</h3>
              <div style={{ flex: 1, border: "1px solid hsl(var(--border-color))", borderRadius: "var(--radius-lg)", overflow: "hidden", background: "hsl(var(--bg-card))" }}>
                <TreeCanvas
                  nodes={convertSubtreeToNodesAndEdges(answerKey.rootSubtree, 760, 380).nodes}
                  edges={convertSubtreeToNodesAndEdges(answerKey.rootSubtree, 760, 380).edges}
                  onNodesChange={() => {}}
                  onEdgesChange={() => {}}
                  onConnect={() => {}}
                  onMerge={() => {}}
                  onProject={() => {}}
                  onSplitBinary={() => {}}
                  onSplitUnary={() => {}}
                  onDeleteSelected={() => {}}
                  readOnly={true}
                />
              </div>
            </div>
          </div>
        )}

        {/* STUDENT PRACTICE GAMEPLAY */}
        {(mode === "student_practice_gameplay" || (mode === "student_game_lobby" && isPracticeSession)) && (
          <div className="gameplay-layout">
            
            {/* Success Banner */}
            {isPracticeComplete && (
              <div className="success-banner">
                🎉 Excellent! Your syntax tree is fully correct and matches the target answer key!
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
              <div>
                <h2 style={{ fontSize: "1.4rem", fontWeight: 700, color: "hsl(var(--success))" }}>
                  Practice mode: Sentence {currentPracticeIndex + 1} of {practicePackage.length}
                </h2>
                <p style={{ color: "hsl(var(--text-primary))", fontWeight: 600 }}>Sentence: "{tree.sentence}"</p>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button className="btn btn-secondary" onClick={() => setShowPracticeAnswer(true)} title="Show Correct Answer Tree">
                  Show Answer (תשובה)
                </button>
                <button className="btn btn-secondary" onClick={tree.createRootNode}>
                  <Plus size={16} /> Add Root
                </button>
                <button className="btn btn-secondary" onClick={tree.clearTree}>
                  <RefreshCw size={16} /> Reset
                </button>
                
                {currentPracticeIndex > 0 && (
                  <button className="btn btn-secondary" onClick={handlePrevPracticeSentence}>
                    Back (הקודם)
                  </button>
                )}

                {currentPracticeIndex < practicePackage.length - 1 ? (
                  <button className="btn btn-primary" onClick={handleNextPracticeSentence} style={{ background: "hsl(var(--success))" }}>
                    Next (הבא)
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={handleFinishPractice} style={{ background: "hsl(var(--primary))" }}>
                    Finish (סיום)
                  </button>
                )}
              </div>
            </div>

            {/* Word Manager Bar */}
            <div className="word-manager-bar">
              <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "hsl(var(--text-primary))", marginRight: "0.5rem" }}>
                Sentence Words:
              </span>
              {wordNodesSorted.map((n) => (
                <span key={n.id} className="word-pill">
                  {n.data.word}
                </span>
              ))}

              <form onSubmit={handleAddWordSubmit} className="add-word-form">
                <input
                  type="text"
                  placeholder="New word..."
                  className="input-text"
                  style={{ width: "110px" }}
                  value={newWordText}
                  onChange={(e) => setNewWordText(e.target.value)}
                />
                <select
                  className="input-text"
                  value={insertIndexSelection}
                  onChange={(e) => setInsertIndexSelection(e.target.value)}
                >
                  <option value="end">Append at end</option>
                  <option value="start">Insert at start</option>
                  {wordNodesSorted.map((n, idx) => (
                    <option key={n.id} value={`after_${idx}`}>
                      Insert after "{n.data.word}"
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn btn-primary" style={{ padding: "0.25rem 0.6rem", fontSize: "0.85rem" }}>
                  <PlusCircle size={14} /> Add
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: "0.25rem 0.6rem", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                  onClick={handleAddNullSymbol}
                >
                  <PlusCircle size={14} /> Add Null (∅)
                </button>
              </form>
            </div>

            {/* Resizable Canvas Viewport */}
            <div
              className="canvas-wrapper"
              ref={canvasWrapperRef}
              style={{ 
                width: isSettingsExpanded ? `${exportWidth}px` : "100%",
                height: isSettingsExpanded ? `${exportHeight}px` : "100%",
                flex: isSettingsExpanded ? "none" : "1"
              }}
            >
              <TreeCanvas
                ref={canvasRef}
                nodes={tree.nodes}
                edges={getValidatedEdges()}
                onNodesChange={tree.onNodesChange}
                onEdgesChange={tree.onEdgesChange}
                onConnect={tree.onConnect}
                onMerge={tree.mergeSelected}
                onProject={tree.projectSelected}
                onSplitBinary={tree.splitBinary}
                onSplitUnary={tree.splitUnary}
                onDeleteSelected={tree.deleteSelected}
                width={exportWidth}
                height={exportHeight}
              />
            </div>

            {renderExportPanel()}
          </div>
        )}

        {/* STUDENT PRACTICE COMPLETE */}
        {mode === "student_practice_complete" && (
          <div style={{ maxWidth: 580, margin: "4rem auto", width: "100%", textAlign: "center" }} className="glass-card animate-in">
            <div style={{ fontSize: "3.5rem", lineHeight: 1, marginBottom: "1rem" }}>🎉</div>
            <h2 className="text-gradient" style={{ fontSize: "2rem", fontWeight: 900, letterSpacing: "-0.02em" }}>
              Practice Complete!
            </h2>
            <p style={{ color: "hsl(var(--text-muted))", marginTop: "0.6rem", fontSize: "0.98rem", lineHeight: 1.65 }}>
              Congratulations! You've successfully completed all syntax tree structures in this practice session.
            </p>
            <hr style={{ borderColor: "hsl(var(--border-color))", margin: "1.75rem 0" }} />
            <button className="btn btn-primary" onClick={resetAppState} style={{ minWidth: "140px" }}>
              Back to Home
            </button>
          </div>
        )}

        {/* STUDENT GAME LOBBY */}
        {mode === "student_game_lobby" && roomType !== "practice" && !isPracticeSession && (
          <div style={{ maxWidth: 560, margin: "4rem auto", width: "100%", textAlign: "center" }} className="glass-card animate-in">
            <span className="badge-active">Connected</span>
            <p style={{ fontSize: "0.7rem", color: "hsl(var(--text-muted))", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, marginTop: "1.25rem", marginBottom: "0.35rem" }}>Room PIN</p>
            <div className="pin-display">{roomPin}</div>
            <h2 style={{ fontSize: "1.4rem", fontWeight: 700, marginTop: "1rem", color: "hsl(var(--text-primary))" }}>
              Hi <span className="text-gradient">{nickname}</span>!
            </h2>
            <p style={{ color: "hsl(var(--text-muted))", marginTop: "0.35rem", fontSize: "0.95rem" }}>
              Get ready — the lecturer will start the challenge shortly.
            </p>

            <hr style={{ borderColor: "hsl(var(--border-color))", margin: "1.5rem 0" }} />

            <div style={{ textAlign: "left" }}>
              <h3 style={{ fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.6rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "hsl(var(--text-muted))" }}>Sentence to Parse</h3>
              <div style={{ padding: "0.9rem 1.1rem", background: "linear-gradient(135deg, hsla(var(--primary)/0.04), hsla(var(--accent)/0.03))", borderRadius: "var(--radius-md)", fontWeight: 700, fontSize: "1.1rem", textAlign: "center", border: "1px solid hsla(var(--primary)/0.12)", letterSpacing: "0.01em" }}>
                "{tree.sentence}"
              </div>
            </div>
          </div>
        )}

        {/* STUDENT GAME GAMEPLAY */}
        {mode === "student_game_gameplay" && (
          <div className="gameplay-layout">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
              <div>
                <h2 style={{ fontSize: "1.4rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  Room {roomPin} <span className="badge-active">Game mode</span>
                  {practicePackage && practicePackage.length > 1 && (
                    <span style={{ fontSize: "0.9rem", color: "hsl(var(--text-muted))", fontWeight: 550 }}>
                      (Sentence {currentGameIndex + 1} of {practicePackage.length})
                    </span>
                  )}
                </h2>
                <p style={{ color: "hsl(var(--text-primary))", fontWeight: 600 }}>Sentence: "{tree.sentence}"</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", background: "hsla(var(--primary) / 0.08)", padding: "0.4rem 0.8rem", borderRadius: "var(--radius-md)", border: "1px solid hsla(var(--primary) / 0.15)" }}>
                  <Clock size={15} style={{ color: "hsl(var(--primary))" }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "1rem", color: "hsl(var(--primary))" }}>
                    {formatTime(elapsedTime)}
                  </span>
                </div>
                <button className="btn btn-primary" onClick={handleSubmitTree} disabled={isGameSubmitted}>
                  Submit Tree
                </button>
                <button className="btn btn-secondary" onClick={tree.createRootNode} disabled={isGameSubmitted}>
                  <Plus size={16} /> Add Root
                </button>
                <button className="btn btn-secondary" onClick={tree.clearTree} disabled={isGameSubmitted}>
                  <RefreshCw size={16} /> Reset
                </button>
              </div>
            </div>

            {/* Word Manager Bar */}
            <div className="word-manager-bar">
              <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "hsl(var(--text-primary))", marginRight: "0.5rem" }}>
                Sentence Words:
              </span>
              {wordNodesSorted.map((n) => (
                <span key={n.id} className="word-pill">
                  {n.data.word}
                </span>
              ))}

              <form onSubmit={handleAddWordSubmit} className="add-word-form">
                <input
                  type="text"
                  placeholder="New word..."
                  className="input-text"
                  style={{ width: "110px" }}
                  value={newWordText}
                  onChange={(e) => setNewWordText(e.target.value)}
                  disabled={isGameSubmitted}
                />
                <select
                  className="input-text"
                  value={insertIndexSelection}
                  onChange={(e) => setInsertIndexSelection(e.target.value)}
                  disabled={isGameSubmitted}
                >
                  <option value="end">Append at end</option>
                  <option value="start">Insert at start</option>
                  {wordNodesSorted.map((n, idx) => (
                    <option key={n.id} value={`after_${idx}`}>
                      Insert after "{n.data.word}"
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn btn-primary" style={{ padding: "0.25rem 0.6rem", fontSize: "0.85rem" }} disabled={isGameSubmitted}>
                  <PlusCircle size={14} /> Add
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: "0.25rem 0.6rem", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                  onClick={handleAddNullSymbol}
                  disabled={isGameSubmitted}
                >
                  <PlusCircle size={14} /> Add Null (∅)
                </button>
              </form>
            </div>

            {/* Resizable Canvas Viewport */}
            <div
              className="canvas-wrapper"
              ref={canvasWrapperRef}
              style={{ 
                width: isSettingsExpanded ? `${exportWidth}px` : "100%",
                height: isSettingsExpanded ? `${exportHeight}px` : "100%",
                flex: isSettingsExpanded ? "none" : "1"
              }}
            >
              <TreeCanvas
                ref={canvasRef}
                nodes={tree.nodes}
                edges={getValidatedEdges()}
                onNodesChange={tree.onNodesChange}
                onEdgesChange={tree.onEdgesChange}
                onConnect={tree.onConnect}
                onMerge={tree.mergeSelected}
                onProject={tree.projectSelected}
                onSplitBinary={tree.splitBinary}
                onSplitUnary={tree.splitUnary}
                onDeleteSelected={tree.deleteSelected}
                width={exportWidth}
                height={exportHeight}
                readOnly={isGameSubmitted}
              />
            </div>

            {renderExportPanel()}

            {isGameSubmitted && (() => {
              const preview = answerKey ? convertSubtreeToNodesAndEdges(answerKey.rootSubtree, 760, 260) : null;
              return (
                <div className="modal-backdrop">
                  <div className="modal-content glass-card" style={{ width: "90%", maxWidth: "800px", maxHeight: "90vh", display: "flex", flexDirection: "column", overflowY: "auto", textAlign: "center", position: "relative", zIndex: 2000 }}>
                    <div style={{ fontSize: "3.5rem", lineHeight: 1, marginBottom: "0.75rem" }}>🏁</div>
                    <h2 className="text-gradient" style={{ fontSize: "1.9rem", fontWeight: 900, letterSpacing: "-0.02em" }}>
                      Submission Received!
                    </h2>
                    <p style={{ color: "hsl(var(--text-muted))", marginTop: "0.35rem", fontSize: "0.95rem" }}>
                      Great effort, <strong style={{ color: "hsl(var(--text-primary))" }}>{nickname}</strong>! Your syntax tree has been submitted.
                    </p>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", margin: "1.5rem 0" }}>
                      <div className="stat-card positive">
                        <div style={{ fontSize: "0.72rem", color: "hsl(var(--text-muted))", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.1em" }}>
                          Final Time
                        </div>
                        <div style={{ fontSize: "2.1rem", fontWeight: 800, color: "hsl(var(--success))", marginTop: "0.3rem", fontFamily: "var(--font-mono)", letterSpacing: "-0.02em" }}>
                          {formatTime(studentCompletionTime)}
                        </div>
                      </div>
                      <div className={`stat-card ${studentMistakes === 0 ? "positive" : "negative"}`}>
                        <div style={{ fontSize: "0.72rem", color: "hsl(var(--text-muted))", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.1em" }}>
                          Total Mistakes
                        </div>
                        <div style={{
                          fontSize: "2.1rem",
                          fontWeight: 800,
                          color: studentMistakes === 0 ? "hsl(var(--success))" : "hsl(var(--error))",
                          marginTop: "0.3rem",
                          fontFamily: "var(--font-mono)"
                        }}>
                          {studentMistakes}
                        </div>
                      </div>
                    </div>

                    {preview && (
                      <div style={{ display: "flex", flexDirection: "column", height: 320, padding: "1rem", border: "1px solid hsl(var(--border-color))", borderRadius: "var(--radius-lg)", marginBottom: "1.5rem", background: "hsl(var(--bg-card))" }}>
                        <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.5rem", color: "hsl(var(--text-primary))", textAlign: "left" }}>
                          Lecturer's Target Answer Key
                        </h3>
                        <div style={{ flex: 1, border: "1px solid hsl(var(--border-color))", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                          <TreeCanvas
                            nodes={preview.nodes}
                            edges={preview.edges}
                            onNodesChange={() => {}}
                            onEdgesChange={() => {}}
                            onConnect={() => {}}
                            onMerge={() => {}}
                            onProject={() => {}}
                            onSplitBinary={() => {}}
                            onSplitUnary={() => {}}
                            onDeleteSelected={() => {}}
                            readOnly={true}
                          />
                        </div>
                      </div>
                    )}

                    <p style={{ color: "hsl(var(--text-muted))", marginBottom: "1.5rem", fontSize: "0.95rem" }}>
                      Check the lecturer's screen to see the live class leaderboard!
                    </p>

                    {practicePackage && practicePackage.length > 1 && currentGameIndex < practicePackage.length - 1 ? (
                      <button 
                        className="btn btn-primary" 
                        onClick={() => {
                          setAccumulatedGameMistakes(prev => prev + studentMistakes);
                          setAccumulatedGameTime(prev => prev + studentCompletionTime);
                          const nextIdx = currentGameIndex + 1;
                          setCurrentGameIndex(nextIdx);
                          setAnswerKey(practicePackage[nextIdx]);
                          tree.initializeSentence(practicePackage[nextIdx].sentence);
                          setIsGameSubmitted(false);
                          setElapsedTime(0);
                          setGameStartTime(Date.now());
                        }} 
                        style={{ alignSelf: "center", minWidth: "150px" }}
                      >
                        Next Sentence (הבא)
                      </button>
                    ) : (
                      <button className="btn btn-primary" onClick={resetAppState} style={{ alignSelf: "center", minWidth: "150px" }}>
                        Back to Home
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* STUDENT GAME COMPLETE */}
        {mode === "student_game_complete" && (() => {
          const preview = answerKey ? convertSubtreeToNodesAndEdges(answerKey.rootSubtree, 760, 300) : null;
          
          return (
            <div style={{ maxWidth: 800, margin: "2rem auto", width: "100%", textAlign: "center" }} className="glass-card animate-in">
              <div style={{ fontSize: "3.5rem", lineHeight: 1, marginBottom: "0.75rem" }}>🏁</div>
              <h2 className="text-gradient" style={{ fontSize: "1.9rem", fontWeight: 900, letterSpacing: "-0.02em" }}>
                Submission Received!
              </h2>
              <p style={{ color: "hsl(var(--text-muted))", marginTop: "0.35rem", fontSize: "0.95rem" }}>
                Great effort, <strong style={{ color: "hsl(var(--text-primary))" }}>{nickname}</strong>! Your syntax tree has been submitted.
              </p>

              {/* Results Panel */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", margin: "1.5rem 0" }}>
                <div className="stat-card positive">
                  <div style={{ fontSize: "0.72rem", color: "hsl(var(--text-muted))", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.1em" }}>
                    Final Time
                  </div>
                  <div style={{ fontSize: "2.1rem", fontWeight: 800, color: "hsl(var(--success))", marginTop: "0.3rem", fontFamily: "var(--font-mono)", letterSpacing: "-0.02em" }}>
                    {formatTime(studentCompletionTime)}
                  </div>
                </div>
                <div className={`stat-card ${studentMistakes === 0 ? "positive" : "negative"}`}>
                  <div style={{ fontSize: "0.72rem", color: "hsl(var(--text-muted))", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.1em" }}>
                    Total Mistakes
                  </div>
                  <div style={{
                    fontSize: "2.1rem",
                    fontWeight: 800,
                    color: studentMistakes === 0 ? "hsl(var(--success))" : "hsl(var(--error))",
                    marginTop: "0.3rem",
                    fontFamily: "var(--font-mono)"
                  }}>
                    {studentMistakes}
                  </div>
                </div>
              </div>

              {/* Target Answer Key Preview */}
              {preview && (
                <div style={{ display: "flex", flexDirection: "column", height: 350, padding: "1rem", border: "1px solid hsl(var(--border-color))", borderRadius: "var(--radius-lg)", marginBottom: "1.5rem", background: "hsl(var(--bg-card))" }}>
                  <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.5rem", color: "hsl(var(--text-primary))", textAlign: "left" }}>
                    Lecturer's Target Answer Key
                  </h3>
                  <div style={{ flex: 1, border: "1px solid hsl(var(--border-color))", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                    <TreeCanvas
                      nodes={preview.nodes}
                      edges={preview.edges}
                      onNodesChange={() => {}}
                      onEdgesChange={() => {}}
                      onConnect={() => {}}
                      onMerge={() => {}}
                      onProject={() => {}}
                      onSplitBinary={() => {}}
                      onSplitUnary={() => {}}
                      onDeleteSelected={() => {}}
                      readOnly={true}
                    />
                  </div>
                </div>
              )}

              <p style={{ color: "hsl(var(--text-muted))", marginBottom: "1.5rem", fontSize: "0.95rem" }}>
                Check the lecturer's screen to see the live class leaderboard!
              </p>

              <button className="btn btn-primary" onClick={resetAppState}>
                Back to Home
              </button>
            </div>
          );
        })()}

      </main>

      {/* Show Answer Modal Overlay (Practice mode only) */}
      {showPracticeAnswer && answerKey && (
        <div className="modal-backdrop" onClick={() => setShowPracticeAnswer(false)}>
          <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()} style={{ width: "90%", maxWidth: "800px", height: "500px", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "hsl(var(--primary))" }}>Correct Target Answer Key (תשובה)</h3>
              <button className="btn btn-secondary" style={{ minHeight: "36px", padding: "0 0.75rem" }} onClick={() => setShowPracticeAnswer(false)}>
                Close
              </button>
            </div>
            <div style={{ flex: 1, border: "1px solid hsl(var(--border-color))", borderRadius: "var(--radius-md)", overflow: "hidden", background: "hsl(var(--bg-card))" }}>
              <TreeCanvas
                nodes={convertSubtreeToNodesAndEdges(answerKey.rootSubtree, 760, 380).nodes}
                edges={convertSubtreeToNodesAndEdges(answerKey.rootSubtree, 760, 380).edges}
                onNodesChange={() => {}}
                onEdgesChange={() => {}}
                onConnect={() => {}}
                onMerge={() => {}}
                onProject={() => {}}
                onSplitBinary={() => {}}
                onSplitUnary={() => {}}
                onDeleteSelected={() => {}}
                readOnly={true}
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
