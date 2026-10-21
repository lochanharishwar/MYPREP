import { z } from 'zod';
import { scope, db, storeAsset } from '@/lib/server/db';
import { assertRole } from '@/lib/domain';
import { boundedBytes } from '@/lib/server/http';
import { storageBuckets } from '@/lib/server/storage';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    const brandId = z.uuid().parse(request.headers.get('x-brand-id'));
    const s = await scope(request, brandId);
    assertRole(s.role, ['owner']);
    const info = z
      .object({
        name: z.string().min(1).max(200),
        source: z.string().min(1).max(2000),
        rights: z.string().min(3).max(3000),
      })
      .parse(
        JSON.parse(
          decodeURIComponent(request.headers.get('x-asset-info') ?? ''),
        ),
      );
    const bytes = await boundedBytes(request, 8_000_000);
    const isPng =
      bytes.length > 8 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
    const isJpeg =
      bytes.length > 3 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255;
    const isWebp =
      bytes.length > 12 &&
      new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' &&
      new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
    const mime = isPng
      ? 'image/png'
      : isJpeg
        ? 'image/jpeg'
        : isWebp
          ? 'image/webp'
          : null;
    if (!mime)
      throw new Error(
        'Upload an original PNG, JPEG or WebP image, up to 8 MB. SVG files require a reviewed raster export.',
      );
    const path = await storeAsset(s.workspaceId, brandId, bytes, mime);
    const checksum = Buffer.from(
      await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>),
    ).toString('hex');
    const { data, error } = await db().rpc('record_brand_asset', {
      p_workspace: s.workspaceId,
      p_brand: brandId,
      p_actor: s.user.id,
      p_payload: {
        ...info,
        assetPath: path,
        mimeType: mime,
        sha256: checksum,
        size: bytes.length,
        sourceType: 'owner_upload',
      },
    });
    if (error) {
      await db().storage.from(storageBuckets().media).remove([path]);
      throw error;
    }
    return Response.json({ id: data }, { status: 201 });
  } catch (e) {
    return Response.json(
      { error: (e as Error).message },
      { status: (e as Error & { status?: number }).status ?? 400 },
    );
  }
}
