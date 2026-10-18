'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  X,
  Send,
  CheckCircle2,
  AlertTriangle,
  Flame,
  HelpCircle,
  Plus,
  Cpu,
  Layers,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import {
  TutorMode,
  TutorTone,
  ExplanationDepth,
  TutorResponse,
} from '@/lib/types/notebook';
import { KatexRenderer } from '@/components/math/KatexRenderer';

interface AIPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedMath?: string;
  onInsertAnnotation: (text: string, latex?: string, status?: 'verified' | 'approximate' | 'unverified' | 'failed') => void;
}

export const AIPanel: React.FC<AIPanelProps> = ({
  isOpen,
  onClose,
  selectedMath = 'f(x) = 6x^2',
  onInsertAnnotation,
}) => {
  const [mathInput, setMathInput] = useState(selectedMath);
  const [questionInput, setQuestionInput] = useState('');
  const [mode, setMode] = useState<TutorMode>('hint');
  const [depth, setDepth] = useState<ExplanationDepth>('guided');
  const [tone, setTone] = useState<TutorTone>('neutral');
  const [backend, setBackend] = useState<'ollama' | 'google-gemma-api' | 'mock'>('ollama');
  const [model, setModel] = useState<string>('gemma4:e4b');

  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<TutorResponse[]>([]);

  // Update mathInput when selectedMath prop changes
  React.useEffect(() => {
    if (selectedMath) {
      setMathInput(selectedMath);
    }
  }, [selectedMath]);

  const handleSubmit = async (overrideMode?: TutorMode) => {
    const activeMode = overrideMode || mode;
    setIsLoading(true);

    try {
      const res = await fetch('/api/ai/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mathExpression: mathInput,
          studentQuestion: questionInput,
          mode: activeMode,
          depth,
          tone,
          backend,
          model,
        }),
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const data: TutorResponse = await res.json();
      setHistory((prev) => [data, ...prev]);
      setQuestionInput('');
    } catch (err: any) {
      alert(`Tutoring request failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[440px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30">
        <div className="flex items-center gap-2.5">
          <span className="p-2 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-sm">
            <Sparkles className="w-4 h-4" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              Gemma 4 Tutor
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                Native
              </span>
            </h2>
            <p className="text-[11px] text-slate-500">
              Verified by SymPy • Contextual Assistance
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

      {/* Model & Config Ribbon */}
      <div className="px-5 py-2.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5">
          <Cpu className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={backend}
            onChange={(e) => {
              const b = e.target.value as any;
              setBackend(b);
              if (b === 'google-gemma-api') setModel('gemma-4-26b-a4b-it');
              else if (b === 'mock') setModel('gemma4:e4b-synthetic');
              else setModel('gemma4:e4b');
            }}
            className="text-[11px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-700 dark:text-slate-300 font-medium focus:outline-none"
          >
            <option value="ollama">Local Ollama</option>
            <option value="google-gemma-api">Hosted Google Gemma 4</option>
            <option value="mock">Synthetic Test Mode</option>
          </select>
        </div>

        <div className="flex items-center gap-1">
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value as TutorTone)}
            className="text-[11px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            <option value="neutral">Neutral</option>
            <option value="encouraging">Encouraging</option>
            <option value="socratic">Socratic</option>
            <option value="roast">Playful Roast 🔥</option>
          </select>

          <select
            value={depth}
            onChange={(e) => setDepth(e.target.value as ExplanationDepth)}
            className="text-[11px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            <option value="short">Short</option>
            <option value="guided">Guided</option>
            <option value="detailed">Detailed</option>
          </select>
        </div>
      </div>

      {/* Action Mode Pills */}
      <div className="px-5 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto text-xs">
        <button
          onClick={() => {
            setMode('hint');
            handleSubmit('hint');
          }}
          className={`px-3 py-1.5 rounded-xl font-medium transition-all ${
            mode === 'hint'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
          }`}
        >
          💡 Hint
        </button>
        <button
          onClick={() => {
            setMode('explain');
            handleSubmit('explain');
          }}
          className={`px-3 py-1.5 rounded-xl font-medium transition-all ${
            mode === 'explain'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
          }`}
        >
          📖 Explain
        </button>
        <button
          onClick={() => {
            setMode('check');
            handleSubmit('check');
          }}
          className={`px-3 py-1.5 rounded-xl font-medium transition-all ${
            mode === 'check'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
          }`}
        >
          🔍 Check Steps
        </button>
        <button
          onClick={() => {
            setMode('full-solution');
            handleSubmit('full-solution');
          }}
          className={`px-3 py-1.5 rounded-xl font-medium transition-all ${
            mode === 'full-solution'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
          }`}
        >
          ✨ Full Solution
        </button>
      </div>

      {/* Conversation & Step Feed */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {history.length === 0 && !isLoading && (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
            <span className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-500 mb-3">
              <Sparkles className="w-8 h-8" />
            </span>
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Quiet, Context-Aware Tutor
            </h4>
            <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
              Select any equation on your canvas or write in the box below to ask for hints, verify step transitions, or catch algebraic mistakes.
            </p>
          </div>
        )}

        {isLoading && (
          <div className="p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 flex items-center gap-3 animate-pulse">
            <Sparkles className="w-5 h-5 text-blue-600 animate-spin" />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-blue-900 dark:text-blue-300">
                Gemma 4 is analyzing your math...
              </p>
              <p className="text-[11px] text-blue-600 dark:text-blue-400">
                Checking equivalence with SymPy verification engine
              </p>
            </div>
          </div>
        )}

        {history.map((resp, idx) => (
          <div
            key={idx}
            className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3"
          >
            {/* Header info */}
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Mode: {resp.mode}
              </span>
              <button
                onClick={() => {
                  if (resp.proposedAnnotation) {
                    onInsertAnnotation(
                      resp.proposedAnnotation.text,
                      resp.proposedAnnotation.latex,
                      resp.proposedAnnotation.status
                    );
                  } else {
                    onInsertAnnotation(resp.summary, undefined, 'verified');
                  }
                }}
                className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                Add to Canvas
              </button>
            </div>

            {/* Summary */}
            <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-sans">
              {resp.summary}
            </p>

            {/* Steps */}
            {resp.steps && resp.steps.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-700/60">
                {resp.steps.map((st, sIdx) => {
                  const isVer = st.verificationStatus === 'verified';
                  return (
                    <div
                      key={sIdx}
                      className="p-2.5 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-100 dark:border-slate-800 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          Step {st.stepNumber || sIdx + 1}
                        </span>
                        {isVer ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                            <CheckCircle2 className="w-3 h-3" />
                            SymPy Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                            <AlertTriangle className="w-3 h-3" />
                            {st.verificationStatus || 'Model reasoning'}
                          </span>
                        )}
                      </div>

                      {st.latex && (
                        <div className="p-2 rounded bg-slate-50 dark:bg-slate-950 font-mono text-center">
                          <KatexRenderer math={st.latex} block />
                        </div>
                      )}

                      <p className="text-slate-600 dark:text-slate-400 leading-normal">
                        {st.explanation}
                      </p>

                      {st.warning && (
                        <p className="text-[11px] text-rose-500 font-medium">
                          ⚠️ {st.warning}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={mathInput}
            onChange={(e) => setMathInput(e.target.value)}
            placeholder="Target expression (e.g. f(x) = 6x^2)"
            className="flex-1 px-3 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={questionInput}
            onChange={(e) => setQuestionInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
            }}
            placeholder="Ask question (e.g. Why is this line wrong?)"
            className="flex-1 px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => handleSubmit()}
            disabled={isLoading}
            className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 transition-colors shadow-sm"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
