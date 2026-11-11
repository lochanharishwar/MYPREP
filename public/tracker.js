/* MARKY first-party tracking. Load only after your site's consent requirements are satisfied. */
(() => {
  const script = document.currentScript;
  const trackingId = script?.dataset.key;
  if (!trackingId) return;
  const endpoint = new URL('/api/collect', script.src).href;
  let anonymousId;
  try {
    anonymousId =
      localStorage.getItem('bc_anonymous_id') || crypto.randomUUID();
    localStorage.setItem('bc_anonymous_id', anonymousId);
  } catch {
    anonymousId = crypto.randomUUID();
  }
  const params = new URLSearchParams(location.search);
  const channel = params.get('utm_source') || 'direct';
  const campaignId = params.get('bc_campaign');
  let consent = true;
  const controller = new AbortController();
  function track(type, properties = {}) {
    if (!consent || !['page_view','engaged','click','video_progress'].includes(type)) return Promise.resolve();
    const event = {
      eventId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      type,
      anonymousId,
      channel,
      properties,
      ...(campaignId && /^[0-9a-f-]{36}$/i.test(campaignId)
        ? { campaignId }
        : {}),
    };
    return fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackingId, event }),
      keepalive: true,
      credentials: 'omit',
      signal: controller.signal,
    }).catch(() => {});
  }
  function withdrawConsent() {
    consent = false;
    controller.abort();
    clearInterval(timer);
    document.removeEventListener('click', onClick);
    try { localStorage.removeItem('bc_anonymous_id'); } catch {}
    anonymousId = undefined;
  }
  window.brandCurrent = { track, withdrawConsent };
  void track('page_view', { path: location.pathname });
  let active = 0;
  const timer = setInterval(() => {
    if (document.visibilityState === 'visible') active++;
    if (active === 10) {
      void track('engaged', { activeSeconds: 10, path: location.pathname });
      clearInterval(timer);
    }
  }, 1000);
  function onClick(e) {
    const a = e.target.closest?.('a[data-bc-track]');
    if (a) void track('click', { label: a.dataset.bcTrack });
  }
  document.addEventListener('click', onClick);
})();
