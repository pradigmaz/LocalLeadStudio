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

function handleExternalWindow(url, openExternal) {
  openHttpUrl(url, openExternal);
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

module.exports = { handleExternalNavigation, handleExternalWindow };
