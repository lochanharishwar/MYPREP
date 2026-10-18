'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as math from 'mathjs';
import { LineChart, X, Plus, Move, Sparkles } from 'lucide-react';
import { KatexRenderer } from '@/components/math/KatexRenderer';

interface InteractiveGraphModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertToCanvas: (expression: string, title: string) => void;
  initialExpression?: string;
}

export const InteractiveGraphModal: React.FC<InteractiveGraphModalProps> = ({
  isOpen,
  onClose,
  onInsertToCanvas,
  initialExpression = 'x^2 - 4*x + 3',
}) => {
  const [expression, setExpression] = useState(initialExpression);
  const [xMin, setXMin] = useState(-5);
  const [xMax, setXMax] = useState(7);
  const [yMin, setYMin] = useState(-3);
  const [yMax, setYMax] = useState(8);

  const svgRef = useRef<SVGSVGElement>(null);

  // Compile math function safely
  const { points, roots, errorMessage } = useMemo(() => {
    try {
      const clean = expression.replace(/\^/g, '^').trim();
      const compiled = math.compile(clean);

      const pts: Array<{ x: number; y: number }> = [];
      const calculatedRoots: number[] = [];

      const step = (xMax - xMin) / 300;
      let prevY: number | null = null;
      let prevX: number = xMin;

      for (let x = xMin; x <= xMax; x += step) {
        try {
          const y = compiled.evaluate({ x });
          if (typeof y === 'number' && !isNaN(y) && isFinite(y)) {
            pts.push({ x, y });

            // Detect sign change for root estimation
            if (prevY !== null && ((prevY < 0 && y > 0) || (prevY > 0 && y < 0))) {
              const root = prevX - prevY * ((x - prevX) / (y - prevY));
              calculatedRoots.push(Number(root.toFixed(3)));
            }
            prevY = y;
            prevX = x;
          }
        } catch {
          // ignore evaluation point error
        }
      }

      return { points: pts, roots: calculatedRoots, errorMessage: null };
    } catch (err: any) {
      return { points: [], roots: [], errorMessage: err.message };
    }
  }, [expression, xMin, xMax]);

  // Coordinate mapping
  const width = 500;
  const height = 340;

  const toSvgX = (x: number) => ((x - xMin) / (xMax - xMin)) * width;
  const toSvgY = (y: number) => height - ((y - yMin) / (yMax - yMin)) * height;

  const pathD = useMemo(() => {
    if (points.length < 2) return '';
    return points.reduce((acc, p, idx) => {
      const sx = toSvgX(p.x);
      const sy = toSvgY(p.y);
      if (idx === 0) return `M ${sx} ${sy}`;
      return `${acc} L ${sx} ${sy}`;
    }, '');
  }, [points, xMin, xMax, yMin, yMax]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <LineChart className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                Interactive Function Grapher
              </h3>
              <p className="text-xs text-slate-500">
                Explore roots, extrema, and behavior in real-time
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Input Bar */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-950/40 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <span className="text-xs font-mono font-bold text-slate-500">f(x) =</span>
          <input
            type="text"
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            className="flex-1 px-3 py-2 text-sm font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g. x^2 - 4*x + 3"
          />
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setExpression('x^2 - 4*x + 3')}
              className="text-[11px] px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-400 hover:text-blue-600"
            >
              Quadratic
            </button>
            <button
              onClick={() => setExpression('sin(x)')}
              className="text-[11px] px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-400 hover:text-blue-600"
            >
              sin(x)
            </button>
            <button
              onClick={() => setExpression('x^3 - 3*x')}
              className="text-[11px] px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-400 hover:text-blue-600"
            >
              Cubic
            </button>
          </div>
        </div>

        {/* SVG Plot Viewport */}
        <div className="p-6 flex flex-col items-center justify-center bg-slate-50/50 dark:bg-slate-900/50">
          <div className="relative border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 rounded-xl overflow-hidden shadow-inner">
            <svg
              ref={svgRef}
              width={width}
              height={height}
              className="select-none"
            >
              {/* Grid Lines */}
              {Array.from({ length: 13 }).map((_, i) => {
                const gx = xMin + ((xMax - xMin) / 12) * i;
                const sx = toSvgX(gx);
                return (
                  <line
                    key={`gx-${i}`}
                    x1={sx}
                    y1={0}
                    x2={sx}
                    y2={height}
                    stroke="#e2e8f0"
                    strokeDasharray="2,2"
                    className="dark:stroke-slate-800"
                  />
                );
              })}
              {Array.from({ length: 11 }).map((_, i) => {
                const gy = yMin + ((yMax - yMin) / 10) * i;
                const sy = toSvgY(gy);
                return (
                  <line
                    key={`gy-${i}`}
                    x1={0}
                    y1={sy}
                    x2={width}
                    y2={sy}
                    stroke="#e2e8f0"
                    strokeDasharray="2,2"
                    className="dark:stroke-slate-800"
                  />
                );
              })}

              {/* Axes */}
              {/* X-Axis */}
              {yMin <= 0 && yMax >= 0 && (
                <line
                  x1={0}
                  y1={toSvgY(0)}
                  x2={width}
                  y2={toSvgY(0)}
                  stroke="#475569"
                  strokeWidth="1.5"
                />
              )}
              {/* Y-Axis */}
              {xMin <= 0 && xMax >= 0 && (
                <line
                  x1={toSvgX(0)}
                  y1={0}
                  x2={toSvgX(0)}
                  y2={height}
                  stroke="#475569"
                  strokeWidth="1.5"
                />
              )}

              {/* Function Curve */}
              {pathD && (
                <path
                  d={pathD}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              )}

              {/* Roots markers */}
              {roots.map((r, idx) => (
                <g key={`root-${idx}`}>
                  <circle
                    cx={toSvgX(r)}
                    cy={toSvgY(0)}
                    r="4"
                    fill="#10b981"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />
                  <text
                    x={toSvgX(r)}
                    y={toSvgY(0) + 16}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#10b981"
                    className="font-mono font-bold"
                  >
                    x = {r}
                  </text>
                </g>
              ))}
            </svg>

            {errorMessage && (
              <div className="absolute inset-0 bg-white/90 dark:bg-slate-900/90 flex items-center justify-center p-4 text-center">
                <span className="text-rose-500 font-mono text-xs">
                  Syntax Error: {errorMessage}
                </span>
              </div>
            )}
          </div>

          {/* Key landmarks info */}
          <div className="w-full mt-3 flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-3">
              <span>
                Calculated Roots: {roots.length > 0 ? roots.map(r => `x = ${r}`).join(', ') : 'None in range'}
              </span>
            </div>
            <span>Window: [{xMin}, {xMax}] × [{yMin}, {yMax}]</span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="font-mono text-xs text-slate-600 dark:text-slate-400">
            <KatexRenderer math={`y = ${expression}`} />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onInsertToCanvas(expression, `Plot: y = ${expression}`);
                onClose();
              }}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-md transition-all"
            >
              <Plus className="w-4 h-4" />
              Add Graph Card to Whiteboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
