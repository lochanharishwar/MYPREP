'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, Sparkles, X, AlertCircle } from 'lucide-react';

interface VoiceGateProps {
  isOpen: boolean;
  onClose: () => void;
  hasSelection: boolean;
  currentMath?: string;
  onIntentAnswer: (intent: string, transcript: string) => void;
}

export const VoiceGate: React.FC<VoiceGateProps> = ({
  isOpen,
  onClose,
  hasSelection,
  currentMath,
  onIntentAnswer,
}) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [decision, setDecision] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [tutorSpokenResponse, setTutorSpokenResponse] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [consentGranted, setConsentGranted] = useState(false);

  const recognitionRef = useRef<any>(null);

  // Initialize Speech Recognition if supported
  useEffect(() => {
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onresult = (event: any) => {
        let current = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          current += event.results[i][0].transcript;
        }
        setTranscript(current);
      };

      rec.onerror = (e: any) => {
        console.warn('Speech recognition error:', e.error);
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
    }
  }, []);

  const startListening = () => {
    if (!consentGranted) {
      setConsentGranted(true);
    }
    setTranscript('');
    setDecision(null);
    setReason(null);
    setIsListening(true);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.warn('Recognition start error:', err);
      }
    }
  };

  const stopListening = async () => {
    setIsListening(false);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) {
        // ignore
      }
    }

    if (!transcript.trim()) return;

    setIsProcessing(true);
    try {
      const res = await fetch('/api/ai/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          hasSelection,
        }),
      });

      const data = await res.json();
      setDecision(data.decision);
      setReason(data.reasonShort);

      if (data.decision === 'ANSWER') {
        try {
          const agentRes = await fetch('/api/ai/agents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'explain',
              payload: {
                topicOrQuestion: transcript,
                mathExpression: currentMath || 'f(x) = 6x^2',
              },
            }),
          });
          if (agentRes.ok) {
            const agentData = await agentRes.json();
            const speech =
              agentData.result?.spokenScript ||
              agentData.result?.conceptualExplanation ||
              agentData.result?.summary ||
              'Here is what I am teaching you about this equation.';
            setTutorSpokenResponse(speech);

            if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
              window.speechSynthesis.cancel();
              const utterance = new SpeechSynthesisUtterance(speech);
              utterance.rate = 1.0;
              window.speechSynthesis.speak(utterance);
            }
          }
        } catch (e) {
          console.warn('Agent conversational voice error:', e);
        }
        onIntentAnswer(data.intent || 'explain', transcript);
      }
    } catch (err: any) {
      console.warn('Intent error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-2xl w-full max-w-md animate-in slide-in-from-bottom duration-200">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <span className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
            <Mic className="w-4 h-4" />
          </span>
          <div>
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Push-to-Talk Voice Tutor
            </h4>
            <p className="text-[10px] text-slate-400">
              Gemma 4 Intent Decision Gate
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Main Mic Button & Visualizer */}
      <div className="flex flex-col items-center justify-center py-4 space-y-3">
        <button
          onMouseDown={startListening}
          onMouseUp={stopListening}
          onTouchStart={startListening}
          onTouchEnd={stopListening}
          className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-lg ${
            isListening
              ? 'bg-rose-500 text-white scale-110 shadow-rose-500/40 animate-pulse'
              : 'bg-blue-600 hover:bg-blue-500 text-white hover:scale-105'
          }`}
        >
          {isListening ? <Mic className="w-7 h-7" /> : <Mic className="w-7 h-7" />}
        </button>

        <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
          {isListening
            ? 'Release to evaluate intent...'
            : 'Hold to speak (Push-to-Talk)'}
        </p>
      </div>

      {/* Live Transcript Display */}
      {transcript && (
        <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 font-sans">
          <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">
            Transcribed:
          </span>
          "{transcript}"
        </div>
      )}

      {/* Conversational AI Spoken Response */}
      {tutorSpokenResponse && (
        <div className="mt-3 p-3 bg-emerald-50/90 dark:bg-emerald-950/50 rounded-xl border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-bold flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300">
              <Sparkles className="w-3.5 h-3.5" />
              Tutor Answer:
            </span>
            <button
              onClick={() => {
                if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                  window.speechSynthesis.cancel();
                  const utterance = new SpeechSynthesisUtterance(tutorSpokenResponse);
                  window.speechSynthesis.speak(utterance);
                }
              }}
              className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:underline"
            >
              <Volume2 className="w-3 h-3" /> Replay Voice
            </button>
          </div>
          <p className="leading-relaxed font-sans">{tutorSpokenResponse}</p>
        </div>
      )}

      {/* Intent Decision Feedback */}
      {decision && (
        <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-100 dark:border-blue-900/60 text-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-blue-900 dark:text-blue-200">
              Decision: {decision}
            </span>
            {decision === 'ANSWER' && (
              <button
                onClick={() => onIntentAnswer('explain', transcript)}
                className="text-[11px] font-bold text-blue-600 underline"
              >
                Open Tutor Now
              </button>
            )}
          </div>
          {reason && (
            <p className="text-[11px] text-blue-700 dark:text-blue-300">
              {reason}
            </p>
          )}
        </div>
      )}

      {/* Privacy note */}
      <p className="mt-3 text-[10px] text-slate-400 text-center">
        🔒 Audio is never continuously captured. Mic runs only while button is held.
      </p>
    </div>
  );
};
