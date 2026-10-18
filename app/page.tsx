'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  Plus,
  Sparkles,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Clock,
  ArrowRight,
  Layers,
  LineChart,
  GraduationCap,
  FileText,
} from 'lucide-react';

interface NotebookSummary {
  id: string;
  title: string;
  subject: string;
  paperStyle: string;
  theme: string;
  coverColor: string;
  updatedAt: string;
  pages: Array<{ id: string; pageNumber: number }>;
}

export default function LibraryPage() {
  const router = useRouter();
  const [notebooks, setNotebooks] = useState<NotebookSummary[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    // 1. Fetch notebooks
    fetch('/api/notebooks')
      .then((r) => r.json())
      .then((d) => {
        if (d.notebooks) setNotebooks(d.notebooks);
      })
      .catch((e) => console.warn('Could not fetch notebooks', e))
      .finally(() => setIsLoading(false));

    // 2. Fetch AI health
    fetch('/api/ai/health')
      .then((r) => r.json())
      .then((d) => setHealth(d))
      .catch((e) => console.warn('Health check error', e));
  }, []);

  const handleCreateNotebook = async (title: string, subject: string, paperStyle = 'grid') => {
    setIsCreating(true);
    try {
      const res = await fetch('/api/notebooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, subject, paperStyle }),
      });
      const data = await res.json();
      if (data.notebook) {
        router.push(`/notebook/${data.notebook.id}`);
      }
    } catch (e: any) {
      alert(`Could not create notebook: ${e.message}`);
      setIsCreating(false);
    }
  };

  const handleDeleteNotebook = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this notebook?')) return;

    try {
      await fetch(`/api/notebooks/${id}`, { method: 'DELETE' });
      setNotebooks((prev) => prev.filter((n) => n.id !== id));
    } catch (err: any) {
      alert('Delete failed');
    }
  };

  return (
    <div className="min-h-screen bg-[#fbfbfa] dark:bg-[#121316] text-slate-900 dark:text-slate-100 font-sans flex flex-col">
      {/* Top Banner & Header */}
      <header className="border-b border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-30 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20">
              <Sparkles className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight">Margin</h1>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900 font-semibold">
                  Gemma 4 Native
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                A maths notebook. A tutor in the margin.
              </p>
            </div>
          </div>

          {/* Model Status Pill */}
          <div className="flex items-center gap-2">
            {health && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                  {health.gemma?.activeBackend || 'Ollama'} • {health.gemma?.modelId || 'gemma4:e4b'}
                </span>
                <span className="text-slate-300 dark:text-slate-600">|</span>
                <span className="text-slate-500 text-[11px]">
                  {health.mathService?.ready ? 'SymPy Active' : 'Symbolic Fallback'}
                </span>
              </div>
            )}

            <button
              onClick={() => handleCreateNotebook('New Math Notebook', 'Calculus')}
              disabled={isCreating}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-md hover:shadow-lg transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>New Notebook</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto w-full px-6 py-8 flex-1 space-y-10">
        {/* Hero Quick Launch / Inspiration */}
        <section className="bg-gradient-to-br from-blue-50/80 via-indigo-50/40 to-slate-50/60 dark:from-slate-900/80 dark:via-slate-900/40 dark:to-slate-950 rounded-3xl p-8 border border-blue-100/80 dark:border-slate-800 shadow-sm relative overflow-hidden">
          <div className="max-w-2xl space-y-4">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              Interactive AI Math Canvas
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">
              A digital whiteboard that understands your mathematics.
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Write equations with a mouse or stylus. Gemma 4 reads your work, detects algebraic errors, guides you with Socratic hints, and grounds every claim in deterministic SymPy verification.
            </p>

            {/* Quick Templates */}
            <div className="pt-2 flex flex-wrap gap-2.5">
              <button
                onClick={() => handleCreateNotebook('Calculus Derivations', 'Calculus', 'grid')}
                className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:border-blue-500 hover:text-blue-600 transition-colors"
              >
                <GraduationCap className="w-4 h-4 text-blue-500" />
                <span>Calculus: Derivations & Limits</span>
              </button>

              <button
                onClick={() => handleCreateNotebook('Algebra & Step Checking', 'Algebra', 'lined')}
                className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:border-blue-500 hover:text-blue-600 transition-colors"
              >
                <FileText className="w-4 h-4 text-emerald-500" />
                <span>Algebra: Equation Step Checking</span>
              </button>

              <button
                onClick={() => handleCreateNotebook('Graph Exploration', 'Functions', 'graph')}
                className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:border-blue-500 hover:text-blue-600 transition-colors"
              >
                <LineChart className="w-4 h-4 text-purple-500" />
                <span>Functions & Interactive Graphs</span>
              </button>
            </div>
          </div>
        </section>

        {/* Library Grid */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
              My Notebooks ({notebooks.length})
            </h3>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-44 rounded-2xl bg-slate-100 dark:bg-slate-800/50 animate-pulse border border-slate-200/50 dark:border-slate-800"
                />
              ))}
            </div>
          ) : notebooks.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-white/40 dark:bg-slate-900/40 space-y-3">
              <BookOpen className="w-10 h-10 text-slate-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                No notebooks created yet
              </p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Start your first notebook to explore natural handwritten math with Gemma 4 tutoring.
              </p>
              <button
                onClick={() => handleCreateNotebook('Calculus Derivations', 'Calculus')}
                className="mt-2 px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-xl shadow-md hover:bg-blue-500"
              >
                Create First Notebook
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
              {notebooks.map((nb) => (
                <Link
                  key={nb.id}
                  href={`/notebook/${nb.id}`}
                  className="group relative bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm hover:shadow-xl hover:border-blue-400 dark:hover:border-blue-600 transition-all flex flex-col justify-between h-48"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
                        {nb.subject || 'Math'}
                      </span>
                      <button
                        onClick={(e) => handleDeleteNotebook(nb.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition-all"
                        title="Delete Notebook"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100 group-hover:text-blue-600 transition-colors line-clamp-1">
                      {nb.title}
                    </h4>

                    <p className="text-xs text-slate-400">
                      Paper: {nb.paperStyle} • {nb.pages?.length || 1} page
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(nb.updatedAt).toLocaleDateString()}
                    </span>
                    <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium group-hover:translate-x-0.5 transition-transform">
                      Open <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
