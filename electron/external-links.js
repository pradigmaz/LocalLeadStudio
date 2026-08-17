function handleExternalWindow(url, openExternal) {
  try {
    const { protocol } = new URL(url);
    if (protocol === 'http:' || protocol === 'https:') {
      setImmediate(() => { void openExternal(url); });
    }
  } catch {
    // Electron denies malformed URLs without opening another application.
  }
  return { action: 'deny' };
}

module.exports = { handleExternalWindow };
