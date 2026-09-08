export async function boundedBytes(
  response: Pick<Response, 'headers' | 'body'>,
  maxBytes: number,
): Promise<Uint8Array> {
  if (Number(response.headers.get('content-length')) > maxBytes)
    throw new Error('Response exceeds the supported size.');
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes)
        throw new Error('Response exceeds the supported size.');
      chunks.push(value);
    }
  } catch (e) {
    await reader.cancel();
    throw e;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
