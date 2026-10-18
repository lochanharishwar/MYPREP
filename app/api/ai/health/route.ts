import { NextResponse } from 'next/server';
import { gemmaGateway, GemmaBackend } from '@/lib/ai/gemma';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const explicitBackend = searchParams.get('backend') as GemmaBackend | null;

  // 1. Probe Gemma 4
  const gemmaHealth = await gemmaGateway.getHealth(explicitBackend || undefined);

  // 2. Probe SymPy Math Service
  let mathService = {
    ready: false,
    engine: 'typescript-symbolic-fallback',
    diagnostic: 'FastAPI SymPy service is not currently running. Safe TypeScript symbolic engine active as fallback.',
  };

  try {
    const mathUrl = process.env.MATH_SERVICE_URL || 'http://127.0.0.1:8001';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${mathUrl}/health`, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      mathService = {
        ready: true,
        engine: 'sympy-fastapi',
        diagnostic: `SymPy v${data.sympy_version} service active on ${mathUrl}`,
      };
    }
  } catch {
    // Keep fallback
  }

  // 3. Probe Database
  let dbStatus = {
    ready: false,
    type: 'sqlite',
    diagnostic: 'Database check in progress',
  };

  try {
    await prisma.notebook.count();
    dbStatus = {
      ready: true,
      type: 'sqlite',
      diagnostic: 'SQLite database connection verified and healthy.',
    };
  } catch (err: any) {
    dbStatus = {
      ready: false,
      type: 'sqlite',
      diagnostic: `Database connection failed: ${err.message}`,
    };
  }

  return NextResponse.json({
    status: gemmaHealth.ready ? 'ready' : 'degraded',
    app: process.env.NEXT_PUBLIC_APP_NAME || 'Margin',
    timestamp: new Date().toISOString(),
    gemma: gemmaHealth,
    mathService,
    database: dbStatus,
  });
}
