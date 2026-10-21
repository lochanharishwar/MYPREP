import 'server-only';
import { env } from './env';

/** Bucket configuration is deployment-wide; object paths remain unchanged.
 * Changing buckets does not migrate existing objects or saved content records.
 */
export function storageBuckets() {
  const customSchema = env('SUPABASE_DB_SCHEMA', 'public') !== 'public';
  const setting = (key: string, fallback: string) => {
    const value = env(key);
    if (customSchema && !value)
      throw new Error(
        `${key} must be configured for a custom database schema.`,
      );
    const name = value || fallback;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/.test(name))
      throw new Error(`${key} must be a valid storage bucket identifier.`);
    return name;
  };
  const media = setting('SUPABASE_MEDIA_BUCKET', 'media');
  const published = setting(
    'SUPABASE_PUBLISHED_MEDIA_BUCKET',
    'published-media',
  );
  if (media === published)
    throw new Error(
      'Private and published media must use separate storage buckets.',
    );
  return { media, published };
}
