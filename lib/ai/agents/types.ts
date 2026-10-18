export type AgentRole = 
  | 'overseer'       // 1. Tracks & monitors problem state
  | 'analyzer'       // 2. Classifies and breaks down the problem
  | 'cowriter'       // 3. Writes on the whiteboard with the student
  | 'explainer'      // 4. Socratic tutor & audio explainer
  | 'artifact'       // 5. Generates graphs, plots, diagrams
  | 'beautifier';    // 6. Converts scribbly handwriting to neat typeset math

export interface AgentStatus {
  id: AgentRole;
  name: string;
  avatar: string;
  roleDescription: string;
  state: 'idle' | 'observing' | 'thinking' | 'writing' | 'speaking' | 'complete';
  lastMessage?: string;
  color: string;
}

export interface ProblemAnalysis {
  title: string;
  subject: string;
  topic: string;
  difficulty: 'Introductory' | 'Intermediate' | 'Advanced';
  given: string[];
  targetGoal: string;
  keyFormulas: string[];
  suggestedFirstStep: string;
}

export interface CoWriteStep {
  latex: string;
  explanation: string;
  targetPosition: { x: number; y: number };
  strokeCoordinates?: Array<Array<{ x: number; y: number; pressure?: number }>>;
}

export interface BeautifyResult {
  originalStrokeIds: string[];
  recognizedLatex: string;
  cleanText: string;
  confidence: 'high' | 'medium' | 'low';
  replacementCard: {
    x: number;
    y: number;
    width: number;
    height: number;
    latex: string;
  };
}
