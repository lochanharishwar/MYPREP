import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function PUT(
  request: Request,
  { params }: { params: { id: string; pageId: string } }
) {
  try {
    const body = await request.json();
    const { contentJson, thumbnail, expectedVersion } = body;

    const existing = await prisma.notebookPage.findUnique({
      where: { id: params.pageId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    if (expectedVersion !== undefined && existing.version > expectedVersion) {
      return NextResponse.json(
        {
          error: 'Version conflict. Notebook page was updated in another session.',
          currentVersion: existing.version,
        },
        { status: 409 }
      );
    }

    const updated = await prisma.notebookPage.update({
      where: { id: params.pageId },
      data: {
        contentJson: typeof contentJson === 'string' ? contentJson : JSON.stringify(contentJson),
        thumbnail: thumbnail ?? existing.thumbnail,
        version: { increment: 1 },
      },
    });

    // Touch notebook updatedAt
    await prisma.notebook.update({
      where: { id: params.id },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({ page: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to save page' }, { status: 500 });
  }
}
