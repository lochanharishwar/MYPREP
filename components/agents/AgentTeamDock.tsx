'use client';

import React, { useState } from 'react';
import {
  Eye,
  Search,
  PenTool,
  Volume2,
  VolumeX,
  LineChart,
  Wand2,
  ChevronUp,
  ChevronDown,
  Sparkles,
  CheckCircle2,
  Play,
  X,
  Edit3,
  Scan,
} from 'lucide-react';
import { AgentRole, AgentStatus, ProblemAnalysis } from '@/lib/ai/agents/types';
import { KatexRenderer } from '@/components/math/KatexRenderer';

interface AgentTeamDockProps {
  currentMath: string;
  onCoWrite: (latex: string, note: string) => void;
  onInsertGraph: (expression: string, title: string) => void;
  onBeautifyHandwriting: () => void;
  onUpdateMath?: (math: string) => void;
  onScanWhiteboard?: () => void;
  isScanning?: boolean;
}

const AGENTS: Array<{
  id: AgentRole;
  name: string;
  title: string;
  roleDescription: string;
  iconName: string;
  color: string;
}> = [
  {
    id: 'overseer',
    name: 'Atlas',
    title: 'Problem Overseer',
    roleDescription: 'Tracks problem state & coordinates the agent team',
    iconName: 'Eye',
    color: 'from-blue-600 to-cyan-600',
  },
  {
    id: 'analyzer',
    name: 'Hypatia',
    title: 'Problem Analyzer',
    roleDescription: 'Identifies branch, difficulty, givens & target goal',
    iconName: 'Search',
    color: 'from-indigo-600 to-purple-600',
  },
  {
    id: 'cowriter',
    name: 'Scribe',
    title: 'Whiteboard Co-Writer',
    roleDescription: 'Writes formulas and steps on the canvas with you',
    iconName: 'PenTool',
    color: 'from-emerald-600 to-teal-600',
  },
  {
    id: 'explainer',
    name: 'Socrates',
    title: 'Voice Explainer',
    roleDescription: 'Explains concepts clearly and speaks explanations aloud',
    iconName: 'Volume2',
    color: 'from-amber-600 to-orange-600',
  },
  {
    id: 'artifact',
    name: 'Euclid',
    title: 'Artifact & Grapher',
    roleDescription: 'Creates interactive coordinate graphs and visual plots',
    iconName: 'LineChart',
    color: 'from-pink-600 to-rose-600',
  },
  {
    id: 'beautifier',
    name: 'Callisto',
    title: 'Scribble Beautifier',
    roleDescription: 'Transforms messy scribbles into pristine typeset math',
    iconName: 'Wand2',
    color: 'from-violet-600 to-fuchsia-600',
  },
];

export const AgentTeamDock: React.FC<AgentTeamDockProps> = ({
  currentMath,
  onCoWrite,
  onInsertGraph,
  onBeautifyHandwriting,
  onUpdateMath,
  onScanWhiteboard,
  isScanning,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeAgent, setActiveAgent] = useState<AgentRole | null>(null);
  const [loadingAgent, setLoadingAgent] = useState<AgentRole | null>(null);
  const [agentOutput, setAgentOutput] = useState<{ agent: AgentRole; data: any } | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isEditingMath, setIsEditingMath] = useState(false);

  // Trigger specific agent action
  const invokeAgent = async (role: AgentRole) => {
    setActiveAgent(role);
    setLoadingAgent(role);

    try {
      if (role === 'cowriter') {
        const res = await fetch('/api/ai/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'cowrite',
            payload: { currentMath, lastPosition: { x: 120, y: 140 } },
          }),
        });
        const data = await res.json();
        setAgentOutput({ agent: 'cowriter', data: data.result });
        // Automatically write next step to whiteboard!
        if (data.result?.latex) {
          onCoWrite(data.result.latex, data.result.explanation);
        }
      } else if (role === 'analyzer') {
        const res = await fetch('/api/ai/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'analyze',
            payload: { mathExpression: currentMath },
          }),
        });
        const data = await res.json();
        setAgentOutput({ agent: 'analyzer', data: data.result });
      } else if (role === 'explainer') {
        const res = await fetch('/api/ai/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'explain',
            payload: { topicOrQuestion: 'Explain this mathematical concept', mathExpression: currentMath },
          }),
        });
        const data = await res.json();
        setAgentOutput({ agent: 'explainer', data: data.result });

        // Speak aloud using browser TTS
        if (data.result?.spokenScript && typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(data.result.spokenScript);
          utterance.rate = 1.0;
          utterance.onstart = () => setIsSpeaking(true);
          utterance.onend = () => setIsSpeaking(false);
          utterance.onerror = () => setIsSpeaking(false);
          window.speechSynthesis.speak(utterance);
        }
      } else if (role === 'artifact') {
        const res = await fetch('/api/ai/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'artifact',
            payload: { mathExpression: currentMath },
          }),
        });
        const data = await res.json();
        setAgentOutput({ agent: 'artifact', data: data.result });
        if (data.result?.expression) {
          onInsertGraph(data.result.expression, data.result.title || 'Interactive Function Plot');
        }
      } else if (role === 'beautifier') {
        onBeautifyHandwriting();
        setAgentOutput({
          agent: 'beautifier',
          data: {
            cleanLatex: currentMath,
            message: 'Handwriting detected and converted into pristine aligned LaTeX typeset format.',
          },
        });
      } else if (role === 'overseer') {
        const res = await fetch('/api/ai/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'oversee',
            payload: { mathContext: currentMath },
          }),
        });
        const data = await res.json();
        setAgentOutput({ agent: 'overseer', data: data.result });
      }
    } catch (err: any) {
      alert(`Agent invocation error: ${err.message}`);
    } finally {
      setLoadingAgent(null);
    }
  };

  const stopSpeaking = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  const renderIcon = (name: string, className = 'w-4 h-4') => {
    switch (name) {
      case 'Eye':
        return <Eye className={className} />;
      case 'Search':
        return <Search className={className} />;
      case 'PenTool':
        return <PenTool className={className} />;
      case 'Volume2':
        return <Volume2 className={className} />;
      case 'LineChart':
        return <LineChart className={className} />;
      case 'Wand2':
        return <Wand2 className={className} />;
      default:
        return <Sparkles className={className} />;
    }
  };

  return (
    <>
      {/* Floating Agent Dock on Top Left */}
      <div className="absolute top-16 left-6 z-30 flex flex-col items-start gap-2 max-w-sm">
        {/* Toggle Pill */}
        <button
          onClick={() => setIsExpanded((prev) => !prev)}
          className="flex items-center gap-2 px-3.5 py-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/80 dark:border-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:shadow-2xl transition-all"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="flex items-center gap-1">
            <span>6-Agent AI Team</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-300">
              Active
            </span>
          </span>
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
        </button>

        {/* Expanded Agent Cards */}
        {isExpanded && (
          <div className="w-80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-3 space-y-2 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 text-[11px] text-slate-400">
              <span className="font-semibold uppercase tracking-wider">Specialized AI Agents</span>
              <span>Click to Trigger</span>
            </div>

            {/* Active Whiteboard Input Math Banner */}
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium">
                <span className="uppercase tracking-wider font-semibold text-slate-600 dark:text-slate-400">
                  Whiteboard Input Math
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setIsEditingMath(!isEditingMath)}
                    className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                    title="Directly edit whiteboard formula"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>{isEditingMath ? 'Save' : 'Edit'}</span>
                  </button>
                  {onScanWhiteboard && (
                    <button
                      onClick={onScanWhiteboard}
                      disabled={isScanning}
                      className="text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-0.5"
                      title="Scan handwritten strokes on whiteboard with Gemma 4 Vision"
                    >
                      <Scan className={`w-3 h-3 ${isScanning ? 'animate-spin' : ''}`} />
                      <span>{isScanning ? 'Scanning...' : 'Scan Canvas'}</span>
                    </button>
                  )}
                </div>
              </div>

              {isEditingMath ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={currentMath}
                    onChange={(e) => onUpdateMath?.(e.target.value)}
                    className="w-full text-xs font-mono px-2 py-1 rounded bg-white dark:bg-slate-900 border border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="e.g. f(x) = 6x^2 or 2x + 3 = 7"
                    autoFocus
                  />
                  <button
                    onClick={() => setIsEditingMath(false)}
                    className="px-2 py-1 text-xs rounded bg-blue-600 text-white font-medium hover:bg-blue-500"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => setIsEditingMath(true)}
                  className="cursor-pointer text-center font-mono text-xs py-1.5 px-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200/80 dark:border-slate-800 text-blue-700 dark:text-blue-300 hover:border-blue-400 transition-colors"
                  title="Click to edit formula"
                >
                  <KatexRenderer math={currentMath || 'f(x) = 6x^2'} />
                </div>
              )}
            </div>

            <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
              {AGENTS.map((agent) => {
                const isLoading = loadingAgent === agent.id;

                return (
                  <button
                    key={agent.id}
                    onClick={() => invokeAgent(agent.id)}
                    disabled={isLoading}
                    className="w-full text-left p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 hover:border-blue-300 dark:hover:border-blue-700 bg-slate-50/50 dark:bg-slate-950/40 hover:bg-white dark:hover:bg-slate-900 transition-all flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`p-2 rounded-xl bg-gradient-to-tr ${agent.color} text-white shadow-sm group-hover:scale-105 transition-transform`}>
                        {renderIcon(agent.iconName, 'w-4 h-4')}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            {agent.title}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            ({agent.name})
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 line-clamp-1">
                          {agent.roleDescription}
                        </p>
                      </div>
                    </div>

                    <div className="pl-2">
                      {isLoading ? (
                        <Sparkles className="w-4 h-4 text-blue-500 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Agent Response Modal / Drawer */}
      {agentOutput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 font-bold">
                  {renderIcon(
                    AGENTS.find((a) => a.id === agentOutput.agent)?.iconName || 'Sparkles',
                    'w-4 h-4'
                  )}
                </span>
                <div>
                  <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {AGENTS.find((a) => a.id === agentOutput.agent)?.title} ({AGENTS.find((a) => a.id === agentOutput.agent)?.name})
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    Live specialized agent response
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isSpeaking && (
                  <button
                    onClick={stopSpeaking}
                    className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-rose-50 text-rose-600 font-medium"
                  >
                    <VolumeX className="w-3.5 h-3.5" />
                    Stop Voice
                  </button>
                )}
                <button
                  onClick={() => {
                    stopSpeaking();
                    setAgentOutput(null);
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto text-xs">
              {/* Agent 1: Overseer */}
              {agentOutput.agent === 'overseer' && (
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/60">
                    <span className="text-[10px] uppercase font-bold text-blue-600 block mb-1">
                      Problem Context Under Watch:
                    </span>
                    <p className="font-semibold text-slate-800 dark:text-slate-200">
                      {agentOutput.data?.activeProblemSummary}
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                    <span>Student State: <strong className="text-emerald-600">{agentOutput.data?.studentState}</strong></span>
                    <span>Next Agent: <strong className="text-blue-600">{agentOutput.data?.recommendedAgent}</strong></span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                      Overseer Guidance Tip:
                    </span>
                    <p className="text-slate-700 dark:text-slate-300">
                      {agentOutput.data?.guidanceTip}
                    </p>
                  </div>
                </div>
              )}

              {/* Agent 2: Problem Analyzer */}
              {agentOutput.agent === 'analyzer' && (
                <div className="space-y-3">
                  <div className="border-b border-slate-100 dark:border-slate-800 pb-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Classified Problem:</span>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                      {agentOutput.data?.title}
                    </h4>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      Subject: <strong>{agentOutput.data?.subject}</strong> • Topic: <strong>{agentOutput.data?.topic}</strong>
                    </p>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Target Goal:</span>
                    <p className="p-2.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/40 text-blue-900 dark:text-blue-200 font-medium">
                      {agentOutput.data?.targetGoal}
                    </p>
                  </div>

                  {agentOutput.data?.keyFormulas && (
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Key Formulas:</span>
                      <div className="space-y-1.5">
                        {agentOutput.data.keyFormulas.map((f: string, idx: number) => (
                          <div key={idx} className="p-2 rounded-lg bg-slate-50 dark:bg-slate-950 font-mono text-center">
                            <KatexRenderer math={f} block />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/60">
                    <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 block mb-1">
                      Recommended First Step:
                    </span>
                    <p className="text-emerald-900 dark:text-emerald-200">
                      {agentOutput.data?.suggestedFirstStep}
                    </p>
                  </div>
                </div>
              )}

              {/* Agent 3: Whiteboard Co-Writer */}
              {agentOutput.agent === 'cowriter' && (
                <div className="space-y-3 text-center">
                  <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/60 flex items-center justify-center gap-2 text-emerald-700 dark:text-emerald-300 font-semibold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Next Step Written Directly to Whiteboard!</span>
                  </div>
                  {agentOutput.data?.latex && (
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 font-mono text-base">
                      <KatexRenderer math={agentOutput.data.latex} block />
                    </div>
                  )}
                  <p className="text-slate-600 dark:text-slate-400">
                    {agentOutput.data?.explanation}
                  </p>
                </div>
              )}

              {/* Agent 4: Socratic Explainer & Voice */}
              {agentOutput.agent === 'explainer' && (
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900/60 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-amber-700 dark:text-amber-400 block">
                        Spoken Voice Narration:
                      </span>
                      <p className="text-xs text-amber-900 dark:text-amber-200 mt-1 italic">
                        "{agentOutput.data?.spokenScript}"
                      </p>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 space-y-1.5">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      Conceptual Deep Dive:
                    </span>
                    <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                      {agentOutput.data?.conceptualExplanation}
                    </p>
                  </div>

                  {agentOutput.data?.socraticQuestion && (
                    <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/60">
                      <span className="text-[10px] uppercase font-bold text-blue-600 block mb-1">
                        Socratic Question to Ponder:
                      </span>
                      <p className="text-blue-900 dark:text-blue-200 font-medium">
                        {agentOutput.data.socraticQuestion}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Agent 5: Artifact Generator */}
              {agentOutput.agent === 'artifact' && (
                <div className="space-y-3 text-center">
                  <div className="p-3 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-100 dark:border-purple-900/60 flex items-center justify-center gap-2 text-purple-700 dark:text-purple-300 font-semibold">
                    <LineChart className="w-4 h-4" />
                    <span>Interactive Graph Card Added to Whiteboard!</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 text-left space-y-1 text-slate-600 dark:text-slate-400">
                    <p>Expression: <strong className="font-mono">{agentOutput.data?.expression}</strong></p>
                    <p>Title: <strong>{agentOutput.data?.title}</strong></p>
                    {agentOutput.data?.keyLandmarks && (
                      <p>Landmarks: {agentOutput.data.keyLandmarks.join(', ')}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Agent 6: Handwriting Beautifier */}
              {agentOutput.agent === 'beautifier' && (
                <div className="space-y-3 text-center">
                  <div className="p-3 rounded-2xl bg-fuchsia-50 dark:bg-fuchsia-950/40 border border-fuchsia-100 dark:border-fuchsia-900/60 flex items-center justify-center gap-2 text-fuchsia-700 dark:text-fuchsia-300 font-semibold">
                    <Wand2 className="w-4 h-4" />
                    <span>Scribbles Cleaned & Typeset into Pristine LaTeX!</span>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 font-mono text-lg text-center">
                    <KatexRenderer math={agentOutput.data?.cleanLatex || currentMath} block />
                  </div>
                  <p className="text-slate-500 text-xs">
                    Replaced uneven handwriting with aligned, high-resolution mathematical typography.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end">
              <button
                onClick={() => {
                  stopSpeaking();
                  setAgentOutput(null);
                }}
                className="px-4 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-500"
              >
                Close & Return to Whiteboard
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
