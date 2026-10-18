export type ToolKind = 
  | 'fine-pen'
  | 'normal-pen'
  | 'marker'
  | 'eraser'
  | 'area-eraser'
  | 'lasso-select'
  | 'rect-select'
  | 'hand'
  | 'shape'
  | 'text'
  | 'math'
  | 'graph';

export type ShapeKind = 'line' | 'arrow' | 'rectangle' | 'ellipse' | 'axes';

export type PaperStyle = 'blank' | 'lined' | 'dotted' | 'grid' | 'graph';

export type CanvasTheme = 'light' | 'dark';

export interface Point {
  x: number;
  y: number;
  pressure?: number;
  time?: number;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface VectorStroke {
  id: string;
  tool: 'fine-pen' | 'normal-pen' | 'marker';
  color: string;
  width: number;
  opacity: number;
  points: Point[];
  bbox: BoundingBox;
  createdAt: number;
}

export interface CanvasShape {
  id: string;
  kind: 'shape';
  shapeKind: ShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  strokeWidth: number;
  fillColor?: string;
  createdAt: number;
}

export interface CanvasText {
  id: string;
  kind: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
  isMath?: boolean;
  createdAt: number;
}

export interface CanvasGraphObject {
  id: string;
  kind: 'graph';
  x: number;
  y: number;
  width: number;
  height: number;
  expressions: string[];
  xRange: [number, number];
  yRange: [number, number];
  title?: string;
  createdAt: number;
}

export interface CanvasAIAnnotation {
  id: string;
  kind: 'ai-annotation';
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  latex?: string;
  status: 'verified' | 'approximate' | 'unverified' | 'failed';
  sourceObjectIds: string[];
  model: string;
  backend: string;
  tone?: string;
  createdAt: number;
}

export interface CanvasPDFWorksheet {
  id: string;
  kind: 'pdf-worksheet';
  x: number;
  y: number;
  width: number;
  height: number;
  fileName: string;
  pageNumber: number;
  dataUrl: string;
  isLocked: boolean;
  createdAt: number;
}

export type CanvasObject = 
  | CanvasShape 
  | CanvasText 
  | CanvasGraphObject 
  | CanvasAIAnnotation 
  | CanvasPDFWorksheet;

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface PageDocument {
  id: string;
  pageNumber: number;
  version: number;
  camera: Camera;
  strokes: VectorStroke[];
  objects: CanvasObject[];
  paperStyle: PaperStyle;
  theme: CanvasTheme;
  updatedAt: number;
}

export type TutorMode = 'hint' | 'explain' | 'check' | 'next-step' | 'full-solution';
export type TutorTone = 'neutral' | 'encouraging' | 'socratic' | 'roast';
export type ExplanationDepth = 'short' | 'guided' | 'detailed';
export type VerificationStatus = 'verified' | 'approximate' | 'unverified' | 'failed';

export interface TutorStep {
  id: string;
  stepNumber: number;
  explanation: string;
  latex?: string;
  verificationStatus: VerificationStatus;
  sourceObjectIds: string[];
  warning?: string;
}

export interface TutorResponse {
  requestId: string;
  mode: TutorMode;
  summary: string;
  steps: TutorStep[];
  assumptions: string[];
  warnings: string[];
  canInsertToCanvas: boolean;
  proposedAnnotation?: {
    latex?: string;
    text: string;
    status: VerificationStatus;
  };
  durationMs: number;
  model: string;
  backend: string;
}

export interface MathRecognitionResult {
  latex: string;
  plainText: string;
  equationCount: number;
  expressions: Array<{
    latex: string;
    sourceObjectIds: string[];
    readingOrder: number;
    uncertaintyReasons: string[];
  }>;
  assumptions: string[];
  ambiguities: string[];
  overallConfidenceLabel: 'high' | 'medium' | 'low';
  cropImageBase64?: string;
}
