import { NextResponse } from 'next/server';
import { gemmaGateway, GEMMA_INTENT_PROMPT, GemmaBackend } from '@/lib/ai/gemma';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { transcript = '', hasSelection = false, backend = 'ollama' } = body;

    const trimmed = transcript.trim().toLowerCase();

    // Fast deterministic heuristics
    if (!trimmed || trimmed.length < 2) {
      return NextResponse.json({
        decision: 'IGNORE',
        addressedToTutor: false,
        intent: 'none',
        reasonShort: 'Utterance is empty or too brief.',
      });
    }

    // Direct explicit math commands
    if (trimmed.includes('inkwise') || trimmed.includes('hey tutor')) {
      if (trimmed.includes('graph')) {
        return NextResponse.json({
          decision: 'ANSWER',
          addressedToTutor: true,
          intent: 'graph',
          reasonShort: 'Direct voice command to graph expression.',
        });
      }
      if (trimmed.includes('hint')) {
        return NextResponse.json({
          decision: 'ANSWER',
          addressedToTutor: true,
          intent: 'hint',
          reasonShort: 'Direct voice command for a hint.',
        });
      }
      if (trimmed.includes('check') || trimmed.includes('wrong') || trimmed.includes('mistake')) {
        return NextResponse.json({
          decision: 'ANSWER',
          addressedToTutor: true,
          intent: 'check',
          reasonShort: 'Direct voice command to check steps.',
        });
      }
    }

    // Ambiguous single words like "why?" or "how?"
    if (trimmed === 'why?' || trimmed === 'why' || trimmed === 'how' || trimmed === 'what?') {
      if (!hasSelection) {
        return NextResponse.json({
          decision: 'ASK_CLARIFYING_QUESTION',
          addressedToTutor: true,
          intent: 'explain',
          needsClarification: true,
          reasonShort: 'Question asked without selected equation. Please select an expression.',
        });
      }
      return NextResponse.json({
        decision: 'SHOW_SUBTLE_SUGGESTION',
        addressedToTutor: true,
        intent: 'explain',
        reasonShort: 'Single word question on selected math. Subtle suggestion shown.',
      });
    }

    // Gemma 4 LLM intent classifier
    const provider = gemmaGateway.getProvider(backend as GemmaBackend);
    let rawOutput: string;
    try {
      rawOutput = await provider.generateText({
        system: GEMMA_INTENT_PROMPT,
        prompt: `Utterance: "${transcript}"\nHas Canvas Selection: ${hasSelection}`,
        temperature: 0.1,
      });
    } catch {
      const mockProvider = gemmaGateway.getProvider('mock');
      rawOutput = await mockProvider.generateText({
        system: GEMMA_INTENT_PROMPT,
        prompt: transcript,
      });
    }

    let parsed = { addressedToTutor: false, intent: 'none', needsClarification: false, reasonShort: '' };
    try {
      let clean = rawOutput.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '');
      parsed = JSON.parse(clean);
    } catch {
      parsed.reasonShort = 'Classifier returned non-json';
    }

    let decision = 'IGNORE';
    if (parsed.addressedToTutor) {
      if (parsed.needsClarification || !hasSelection) {
        decision = 'ASK_CLARIFYING_QUESTION';
      } else {
        decision = 'ANSWER';
      }
    }

    return NextResponse.json({
      decision,
      ...parsed,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Intent classification failed' }, { status: 500 });
  }
}
