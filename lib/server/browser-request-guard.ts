import { isPublicWebUrl } from './public-address';

// Supplemental request filtering. Browser network isolation must also block
// private/reserved socket destinations; URL checks alone cannot stop rebinding.
export function browserRequestGuard() {
  return `const isPublicWebUrl = ${isPublicWebUrl.toString()};
    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = request.url();
      const allowed = url.startsWith('data:') || url.startsWith('blob:') || isPublicWebUrl(url);
      Promise.resolve(allowed ? request.continue() : request.abort()).catch(() => {});
    });`;
}
