import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const notebook = await prisma.notebook.findUnique({
      where: { id: params.id },
      include: {
        pages: {
          orderBy: { pageNumber: 'asc' },
        },
      },
    });

    if (!notebook) {
      return NextResponse.json({ error: 'Notebook not found' }, { status: 404 });
    }

    return NextResponse.json({ notebook });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch notebook' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { title, subject, paperStyle, theme, coverColor, archived } = body;

    const updated = await prisma.notebook.update({
      where: { id: params.id },
      data: {
        ...(title !== undefined && { title }),
        ...(subject !== undefined && { subject }),
        ...(paperStyle !== undefined && { paperStyle }),
        ...(theme !== undefined && { theme }),
        ...(coverColor !== undefined && { coverColor }),
        ...(archived !== undefined && { archived }),
      },
    });

    return NextResponse.json({ notebook: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to update notebook' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.notebook.delete({
      where: { id: params.id },
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to delete notebook' }, { status: 500 });
  }
}
