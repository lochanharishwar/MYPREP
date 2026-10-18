import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
  try {
    const notebooks = await prisma.notebook.findMany({
      where: { archived: false },
      orderBy: { updatedAt: 'desc' },
      include: {
        pages: {
          select: { id: true, pageNumber: true, version: true, updatedAt: true },
        },
      },
    });

    return NextResponse.json({ notebooks });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to list notebooks' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { title = 'New Math Notebook', subject = 'Calculus', paperStyle = 'grid', theme = 'light' } = body;

    const notebook = await prisma.notebook.create({
      data: {
        title,
        subject,
        paperStyle,
        theme,
        pages: {
          create: {
            pageNumber: 1,
            version: 1,
            contentJson: JSON.stringify({
              strokes: [],
              objects: [],
              camera: { x: 0, y: 0, zoom: 1 },
              paperStyle,
              theme,
            }),
          },
        },
      },
      include: { pages: true },
    });

    return NextResponse.json({ notebook }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to create notebook' }, { status: 500 });
  }
}
