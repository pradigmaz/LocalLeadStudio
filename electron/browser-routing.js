const fs = require('fs');
const path = require('path');

const ROUTING_FILE_NAME = 'browser-routing.json';
const DEFAULT_BROWSER_ROUTING = Object.freeze({
  onboarding: 'pending',
  mode: 'default',
  browserPath: '',
  browserLabel: '',
});

const BROWSER_DEFINITIONS = [
  { id: 'yandex', label: 'Yandex Browser', recommended: true, executable: 'Yandex/YandexBrowser/Application/browser.exe' },
  { id: 'chrome', label: 'Google Chrome', recommended: false, executable: 'Google/Chrome/Application/chrome.exe' },
  { id: 'edge', label: 'Microsoft Edge', recommended: false, executable: 'Microsoft/Edge/Application/msedge.exe' },
  { id: 'firefox', label: 'Mozilla Firefox', recommended: false, executable: 'Mozilla Firefox/firefox.exe' },
  { id: 'brave', label: 'Brave', recommended: false, executable: 'BraveSoftware/Brave-Browser/Application/brave.exe' },
  { id: 'vivaldi', label: 'Vivaldi', recommended: false, executable: 'Vivaldi/Application/vivaldi.exe' },
];

function browserRoutingPath(dataDir) {
  return path.join(dataDir, ROUTING_FILE_NAME);
}

function normalizeBrowserRouting(value) {
  const source = value && typeof value === 'object' ? value : {};
  const browserPath = typeof source.browserPath === 'string' && path.isAbsolute(source.browserPath)
    ? source.browserPath
    : '';
  const browserLabel = typeof source.browserLabel === 'string' ? source.browserLabel.trim().slice(0, 120) : '';
  return {
    onboarding: source.onboarding === 'complete' ? 'complete' : 'pending',
    mode: source.mode === 'dedicated' && browserPath ? 'dedicated' : 'default',
    browserPath: source.mode === 'dedicated' ? browserPath : '',
    browserLabel: source.mode === 'dedicated' ? browserLabel : '',
  };
}

function readBrowserRouting(dataDir) {
  try {
    return normalizeBrowserRouting(JSON.parse(fs.readFileSync(browserRoutingPath(dataDir), 'utf8')));
  } catch {
    return { ...DEFAULT_BROWSER_ROUTING };
  }
}

function saveBrowserRouting(dataDir, value) {
  const routing = normalizeBrowserRouting(value);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(browserRoutingPath(dataDir), `${JSON.stringify(routing, null, 2)}\n`, 'utf8');
  return routing;
}

function isBrowserExecutable(browserPath) {
  if (typeof browserPath !== 'string' || !path.isAbsolute(browserPath) || path.extname(browserPath).toLowerCase() !== '.exe') {
    return false;
  }
  try {
    return fs.statSync(browserPath).isFile();
  } catch {
    return false;
  }
}

function discoverBrowsers(env = process.env) {
  const roots = [env.LOCALAPPDATA, env.ProgramFiles, env['ProgramFiles(x86)']].filter(Boolean);
  const seenPaths = new Set();
  const browsers = [];
  for (const definition of BROWSER_DEFINITIONS) {
    const browserPath = roots
      .map((root) => path.join(root, definition.executable))
      .find(isBrowserExecutable);
    if (!browserPath) continue;
    const normalizedPath = browserPath.toLowerCase();
    if (seenPaths.has(normalizedPath)) continue;
    seenPaths.add(normalizedPath);
    browsers.push({
      id: definition.id,
      label: definition.label,
      path: browserPath,
      recommended: definition.recommended,
    });
  }
  return browsers;
}

module.exports = {
  DEFAULT_BROWSER_ROUTING,
  browserRoutingPath,
  discoverBrowsers,
  isBrowserExecutable,
  readBrowserRouting,
  saveBrowserRouting,
};
