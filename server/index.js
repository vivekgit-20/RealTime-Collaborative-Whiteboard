import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

const DEFAULT_ROOM = "lobby";
const PORT = process.env.PORT || 5000;

function normalizeRoomId(roomId) {
  if (typeof roomId !== "string") return DEFAULT_ROOM;

  const trimmedRoomId = roomId.trim();
  return trimmedRoomId || DEFAULT_ROOM;
}

function emitRoomUserCount(roomId) {
  // Socket.io already tracks room membership in its adapter.
  // rooms.get(roomId) returns a Set of socket IDs, so its size is the live user count.
  const room = io.sockets.adapter.rooms.get(roomId);
  const userCount = room ? room.size : 0;
 

  io.to(roomId).emit("roomUserCount", userCount);
}

io.on("connection", (socket) => {
  socket.data.roomId = DEFAULT_ROOM;
  socket.join(DEFAULT_ROOM);
  emitRoomUserCount(DEFAULT_ROOM);

  socket.on("joinRoom", (roomId) => {
    const nextRoomId = normalizeRoomId(roomId);
    const previousRoomId = socket.data.roomId;

    if (previousRoomId !== nextRoomId) {
      // Leave the old room first so Socket.io's room Set has the updated count.
      socket.leave(previousRoomId);
      emitRoomUserCount(previousRoomId);

      // Join the new room next, then emit the count to everyone in that room.
      socket.join(nextRoomId);
      socket.data.roomId = nextRoomId;
    }

    socket.emit("joinedRoom", nextRoomId);
    emitRoomUserCount(nextRoomId);
  });

  socket.on("beginPath", (data) => {
    socket.to(socket.data.roomId).emit("beginPath", data);
  });

  socket.on("clearBoard", () => {
    socket.to(socket.data.roomId).emit("clearBoard");
  });

  socket.on("draw", (data) => {
    socket.to(socket.data.roomId).emit("draw", data);
  });

  // Stroke completion lets each client close its local history entry.
  // Undo and redo are intentionally not emitted, so they remain local-only.
  socket.on("endStroke", (data) => {
    socket.to(socket.data.roomId).emit("endStroke", data);
  });

  console.log("A user connected:", socket.id);
  socket.on("disconnecting", () => {
    const roomId = socket.data.roomId;
    const room = io.sockets.adapter.rooms.get(roomId);

    // During "disconnecting", Socket.io has not removed this socket from the room yet.
    // Subtract one so remaining clients see the count they will have after this user leaves.
    const userCountAfterDisconnect = Math.max((room ? room.size : 1) - 1, 0);
    socket.to(roomId).emit("roomUserCount", userCountAfterDisconnect);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
