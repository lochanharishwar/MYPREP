import 'server-only';
import { contextDiscover, contextScrape } from './context-client';
import { assemble, observedStyles, type Observation } from './local-crawl';
import { parsePage, safeLink } from './page-observations';
import { validatePublicUrl } from './security';
import { createScan, claimScan, saveScan, creditMonth } from './scan-ledger';
type State = {
  url: string; mapped: boolean; queue: string[]; discovered: string[];
  visited: string[]; failed: string[]; excluded: string[]; warnings: string[];
  pages: Observation[]; styles: ReturnType<typeof observedStyles>[];
};
const escape = (text: string) => text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
export async function contextScanBatch(raw: string, runId?: string) {
  const url = await validatePublicUrl(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw);
  const site = new URL(url).hostname.replace(/^www\./,'');
  let id = runId ?? await createScan(site, { url, mapped: false, queue: [url], discovered: [url], visited: [], failed: [], excluded: [], warnings: [], pages: [], styles: [] });
  let row = await claimScan(id);
  const state = JSON.parse(row.payload) as State;
  if (row.site === site && row.month && row.month !== creditMonth()) {
    // Preserve the previous month's reservations while continuing its queue.
    await saveScan(id, state);
    id = await createScan(site, state);
    row = await claimScan(id);
  }
  try {
    if (row.site !== site) throw new Error('This scan belongs to a different website.');
    const ctx = { workspaceId: 'browser', brandId: site, creditRunId: id };
    const add = (rawLink: string) => {
      const link = safeLink(rawLink, state.url);
      if (!link || new URL(link).hostname.replace(/^www\./,'') !== site || /\.(pdf|zip|png|jpe?g|webp|svg|css|js|mp4|woff2?)(?:$|\?)/i.test(link)) {
        if (state.excluded.length < 500 && !state.excluded.includes(rawLink)) state.excluded.push(rawLink);
        return;
      }
      if (!state.discovered.includes(link) && state.discovered.length < 5000) { state.discovered.push(link); state.queue.push(link); }
    };
    let paused = false;
    const shouldPause = (message: string) => /credit limit|request failed \((401|402|429|5\d\d)\)|did not complete the request/.test(message);
    if (!state.mapped) {
      state.mapped = true;
      try {
        const map = await contextDiscover(ctx, url);
        map.urls.forEach(add);
        if (map.partial) state.warnings.push('URL discovery is partial; additional pages may exist.');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Discovery unavailable.';
        state.warnings.push(message);
        paused = shouldPause(message);
        if (paused) state.mapped = false;
      }
    }
    // One page per HTTP request keeps results saved and requests bounded.
    const target = state.queue[0];
    if (target && !paused) {
      try {
        const result = await contextScrape(ctx, target);
        const page = parsePage(result.html || `<html><head><title>${escape(String(result.metadata.title ?? ''))}</title></head><body>${result.markdown.split(/\n\s*\n/).map(p=>`<p>${escape(p)}</p>`).join('')}</body></html>`, result.url);
        result.links.forEach(add);
        state.styles.push(observedStyles(page.css, result.url));
        // Persist observations, not executable HTML. Bound individual records.
        page.text = page.text.slice(0, 30000);
        page.paragraphs = page.paragraphs.slice(0, 80);
        page.css = '';
        state.pages.push({ page, method: result.html ? 'dom' : 'research', truncated: true,
          retrieval: `Context.dev · ${result.metadata.retrievedAt} · request ${result.metadata.requestId ?? 'unavailable'}` });
        if (result.error) state.warnings.push(`${target}: ${result.error}`);
        state.visited.push(target, result.url);
        state.queue = state.queue.filter(u=>!state.visited.includes(u));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Page could not be read.';
        state.warnings.push(`${target}: ${message}`);
        if (shouldPause(message)) paused = true;
        else { state.failed.push(target); state.visited.push(target); state.queue.shift(); }
      }
    }
    const result = assemble(state.pages, state.styles, new Set(state.discovered), new Set(state.visited), state.failed, state.excluded, state.warnings);
    result.scan.coverageNote = `Context.dev: ${state.pages.length} pages read, ${state.queue.length} pending, ${state.failed.length} failed. Limits: 50 credits per website per month; 1,000 total monthly. Embedded CSS is partial, not computed. Summaries use observed page text.`;
    return { ...result, scan: { ...result.scan, queue: state.queue, runId: id }, runId: id, continueScan: state.queue.length > 0 && !paused };
  } finally { await saveScan(id, state); }
}
