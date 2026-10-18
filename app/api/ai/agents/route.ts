import { NextResponse } from 'next/server';
import { AgentTeamService } from '@/lib/ai/agents/agent-team';
import { GemmaBackend } from '@/lib/ai/gemma';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const defaultBackend = (process.env.GEMMA_BACKEND || (process.env.GEMINI_API_KEY ? 'google-gemma-api' : 'ollama')) as GemmaBackend;
    const { action, payload = {}, backend = defaultBackend } = body;

    const team = new AgentTeamService(backend as GemmaBackend);

    switch (action) {
      // Agent 1: Problem Overseer
      case 'oversee': {
        const result = await team.oversee(payload);
        return NextResponse.json({ agent: 'overseer', result });
      }

      // Agent 2: Problem Analyzer
      case 'analyze': {
        const { mathExpression = '' } = payload;
        const result = await team.analyze(mathExpression);
        return NextResponse.json({ agent: 'analyzer', result });
      }

      // Agent 3: Whiteboard Co-Writer
      case 'cowrite': {
        const { currentMath = '', lastPosition = { x: 100, y: 100 } } = payload;
        const result = await team.coWrite({ currentMath, lastPosition });
        return NextResponse.json({ agent: 'cowriter', result });
      }

      // Agent 4: Socratic Explainer & Voice
      case 'explain': {
        const { topicOrQuestion = 'Explain step', mathExpression = '' } = payload;
        const result = await team.explain({ topicOrQuestion, mathExpression });
        return NextResponse.json({ agent: 'explainer', result });
      }

      // Agent 5: Artifact Generator
      case 'artifact': {
        const { mathExpression = 'x^2' } = payload;
        const result = await team.generateArtifact(mathExpression);
        return NextResponse.json({ agent: 'artifact', result });
      }

      // Agent 6: Handwriting Beautifier (Scribble-to-Neat)
      case 'beautify': {
        const {
          scribbledMath = '',
          sourceIds = [],
          bbox = { minX: 100, minY: 100, width: 200, height: 80 },
        } = payload;
        const result = await team.beautify({ scribbledMath, sourceIds, bbox });
        return NextResponse.json({ agent: 'beautifier', result });
      }

      default:
        return NextResponse.json({ error: `Unknown agent action: ${action}` }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Agent execution failed' },
      { status: 500 }
    );
  }
}
