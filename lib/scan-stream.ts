import type { ScanResult } from './server/local-crawl';

// Saves each observed page before requesting the rest of a crawl. A dropped
// connection can stop discovery without discarding the evidence already read.
export async function scanWithProgress(
  url: string,
  onResult: (result: ScanResult, complete: boolean) => void,
  resumeId?: string,
) {
  let runId = resumeId;
  for (let batch = 0; batch < 51; batch++) {
  const response = await fetch('/api/local/scan', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/x-ndjson',
    },
    body: JSON.stringify({ url, runId }),
    signal: AbortSignal.timeout(180000),
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(
      error.error || `The scan service could not start (${response.status}).`,
    );
  }
  if (!response.headers.get('content-type')?.includes('application/x-ndjson')) {
    const result = (await response.json()) as ScanResult & { runId?: string; continueScan?: boolean };
    onResult(result, !result.continueScan);
    if (!result.continueScan) return result;
    if (!result.runId) throw new Error('Scan continuation is missing. Saved results remain available.');
    runId = result.runId;
    continue;
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('The scan service returned an empty response.');
  const decoder = new TextDecoder();
  let buffer = '',
    complete: ScanResult | undefined;
  const line = (value: string) => {
    if (!value.trim()) return;
    const event = JSON.parse(value) as {
      type: string;
      error?: string;
      result: ScanResult;
    };
    if (event.type === 'error')
      throw new Error(event.error || 'The website could not be read.');
    if (event.type === 'progress' || event.type === 'complete') {
      onResult(event.result, event.type === 'complete');
      if (event.type === 'complete') complete = event.result;
    }
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let end: number;
      while ((end = buffer.indexOf('\n')) !== -1) {
        line(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
      }
      if (buffer.length > 12000000)
        throw new Error('The scan response exceeded the supported size.');
    }
    line(buffer + decoder.decode());
    if (!complete)
      throw new Error(
        'The connection ended early. Pages already read have been saved; scan again to continue.',
      );
    return complete;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  }
  throw new Error('Scan batch limit reached. Saved page summaries remain available.');
}
