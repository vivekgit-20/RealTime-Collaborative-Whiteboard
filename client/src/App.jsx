import { useCallback, useEffect, useRef, useState } from "react";
import { socket } from "./socket";

const DEFAULT_ROOM = "lobby";

function App() {
  const [color, setColor] = useState("black");
  const [brushSize, setBrushSize] = useState(4);
  const [tool, setTool] = useState("pencil");
  const [roomInput, setRoomInput] = useState(DEFAULT_ROOM);
  const [roomId, setRoomId] = useState(DEFAULT_ROOM);
  const [userCount, setUserCount] = useState(1);
  const [, setHistoryVersion] = useState(0);

  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const drawing = useRef(false);
  const currentStrokeRef = useRef(null);
  const remoteStrokesRef = useRef(new Map());
  const strokeIdRef = useRef(0);

  // Each completed stroke stores the style used when it began and its ordered points.
  // Refs keep this drawing data available to canvas and socket handlers without extra renders.
  const strokeHistoryRef = useRef([]);
  const redoHistoryRef = useRef([]);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;

    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const drawStroke = useCallback((stroke) => {
    const ctx = ctxRef.current;
    if (!ctx || stroke.points.length < 2) return;

    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.brushSize;

    const strokeTool = stroke.tool || "pencil";

    if (strokeTool === "pencil") {
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      stroke.points.slice(1).forEach(({ x, y }) => {
        ctx.lineTo(x, y);
      });
      ctx.stroke();
    } else if (strokeTool === "line") {
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      ctx.lineTo(stroke.points[1].x, stroke.points[1].y);
      ctx.stroke();
    } else if (strokeTool === "rectangle") {
      ctx.beginPath();
      const x1 = stroke.points[0].x;
      const y1 = stroke.points[0].y;
      const x2 = stroke.points[1].x;
      const y2 = stroke.points[1].y;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    } else if (strokeTool === "circle") {
      ctx.beginPath();
      const x1 = stroke.points[0].x;
      const y1 = stroke.points[0].y;
      const x2 = stroke.points[1].x;
      const y2 = stroke.points[1].y;
      const radius = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
      ctx.arc(x1, y1, radius, 0, 2 * Math.PI);
      ctx.stroke();
    } else if (strokeTool === "arrow") {
      const x1 = stroke.points[0].x;
      const y1 = stroke.points[0].y;
      const x2 = stroke.points[1].x;
      const y2 = stroke.points[1].y;

      // Draw arrow shaft
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Draw arrowhead
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLength = Math.max(10, stroke.brushSize * 3);
      const headAngle = Math.PI / 6; // 30 degrees

      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(
        x2 - headLength * Math.cos(angle - headAngle),
        y2 - headLength * Math.sin(angle - headAngle)
      );
      ctx.moveTo(x2, y2);
      ctx.lineTo(
        x2 - headLength * Math.cos(angle + headAngle),
        y2 - headLength * Math.sin(angle + headAngle)
      );
      ctx.stroke();
    }
  }, []);

  const drawStrokeSegment = useCallback((stroke) => {
    const ctx = ctxRef.current;
    const { points } = stroke;
    if (!ctx || points.length < 2) return;

    const previousPoint = points[points.length - 2];
    const currentPoint = points[points.length - 1];

    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.brushSize;
    ctx.beginPath();
    ctx.moveTo(previousPoint.x, previousPoint.y);
    ctx.lineTo(currentPoint.x, currentPoint.y);
    ctx.stroke();
  }, []);

  const redrawCanvas = useCallback(() => {
    // Redraw always starts with a blank canvas, then replays every active stroke in order.
    clearCanvas();
    strokeHistoryRef.current.forEach(drawStroke);

    // Draw active remote strokes to preview shape drawing in real-time
    remoteStrokesRef.current.forEach(drawStroke);

    // Draw local active preview
    if (currentStrokeRef.current) {
      drawStroke(currentStrokeRef.current);
    }
  }, [clearCanvas, drawStroke]);

  const recordCompletedStroke = useCallback((stroke) => {
    if (!stroke || stroke.points.length < 2) return;

    strokeHistoryRef.current.push(stroke);
    // A new stroke creates a new history branch, so old redo entries are no longer valid.
    redoHistoryRef.current = [];
    setHistoryVersion((version) => version + 1);
  }, []);

  const resetHistory = useCallback(() => {
    strokeHistoryRef.current = [];
    redoHistoryRef.current = [];
    currentStrokeRef.current = null;
    remoteStrokesRef.current.clear();
    drawing.current = false;
    setHistoryVersion((version) => version + 1);
    clearCanvas();
  }, [clearCanvas]);

  useEffect(() => {
    // 1 Setup Canvas
    const canvas = canvasRef.current;
    canvas.width = window.innerWidth * 0.95;
    canvas.height = window.innerHeight * 0.9;
    const ctx = canvas.getContext("2d");
    ctx.lineCap = "round";
    ctxRef.current = ctx;

    // 2 Socket listeners
    function handleBeginPath({ strokeId, x, y, color, brushSize, tool }) {
      remoteStrokesRef.current.set(strokeId, {
        tool: tool || "pencil",
        color,
        brushSize,
        points: [{ x, y }],
      });
    }

    function handleDraw({ strokeId, x, y }) {
      const stroke = remoteStrokesRef.current.get(strokeId);
      if (!stroke) return;

      const strokeTool = stroke.tool || "pencil";
      if (strokeTool === "pencil") {
        stroke.points.push({ x, y });
        drawStrokeSegment(stroke);
      } else {
        if (stroke.points.length === 1) {
          stroke.points.push({ x, y });
        } else {
          stroke.points[1] = { x, y };
        }
        redrawCanvas();
      }
    }

    function handleEndStroke({ strokeId }) {
      const stroke = remoteStrokesRef.current.get(strokeId);
      if (!stroke) return;

      remoteStrokesRef.current.delete(strokeId);
      recordCompletedStroke(stroke);
      redrawCanvas();
    }

    socket.on("beginPath", handleBeginPath);
    socket.on("draw", handleDraw);
    socket.on("endStroke", handleEndStroke);

    // 3 Cleanup
    return () => {
      socket.off("beginPath", handleBeginPath);
      socket.off("draw", handleDraw);
      socket.off("endStroke", handleEndStroke);
    };
  }, [drawStrokeSegment, recordCompletedStroke, redrawCanvas]);

  useEffect(() => {
    function handleJoinedRoom(joinedRoomId) {
      setRoomId(joinedRoomId);
      setRoomInput(joinedRoomId);
      resetHistory();
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
  }, [resetHistory, roomId]);

  // -------------------------------
  // Mouse events (local + emit)
  // -------------------------------

  const startDrawing = (e) => {
    drawing.current = true;
    const { offsetX, offsetY } = e.nativeEvent;
    const strokeId = `${socket.id}-${strokeIdRef.current++}`;

    currentStrokeRef.current = {
      strokeId,
      tool,
      color,
      brushSize,
      points: [{ x: offsetX, y: offsetY }],
    };

    socket.emit("beginPath", {
      strokeId,
      tool,
      x: offsetX,
      y: offsetY,
      color,
      brushSize,
    });
  };

  const draw = (e) => {
    const stroke = currentStrokeRef.current;
    if (!drawing.current || !stroke) return;

    const { offsetX, offsetY } = e.nativeEvent;

    if (stroke.tool === "pencil") {
      stroke.points.push({ x: offsetX, y: offsetY });
      drawStrokeSegment(stroke);
    } else {
      if (stroke.points.length === 1) {
        stroke.points.push({ x: offsetX, y: offsetY });
      } else {
        stroke.points[1] = { x: offsetX, y: offsetY };
      }
      redrawCanvas();
    }

    socket.emit("draw", {
      strokeId: stroke.strokeId,
      x: offsetX,
      y: offsetY,
      color: stroke.color,
      brushSize: stroke.brushSize,
    });
  };

  const stopDrawing = () => {
    const stroke = currentStrokeRef.current;
    if (!drawing.current || !stroke) return;

    drawing.current = false;
    currentStrokeRef.current = null;
    recordCompletedStroke({
      tool: stroke.tool,
      color: stroke.color,
      brushSize: stroke.brushSize,
      points: stroke.points,
    });
    socket.emit("endStroke", { strokeId: stroke.strokeId });
    redrawCanvas();
  };

  const undo = () => {
    // Undo removes the newest active stroke and preserves it on the redo stack.
    const stroke = strokeHistoryRef.current.pop();
    if (!stroke) return;

    redoHistoryRef.current.push(stroke);
    redrawCanvas();
    setHistoryVersion((version) => version + 1);
  };

  const redo = () => {
    // Redo restores the newest undone stroke to active history, then replays the canvas.
    const stroke = redoHistoryRef.current.pop();
    if (!stroke) return;

    strokeHistoryRef.current.push(stroke);
    redrawCanvas();
    setHistoryVersion((version) => version + 1);
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
        <span style={{ marginRight: "6px", fontWeight: "bold" }}>Colors:</span>
        <button onClick={() => setColor("black")}>Black</button>
        <button onClick={() => setColor("red")}>Red</button>
        <button onClick={() => setColor("blue")}>Blue</button>
        <button onClick={() => setColor("green")}>Green</button>

        <span style={{ marginLeft: "12px", marginRight: "6px", fontWeight: "bold" }}>Tools:</span>
        <button
          onClick={() => setTool("pencil")}
          style={{
            borderColor: tool === "pencil" ? "#646cff" : "transparent",
            boxShadow: tool === "pencil" ? "0 0 0 2px #646cff" : "none",
            marginRight: "4px"
          }}
        >
          Pencil
        </button>
        <button
          onClick={() => setTool("line")}
          style={{
            borderColor: tool === "line" ? "#646cff" : "transparent",
            boxShadow: tool === "line" ? "0 0 0 2px #646cff" : "none",
            marginRight: "4px"
          }}
        >
          Line
        </button>
        <button
          onClick={() => setTool("rectangle")}
          style={{
            borderColor: tool === "rectangle" ? "#646cff" : "transparent",
            boxShadow: tool === "rectangle" ? "0 0 0 2px #646cff" : "none",
            marginRight: "4px"
          }}
        >
          Rectangle
        </button>
        <button
          onClick={() => setTool("circle")}
          style={{
            borderColor: tool === "circle" ? "#646cff" : "transparent",
            boxShadow: tool === "circle" ? "0 0 0 2px #646cff" : "none",
            marginRight: "4px"
          }}
        >
          Circle
        </button>
        <button
          onClick={() => setTool("arrow")}
          style={{
            borderColor: tool === "arrow" ? "#646cff" : "transparent",
            boxShadow: tool === "arrow" ? "0 0 0 2px #646cff" : "none",
            marginRight: "12px"
          }}
        >
          Arrow
        </button>

        <select value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))}>
          <option value="2">2px</option>
          <option value="4">4px</option>
          <option value="6">6px</option>
          <option value="8">8px</option>
          <option value="10">10px</option>
        </select>

        <button
          type="button"
          onClick={undo}
          disabled={strokeHistoryRef.current.length === 0}
          style={{ marginLeft: "12px" }}
        >
          Undo
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={redoHistoryRef.current.length === 0}
          style={{ marginLeft: "6px" }}
        >
          Redo
        </button>
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
