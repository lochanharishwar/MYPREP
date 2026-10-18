// lib/canvas/stroke-rasterizer.ts
import { VectorStroke } from '@/lib/types/notebook';

/**
 * Rasterizes an array of vector strokes into a crisp PNG Data URL.
 * Designed specifically for high-contrast handwriting OCR with Gemma 4 Vision.
 */
export function rasterizeStrokesToPng(strokes: VectorStroke[]): string | null {
  if (!strokes || strokes.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const s of strokes) {
    if (s.bbox) {
      minX = Math.min(minX, s.bbox.minX);
      minY = Math.min(minY, s.bbox.minY);
      maxX = Math.max(maxX, s.bbox.maxX);
      maxY = Math.max(maxY, s.bbox.maxY);
    } else if (s.points && s.points.length > 0) {
      for (const p of s.points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
    }
  }

  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
    return null;
  }

  const padding = 28;
  const contentWidth = Math.max(maxX - minX, 10);
  const contentHeight = Math.max(maxY - minY, 10);

  const canvasWidth = Math.max(contentWidth + padding * 2, 120);
  const canvasHeight = Math.max(contentHeight + padding * 2, 80);

  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  // Double resolution for sharp stroke edges
  const scale = 2;
  canvas.width = canvasWidth * scale;
  canvas.height = canvasHeight * scale;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Solid white background is crucial for Gemma Vision model accuracy
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.scale(scale, scale);
  ctx.translate(-minX + padding, -minY + padding);

  for (const stroke of strokes) {
    if (!stroke.points || stroke.points.length === 0) continue;

    ctx.save();
    ctx.strokeStyle = '#111827';
    ctx.fillStyle = '#111827';
    ctx.lineWidth = Math.max(stroke.width * 1.2, 2.8);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const pts = stroke.points;
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const xc = (pts[i].x + pts[i + 1].x) / 2;
        const yc = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
      }
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();
    }
    ctx.restore();
  }

  return canvas.toDataURL('image/png');
}
