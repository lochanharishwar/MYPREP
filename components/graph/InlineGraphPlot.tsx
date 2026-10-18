'use client';

import React, { useMemo } from 'react';
import * as math from 'mathjs';

interface InlineGraphPlotProps {
  expression: string;
  width?: number;
  height?: number;
  className?: string;
}

export const InlineGraphPlot: React.FC<InlineGraphPlotProps> = ({
  expression = 'x^2',
  width = 280,
  height = 140,
  className = '',
}) => {
  // Normalize mathematical expression for mathjs
  const cleanExpr = useMemo(() => {
    let clean = expression
      .replace(/^[fy]\(?[x]?\)?\s*=\s*/i, '')
      .replace(/\\cdot/g, '*')
      .replace(/(\d)([a-zA-Z])/g, '$1*$2') // 6x -> 6*x
      .trim();

    if (clean.includes('=')) {
      clean = clean.split('=')[0].trim();
    }
    return clean || 'x^2';
  }, [expression]);

  const xMin = -6;
  const xMax = 6;
  const yMin = -4;
  const yMax = 12;

  // Compile and evaluate points
  const { pathD, points, error } = useMemo(() => {
    try {
      const compiled = math.compile(cleanExpr);
      const pts: Array<{ x: number; y: number }> = [];
      const numSteps = 120;
      const step = (xMax - xMin) / numSteps;

      for (let x = xMin; x <= xMax; x += step) {
        try {
          const y = compiled.evaluate({ x });
          if (typeof y === 'number' && !isNaN(y) && isFinite(y)) {
            // Clamp huge values to prevent SVG artifacts
            const clampedY = Math.max(Math.min(y, yMax + 20), yMin - 20);
            pts.push({ x, y: clampedY });
          }
        } catch {
          // ignore individual point errors
        }
      }

      if (pts.length < 2) {
        return { pathD: '', points: [], error: 'Could not evaluate curve points' };
      }

      // Convert coordinate (x, y) to SVG (sx, sy)
      const toSvgX = (x: number) => ((x - xMin) / (xMax - xMin)) * width;
      const toSvgY = (y: number) => height - ((y - yMin) / (yMax - yMin)) * height;

      let d = '';
      for (let i = 0; i < pts.length; i++) {
        const sx = toSvgX(pts[i].x);
        const sy = toSvgY(pts[i].y);
        if (i === 0) d += `M ${sx.toFixed(1)} ${sy.toFixed(1)}`;
        else d += ` L ${sx.toFixed(1)} ${sy.toFixed(1)}`;
      }

      return { pathD: d, points: pts, error: null };
    } catch (err: any) {
      return { pathD: '', points: [], error: err.message };
    }
  }, [cleanExpr, width, height]);

  // Coordinate transforms for axes
  const toSvgX = (x: number) => ((x - xMin) / (xMax - xMin)) * width;
  const toSvgY = (y: number) => height - ((y - yMin) / (yMax - yMin)) * height;

  const originX = toSvgX(0);
  const originY = toSvgY(0);

  return (
    <div className={`relative overflow-hidden rounded-lg bg-slate-900 border border-slate-800 ${className}`}>
      <svg width={width} height={height} className="block select-none">
        <defs>
          {/* Subtle grid pattern */}
          <pattern id={`grid_${width}`} width={width / 8} height={height / 6} patternUnits="userSpaceOnUse">
            <path d={`M ${width / 8} 0 L 0 0 0 ${height / 6}`} fill="none" stroke="#1e293b" strokeWidth="0.8" />
          </pattern>
          {/* Curve glow filter */}
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Background Grid */}
        <rect width={width} height={height} fill={`url(#grid_${width})`} opacity="0.6" />

        {/* X Axis */}
        <line
          x1={0}
          y1={originY}
          x2={width}
          y2={originY}
          stroke="#475569"
          strokeWidth="1.2"
          strokeDasharray="none"
        />

        {/* Y Axis */}
        <line
          x1={originX}
          y1={0}
          x2={originX}
          y2={height}
          stroke="#475569"
          strokeWidth="1.2"
          strokeDasharray="none"
        />

        {/* Ticks and Axis Labels */}
        {[-4, -2, 2, 4].map((tick) => (
          <g key={`xtick_${tick}`}>
            <line
              x1={toSvgX(tick)}
              y1={originY - 3}
              x2={toSvgX(tick)}
              y2={originY + 3}
              stroke="#64748b"
              strokeWidth="1"
            />
            <text
              x={toSvgX(tick)}
              y={originY + 11}
              fill="#64748b"
              fontSize="8"
              fontFamily="monospace"
              textAnchor="middle"
            >
              {tick}
            </text>
          </g>
        ))}

        {[4, 8].map((tick) => (
          <g key={`ytick_${tick}`}>
            <line
              x1={originX - 3}
              y1={toSvgY(tick)}
              x2={originX + 3}
              y2={toSvgY(tick)}
              stroke="#64748b"
              strokeWidth="1"
            />
            <text
              x={originX + 7}
              y={toSvgY(tick) + 3}
              fill="#64748b"
              fontSize="8"
              fontFamily="monospace"
              textAnchor="start"
            >
              {tick}
            </text>
          </g>
        ))}

        {/* The Math Function Curve Path */}
        {pathD && (
          <path
            d={pathD}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#glow)"
          />
        )}

        {/* Origin (0,0) marker */}
        <circle cx={originX} cy={originY} r="2.5" fill="#f43f5e" />
      </svg>

      {/* Floating Formula Badge in Corner */}
      <div className="absolute top-1.5 left-2 px-1.5 py-0.5 rounded bg-slate-950/80 border border-slate-700/60 backdrop-blur-sm text-[10px] font-mono text-cyan-400 font-semibold shadow-sm">
        y = {cleanExpr}
      </div>

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 text-xs text-rose-400 font-mono p-2 text-center">
          Plot error: {error}
        </div>
      )}
    </div>
  );
};
