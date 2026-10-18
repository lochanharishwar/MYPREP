'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  VectorStroke,
  CanvasObject,
  ToolKind,
  PaperStyle,
  CanvasTheme,
  Camera,
  CanvasAIAnnotation,
  CanvasGraphObject,
  CanvasText as NotebookCanvasText,
  BoundingBox,
} from '@/lib/types/notebook';
import { VectorCanvas } from '@/components/canvas/VectorCanvas';
import { Toolbar } from '@/components/canvas/Toolbar';
import { AIPanel } from '@/components/ai/AIPanel';
import { InteractiveGraphModal } from '@/components/graph/InteractiveGraphModal';
import { WorksheetModal } from '@/components/pdf/WorksheetModal';
import { VoiceGate } from '@/components/voice/VoiceGate';
import { AgentTeamDock } from '@/components/agents/AgentTeamDock';
import { rasterizeStrokesToPng } from '@/lib/canvas/stroke-rasterizer';
import {
  ChevronLeft,
  Sparkles,
  Save,
  CheckCircle,
  Clock,
  CloudOff,
  Cpu,
  Layers,
  AlertTriangle,
  LineChart,
  FileText,
  Mic,
  Trash2,
  Play,
  RotateCcw,
  Scan,
  Edit3,
  Wand2,
  PenTool,
  Volume2,
  VolumeX,
  Radio,
} from 'lucide-react';

// Genuine handwritten-style vector coordinates for f(x) = 6x^2
const createSampleStrokes = (): VectorStroke[] => [
  // 'f'
  {
    id: 'stroke_f_1',
    tool: 'normal-pen',
    color: '#1a1b1e',
    width: 2.8,
    opacity: 1,
    points: [
      { x: 90, y: 110, pressure: 0.6 },
      { x: 95, y: 95, pressure: 0.7 },
      { x: 105, y: 92, pressure: 0.8 },
      { x: 100, y: 135, pressure: 0.7 },
      { x: 98, y: 155, pressure: 0.5 },
    ],
    bbox: { minX: 90, minY: 92, maxX: 105, maxY: 155, width: 15, height: 63 },
    createdAt: 1,
  },
  // 'f' bar
  {
    id: 'stroke_f_bar',
    tool: 'normal-pen',
    color: '#1a1b1e',
    width: 2.5,
    opacity: 1,
    points: [
      { x: 88, y: 118, pressure: 0.5 },
      { x: 112, y: 118, pressure: 0.6 },
    ],
    bbox: { minX: 88, minY: 118, maxX: 112, maxY: 118, width: 24, height: 0 },
    createdAt: 2,
  },
  // '('
  {
    id: 'stroke_paren_open',
    tool: 'normal-pen',
    color: '#1a1b1e',
    width: 2.5,
    opacity: 1,
    points: [
      { x: 122, y: 100, pressure: 0.5 },
      { x: 116, y: 120, pressure: 0.7 },
      { x: 122, y: 140, pressure: 0.5 },
    ],
    bbox: { minX: 116, minY: 100, maxX: 122, maxY: 140, width: 6, height: 40 },
    createdAt: 3,
  },
  // 'x'
  {
    id: 'stroke_x_1',
    tool: 'normal-pen',
    color: '#1a1b1e',
    width: 2.5,
    opacity: 1,
    points: [
      { x: 130, y: 112, pressure: 0.6 },
      { x: 144, y: 136, pressure: 0.6 },
    ],
    bbox: { minX: 130, minY: 112, maxX: 144, maxY: 136, width: 14, height: 24 },
    createdAt: 4,
  },
  {
    id: 'stroke_x_2',
    tool: 'normal-pen',
    color: '#1a1b1e',
    width: 2.5,
    opacity: 1,
    points: [
      { x: 144, y: 112, pressure: 0.6 },
      { x: 130, y: 136, pressure: 0.6 },
    ],
    bbox: { minX: 130, minY: 112, maxX: 144, maxY: 136, width: 14, height: 24 },
    createdAt: 5,
  },
  // ')'
  {
    id: 'stroke_paren_close',
    tool: 'normal-pen',
    color: '#1a1b1e',
    width: 2.5,
    opacity: 1,
    points: [
      { x: 152, y: 100, pressure: 0.5 },
      { x: 158, y: 120, pressure: 0.7 },
      { x: 152, y: 140, pressure: 0.5 },
    ],
    bbox: { minX: 152, minY: 100, maxX: 158, maxY: 140, width: 6, height: 40 },
    createdAt: 6,
  },
  // '='
  {
    id: 'stroke_eq_1',
    tool: 'normal-pen',
    color: '#1a1b1e',
    width: 2.5,
    opacity: 1,
    points: [
      { x: 172, y: 118, pressure: 0.6 },
      { x: 194, y: 118, pressure: 0.6 },
    ],
    bbox: { minX: 172, minY: 118, maxX: 194, maxY: 118, width: 22, height: 0 },
    createdAt: 7,
  },
  {
    id: 'stroke_eq_2',
    tool: 'normal-pen',
    color: '#1a1b1e',
    width: 2.5,
    opacity: 1,
    points: [
      { x: 172, y: 128, pressure: 0.6 },
      { x: 194, y: 128, pressure: 0.6 },
    ],
    bbox: { minX: 172, minY: 128, maxX: 194, maxY: 128, width: 22, height: 0 },
    createdAt: 8,
  },
  // '6'
  {
    id: 'stroke_6',
    tool: 'normal-pen',
    color: '#1a1b1e',
    width: 2.8,
    opacity: 1,
    points: [
      { x: 222, y: 96, pressure: 0.6 },
      { x: 210, y: 116, pressure: 0.7 },
      { x: 212, y: 134, pressure: 0.7 },
      { x: 225, y: 134, pressure: 0.7 },
      { x: 225, y: 120, pressure: 0.6 },
      { x: 212, y: 120, pressure: 0.6 },
    ],
    bbox: { minX: 210, minY: 96, maxX: 225, maxY: 134, width: 15, height: 38 },
    createdAt: 9,
  },
  // 'x'
  {
    id: 'stroke_x2_1',
    tool: 'normal-pen',
    color: '#1a1b1e',
    width: 2.5,
    opacity: 1,
    points: [
      { x: 238, y: 112, pressure: 0.6 },
      { x: 252, y: 136, pressure: 0.6 },
    ],
    bbox: { minX: 238, minY: 112, maxX: 252, maxY: 136, width: 14, height: 24 },
    createdAt: 10,
  },
  {
    id: 'stroke_x2_2',
    tool: 'normal-pen',
    color: '#1a1b1e',
    width: 2.5,
    opacity: 1,
    points: [
      { x: 252, y: 112, pressure: 0.6 },
      { x: 238, y: 136, pressure: 0.6 },
    ],
    bbox: { minX: 238, minY: 112, maxX: 252, maxY: 136, width: 14, height: 24 },
    createdAt: 11,
  },
  // '^2'
  {
    id: 'stroke_sup_2',
    tool: 'normal-pen',
    color: '#1a1b1e',
    width: 2.2,
    opacity: 1,
    points: [
      { x: 258, y: 98, pressure: 0.5 },
      { x: 265, y: 94, pressure: 0.6 },
      { x: 268, y: 100, pressure: 0.6 },
      { x: 258, y: 110, pressure: 0.6 },
      { x: 270, y: 110, pressure: 0.6 },
    ],
    bbox: { minX: 258, minY: 94, maxX: 270, maxY: 110, width: 12, height: 16 },
    createdAt: 12,
  },
];

const createInitialCanvasObjects = (): CanvasObject[] => [
  // 1. Separate Equation Card (Col 1)
  {
    id: 'initial_eq_card_0',
    kind: 'ai-annotation',
    x: 310,
    y: 80,
    width: 280,
    height: 140,
    text: '', // Plain text explanation is placed beside the card, not inside!
    latex: 'f(x) = 6x^2',
    status: 'verified',
    sourceObjectIds: ['stroke_6', 'stroke_x2_1'],
    model: 'gemma-4-26b-a4b-it',
    backend: 'Equation 1',
    createdAt: 1,
  },
  // 2. Plain Text Explanation Beside the Equation (Col 2)
  {
    id: 'initial_eq_text_0',
    kind: 'text',
    x: 615,
    y: 80,
    text: "f(x) = 6x²: A parabolic curve with vertex at the origin. Applying the power rule: f'(x) = 6 · 2x = 12x, which gives the tangent slope at any point x on the Cartesian plane.",
    fontSize: 13,
    color: '#334155',
    createdAt: 2,
  },
  // 3. Visual Coordinate Graph Card Apart from Equation (Col 3)
  {
    id: 'initial_eq_graph_0',
    kind: 'graph',
    x: 950,
    y: 80,
    width: 320,
    height: 210,
    expressions: ['6*x^2'],
    xRange: [-6, 6],
    yRange: [-4, 12],
    title: 'Plot: y = 6x²',
    createdAt: 3,
  },
];

export default function NotebookPage() {
  const params = useParams();
  const router = useRouter();
  const notebookId = params.id as string;

  // Notebook metadata
  const [title, setTitle] = useState('Calculus Derivations');
  const [subject, setSubject] = useState('Calculus');
  const [pageId, setPageId] = useState<string>('');
  const [pageVersion, setPageVersion] = useState<number>(1);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'offline'>('saved');

  // Canvas State
  const [strokes, setStrokes] = useState<VectorStroke[]>(createSampleStrokes());
  const [objects, setObjects] = useState<CanvasObject[]>(createInitialCanvasObjects());
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const [activeTool, setActiveTool] = useState<ToolKind>('normal-pen');
  const [activeColor, setActiveColor] = useState<string>('#1a1b1e');
  const [activeWidth, setActiveWidth] = useState<number>(2.5);
  const [paperStyle, setPaperStyle] = useState<PaperStyle>('grid');
  const [theme, setTheme] = useState<CanvasTheme>('light');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // History Stacks
  const [undoStack, setUndoStack] = useState<Array<{ strokes: VectorStroke[]; objects: CanvasObject[] }>>([]);
  const [redoStack, setRedoStack] = useState<Array<{ strokes: VectorStroke[]; objects: CanvasObject[] }>>([]);

  // Modals & Panels
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [isGraphOpen, setIsGraphOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [activeMathTarget, setActiveMathTarget] = useState<string>('f(x) = 6x^2');
  const [isScanningWhiteboard, setIsScanningWhiteboard] = useState<boolean>(false);
  const [gemmaDiagnostic, setGemmaDiagnostic] = useState<string>('Gemma 4 Ready');

  // Auto-Scan (every 3 seconds) & Conversational AI Tutor
  const [autoScanEnabled, setAutoScanEnabled] = useState<boolean>(true);
  const [isVoiceTtsEnabled, setIsVoiceTtsEnabled] = useState<boolean>(true);
  const [tutorSpeaking, setTutorSpeaking] = useState<boolean>(false);
  const [tutorTeachingSummary, setTutorTeachingSummary] = useState<string>(
    'Differential Calculus & Power Rule'
  );
  const [conversationalScript, setConversationalScript] = useState<string>(
    "Welcome to Margin! As you write on the whiteboard, I auto-scan every 3 seconds, generate separate cards and graphs for each equation, and explain concepts beside your work."
  );
  const lastScannedSignatureRef = useRef<string>('');
  const isScanningRef = useRef<boolean>(false);

  // Load notebook from server
  useEffect(() => {
    async function fetchNotebook() {
      try {
        const res = await fetch(`/api/notebooks/${notebookId}`);
        if (!res.ok) return;

        const data = await res.json();
        if (data.notebook) {
          setTitle(data.notebook.title || 'Untitled Notebook');
          setSubject(data.notebook.subject || 'General Math');
          setPaperStyle((data.notebook.paperStyle as PaperStyle) || 'grid');
          setTheme((data.notebook.theme as CanvasTheme) || 'light');

          if (data.notebook.pages && data.notebook.pages.length > 0) {
            const page = data.notebook.pages[0];
            setPageId(page.id);
            setPageVersion(page.version);

            try {
              const parsed = JSON.parse(page.contentJson);
              if (parsed.strokes && parsed.strokes.length > 0) {
                setStrokes(parsed.strokes);
              }
              if (parsed.objects && parsed.objects.length > 0) {
                setObjects(parsed.objects);
              }
              if (parsed.camera) setCamera(parsed.camera);
            } catch (e) {
              console.warn('Could not parse page content json');
            }
          }
        }
      } catch (err) {
        console.warn('Fetch notebook error, running locally');
      }
    }

    fetchNotebook();
  }, [notebookId]);

  // Health check probe
  useEffect(() => {
    fetch('/api/ai/health')
      .then((r) => r.json())
      .then((d) => {
        if (d.gemma) {
          setGemmaDiagnostic(`${d.gemma.activeBackend} (${d.gemma.modelId})`);
        }
      })
      .catch(() => {});
  }, []);

  // Debounced Autosave
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const triggerAutosave = useCallback(
    (newStrokes: VectorStroke[], newObjects: CanvasObject[], newCamera: Camera) => {
      setSaveStatus('saving');
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      saveTimeoutRef.current = setTimeout(async () => {
        if (!pageId) {
          setSaveStatus('saved');
          return;
        }

        try {
          const contentJson = JSON.stringify({
            strokes: newStrokes,
            objects: newObjects,
            camera: newCamera,
            paperStyle,
            theme,
          });

          const res = await fetch(`/api/notebooks/${notebookId}/pages/${pageId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contentJson,
              expectedVersion: pageVersion,
            }),
          });

          if (res.ok) {
            const data = await res.json();
            setPageVersion(data.page.version);
            setSaveStatus('saved');
          } else {
            setSaveStatus('offline');
          }
        } catch {
          setSaveStatus('offline');
        }
      }, 1500);
    },
    [notebookId, pageId, pageVersion, paperStyle, theme]
  );

  // Stroke change with undo recording
  const handleStrokesChange = (newStrokes: VectorStroke[], isUndoable = false) => {
    if (isUndoable) {
      setUndoStack((prev) => [...prev, { strokes, objects }]);
      setRedoStack([]);
    }
    setStrokes(newStrokes);
    triggerAutosave(newStrokes, objects, camera);
  };

  const handleObjectsChange = (newObjects: CanvasObject[], isUndoable = false) => {
    if (isUndoable) {
      setUndoStack((prev) => [...prev, { strokes, objects }]);
      setRedoStack([]);
    }
    setObjects(newObjects);
    triggerAutosave(strokes, newObjects, camera);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setRedoStack((prev) => [...prev, { strokes, objects }]);
    setUndoStack((prev) => prev.slice(0, -1));
    setStrokes(previous.strokes);
    setObjects(previous.objects);
    triggerAutosave(previous.strokes, previous.objects, camera);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((prev) => [...prev, { strokes, objects }]);
    setRedoStack((prev) => prev.slice(0, -1));
    setStrokes(next.strokes);
    setObjects(next.objects);
    triggerAutosave(next.strokes, next.objects, camera);
  };

  // Insert AI Annotation card onto canvas
  const handleInsertAnnotation = (
    text: string,
    latex?: string,
    status: 'verified' | 'approximate' | 'unverified' | 'failed' = 'verified'
  ) => {
    const newAnnotation: CanvasAIAnnotation = {
      id: `ai_${Date.now()}`,
      kind: 'ai-annotation',
      x: -camera.x / camera.zoom + 120,
      y: -camera.y / camera.zoom + 120,
      width: 320,
      height: 200,
      text,
      latex,
      status,
      sourceObjectIds: selectedIds,
      model: 'gemma4:e4b',
      backend: 'Gemma 4 Gateway',
      createdAt: Date.now(),
    };

    handleObjectsChange([...objects, newAnnotation], true);
    setIsAIOpen(false);
  };

  // Insert Interactive Graph Card onto canvas
  const handleInsertGraph = (expression: string, graphTitle: string) => {
    const newGraph: CanvasGraphObject = {
      id: `graph_${Date.now()}`,
      kind: 'graph',
      x: -camera.x / camera.zoom + 140,
      y: -camera.y / camera.zoom + 120,
      width: 340,
      height: 240,
      expressions: [expression],
      xRange: [-5, 7],
      yRange: [-3, 8],
      title: graphTitle,
      createdAt: Date.now(),
    };

    handleObjectsChange([...objects, newGraph], true);
  };

  // Insert Worksheet background
  const handleInsertWorksheet = (dataUrl: string, fileName: string, isLocked: boolean) => {
    const newWorksheet: CanvasObject = {
      id: `sheet_${Date.now()}`,
      kind: 'pdf-worksheet',
      x: -camera.x / camera.zoom + 50,
      y: -camera.y / camera.zoom + 50,
      width: 600,
      height: 800,
      fileName,
      pageNumber: 1,
      dataUrl,
      isLocked,
      createdAt: Date.now(),
    };

    handleObjectsChange([...objects, newWorksheet], true);
  };

  // ==========================================
  // Quick Demonstration Scenarios Handlers
  // ==========================================

  // Scenario A: Derivative of 6x^2 -> 12x
  const runScenarioA = () => {
    setStrokes(createSampleStrokes());
    setActiveMathTarget('f(x) = 6x^2');
    setIsAIOpen(true);
  };

  // Scenario B: Detect mistake in d/dx[x^3] = 2x^2
  const runScenarioB = () => {
    setActiveMathTarget('d/dx(x^3) = 2x^2');
    setIsAIOpen(true);
    handleInsertAnnotation(
      'Error detected: Power rule was misapplied. d/dx[x^3] is 3x^2, but you wrote 2x^2. Difference is -x^2 != 0.',
      '\\frac{d}{dx}[x^3] = 3x^2',
      'failed'
    );
  };

  // Scenario C: Plot y = x^2 - 4x + 3
  const runScenarioC = () => {
    handleInsertGraph('x^2 - 4*x + 3', 'Plot: y = x^2 - 4x + 3 (Roots at x=1, x=3)');
  };

  // Scenario D: Sample Worksheet
  const runScenarioD = () => {
    setIsUploadOpen(true);
  };

  // Scenario E: Push-to-Talk Voice
  const runScenarioE = () => {
    setIsVoiceOpen(true);
  };

  // Clear Canvas
  const handleClearCanvas = () => {
    handleStrokesChange([], true);
    handleObjectsChange([], true);
    setActiveMathTarget('');
  };

  // Conversational Speech Helper: Speaks out loud what the AI is teaching
  const handleSpeakCurrentLesson = useCallback((scriptOverride?: string) => {
    const textToSpeak = scriptOverride || conversationalScript;
    if (!textToSpeak) return;

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.onstart = () => setTutorSpeaking(true);
      utterance.onend = () => setTutorSpeaking(false);
      utterance.onerror = () => setTutorSpeaking(false);
      window.speechSynthesis.speak(utterance);
    }
  }, [conversationalScript]);

  // Scan handwritten strokes on whiteboard with Gemma 4 Vision OCR
  // Generates separate cards for each equation, plain text explanations beside each,
  // separate graph cards apart from each, and speaks back conversationally!
  const handleScanWhiteboard = async (targetStrokes?: VectorStroke[], isAuto: boolean = false): Promise<string> => {
    const strokesToScan =
      targetStrokes ||
      (selectedIds.length > 0 ? strokes.filter((s) => selectedIds.includes(s.id)) : strokes);

    if (!strokesToScan || strokesToScan.length === 0) {
      return activeMathTarget;
    }

    if (isScanningRef.current) return activeMathTarget;
    isScanningRef.current = true;
    setIsScanningWhiteboard(true);

    try {
      const pngDataUrl = rasterizeStrokesToPng(strokesToScan);
      if (!pngDataUrl) return activeMathTarget;

      const res = await fetch('/api/ai/recognize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: pngDataUrl,
          sourceObjectIds: strokesToScan.map((s) => s.id),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const primaryMath = data.latex || data.expressions?.[0]?.latex || activeMathTarget;
        if (primaryMath) {
          setActiveMathTarget(primaryMath);
        }

        // 1. Separate Equations Handling
        const expressions: Array<{
          latex: string;
          plainExplanation?: string;
          isGraphable?: boolean;
          graphExpression?: string;
        }> =
          Array.isArray(data.expressions) && data.expressions.length > 0
            ? data.expressions
            : [
                {
                  latex: primaryMath,
                  plainExplanation:
                    data.plainText ||
                    `Analysis of ${primaryMath}: Functional relationship on the Cartesian coordinate plane.`,
                  isGraphable: true,
                  graphExpression: primaryMath.replace(/^[fy]\(?[x]?\)?\s*=\s*/i, '').trim() || 'x^2',
                },
              ];

        // Position calculations from stroke bounds to prevent overlapping handwritten strokes
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const s of strokesToScan) {
          if (s.bbox) {
            minX = Math.min(minX, s.bbox.minX);
            maxX = Math.max(maxX, s.bbox.maxX);
            minY = Math.min(minY, s.bbox.minY);
            maxY = Math.max(maxY, s.bbox.maxY);
          }
        }

        // Layout positioning:
        // If strokes are on the left (maxX < 500), place the 3-column rows cleanly to the right.
        // If strokes span horizontally (maxX >= 500), place the 3-column rows below the strokes.
        let baseX: number;
        let baseY: number;
        if (isFinite(maxX) && maxX > 0) {
          if (maxX < 500) {
            baseX = maxX + 40;
            baseY = Math.max(isFinite(minY) ? minY : 80, -camera.y / camera.zoom + 70);
          } else {
            baseX = Math.max(isFinite(minX) ? minX : 80, -camera.x / camera.zoom + 60);
            baseY = maxY + 40;
          }
        } else {
          baseX = -camera.x / camera.zoom + 80;
          baseY = -camera.y / camera.zoom + 90;
        }

        const newObjects: CanvasObject[] = [];

        expressions.forEach((expr, idx) => {
          // Strictly separated row per equation: 240px vertical pitch guarantees ZERO vertical collision
          const rowY = baseY + idx * 240;
          const cleanLatex = expr.latex || `Equation ${idx + 1}`;

          // Column 1: SEPARATE Equation Card (No plain text explanation inside)
          const eqCard: CanvasAIAnnotation = {
            id: `eq_card_${idx}_${Date.now()}`,
            kind: 'ai-annotation',
            x: baseX,
            y: rowY,
            width: 280,
            height: 140,
            text: '', // Plain text explanation is placed beside the card, not inside!
            latex: cleanLatex,
            status: 'verified',
            sourceObjectIds: strokesToScan.map((s) => s.id),
            model: 'gemma-4-26b-a4b-it',
            backend: `Equation ${idx + 1}`,
            createdAt: Date.now() + idx * 3,
          };
          newObjects.push(eqCard);

          // Column 2: PLAIN TEXT EXPLANATION BESIDE THE EQUATION (25px horizontal gap)
          const textBeside: NotebookCanvasText = {
            id: `eq_text_${idx}_${Date.now()}`,
            kind: 'text',
            x: baseX + 305, // Positioned BESIDE the equation!
            y: rowY,
            text:
              expr.plainExplanation ||
              `${cleanLatex}: Evaluated on the coordinate plane. Differentiate with respect to x using standard calculus rules.`,
            fontSize: 13,
            color: theme === 'dark' ? '#cbd5e1' : '#334155',
            createdAt: Date.now() + idx * 3 + 1,
          };
          newObjects.push(textBeside);

          // Column 3: SEPARATE GRAPH CARD APART FROM THE EQUATION (25px horizontal gap)
          if (expr.isGraphable !== false) {
            const plotExpr =
              (expr.graphExpression || cleanLatex)
                .replace(/^[fy]\(?[x]?\)?\s*=\s*/i, '')
                .replace(/\\cdot/g, '*')
                .trim() || 'x^2';

            const graphCard: CanvasGraphObject = {
              id: `eq_graph_${idx}_${Date.now()}`,
              kind: 'graph',
              x: baseX + 640, // Positioned APART in Column 3
              y: rowY,
              width: 320,
              height: 210,
              expressions: [plotExpr],
              xRange: [-6, 6],
              yRange: [-4, 12],
              title: `Plot: y = ${plotExpr}`,
              createdAt: Date.now() + idx * 3 + 2,
            };
            newObjects.push(graphCard);
          }
        });

        // Replace previously auto-generated scan objects so old & new cards NEVER overlap or pile up
        setObjects((prev) => {
          const persistent = prev.filter(
            (o) =>
              !o.id.startsWith('eq_card_') &&
              !o.id.startsWith('eq_text_') &&
              !o.id.startsWith('eq_graph_') &&
              !o.id.startsWith('initial_eq_') &&
              o.id !== 'ai_sample_welcome'
          );
          return [...persistent, ...newObjects];
        });

        // Update Conversational AI script & summary
        const script =
          data.conversationalScript ||
          `I've scanned your whiteboard! Here is what I am teaching you: for ${expressions.map((e, i) => `equation ${i + 1}, ${e.latex}`).join('; and ')}. I have placed plain explanations beside each equation and generated separate coordinate graphs below.`;

        setConversationalScript(script);
        if (data.overallTeachingSummary) {
          setTutorTeachingSummary(data.overallTeachingSummary);
        }

        // Conversational voice output: Tell the student back what it is teaching them!
        if (isVoiceTtsEnabled && typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(script);
          utterance.rate = 1.0;
          utterance.pitch = 1.0;
          utterance.onstart = () => setTutorSpeaking(true);
          utterance.onend = () => setTutorSpeaking(false);
          utterance.onerror = () => setTutorSpeaking(false);
          window.speechSynthesis.speak(utterance);
        }

        return primaryMath;
      }
    } catch (err) {
      console.warn('Whiteboard scan failed, keeping current formula', err);
    } finally {
      setIsScanningWhiteboard(false);
      isScanningRef.current = false;
    }
    return activeMathTarget;
  };

  // 1. FAST PEN-UP IDLE DEBOUNCE (600ms): Scan whiteboard immediately when user pauses drawing!
  useEffect(() => {
    if (!autoScanEnabled || strokes.length === 0) return;

    const debounceTimer = setTimeout(() => {
      if (isScanningRef.current) return;
      const lastStroke = strokes[strokes.length - 1];
      const signature = `${strokes.length}_${lastStroke?.id || ''}_${lastStroke?.points?.length || 0}_${lastStroke?.createdAt || 0}`;

      if (signature !== lastScannedSignatureRef.current) {
        lastScannedSignatureRef.current = signature;
        handleScanWhiteboard(strokes, true);
      }
    }, 600);

    return () => clearTimeout(debounceTimer);
  }, [strokes, autoScanEnabled]);

  // 2. Periodic Safety Auto-scan every 3 seconds
  useEffect(() => {
    if (!autoScanEnabled) return;

    const interval = setInterval(() => {
      if (isScanningRef.current || strokes.length === 0) return;

      const lastStroke = strokes[strokes.length - 1];
      const signature = `${strokes.length}_${lastStroke?.id || ''}_${lastStroke?.points?.length || 0}_${lastStroke?.createdAt || 0}`;

      if (signature !== lastScannedSignatureRef.current) {
        lastScannedSignatureRef.current = signature;
        handleScanWhiteboard(strokes, true);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [autoScanEnabled, strokes]);

  // Agent 3 Co-Write Handler: Writes directly to whiteboard
  const handleCoWrite = (latex: string, note: string) => {
    const coWriteCard: CanvasAIAnnotation = {
      id: `cowrite_${Date.now()}`,
      kind: 'ai-annotation',
      x: -camera.x / camera.zoom + 100,
      y: -camera.y / camera.zoom + 220,
      width: 320,
      height: 160,
      text: note || 'Next algebraic step written by Scribe Companion Agent.',
      latex: latex || '= 12x',
      status: 'verified',
      sourceObjectIds: [],
      model: 'gemma4:e4b',
      backend: 'Scribe Whiteboard Agent',
      createdAt: Date.now(),
    };
    handleObjectsChange([...objects, coWriteCard], true);
  };

  // Co-write specifically below selected math
  const handleCoWriteForSelection = async (expression: string, lastPos: { x: number; y: number }) => {
    try {
      const res = await fetch('/api/ai/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cowrite',
          payload: { currentMath: expression, lastPosition: lastPos },
        }),
      });
      const data = await res.json();
      if (data.result?.latex) {
        const coWriteCard: CanvasAIAnnotation = {
          id: `cowrite_${Date.now()}`,
          kind: 'ai-annotation',
          x: lastPos.x,
          y: lastPos.y,
          width: 300,
          height: 150,
          text: data.result.explanation || 'Next step written by Scribe.',
          latex: data.result.latex,
          status: 'verified',
          sourceObjectIds: selectedIds,
          model: 'gemma4:e4b',
          backend: 'Scribe Companion',
          createdAt: Date.now(),
        };
        handleObjectsChange([...objects, coWriteCard], true);
      }
    } catch (err) {
      console.warn('Co-write selection failed', err);
    }
  };

  // Agent 6 Beautify Handler: Transforms scribbles into pristine typeset math
  const handleBeautifyHandwriting = () => {
    const targetLatex = activeMathTarget || 'f(x) = 6x^2';
    const beautifiedCard: CanvasAIAnnotation = {
      id: `beautified_${Date.now()}`,
      kind: 'ai-annotation',
      x: -camera.x / camera.zoom + 80,
      y: -camera.y / camera.zoom + 80,
      width: 280,
      height: 120,
      text: 'Converted handwritten scribble into pristine, aligned LaTeX.',
      latex: targetLatex,
      status: 'verified',
      sourceObjectIds: selectedIds,
      model: 'gemma4:e4b',
      backend: 'Callisto Beautifier Agent',
      createdAt: Date.now(),
    };
    handleObjectsChange([...objects, beautifiedCard], true);
  };

  // Beautify selection directly: deletes scribbled strokes and places typeset card at bbox
  const handleBeautifySelection = (selectedStrokeIds: string[], bbox: BoundingBox) => {
    const targetLatex = activeMathTarget || 'f(x) = 6x^2';
    const beautifiedCard: CanvasAIAnnotation = {
      id: `beautified_${Date.now()}`,
      kind: 'ai-annotation',
      x: bbox.minX,
      y: bbox.minY,
      width: Math.max(bbox.width + 20, 260),
      height: Math.max(bbox.height + 20, 110),
      text: 'Converted handwritten scribble into neat KaTeX math card.',
      latex: targetLatex,
      status: 'verified',
      sourceObjectIds: selectedStrokeIds,
      model: 'gemma4:e4b',
      backend: 'Callisto Beautifier Agent',
      createdAt: Date.now(),
    };

    // Remove the scribbled strokes and add the beautified card
    const remainingStrokes = strokes.filter((s) => !selectedStrokeIds.includes(s.id));
    setStrokes(remainingStrokes);
    setSelectedIds([]);
    handleObjectsChange([...objects, beautifiedCard], true);
  };

  return (
    <div className={`relative w-screen h-screen overflow-hidden flex flex-col font-sans ${
      theme === 'dark' ? 'bg-[#18191c] text-white' : 'bg-[#fbfbfa] text-slate-900'
    }`}>
      {/* Top Navigation Bar */}
      <header className="z-30 h-14 border-b border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            title="Back to Notebooks"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>

          <div className="hidden sm:flex items-center gap-1.5 border-r border-slate-200 dark:border-slate-800 pr-3 mr-0.5">
            <span className="font-extrabold text-sm tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Margin</span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="font-semibold text-sm bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 rounded px-1.5 py-0.5 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
              />
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                {subject}
              </span>
            </div>
          </div>
        </div>

        {/* Center: Active Whiteboard Math + Auto-Scan Status & Conversational Controls */}
        <div className="flex items-center gap-2.5 text-xs">
          {/* Auto-Scan 3s Status & Toggle */}
          <button
            onClick={() => setAutoScanEnabled(!autoScanEnabled)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all shadow-sm ${
              autoScanEnabled
                ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
            }`}
            title={autoScanEnabled ? "Auto-Scan runs fully every 3 seconds. Click to pause." : "Auto-Scan is paused. Click to enable 3s auto-scan."}
          >
            <span className={`w-2 h-2 rounded-full ${autoScanEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
            <span>Auto-Scan: {autoScanEnabled ? '3s Active' : 'Paused'}</span>
            {isScanningWhiteboard && <span className="animate-spin text-emerald-600 dark:text-emerald-400 font-bold ml-0.5">⟳</span>}
          </button>

          {/* Conversational "Tell Me What You're Teaching" Button */}
          <button
            onClick={() => handleSpeakCurrentLesson()}
            disabled={tutorSpeaking}
            className={`hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold transition-all shadow-sm ${
              tutorSpeaking
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white animate-pulse'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500'
            }`}
            title="Have the Conversational AI tell you aloud what it is teaching you!"
          >
            <Volume2 className={`w-3.5 h-3.5 ${tutorSpeaking ? 'animate-bounce' : ''}`} />
            <span>{tutorSpeaking ? 'Teaching Live...' : "Tell Me What You're Teaching"}</span>
          </button>

          {/* Voice Output Mute/Unmute */}
          <button
            onClick={() => {
              if (tutorSpeaking && typeof window !== 'undefined' && 'speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                setTutorSpeaking(false);
              }
              setIsVoiceTtsEnabled(!isVoiceTtsEnabled);
            }}
            className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={isVoiceTtsEnabled ? 'Mute AI Voice' : 'Unmute AI Voice'}
          >
            {isVoiceTtsEnabled ? (
              <Volume2 className="w-3.5 h-3.5 text-blue-500" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-slate-400" />
            )}
          </button>

          {/* Active Whiteboard Expression Pill */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700 shadow-sm">
            <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 flex items-center gap-1 select-none">
              <span>Whiteboard Math:</span>
            </span>

            <input
              type="text"
              value={activeMathTarget}
              onChange={(e) => setActiveMathTarget(e.target.value)}
              className="text-xs font-mono font-semibold bg-transparent border-b border-transparent hover:border-blue-400 focus:border-blue-500 focus:outline-none text-blue-600 dark:text-blue-400 w-24 sm:w-36 transition-colors"
              title="Active whiteboard math input. Click to edit anytime!"
              placeholder="e.g. f(x) = 6x^2"
            />

            <button
              onClick={() => handleScanWhiteboard()}
              disabled={isScanningWhiteboard}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
              title="Scan canvas handwriting with Gemma 4 Vision OCR"
            >
              <Scan className={`w-3.5 h-3.5 ${isScanningWhiteboard ? 'animate-spin text-emerald-500' : ''}`} />
            </button>
          </div>

          <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900/60 text-blue-700 dark:text-blue-300 text-[11px] font-mono">
            <Cpu className="w-3 h-3 text-blue-500" />
            <span>AI: {gemmaDiagnostic}</span>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAIOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-500 transition-colors shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-200" />
            <span>Ask Gemma 4</span>
          </button>
        </div>
      </header>

      {/* Main Vector Drawing Canvas Area */}
      <main className="relative flex-1 w-full h-[calc(100vh-3.5rem)] overflow-hidden">
        <Toolbar
          activeTool={activeTool}
          activeColor={activeColor}
          activeWidth={activeWidth}
          paperStyle={paperStyle}
          theme={theme}
          zoom={camera.zoom}
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
          onToolSelect={setActiveTool}
          onColorSelect={setActiveColor}
          onWidthSelect={setActiveWidth}
          onPaperStyleChange={setPaperStyle}
          onThemeToggle={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onZoomIn={() => setCamera((c) => ({ ...c, zoom: Math.min(c.zoom * 1.15, 4.0) }))}
          onZoomOut={() => setCamera((c) => ({ ...c, zoom: Math.max(c.zoom * 0.85, 0.25) }))}
          onZoomReset={() => setCamera((c) => ({ ...c, zoom: 1 }))}
          onOpenAI={() => setIsAIOpen(true)}
          onOpenGraph={() => setIsGraphOpen(true)}
          onOpenUpload={() => setIsUploadOpen(true)}
          onToggleVoice={() => setIsVoiceOpen((v) => !v)}
          isVoiceActive={isVoiceOpen}
        />

        <VectorCanvas
          strokes={strokes}
          objects={objects}
          camera={camera}
          activeTool={activeTool}
          activeColor={activeColor}
          activeWidth={activeWidth}
          paperStyle={paperStyle}
          theme={theme}
          selectedIds={selectedIds}
          activeMathExpression={activeMathTarget}
          onStrokesChange={handleStrokesChange}
          onObjectsChange={handleObjectsChange}
          onCameraChange={setCamera}
          onSelectionChange={setSelectedIds}
          onAskAIForSelection={(expr) => {
            setActiveMathTarget(expr);
            setIsAIOpen(true);
          }}
          onGraphForSelection={(expr) => {
            handleInsertGraph(expr, `Plot: ${expr}`);
          }}
          onBeautifySelection={handleBeautifySelection}
          onCoWriteSelection={handleCoWriteForSelection}
        />

        {/* 6-Agent AI Team Dock */}
        <AgentTeamDock
          currentMath={activeMathTarget}
          onCoWrite={handleCoWrite}
          onInsertGraph={handleInsertGraph}
          onBeautifyHandwriting={handleBeautifyHandwriting}
          onUpdateMath={setActiveMathTarget}
          onScanWhiteboard={() => handleScanWhiteboard()}
          isScanning={isScanningWhiteboard}
        />

        {/* Conversational AI Floating Teaching Dock */}
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 w-full max-w-2xl px-4 pointer-events-none">
          <div className="pointer-events-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200/90 dark:border-slate-800 p-3.5 transition-all">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className={`p-1.5 rounded-xl ${tutorSpeaking ? 'bg-amber-100 dark:bg-amber-950 text-amber-600 animate-pulse' : 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400'}`}>
                  <Sparkles className="w-4 h-4" />
                </span>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                  Conversational AI Tutor
                </span>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-semibold truncate max-w-[260px]">
                  {tutorTeachingSummary}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleSpeakCurrentLesson()}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold transition-colors ${
                    tutorSpeaking
                      ? 'bg-amber-500 text-white animate-pulse'
                      : 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900'
                  }`}
                  title="Have tutor speak aloud what it is teaching you"
                >
                  <Volume2 className={`w-3.5 h-3.5 ${tutorSpeaking ? 'animate-bounce' : ''}`} />
                  <span>{tutorSpeaking ? 'Teaching Live...' : 'Listen'}</span>
                </button>

                <button
                  onClick={() => setIsVoiceOpen(true)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900 transition-colors"
                  title="Open voice conversation"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>Talk</span>
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-sans flex items-start gap-2">
              <span className="text-blue-600 dark:text-blue-400 font-bold shrink-0">Tutor:</span>
              <span className="line-clamp-2 hover:line-clamp-none transition-all">{conversationalScript}</span>
            </p>
          </div>
        </div>

        {/* Live Interactive Scenario Floating Bar */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-35 flex items-center gap-1.5 p-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200/90 dark:border-slate-800 text-xs">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-2 pr-1 select-none">
            Demo Scenarios:
          </span>

          <button
            onClick={runScenarioA}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-300 font-medium hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors shadow-sm"
            title="Scenario A: Differentiate f(x) = 6x^2"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-500" />
            <span>A: 6x² Derivative</span>
          </button>

          <button
            onClick={runScenarioB}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 font-medium hover:bg-amber-100 dark:hover:bg-amber-900 transition-colors shadow-sm"
            title="Scenario B: Check step error in d/dx[x^3] = 2x^2"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span>B: Catch Mistake</span>
          </button>

          <button
            onClick={runScenarioC}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-purple-50 dark:bg-purple-950/70 text-purple-600 dark:text-purple-300 font-medium hover:bg-purple-100 dark:hover:bg-purple-900 transition-colors shadow-sm"
            title="Scenario C: Plot y = x^2 - 4x + 3 with roots"
          >
            <LineChart className="w-3.5 h-3.5 text-purple-500" />
            <span>C: Graph</span>
          </button>

          <button
            onClick={runScenarioD}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-300 font-medium hover:bg-emerald-100 dark:hover:bg-emerald-900 transition-colors shadow-sm"
            title="Scenario D: Upload & Annotate Worksheet"
          >
            <FileText className="w-3.5 h-3.5 text-emerald-500" />
            <span>D: Worksheet</span>
          </button>

          <button
            onClick={runScenarioE}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/70 text-rose-600 dark:text-rose-300 font-medium hover:bg-rose-100 dark:hover:bg-rose-900 transition-colors shadow-sm"
            title="Scenario E: Push-to-Talk Voice Tutor"
          >
            <Mic className="w-3.5 h-3.5 text-rose-500" />
            <span>E: Voice</span>
          </button>

          <button
            onClick={handleClearCanvas}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ml-1"
            title="Clear Canvas"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </main>

      {/* Gemma 4 AI Assistant Drawer */}
      <AIPanel
        isOpen={isAIOpen}
        onClose={() => setIsAIOpen(false)}
        selectedMath={activeMathTarget}
        onInsertAnnotation={handleInsertAnnotation}
      />

      {/* Interactive Graphing Modal */}
      <InteractiveGraphModal
        isOpen={isGraphOpen}
        onClose={() => setIsGraphOpen(false)}
        onInsertToCanvas={handleInsertGraph}
        initialExpression="x^2 - 4*x + 3"
      />

      {/* Worksheet & PDF Import Modal */}
      <WorksheetModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onInsertWorksheet={handleInsertWorksheet}
      />

      {/* Push-to-Talk Voice Gate with Conversational Response */}
      <VoiceGate
        isOpen={isVoiceOpen}
        onClose={() => setIsVoiceOpen(false)}
        hasSelection={selectedIds.length > 0}
        currentMath={activeMathTarget}
        onIntentAnswer={(intent, transcript) => {
          setActiveMathTarget('Selected Math');
          setIsAIOpen(true);
        }}
      />
    </div>
  );
}
