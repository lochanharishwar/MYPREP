import { NextResponse } from 'next/server';
import { gemmaGateway, GEMMA_TUTOR_PROMPT, GemmaBackend } from '@/lib/ai/gemma';
import { verifyMathematics } from '@/lib/math/verifier';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(request: Request) {
  const startTime = Date.now();
  try {
    const body = await request.json();
    const {
      mathExpression = '',
      studentQuestion = '',
      mode = 'hint',
      depth = 'guided',
      tone = 'neutral',
      backend = 'ollama',
      notebookId,
      pageId,
      sourceObjectIds = [],
    } = body;

    // Step 1: Deterministic Verification Layer (SymPy)
    let mathVerification = null;
    try {
      if (mathExpression.includes('d/dx') || mathExpression.includes("'") || mathExpression.includes('derivative')) {
        const clean = mathExpression.replace(/d\/dx\s*\((.*?)\)/, '$1').replace(/f\(x\)\s*=\s*/, '');
        mathVerification = await verifyMathematics({
          operation: 'differentiate',
          expression: clean,
          variable: 'x',
        });
      } else if (mathExpression.includes('=')) {
        // Equation / Equivalence check
        const parts = mathExpression.split('=');
        if (parts.length === 2) {
          mathVerification = await verifyMathematics({
            operation: 'verify_step',
            expression: parts[0].trim(),
            expectedResult: parts[1].trim(),
          });
        }
      }
    } catch (e) {
      console.warn('Math verification error:', e);
    }

    // Step 2: Build Structured Gemma 4 Context
    const trustedEvidenceBlock = mathVerification
      ? `\n[TRUSTED DETERMINISTIC VERIFICATION EVIDENCE FROM SYMPY/SOLVER]:
- Operation: ${mathVerification.operation}
- Status: ${mathVerification.verificationStatus}
- Is Verified Equivalent: ${mathVerification.isVerified}
- Simplified Result: ${mathVerification.resultExpression || 'N/A'}
- Domain Restrictions: ${mathVerification.domainWarnings.join('; ') || 'None'}
- Engine: ${mathVerification.engine}`
      : '\n[TRUSTED EVIDENCE]: Symbolic check not applicable or indeterminate.';

    const userPrompt = `Student Math Expression: "${mathExpression}"
Student Question: "${studentQuestion || `Please provide ${mode} for this math.`}"
Tutor Mode: ${mode}
Explanation Depth: ${depth}
Tone Preference: ${tone}
${trustedEvidenceBlock}

Remember your rules:
- Respect the requested mode: If HINT, do not give away the final result. If CHECK_STEPS, point out the earliest flaw.
- Ground claims in the trusted verification evidence.
- If tone is 'roast', use a light, playful math joke (e.g., about rogue minus signs or disappearing exponents) without being mean.
- Return structured JSON matching schema.`;

    const provider = gemmaGateway.getProvider(backend as GemmaBackend);
    let rawOutput: string;
    let actualBackend = backend;

    try {
      rawOutput = await provider.generateText({
        system: GEMMA_TUTOR_PROMPT,
        prompt: userPrompt,
        temperature: tone === 'roast' ? 0.4 : 0.2,
      });
    } catch (err: any) {
      console.warn('Gemma tutor call failed, using synthetic fallback:', err.message);
      actualBackend = 'mock';
      const mockProvider = gemmaGateway.getProvider('mock');
      rawOutput = await mockProvider.generateText({
        system: GEMMA_TUTOR_PROMPT,
        prompt: userPrompt,
      });
    }

    // Step 3: Clean and Parse JSON
    let cleanJson = rawOutput.trim();
    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    let parsed;
    try {
      parsed = JSON.parse(cleanJson);
    } catch {
      parsed = {
        summary: cleanJson.slice(0, 300),
        steps: [
          {
            stepNumber: 1,
            explanation: cleanJson,
            verificationStatus: mathVerification?.verificationStatus || 'unverified',
          },
        ],
        assumptions: [],
        warnings: [],
        canInsertToCanvas: true,
      };
    }

    // Step 4: Add Metadata & Persistence
    const durationMs = Date.now() - startTime;
    const responsePayload = {
      ...parsed,
      requestId: `req_${Date.now()}`,
      mode,
      durationMs,
      model: provider instanceof Object && (provider as any).model ? (provider as any).model : 'gemma4',
      backend: actualBackend,
      verificationEvidence: mathVerification,
    };

    // Async record interaction in database if notebookId is provided
    if (notebookId) {
      try {
        await prisma.aIInteraction.create({
          data: {
            notebookId,
            pageId: pageId || null,
            actionType: 'tutor',
            backend: actualBackend,
            modelId: 'gemma4',
            status: mathVerification?.verificationStatus || 'model_explained',
            durationMs,
            requestPayload: JSON.stringify({ mathExpression, studentQuestion, mode, depth, tone }),
            responsePayload: JSON.stringify(responsePayload),
          },
        });
      } catch (dbErr) {
        console.warn('Could not record AI interaction:', dbErr);
      }
    }

    return NextResponse.json(responsePayload);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Tutor generation failed' },
      { status: 500 }
    );
  }
}
