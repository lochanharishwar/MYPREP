'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  VectorStroke,
  CanvasObject,
  ToolKind,
  PaperStyle,
  CanvasTheme,
  Camera,
  Point,
  BoundingBox,
  CanvasAIAnnotation,
  CanvasGraphObject,
  CanvasText as NotebookCanvasText,
} from '@/lib/types/notebook';
import { KatexRenderer } from '@/components/math/KatexRenderer';
import { InlineGraphPlot } from '@/components/graph/InlineGraphPlot';
import {
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  X,
  Move,
  Trash2,
  GripVertical,
  Wand2,
  PenTool,
} from 'lucide-react';

interface VectorCanvasProps {
  strokes: VectorStroke[];
  objects: CanvasObject[];
  camera: Camera;
  activeTool: ToolKind;
  activeColor: string;
  activeWidth: number;
  paperStyle: PaperStyle;
  theme: CanvasTheme;
  selectedIds: string[];
  activeMathExpression?: string;
  onStrokesChange: (strokes: VectorStroke[], isUndoable?: boolean) => void;
  onObjectsChange: (objects: CanvasObject[], isUndoable?: boolean) => void;
  onCameraChange: (camera: Camera) => void;
  onSelectionChange: (selectedIds: string[]) => void;
  onAskAIForSelection?: (expression: string, mode: 'hint' | 'explain' | 'check') => void;
  onGraphForSelection?: (expression: string) => void;
  onBeautifySelection?: (selectedStrokeIds: string[], bbox: BoundingBox) => void;
  onCoWriteSelection?: (expression: string, lastPos: { x: number; y: number }) => void;
}

export const VectorCanvas: React.FC<VectorCanvasProps> = ({
  strokes,
  objects,
  camera,
  activeTool,
  activeColor,
  activeWidth,
  paperStyle,
  theme,
  selectedIds,
  activeMathExpression,
  onStrokesChange,
  onObjectsChange,
  onCameraChange,
  onSelectionChange,
  onAskAIForSelection,
  onGraphForSelection,
  onBeautifySelection,
  onCoWriteSelection,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const dragInfoRef = useRef<{
    id: string;
    startClientX: number;
    startClientY: number;
    origDocX: number;
    origDocY: number;
  } | null>(null);

  // Coordinate transforms
  const screenToDoc = useCallback(
    (screenX: number, screenY: number): { x: number; y: number } => {
      return {
        x: (screenX - camera.x) / camera.zoom,
        y: (screenY - camera.y) / camera.zoom,
      };
    },
    [camera]
  );

  const docToScreen = useCallback(
    (docX: number, docY: number): { x: number; y: number } => {
      return {
        x: docX * camera.zoom + camera.x,
        y: docY * camera.zoom + camera.y,
      };
    },
    [camera]
  );

  // Compute stroke bounding box
  const computeBoundingBox = (points: Point[]): BoundingBox => {
    if (points.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
    }
    let minX = points[0].x;
    let minY = points[0].y;
    let maxX = points[0].x;
    let maxY = points[0].y;

    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    };
  };

  // Render canvas layers
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

    // Clean reset of transforms
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    // Scale to physical DPR
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Apply camera transform
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);

    // 1. Draw Paper Background Grid / Lines
    const isDark = theme === 'dark';
    const gridColor = isDark ? '#2b2d31' : '#e5e7eb';
    const subGridColor = isDark ? '#232428' : '#f3f4f6';
    const marginColor = isDark ? '#4b2a34' : '#fed7aa';

    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const visibleLeft = -camera.x / camera.zoom;
    const visibleTop = -camera.y / camera.zoom;
    const visibleRight = visibleLeft + width / camera.zoom;
    const visibleBottom = visibleTop + height / camera.zoom;

    if (paperStyle === 'grid' || paperStyle === 'graph') {
      const step = paperStyle === 'graph' ? 14 : 26;
      ctx.lineWidth = 1 / camera.zoom;
      ctx.strokeStyle = gridColor;

      const startX = Math.floor(visibleLeft / step) * step;
      const endX = Math.ceil(visibleRight / step) * step;
      const startY = Math.floor(visibleTop / step) * step;
      const endY = Math.ceil(visibleBottom / step) * step;

      ctx.beginPath();
      for (let x = startX; x <= endX; x += step) {
        ctx.moveTo(x, visibleTop);
        ctx.lineTo(x, visibleBottom);
      }
      for (let y = startY; y <= endY; y += step) {
        ctx.moveTo(visibleLeft, y);
        ctx.lineTo(visibleRight, y);
      }
      ctx.stroke();
    } else if (paperStyle === 'lined') {
      const lineStep = 32;
      ctx.lineWidth = 1 / camera.zoom;
      ctx.strokeStyle = gridColor;

      const startY = Math.floor(visibleTop / lineStep) * lineStep;
      const endY = Math.ceil(visibleBottom / lineStep) * lineStep;

      ctx.beginPath();
      for (let y = startY; y <= endY; y += lineStep) {
        ctx.moveTo(visibleLeft, y);
        ctx.lineTo(visibleRight, y);
      }
      ctx.stroke();

      // Red vertical margin rule
      ctx.beginPath();
      ctx.strokeStyle = marginColor;
      ctx.lineWidth = 1.5 / camera.zoom;
      ctx.moveTo(100, visibleTop);
      ctx.lineTo(100, visibleBottom);
      ctx.stroke();
    } else if (paperStyle === 'dotted') {
      const dotStep = 24;
      ctx.fillStyle = gridColor;
      const startX = Math.floor(visibleLeft / dotStep) * dotStep;
      const endX = Math.ceil(visibleRight / dotStep) * dotStep;
      const startY = Math.floor(visibleTop / dotStep) * dotStep;
      const endY = Math.ceil(visibleBottom / dotStep) * dotStep;

      for (let x = startX; x <= endX; x += dotStep) {
        for (let y = startY; y <= endY; y += dotStep) {
          ctx.beginPath();
          ctx.arc(x, y, 1.2 / camera.zoom, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 2. Draw Vector Strokes
    const allStrokes = [...strokes];
    if (currentStroke.length >= 1) {
      allStrokes.push({
        id: 'in-progress',
        tool: activeTool === 'marker' ? 'marker' : activeTool === 'fine-pen' ? 'fine-pen' : 'normal-pen',
        color: activeColor,
        width: activeWidth,
        opacity: activeTool === 'marker' ? 0.35 : 1,
        points: currentStroke,
        bbox: computeBoundingBox(currentStroke),
        createdAt: Date.now(),
      });
    }

    for (const stroke of allStrokes) {
      if (stroke.points.length === 0) continue;

      ctx.save();
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = stroke.opacity;

      const pts = stroke.points;
      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, Math.max(stroke.width / 2, 1.5), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length - 1; i++) {
          const xc = (pts[i].x + pts[i + 1].x) / 2;
          const yc = (pts[i].y + pts[i + 1].y) / 2;
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
        }
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
        ctx.stroke();
      }

      // If stroke is selected, highlight with dashed cyan outline
      if (selectedIds.includes(stroke.id)) {
        ctx.save();
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1.5 / camera.zoom;
        ctx.setLineDash([4 / camera.zoom, 4 / camera.zoom]);
        const pad = 4;
        ctx.strokeRect(
          stroke.bbox.minX - pad,
          stroke.bbox.minY - pad,
          stroke.bbox.width + pad * 2,
          stroke.bbox.height + pad * 2
        );
        ctx.restore();
      }

      ctx.restore();
    }

    // 3. Selection Box
    if (selectionBox) {
      ctx.save();
      ctx.strokeStyle = '#2563eb';
      ctx.fillStyle = 'rgba(37, 99, 235, 0.08)';
      ctx.lineWidth = 1 / camera.zoom;
      ctx.setLineDash([3 / camera.zoom, 3 / camera.zoom]);

      const left = Math.min(selectionBox.startX, selectionBox.currentX);
      const top = Math.min(selectionBox.startY, selectionBox.currentY);
      const w = Math.abs(selectionBox.currentX - selectionBox.startX);
      const h = Math.abs(selectionBox.currentY - selectionBox.startY);

      ctx.fillRect(left, top, w, h);
      ctx.strokeRect(left, top, w, h);
      ctx.restore();
    }

    ctx.restore();
  }, [
    camera,
    strokes,
    currentStroke,
    activeTool,
    activeColor,
    activeWidth,
    paperStyle,
    theme,
    selectedIds,
    selectionBox,
  ]);

  // Adjust canvas size to window/container with high DPR
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      render();
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [render]);

  useEffect(() => {
    render();
  }, [render]);

  // Pointer event handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const docPos = screenToDoc(screenX, screenY);

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {}

    if (activeTool === 'hand' || e.button === 1) {
      setIsDrawing(true);
      setDragStart({ x: screenX, y: screenY });
      return;
    }

    if (activeTool === 'rect-select' || activeTool === 'lasso-select') {
      setSelectionBox({
        startX: docPos.x,
        startY: docPos.y,
        currentX: docPos.x,
        currentY: docPos.y,
      });
      setIsDrawing(true);
      return;
    }

    if (activeTool === 'eraser' || activeTool === 'area-eraser') {
      const threshold = 16 / camera.zoom;
      const remainingStrokes = strokes.filter((stroke) => {
        return !stroke.points.some(
          (p) => Math.hypot(p.x - docPos.x, p.y - docPos.y) < threshold
        );
      });
      if (remainingStrokes.length !== strokes.length) {
        onStrokesChange(remainingStrokes, true);
      }
      setIsDrawing(true);
      return;
    }

    if (['fine-pen', 'normal-pen', 'marker'].includes(activeTool)) {
      setIsDrawing(true);
      const pressure = e.pressure && e.pressure > 0 ? e.pressure : 0.5;
      setCurrentStroke([{ x: docPos.x, y: docPos.y, pressure, time: Date.now() }]);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing && !selectionBox) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const docPos = screenToDoc(screenX, screenY);

    if (dragStart) {
      // Camera panning
      const dx = screenX - dragStart.x;
      const dy = screenY - dragStart.y;
      onCameraChange({
        ...camera,
        x: camera.x + dx,
        y: camera.y + dy,
      });
      setDragStart({ x: screenX, y: screenY });
      return;
    }

    if (selectionBox) {
      setSelectionBox((prev) =>
        prev ? { ...prev, currentX: docPos.x, currentY: docPos.y } : null
      );
      return;
    }

    if (activeTool === 'eraser') {
      const threshold = 16 / camera.zoom;
      const remainingStrokes = strokes.filter((stroke) => {
        return !stroke.points.some(
          (p) => Math.hypot(p.x - docPos.x, p.y - docPos.y) < threshold
        );
      });
      if (remainingStrokes.length !== strokes.length) {
        onStrokesChange(remainingStrokes, true);
      }
      return;
    }

    if (['fine-pen', 'normal-pen', 'marker'].includes(activeTool)) {
      const pressure = e.pressure && e.pressure > 0 ? e.pressure : 0.5;
      setCurrentStroke((prev) => [
        ...prev,
        { x: docPos.x, y: docPos.y, pressure, time: Date.now() },
      ]);
    }
  };

  const handlePointerUp = (e?: React.PointerEvent<HTMLCanvasElement>) => {
    if (e) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (err) {}
    }

    if (dragStart) {
      setDragStart(null);
      setIsDrawing(false);
      return;
    }

    if (selectionBox) {
      const minX = Math.min(selectionBox.startX, selectionBox.currentX);
      const maxX = Math.max(selectionBox.startX, selectionBox.currentX);
      const minY = Math.min(selectionBox.startY, selectionBox.currentY);
      const maxY = Math.max(selectionBox.startY, selectionBox.currentY);

      // Select intersecting strokes
      const selected = strokes.filter((s) => {
        return (
          s.bbox.minX >= minX &&
          s.bbox.maxX <= maxX &&
          s.bbox.minY >= minY &&
          s.bbox.maxY <= maxY
        );
      });

      onSelectionChange(selected.map((s) => s.id));
      setSelectionBox(null);
      setIsDrawing(false);
      return;
    }

    if (currentStroke.length >= 1) {
      const newStroke: VectorStroke = {
        id: `stroke_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        tool: activeTool === 'marker' ? 'marker' : activeTool === 'fine-pen' ? 'fine-pen' : 'normal-pen',
        color: activeColor,
        width: activeWidth,
        opacity: activeTool === 'marker' ? 0.35 : 1,
        points: currentStroke,
        bbox: computeBoundingBox(currentStroke),
        createdAt: Date.now(),
      };

      onStrokesChange([...strokes, newStroke], true);
    }

    setCurrentStroke([]);
    setIsDrawing(false);
  };

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseScreenX = e.clientX - rect.left;
    const mouseScreenY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    const newZoom = Math.min(Math.max(camera.zoom * zoomFactor, 0.25), 4.0);

    const newX = mouseScreenX - (mouseScreenX - camera.x) * (newZoom / camera.zoom);
    const newY = mouseScreenY - (mouseScreenY - camera.y) * (newZoom / camera.zoom);

    onCameraChange({ x: newX, y: newY, zoom: newZoom });
  };

  // Delete object
  const handleDeleteObject = (id: string) => {
    onObjectsChange(objects.filter((o) => o.id !== id), true);
  };

  // Object dragging handler: allows moving any card smoothly across canvas
  const handleStartDrag = (e: React.PointerEvent, objId: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();

    const targetObj = objects.find((o) => o.id === objId);
    if (!targetObj) return;

    dragInfoRef.current = {
      id: objId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origDocX: targetObj.x,
      origDocY: targetObj.y,
    };
    setActiveDragId(objId);

    const onPointerMove = (ev: PointerEvent) => {
      if (!dragInfoRef.current) return;
      const dx = (ev.clientX - dragInfoRef.current.startClientX) / camera.zoom;
      const dy = (ev.clientY - dragInfoRef.current.startClientY) / camera.zoom;

      const newObjects = objects.map((o) => {
        if (o.id === dragInfoRef.current!.id) {
          return {
            ...o,
            x: Math.round(dragInfoRef.current!.origDocX + dx),
            y: Math.round(dragInfoRef.current!.origDocY + dy),
          };
        }
        return o;
      });

      onObjectsChange(newObjects, false);
    };

    const onPointerUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);

      if (dragInfoRef.current) {
        const dx = (ev.clientX - dragInfoRef.current.startClientX) / camera.zoom;
        const dy = (ev.clientY - dragInfoRef.current.startClientY) / camera.zoom;

        if (Math.hypot(dx, dy) > 1) {
          const finalObjects = objects.map((o) => {
            if (o.id === dragInfoRef.current!.id) {
              return {
                ...o,
                x: Math.round(dragInfoRef.current!.origDocX + dx),
                y: Math.round(dragInfoRef.current!.origDocY + dy),
              };
            }
            return o;
          });
          onObjectsChange(finalObjects, true);
        }
        dragInfoRef.current = null;
        setActiveDragId(null);
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Get selected strokes bounding box for contextual math bar
  const selectedStrokes = strokes.filter((s) => selectedIds.includes(s.id));
  const selectionBBox = selectedStrokes.length > 0
    ? {
        minX: Math.min(...selectedStrokes.map((s) => s.bbox.minX)),
        minY: Math.min(...selectedStrokes.map((s) => s.bbox.minY)),
        maxX: Math.max(...selectedStrokes.map((s) => s.bbox.maxX)),
        maxY: Math.max(...selectedStrokes.map((s) => s.bbox.maxY)),
      }
    : null;

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full select-none overflow-hidden ${
        theme === 'dark' ? 'bg-[#18191c]' : 'bg-[#fbfbfa]'
      }`}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        className={`absolute inset-0 touch-none ${
          activeTool === 'hand' ? 'cursor-grab' : activeTool.includes('pen') ? 'cursor-crosshair' : 'cursor-default'
        }`}
      />

      {/* DOM Interactive Object Layer: Draggable AI Cards, Graphs, Shapes */}
      <div className="absolute inset-0 pointer-events-none">
        {objects.map((obj) => {
          const screenPos = docToScreen(obj.x, obj.y);
          const isDragging = activeDragId === obj.id;

          if (obj.kind === 'ai-annotation') {
            const ai = obj as CanvasAIAnnotation;
            const isVerified = ai.status === 'verified';

            return (
              <div
                key={ai.id}
                style={{
                  transform: `translate(${screenPos.x}px, ${screenPos.y}px) scale(${camera.zoom})`,
                  transformOrigin: 'top left',
                  width: `${ai.width}px`,
                }}
                className={`pointer-events-auto absolute z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl p-4 transition-all duration-75 ${
                  isDragging
                    ? 'shadow-2xl ring-2 ring-blue-500 scale-[1.02] border-blue-400'
                    : 'shadow-xl border border-slate-200 dark:border-slate-800 hover:shadow-2xl hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                {/* Draggable Card Header */}
                <div
                  onPointerDown={(e) => handleStartDrag(e, ai.id)}
                  className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800 cursor-grab active:cursor-grabbing select-none hover:bg-slate-50/60 dark:hover:bg-slate-800/40 -mx-2 px-2 py-1 rounded-t-lg transition-colors"
                  title="Click and drag anywhere on this header to move card"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                      <GripVertical className="w-3.5 h-3.5" />
                    </span>
                    <span className="p-1 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                      <Sparkles className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {ai.backend.includes('Scribe')
                        ? 'Scribe Co-Writer'
                        : ai.backend.includes('Callisto')
                        ? 'Callisto Beautifier'
                        : 'Gemma 4 Tutor'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {isVerified ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                        <CheckCircle2 className="w-3 h-3" />
                        Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                        <AlertTriangle className="w-3 h-3" />
                        Reasoning
                      </span>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteObject(ai.id);
                      }}
                      className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                      title="Dismiss card"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {ai.latex && (
                  <div className="my-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-center font-mono">
                    <KatexRenderer math={ai.latex} block />
                  </div>
                )}

                {ai.text ? (
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-sans">
                    {ai.text}
                  </p>
                ) : null}

                <div className="mt-3 pt-2 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800">
                  <span>Engine: {ai.backend} • {ai.model}</span>
                  <span className="text-slate-300 dark:text-slate-600 font-mono text-[9px]">Drag header to move</span>
                </div>
              </div>
            );
          }

          if (obj.kind === 'graph') {
            const graph = obj as CanvasGraphObject;
            return (
              <div
                key={graph.id}
                style={{
                  transform: `translate(${screenPos.x}px, ${screenPos.y}px) scale(${camera.zoom})`,
                  transformOrigin: 'top left',
                  width: `${graph.width}px`,
                  height: `${graph.height}px`,
                }}
                className={`pointer-events-auto absolute z-15 bg-white dark:bg-slate-900 rounded-xl p-3 border flex flex-col transition-all duration-75 ${
                  isDragging
                    ? 'shadow-2xl ring-2 ring-purple-500 scale-[1.02] border-purple-400'
                    : 'shadow-lg border-slate-200 dark:border-slate-800 hover:shadow-xl'
                }`}
              >
                {/* Draggable Graph Header */}
                <div
                  onPointerDown={(e) => handleStartDrag(e, graph.id)}
                  className="flex items-center justify-between pb-1 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-grab active:cursor-grabbing select-none hover:bg-slate-50 dark:hover:bg-slate-800/50 -mx-1 px-1 py-0.5 rounded transition-colors"
                  title="Click and drag anywhere on this header to move graph"
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="text-slate-400">
                      <GripVertical className="w-3.5 h-3.5" />
                    </span>
                    <span className="truncate">{graph.title || `Plot: ${graph.expressions[0] || 'x^2'}`}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteObject(graph.id);
                    }}
                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
                    title="Dismiss graph"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex-1 rounded overflow-hidden flex items-center justify-center p-1">
                  <InlineGraphPlot
                    expression={graph.expressions[0] || 'x^2'}
                    width={Math.max(graph.width - 24, 250)}
                    height={Math.max(graph.height - 44, 150)}
                  />
                </div>
              </div>
            );
          }

          if (obj.kind === 'text') {
            const textObj = obj as NotebookCanvasText;
            return (
              <div
                key={textObj.id}
                style={{
                  transform: `translate(${screenPos.x}px, ${screenPos.y}px) scale(${camera.zoom})`,
                  transformOrigin: 'top left',
                  maxWidth: '380px',
                }}
                className={`pointer-events-auto absolute z-20 p-3 rounded-xl transition-all duration-75 select-none ${
                  isDragging
                    ? 'bg-blue-50/95 dark:bg-blue-950/95 ring-2 ring-blue-500 shadow-xl'
                    : 'bg-white/90 dark:bg-slate-900/90 border border-dashed border-slate-300 dark:border-slate-700 shadow-sm hover:shadow-md'
                }`}
              >
                <div
                  onPointerDown={(e) => handleStartDrag(e, textObj.id)}
                  className="cursor-grab active:cursor-grabbing flex items-start gap-2 group"
                  title="Drag to move plain text explanation"
                >
                  <span className="text-slate-400 group-hover:text-blue-500 mt-0.5 transition-colors">
                    <GripVertical className="w-3.5 h-3.5" />
                  </span>
                  <div className="flex-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-1">
                      Whiteboard Explanation:
                    </span>
                    <p
                      className="text-xs text-slate-800 dark:text-slate-200 font-sans leading-relaxed whitespace-pre-wrap"
                      style={{ fontSize: textObj.fontSize ? `${textObj.fontSize}px` : '13px' }}
                    >
                      {textObj.text}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteObject(textObj.id);
                    }}
                    className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title="Dismiss explanation"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          }

          return null;
        })}
      </div>

      {/* Contextual Floating Math Menu above Selected Strokes */}
      {selectionBBox && selectedIds.length > 0 && (
        <div
          style={{
            left: `${docToScreen((selectionBBox.minX + selectionBBox.maxX) / 2, selectionBBox.minY).x}px`,
            top: `${docToScreen(0, selectionBBox.minY).y - 52}px`,
            transform: 'translateX(-50%)',
          }}
          className="absolute z-30 flex items-center gap-1.5 p-2 bg-slate-900/95 text-white rounded-2xl shadow-2xl backdrop-blur-md border border-slate-700/80 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800/90 border border-slate-700 text-xs font-mono text-cyan-300">
            <span className="text-[10px] text-slate-400 uppercase">Input:</span>
            <span className="truncate max-w-[130px] font-semibold">{activeMathExpression || 'Whiteboard Math'}</span>
          </div>

          <button
            onClick={() => onAskAIForSelection?.(activeMathExpression || 'Whiteboard Math', 'explain')}
            className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-200" />
            Explain
          </button>

          <button
            onClick={() => onAskAIForSelection?.(activeMathExpression || 'Whiteboard Math', 'check')}
            className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors text-slate-200"
          >
            Check Steps
          </button>

          <button
            onClick={() => onGraphForSelection?.(activeMathExpression || 'x^2')}
            className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-purple-600/90 hover:bg-purple-600 transition-colors text-white"
            title="Graph this whiteboard expression"
          >
            Graph
          </button>

          <button
            onClick={() =>
              onBeautifySelection?.(selectedIds, {
                minX: selectionBBox.minX,
                minY: selectionBBox.minY,
                maxX: selectionBBox.maxX,
                maxY: selectionBBox.maxY,
                width: selectionBBox.maxX - selectionBBox.minX,
                height: selectionBBox.maxY - selectionBBox.minY,
              })
            }
            className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-600 transition-colors text-white"
            title="Convert scribbles to neat typeset KaTeX card"
          >
            <Wand2 className="w-3.5 h-3.5" />
            Beautify
          </button>

          <button
            onClick={() =>
              onCoWriteSelection?.(activeMathExpression || 'Whiteboard Math', {
                x: selectionBBox.minX,
                y: selectionBBox.maxY + 20,
              })
            }
            className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-teal-600/90 hover:bg-teal-600 transition-colors text-white"
            title="Co-write the next step directly onto the whiteboard"
          >
            <PenTool className="w-3.5 h-3.5" />
            Co-Write
          </button>

          <button
            onClick={() => {
              const remaining = strokes.filter((s) => !selectedIds.includes(s.id));
              onStrokesChange(remaining, true);
              onSelectionChange([]);
            }}
            className="p-1.5 rounded-lg hover:bg-rose-950 text-slate-400 hover:text-rose-400 transition-colors ml-1"
            title="Delete selection"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
