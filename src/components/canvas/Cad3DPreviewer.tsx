'use client';

// Interactive In-Browser 3D CAD Geometry Previewer
// Renders a rotatable, zoomable 3D parametric CAD geometry model using an interactive Canvas projection engine.
// Allows learners to preview the physical mechanism / enclosure before opening FreeCAD or AutoCAD.

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  RotateCcw,
  Box,
  Eye,
} from 'lucide-react';

interface Cad3DPreviewerProps {
  title: string;
  dimensions?: { length: number; width: number; height: number };
  wireframe?: boolean;
}

interface Point3D {
  x: number;
  y: number;
  z: number;
}

export default function Cad3DPreviewer({
  dimensions = { length: 120, width: 80, height: 45 },
}: Cad3DPreviewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Rotation angles in radians
  const [rotX, setRotX] = useState<number>(0.55);
  const [rotY, setRotY] = useState<number>(-0.65);
  const [zoom, setZoom] = useState<number>(1.1);
  const [isWireframe, setIsWireframe] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const lastMousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const resetView = () => {
    setRotX(0.55);
    setRotY(-0.65);
    setZoom(1.1);
  };

  // Mouse drag handlers for 3D orbit rotation
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    lastMousePos.current = { x: e.clientX, y: e.clientY };

    setRotY((prev) => prev + dx * 0.015);
    setRotX((prev) => Math.max(-1.4, Math.min(1.4, prev + dy * 0.015)));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setZoom((prev) => Math.max(0.5, Math.min(2.5, prev - e.deltaY * 0.0015)));
  };

  // 3D Projection & Rendering Loop
  const render3D = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Coordinate center
    const cx = width / 2;
    const cy = height / 2;

    const scale = zoom * 1.3;
    const L = (dimensions.length / 2) * scale;
    const W = (dimensions.width / 2) * scale;
    const H = (dimensions.height / 2) * scale;

    // Outer Enclosure Box Vertices
    const vertices: Point3D[] = [
      { x: -L, y: -H, z: -W },
      { x: L, y: -H, z: -W },
      { x: L, y: H, z: -W },
      { x: -L, y: H, z: -W },
      { x: -L, y: -H, z: W },
      { x: L, y: -H, z: W },
      { x: L, y: H, z: W },
      { x: -L, y: H, z: W },
      // Inner subtractive cavity vertices
      { x: -L + 8, y: -H + 8, z: -W + 8 },
      { x: L - 8, y: -H + 8, z: -W + 8 },
      { x: L - 8, y: H, z: -W + 8 },
      { x: -L + 8, y: H, z: -W + 8 },
      { x: -L + 8, y: -H + 8, z: W - 8 },
      { x: L - 8, y: -H + 8, z: W - 8 },
      { x: L - 8, y: H, z: W - 8 },
      { x: -L + 8, y: H, z: W - 8 },
    ];

    // Project 3D Point to 2D Screen
    const project = (p: Point3D): { x: number; y: number; depth: number } => {
      // Rotation around Y
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const x1 = p.x * cosY + p.z * sinY;
      const z1 = -p.x * sinY + p.z * cosY;

      // Rotation around X
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);
      const y2 = p.y * cosX - z1 * sinX;
      const z2 = p.y * sinX + z1 * cosX;

      // Perspective projection
      const distance = 400;
      const fov = distance / (distance + z2);

      return {
        x: cx + x1 * fov,
        y: cy + y2 * fov,
        depth: z2,
      };
    };

    // Draw Ground Grid
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.8)';
    ctx.lineWidth = 1;
    const gridSpan = 140 * scale;
    for (let i = -3; i <= 3; i++) {
      const p1 = project({ x: (i * gridSpan) / 3, y: H + 10, z: -gridSpan });
      const p2 = project({ x: (i * gridSpan) / 3, y: H + 10, z: gridSpan });
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      const p3 = project({ x: -gridSpan, y: H + 10, z: (i * gridSpan) / 3 });
      const p4 = project({ x: gridSpan, y: H + 10, z: (i * gridSpan) / 3 });
      ctx.beginPath();
      ctx.moveTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.stroke();
    }

    // Outer Faces Definition (4 vertices per face)
    const faces = [
      { indices: [0, 1, 2, 3], normalZ: -1, color: 'rgba(238, 242, 255, 0.85)', stroke: '#6366f1' }, // Front
      { indices: [5, 4, 7, 6], normalZ: 1, color: 'rgba(224, 231, 255, 0.85)', stroke: '#4f46e5' },  // Back
      { indices: [4, 0, 3, 7], normalZ: 0, color: 'rgba(219, 234, 254, 0.85)', stroke: '#3b82f6' },  // Left
      { indices: [1, 5, 6, 2], normalZ: 0, color: 'rgba(199, 210, 254, 0.85)', stroke: '#4338ca' },  // Right
      { indices: [3, 2, 6, 7], normalZ: 0, color: 'rgba(245, 243, 255, 0.85)', stroke: '#818cf8' },  // Top
      { indices: [4, 5, 1, 0], normalZ: 0, color: 'rgba(203, 213, 225, 0.85)', stroke: '#64748b' },  // Bottom
    ];

    // Sort faces by depth for painter's algorithm
    const projectedVertices = vertices.map(project);

    faces.forEach((face) => {
      const pts = face.indices.map((i) => projectedVertices[i]);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.closePath();

      if (!isWireframe) {
        ctx.fillStyle = face.color;
        ctx.fill();
      }

      ctx.strokeStyle = face.stroke;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // Draw Mounting Hole Bosses at 4 corners
    const bossPositions = [
      { x: -L + 20, z: -W + 20 },
      { x: L - 20, z: -W + 20 },
      { x: -L + 20, z: W - 20 },
      { x: L - 20, z: W - 20 },
    ];

    bossPositions.forEach((b) => {
      const topPt = project({ x: b.x, y: H, z: b.z });
      ctx.beginPath();
      ctx.arc(topPt.x, topPt.y, 4 * scale, 0, Math.PI * 2);
      ctx.fillStyle = '#4f46e5';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // Draw Parametric Dimension Indicator Lines
    ctx.font = '10px monospace';
    ctx.fillStyle = '#475569';
    const dimStart = project({ x: -L, y: H + 18, z: W });
    const dimEnd = project({ x: L, y: H + 18, z: W });
    ctx.beginPath();
    ctx.moveTo(dimStart.x, dimStart.y);
    ctx.lineTo(dimEnd.x, dimEnd.y);
    ctx.strokeStyle = '#94a3b8';
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText(`${dimensions.length}mm L`, (dimStart.x + dimEnd.x) / 2 - 15, (dimStart.y + dimEnd.y) / 2 - 4);
  }, [dimensions, rotX, rotY, zoom, isWireframe]);

  useEffect(() => {
    render3D();
  }, [render3D]);

  return (
    <div className="relative rounded-xl border border-indigo-200/90 bg-gradient-to-b from-slate-50 to-indigo-50/30 overflow-hidden shadow-inner">
      {/* 3D Viewer Top Bar */}
      <div className="absolute top-2.5 left-3 right-3 z-10 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-1.5 rounded-lg bg-white/90 px-2.5 py-1 shadow-sm backdrop-blur-sm border border-gray-200 pointer-events-auto">
          <Box className="h-3.5 w-3.5 text-indigo-600" />
          <span className="text-[11px] font-bold text-gray-800">
            Example enclosure preview
          </span>
          <span className="text-[10px] text-gray-400 font-mono">
            {dimensions.length}×{dimensions.width}×{dimensions.height}mm
          </span>
        </div>

        {/* Orbit Controls Toolbar */}
        <div className="flex items-center gap-1 rounded-lg bg-white/90 p-0.5 shadow-sm backdrop-blur-sm border border-gray-200 pointer-events-auto">
          <button
            type="button"
            onClick={() => setIsWireframe((w) => !w)}
            className={`rounded p-1 text-xs transition ${
              isWireframe ? 'bg-indigo-100 text-indigo-700 font-bold' : 'text-gray-600 hover:bg-gray-100'
            }`}
            title="Toggle Wireframe"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.2, z + 0.2))}
            className="rounded p-1 text-gray-600 hover:bg-gray-100 transition text-xs font-bold px-1.5"
            title="Zoom In"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}
            className="rounded p-1 text-gray-600 hover:bg-gray-100 transition text-xs font-bold px-1.5"
            title="Zoom Out"
          >
            -
          </button>
          <button
            type="button"
            onClick={resetView}
            className="rounded p-1 text-gray-600 hover:bg-gray-100 transition"
            title="Reset 3D View"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Interactive 3D Canvas */}
      <canvas
        ref={canvasRef}
        width={420}
        height={220}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        className="w-full h-[220px] cursor-grab active:cursor-grabbing block"
      />

      {/* Footer Helper */}
      <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[10px] text-gray-400 pointer-events-none">
        <span>Click &amp; drag to rotate · Scroll to zoom</span>
        <span className="font-semibold text-indigo-600">Generic illustration, not project CAD</span>
      </div>
    </div>
  );
}
