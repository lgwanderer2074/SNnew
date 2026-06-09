import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/ping", (req, res) => {
  res.json({ status: "ok" });
});
app.get("/", (req, res) => {
  res.send("Socket.io Backend Server is running.");
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// In-memory room storage
// Key: roomPin, Value: Room object
const rooms = new Map();

// Generate unique 4-digit PIN
function generatePIN() {
  let pin;
  do {
    pin = Math.floor(1000 + Math.random() * 9000).toString();
  } while (rooms.has(pin));
  return pin;
}

// Helper to sort students based on room type
function getSortedStudents(room) {
  const studentsList = Object.values(room.students);
  if (room.roomType === "game") {
    studentsList.sort((a, b) => {
      // 1. Completed/submitted students always rank higher than active students
      if (a.completed && !b.completed) return -1;
      if (!a.completed && b.completed) return 1;

      // 2. Both completed -> Accuracy-first sorting
      if (a.completed && b.completed) {
        const aMistakes = typeof a.mistakes === 'number' ? a.mistakes : 0;
        const bMistakes = typeof b.mistakes === 'number' ? b.mistakes : 0;
        
        const mistakesDiff = aMistakes - bMistakes;
        if (mistakesDiff !== 0) return mistakesDiff; // Fewest mistakes wins
        return a.completionTime - b.completionTime; // Faster time breaks tie
      }

      // 3. Both uncompleted -> Sort by correct nodes count descending
      const aCorrect = a.progress ? (a.progress.correctNodes || 0) : 0;
      const bCorrect = b.progress ? (b.progress.correctNodes || 0) : 0;
      return bCorrect - aCorrect;
    });
  } else {
    // Practice mode sorting: Sort by progress (highest index first)
    studentsList.sort((a, b) => {
      const aIndex = a.progress ? (a.progress.currentIndex || 0) : 0;
      const bIndex = b.progress ? (b.progress.currentIndex || 0) : 0;
      if (a.completed !== b.completed) {
        return a.completed ? 1 : -1; // completed students sorted last to let active ones be at top
      }
      return bIndex - aIndex; // higher sentence index first
    });
  }
  return studentsList;
}

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // 1. Host creates a room (practice or game)
  socket.on("host_create_room", (payload, callback) => {
    const { roomType = "game", sentence, answerKey } = payload || {};
    const practicePackage = (payload && (payload.practicePackage || payload.package || payload.pkg)) || [];
    const pin = generatePIN();
    const room = {
      pin,
      roomType,
      sentence: roomType === "game" ? sentence : (practicePackage && practicePackage[0] ? practicePackage[0].sentence : ""),
      answerKey: roomType === "game" ? answerKey : (practicePackage && practicePackage[0] ? practicePackage[0] : null),
      package: practicePackage,
      hostSocketId: socket.id,
      students: {},
      status: roomType === "practice" ? "playing" : "lobby", // Practice rooms start playing immediately
      startTime: roomType === "practice" ? Date.now() : null
    };
    rooms.set(pin, room);
    socket.join(pin);
    console.log(`Room ${pin} (${roomType}) created by host ${socket.id}`);
    callback({ success: true, pin });
  });

  // 2. Student joins a room
  socket.on("student_join_room", ({ pin, nickname }, callback) => {
    const room = rooms.get(pin);
    if (!room) {
      return callback({ success: false, error: "Room not found." });
    }
    
    // For game rooms, they can only join during lobby
    if (room.roomType === "game" && room.status !== "lobby") {
      return callback({ success: false, error: "Game has already started." });
    }
    
    // Check if nickname already exists in room
    const nameTaken = Object.values(room.students).some(
      (s) => s.nickname.toLowerCase() === nickname.toLowerCase()
    );
    if (nameTaken) {
      return callback({ success: false, error: "Nickname is already taken." });
    }

    // Add student
    room.students[socket.id] = {
      nickname,
      completed: false,
      completionTime: null,
      mistakes: null,
      progress: {
        totalNodes: 0,
        correctNodes: 0,
        currentIndex: 0 // Used in practice mode
      }
    };

    socket.join(pin);
    console.log(`Student ${nickname} (${socket.id}) joined room ${pin}`);

    // Notify lobby/host of updates with redundant type/mode fields for front-end robustness
    io.to(pin).emit("lobby_update", {
      roomType: room.roomType,
      type: room.roomType,
      mode: room.roomType,
      sentence: room.sentence,
      package: room.package,
      pkg: room.package,
      students: getSortedStudents(room),
      status: room.status
    });

    callback({
      success: true,
      roomType: room.roomType,
      type: room.roomType,
      mode: room.roomType,
      sentence: room.sentence,
      answerKey: room.answerKey,
      package: room.package,
      pkg: room.package,
      status: room.status
    });
  });

  // 3. Host starts the game (Game mode only)
  socket.on("host_start_game", ({ pin }, callback) => {
    const room = rooms.get(pin);
    if (!room) {
      return callback({ success: false, error: "Room not found." });
    }
    if (room.hostSocketId !== socket.id) {
      return callback({ success: false, error: "Only the host can start the game." });
    }

    room.status = "playing";
    room.startTime = Date.now();
    
    io.to(pin).emit("game_start", { startTime: room.startTime });
    console.log(`Game started for room ${pin}`);
    callback({ success: true });
  });

  // 4. Student updates progress (real-time validation status - Game mode)
  socket.on("student_progress", ({ pin, totalNodes, correctNodes }) => {
    const room = rooms.get(pin);
    if (!room || !room.students[socket.id]) return;

    room.students[socket.id].progress = {
      ...room.students[socket.id].progress,
      totalNodes,
      correctNodes
    };

    // Emit sorted progress to host
    io.to(room.hostSocketId).emit("host_progress_update", {
      students: getSortedStudents(room)
    });
  });

  // 5. Student updates progress in Practice mode (moving to next sentence)
  socket.on("student_practice_progress", ({ pin, currentIndex, completed }) => {
    const room = rooms.get(pin);
    if (!room || !room.students[socket.id]) return;

    room.students[socket.id].completed = completed;
    room.students[socket.id].progress = {
      ...room.students[socket.id].progress,
      currentIndex
    };

    console.log(`Student ${room.students[socket.id].nickname} progress in room ${pin}: index ${currentIndex}, completed: ${completed}`);

    // Notify host of updates
    io.to(room.hostSocketId).emit("host_progress_update", {
      students: getSortedStudents(room)
    });
  });

  // 6. Student submits tree (Game mode complete)
  socket.on("student_submit_tree", ({ pin, mistakes, completionTime }, callback) => {
    const room = rooms.get(pin);
    if (!room || !room.students[socket.id]) {
      return callback({ success: false, error: "Room or student session not found." });
    }
    if (room.status !== "playing") {
      return callback({ success: false, error: "Game is not currently active." });
    }

    const student = room.students[socket.id];
    if (!student.completed) {
      student.completed = true;
      student.completionTime = completionTime;
      student.mistakes = mistakes;
      console.log(`Student ${student.nickname} submitted tree with ${mistakes} mistakes in ${completionTime}ms`);
    }

    // Broadcast updated student leaderboard to the entire room
    io.to(pin).emit("lobby_update", {
      roomType: room.roomType,
      type: room.roomType,
      mode: room.roomType,
      sentence: room.sentence,
      package: room.package,
      pkg: room.package,
      students: getSortedStudents(room),
      status: room.status
    });

    callback({ success: true, completionTime: student.completionTime, mistakes: student.mistakes });
  });

  // 7. Handle disconnect
  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
    
    // Check if disconnecting socket is a host or student in any room
    for (const [pin, room] of rooms.entries()) {
      if (room.hostSocketId === socket.id) {
        // Host disconnected -> Close room
        io.to(pin).emit("room_closed", { reason: "Host disconnected." });
        rooms.delete(pin);
        console.log(`Room ${pin} closed because host disconnected.`);
      } else if (room.students[socket.id]) {
        // Student disconnected -> Remove student
        const nickname = room.students[socket.id].nickname;
        delete room.students[socket.id];
        console.log(`Student ${nickname} left room ${pin}`);
        
        io.to(pin).emit("lobby_update", {
          roomType: room.roomType,
          type: room.roomType,
          mode: room.roomType,
          sentence: room.sentence,
          package: room.package,
          pkg: room.package,
          students: getSortedStudents(room),
          status: room.status
        });
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Socket.io server listening on port ${PORT} (bound to 0.0.0.0)`);
});
