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

io.on("connection", (socket)   => {

  socket.on("beginPath", (data) => {
  socket.broadcast.emit("beginPath", data);
});

  socket.on("clearBoard", () => {
  socket.broadcast.emit("clearBoard");
});

socket.on("draw", (data) => {
  socket.broadcast.emit("draw", data);
});

  console.log("A user connected:", socket.id);
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

server.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});
