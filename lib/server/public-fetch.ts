import { validatePublicUrl } from './security';

export async function publicFetch(raw: string, timeout = 15000) {
  let url = raw;
  const signal = AbortSignal.timeout(timeout);
  for (let redirects = 0; redirects <= 4; redirects++) {
    url = await validatePublicUrl(url);
    const response = await fetch(url, {
      redirect: 'manual',
      signal,
      headers: {
        'user-agent': 'MARKY/1.0 website analysis',
        accept:
          'text/html,application/xhtml+xml,text/css,image/*;q=0.8,*/*;q=0.5',
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location)
        throw new Error('Website returned a redirect without a destination.');
      url = new URL(location, url).href;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(
        `Website returned HTTP ${response.status}. It may restrict automated access.`,
      );
    }
    return { response, url };
  }
  throw new Error('Website redirected too many times.');
}
