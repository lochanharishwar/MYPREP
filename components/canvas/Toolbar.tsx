'use client';

import React from 'react';
import {
  Pen,
  Highlighter,
  Eraser,
  Hand,
  BoxSelect,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
  LineChart,
  FileUp,
  Mic,
  Moon,
  Sun,
  Grid,
} from 'lucide-react';
import { ToolKind, PaperStyle, CanvasTheme } from '@/lib/types/notebook';

interface ToolbarProps {
  activeTool: ToolKind;
  activeColor: string;
  activeWidth: number;
  paperStyle: PaperStyle;
  theme: CanvasTheme;
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  onToolSelect: (tool: ToolKind) => void;
  onColorSelect: (color: string) => void;
  onWidthSelect: (width: number) => void;
  onPaperStyleChange: (style: PaperStyle) => void;
  onThemeToggle: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onOpenAI: () => void;
  onOpenGraph: () => void;
  onOpenUpload: () => void;
  onToggleVoice: () => void;
  isVoiceActive?: boolean;
}

const COLORS = [
  { name: 'Charcoal', hex: '#1a1b1e' },
  { name: 'Ink Blue', hex: '#1d4ed8' },
  { name: 'Emerald', hex: '#059669' },
  { name: 'Amber', hex: '#d97706' },
  { name: 'Rose', hex: '#e11d48' },
  { name: 'Purple', hex: '#7c3aed' },
];

export const Toolbar: React.FC<ToolbarProps> = ({
  activeTool,
  activeColor,
  activeWidth,
  paperStyle,
  theme,
  zoom,
  canUndo,
  canRedo,
  onToolSelect,
  onColorSelect,
  onWidthSelect,
  onPaperStyleChange,
  onThemeToggle,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onOpenAI,
  onOpenGraph,
  onOpenUpload,
  onToggleVoice,
  isVoiceActive,
}) => {
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 p-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/80 dark:border-slate-800 transition-all">
      {/* Primary Tools */}
      <div className="flex items-center gap-1 pr-2 border-r border-slate-200 dark:border-slate-800">
        <button
          onClick={() => onToolSelect('fine-pen')}
          className={`p-2 rounded-xl transition-colors relative ${
            activeTool === 'fine-pen'
              ? 'bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
          title="Fine Pen (0.5mm) [P]"
        >
          <Pen className="w-4 h-4" />
          <span className="absolute bottom-0.5 right-1 w-1 h-1 rounded-full bg-current" />
        </button>

        <button
          onClick={() => onToolSelect('normal-pen')}
          className={`p-2 rounded-xl transition-colors relative ${
            activeTool === 'normal-pen'
              ? 'bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
          title="Standard Ink Pen (1.2mm)"
        >
          <Pen className="w-4 h-4 stroke-[2.5]" />
        </button>

        <button
          onClick={() => onToolSelect('marker')}
          className={`p-2 rounded-xl transition-colors ${
            activeTool === 'marker'
              ? 'bg-amber-50 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
          title="Highlighter Marker"
        >
          <Highlighter className="w-4 h-4" />
        </button>

        <button
          onClick={() => onToolSelect('eraser')}
          className={`p-2 rounded-xl transition-colors ${
            activeTool === 'eraser'
              ? 'bg-rose-50 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
          title="Stroke Eraser [E]"
        >
          <Eraser className="w-4 h-4" />
        </button>

        <button
          onClick={() => onToolSelect('rect-select')}
          className={`p-2 rounded-xl transition-colors ${
            activeTool === 'rect-select'
              ? 'bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
          title="Selection Box [V]"
        >
          <BoxSelect className="w-4 h-4" />
        </button>

        <button
          onClick={() => onToolSelect('hand')}
          className={`p-2 rounded-xl transition-colors ${
            activeTool === 'hand'
              ? 'bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
          title="Pan Workspace [H or Space+Drag]"
        >
          <Hand className="w-4 h-4" />
        </button>
      </div>

      {/* Color Palette */}
      <div className="flex items-center gap-1.5 px-2 border-r border-slate-200 dark:border-slate-800">
        {COLORS.map((c) => (
          <button
            key={c.hex}
            onClick={() => onColorSelect(c.hex)}
            className={`w-5 h-5 rounded-full transition-transform ${
              activeColor === c.hex ? 'scale-125 ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-slate-900' : 'hover:scale-110'
            }`}
            style={{ backgroundColor: c.hex }}
            title={c.name}
          />
        ))}
      </div>

      {/* History Undo / Redo */}
      <div className="flex items-center gap-1 px-1 border-r border-slate-200 dark:border-slate-800">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </button>

        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent"
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 className="w-4 h-4" />
        </button>
      </div>

      {/* Zoom Controls */}
      <div className="flex items-center gap-1 px-1 border-r border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
        <button
          onClick={onZoomOut}
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          title="Zoom out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onZoomReset}
          className="font-mono text-[11px] px-1 hover:text-blue-600 dark:hover:text-blue-400"
          title="Reset zoom to 100%"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={onZoomIn}
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          title="Zoom in"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Paper & Theme */}
      <div className="flex items-center gap-1 px-1 border-r border-slate-200 dark:border-slate-800">
        <select
          value={paperStyle}
          onChange={(e) => onPaperStyleChange(e.target.value as PaperStyle)}
          className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-700 dark:text-slate-300 focus:outline-none"
        >
          <option value="grid">Grid</option>
          <option value="lined">Lined</option>
          <option value="dotted">Dotted</option>
          <option value="graph">Graph</option>
          <option value="blank">Blank</option>
        </select>

        <button
          onClick={onThemeToggle}
          className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          title="Toggle Canvas Theme"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      {/* Interactive Action Triggers */}
      <div className="flex items-center gap-1.5 pl-1">
        <button
          onClick={onOpenGraph}
          className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          title="Insert Interactive Graph Card"
        >
          <LineChart className="w-3.5 h-3.5 text-blue-500" />
          <span className="hidden sm:inline">Graph</span>
        </button>

        <button
          onClick={onOpenUpload}
          className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          title="Import Worksheet or PDF"
        >
          <FileUp className="w-3.5 h-3.5 text-emerald-500" />
          <span className="hidden sm:inline">Worksheet</span>
        </button>

        <button
          onClick={onToggleVoice}
          className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-xl transition-colors ${
            isVoiceActive
              ? 'bg-rose-500 text-white animate-pulse'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
          title="Push-to-Talk Voice Tutor"
        >
          <Mic className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{isVoiceActive ? 'Listening' : 'Voice'}</span>
        </button>

        <button
          onClick={onOpenAI}
          className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500 transition-all shadow-md hover:shadow-lg"
          title="Open Gemma 4 AI Math Assistant"
        >
          <Sparkles className="w-3.5 h-3.5 text-blue-200 animate-spin-slow" />
          <span>Gemma 4 Tutor</span>
        </button>
      </div>
    </div>
  );
};
