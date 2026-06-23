import { useEffect, useRef, useState} from "react";
import { socket } from "./socket";

const DEFAULT_ROOM = "lobby";

function App() {
  const [color, setColor] = useState("black");
  const [brushSize, setBrushSize] = useState(4);
  const [roomInput, setRoomInput] = useState(DEFAULT_ROOM);
  const [roomId, setRoomId] = useState(DEFAULT_ROOM);
  const [userCount, setUserCount] = useState(1);

  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const drawing = useRef(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;

    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  
  useEffect(() => {
    // 1 Setup Canvas
    const canvas = canvasRef.current;
    canvas.width = window.innerWidth * 0.95;
    
    canvas.height = window.innerHeight * 0.9;
    const ctx = canvas.getContext("2d");
    
    ctx.lineCap = "round";
    
    ctxRef.current = ctx;

    // 2 Socket listeners
    function handleBeginPath({ x, y ,color,brushSize}) {
      ctx.strokeStyle = color;
      ctx.lineWidth = brushSize;
      ctx.beginPath();
      ctx.moveTo(x, y);
    }

    function handleDraw({ x, y ,color,brushSize}) {
      ctx.strokeStyle = color;
      ctx.lineWidth = brushSize;
      ctx.lineTo(x, y);
      ctx.stroke(); 
    }

    socket.on("beginPath", handleBeginPath);
    socket.on("draw", handleDraw);

    // 3 Cleanup
    return () => {
      socket.off("beginPath", handleBeginPath);
      socket.off("draw", handleDraw);
    };
  }, []);

  useEffect(() => {
    function handleJoinedRoom(joinedRoomId) {
      setRoomId(joinedRoomId);
      setRoomInput(joinedRoomId);
      clearCanvas();
    }

    // React stores the latest count for the active room so the UI updates automatically.
    // The server remains the source of truth because it can see Socket.io room membership.
    socket.on("joinedRoom", handleJoinedRoom);
    socket.on("roomUserCount", setUserCount);
    socket.emit("joinRoom", roomId);

    return () => {
      socket.off("joinedRoom", handleJoinedRoom);
      socket.off("roomUserCount", setUserCount);
    };
  }, [roomId]);

  // -------------------------------
  // Mouse events (local + emit)
  // -------------------------------

  const startDrawing = (e) => {
    ctxRef.current.strokeStyle = color;
    ctxRef.current.lineWidth = brushSize;

    drawing.current = true;
    const { offsetX, offsetY } = e.nativeEvent;

    ctxRef.current.beginPath();
    ctxRef.current.moveTo(offsetX, offsetY);

    socket.emit("beginPath", { x: offsetX, y: offsetY ,color,brushSize});
  };

  const draw = (e) => {
    ctxRef.current.strokeStyle = color;
    ctxRef.current.lineWidth = brushSize;

    if (!drawing.current) return;
    const { offsetX, offsetY } = e.nativeEvent;

    ctxRef.current.lineTo(offsetX, offsetY);
    ctxRef.current.stroke();

    socket.emit("draw", { x: offsetX, y: offsetY,color,brushSize });
  };

  const stopDrawing = () => {
    drawing.current = false;
  };

  const joinRoom = (e) => {
    e.preventDefault();

    const nextRoomId = roomInput.trim() || DEFAULT_ROOM;
    setRoomInput(nextRoomId);
    setRoomId(nextRoomId);
  };

  return (
    <div style={{ textAlign: "center" }}>
      <h1> Whiteboard  </h1>
      <form onSubmit={joinRoom} style={{ marginBottom: "10px" }}>
        <label>
          Room
          <input
            value={roomInput}
            onChange={(e) => setRoomInput(e.target.value)}
            style={{ marginLeft: "8px" }}
          />
        </label>
        <button type="submit" style={{ marginLeft: "8px" }}>Join</button>
        <span style={{ marginLeft: "12px" }}>Current room: {roomId}</span>
        <span style={{ marginLeft: "12px" }}>Users: {userCount}</span>
      </form>
      <div style={{ marginBottom: "10px" }}>
        <button onClick={() => setColor("black")}>Black</button>
        <button onClick={() => setColor("red")}>Red</button>
        <button onClick={() => setColor("blue")}>Blue</button>
        <button onClick={() => setColor("green")}>Green</button>

        <select value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))}>
          <option value="2">2px</option>
          <option value="4">4px</option>
          <option value="6">6px</option>
          <option value="8">8px</option>
          <option value="10">10px</option>
        </select>
      </div>


      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        style={{
          background: "white",
          border: "2px solid black",
          borderRadius: "8px",
          cursor: "crosshair",
        }}
      />
    </div>
  );
}

export default App;
