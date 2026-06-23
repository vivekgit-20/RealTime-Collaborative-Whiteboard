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

function normalizeRoomId(roomId) {
  if (typeof roomId !== "string") return DEFAULT_ROOM;

  const trimmedRoomId = roomId.trim();
  return trimmedRoomId || DEFAULT_ROOM;
}

io.on("connection", (socket) => {
  socket.data.roomId = DEFAULT_ROOM;
  socket.join(DEFAULT_ROOM);

  socket.on("joinRoom", (roomId) => {
    const nextRoomId = normalizeRoomId(roomId);
    const previousRoomId = socket.data.roomId;

    if (previousRoomId !== nextRoomId) {
      socket.leave(previousRoomId);
      socket.join(nextRoomId);
      socket.data.roomId = nextRoomId;
    }

    socket.emit("joinedRoom", nextRoomId);
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

  console.log("A user connected:", socket.id);
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

server.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});
