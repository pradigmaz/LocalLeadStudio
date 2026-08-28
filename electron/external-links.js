function isHostIn(host, domains) {
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function isYandexBrowserOnlyUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (isHostIn(host, ['vk.ru', 'vk.com', 'vkontakte.ru', 'max.ru'])) return true;
    return isHostIn(host, ['yandex.ru', 'yandex.com'])
      && (host.startsWith('maps.') || parsed.pathname === '/maps' || parsed.pathname.startsWith('/maps/'));
  } catch {
    return false;
  }
}

function shouldOpenInDedicatedBrowser(url, forceDedicatedBrowser = false, mode = 'default') {
  return mode === 'dedicated' && (forceDedicatedBrowser || isYandexBrowserOnlyUrl(url));
}

function openHttpUrl(url, openExternal) {
  try {
    const { protocol } = new URL(url);
    if (protocol === 'http:' || protocol === 'https:') {
      setImmediate(() => { void openExternal(url); });
    }
  } catch {
    // Electron denies malformed URLs without opening another application.
  }
}

function handleExternalWindow(url, openExternal, forceYandexBrowser = false) {
  openHttpUrl(url, (httpUrl) => openExternal(httpUrl, forceYandexBrowser));
  return { action: 'deny' };
}

function handleExternalNavigation(url, localOrigin, openExternal) {
  try {
    if (new URL(url).origin === localOrigin) return false;
  } catch {
    return true;
  }
  openHttpUrl(url, openExternal);
  return true;
}

module.exports = {
  handleExternalNavigation,
  handleExternalWindow,
  isYandexBrowserOnlyUrl,
  shouldOpenInDedicatedBrowser,
};
