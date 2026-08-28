// ponytail-минимум: проверяет нетривиальную логику waitForPort без запуска Electron.
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const packageJson = require('./package.json');
const { waitForPort, portStartupError } = require('./wait-port');
const {
  handleExternalNavigation,
  handleExternalWindow,
  isYandexBrowserOnlyUrl,
  shouldOpenInDedicatedBrowser,
} = require('./external-links');
const { compareDirectoryHashes, findBundledFrontend } = require('./release-preflight');

let browserRouting = {};
try {
  browserRouting = require('./browser-routing');
} catch (error) {
  browserRouting.loadError = error.message;
}

(async () => {
  assert.strictEqual(packageJson.scripts.dist, 'node release-preflight.js && electron-builder --win portable');
  const mainSource = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  const leadModalInfoGridSource = fs.readFileSync(
    path.join(__dirname, '..', 'frontend', 'src', 'components', 'leads', 'LeadModalInfoGrid.tsx'),
    'utf8',
  );
  assert.match(mainSource, /\bminWidth:\s*1120\b/, 'desktop window must keep the collection settings readable');
  assert.match(mainSource, /data:text\/html;charset=utf-8,/, 'backend error page must declare UTF-8 for Russian text');
  assert.match(mainSource, /readBrowserRouting\(/, 'external links must read the saved browser choice');
  assert.match(mainSource, /showUnavailableBrowserDialog\(/, 'a missing selected browser must prompt instead of falling back');
  assert.match(mainSource, /validateLocalSender\(/, 'browser settings IPC must validate the local renderer origin');
  assert(packageJson.build.files.includes('preload.js'), 'the packaged app must include the narrow browser-settings preload bridge');
  assert(packageJson.build.files.includes('startup.html'), 'the packaged app must include the startup screen');
  assert(fs.existsSync(path.join(__dirname, 'startup.html')), 'the startup screen must exist locally');
  assert.match(mainSource, /show:\s*false/, 'the native window must stay hidden until the startup screen is painted');
  assert.match(mainSource, /win\.once\('ready-to-show', \(\) => win\.show\(\)\)/, 'the startup screen must show only after first paint');
  assert(
    mainSource.indexOf("await win.loadFile(path.join(__dirname, 'startup.html'));" ) < mainSource.indexOf('await waitForPort(PORT)'),
    'the startup screen must load before waiting for the backend port',
  );
  assert.match(
    mainSource,
    /frameName === 'lead-studio-site'/,
    'sites from a lead card must be routed to Yandex Browser',
  );
  assert.match(
    leadModalInfoGridSource,
    /href=\{w\}\s+target="lead-studio-site"/,
    'lead card site links must carry the Yandex Browser routing marker',
  );
  assert.match(
    leadModalInfoGridSource,
    /bookingLinks\.map\(\(s, i\) => \(\s*<a\s+key=\{i\}\s+href=\{s\}\s+target="lead-studio-site"/,
    'lead card booking links must carry the Yandex Browser routing marker',
  );
  assert.strictEqual(
    portStartupError?.(8765, true),
    'Порт 8765 уже занят. Закройте запущенный LeadStudio или другое приложение и повторите запуск.',
  );
  assert.strictEqual(portStartupError?.(8765, false), null);

  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'lls-release-preflight-'));
  try {
    const frontendDist = path.join(fixture, 'frontend-dist');
    const bundledDist = path.join(fixture, 'bundled-dist');
    for (const root of [frontendDist, bundledDist]) {
      fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
      fs.writeFileSync(path.join(root, 'assets', 'app.js'), 'same');
    }
    const backendDist = path.join(fixture, 'backend-dist');
    const internalFrontendDist = path.join(backendDist, '_internal', 'frontend_dist');
    fs.mkdirSync(internalFrontendDist, { recursive: true });
    assert.strictEqual(findBundledFrontend(backendDist), internalFrontendDist);
    assert.deepStrictEqual(compareDirectoryHashes(frontendDist, bundledDist), []);
    fs.writeFileSync(path.join(bundledDist, 'assets', 'app.js'), 'changed');
    assert.deepStrictEqual(compareDirectoryHashes(frontendDist, bundledDist), ['assets/app.js']);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }

  // 1. живой порт -> резолв
  const srv = net.createServer().listen(0, '127.0.0.1');
  await new Promise((r) => srv.once('listening', r));
  const port = srv.address().port;
  await waitForPort(port, 2000);
  srv.close();

  // 2. мёртвый порт -> реджект по таймауту
  let rejected = false;
  try {
    await waitForPort(port, 600, 150);
  } catch {
    rejected = true;
  }
  assert.strictEqual(rejected, true, 'dead port must reject');

  // Внешние ссылки не создают второе окно Electron.
  const openedUrls = [];
  assert.deepStrictEqual(
    handleExternalWindow('https://yandex.ru/maps', (url) => openedUrls.push(url)),
    { action: 'deny' },
  );
  await new Promise(setImmediate);
  assert.deepStrictEqual(openedUrls, ['https://yandex.ru/maps']);

  handleExternalWindow('file:///C:/Windows/System32', (url) => openedUrls.push(url));
  handleExternalWindow('file:///C:/Windows/System32', (url) => openedUrls.push(url), true);
  await new Promise(setImmediate);
  assert.deepStrictEqual(openedUrls, ['https://yandex.ru/maps']);

  assert.strictEqual(isYandexBrowserOnlyUrl('https://vk.ru/example'), true);
  assert.strictEqual(isYandexBrowserOnlyUrl('https://web.max.ru/example'), true);
  assert.strictEqual(isYandexBrowserOnlyUrl('https://yandex.ru/maps/-/example'), true);
  assert.strictEqual(isYandexBrowserOnlyUrl('https://yandex.ru/search'), false);
  assert.strictEqual(isYandexBrowserOnlyUrl('https://example.com'), false);

  assert.strictEqual(
    typeof shouldOpenInDedicatedBrowser,
    'function',
    'special links must respect the saved separate-browser mode',
  );
  assert.strictEqual(shouldOpenInDedicatedBrowser('https://vk.ru/example', false, 'default'), false);
  assert.strictEqual(shouldOpenInDedicatedBrowser('https://vk.ru/example', false, 'dedicated'), true);
  assert.strictEqual(shouldOpenInDedicatedBrowser('https://example.com', false, 'dedicated'), false);
  assert.strictEqual(shouldOpenInDedicatedBrowser('https://example.com', true, 'dedicated'), true);

  assert.strictEqual(
    typeof browserRouting.readBrowserRouting,
    'function',
    `browser routing settings must be persisted locally${browserRouting.loadError ? `: ${browserRouting.loadError}` : ''}`,
  );
  assert.strictEqual(typeof browserRouting.saveBrowserRouting, 'function');
  assert.strictEqual(typeof browserRouting.discoverBrowsers, 'function');
  assert.strictEqual(typeof browserRouting.isBrowserExecutable, 'function');

  const browserFixture = fs.mkdtempSync(path.join(os.tmpdir(), 'lls-browser-routing-'));
  try {
    const browserRoot = path.join(browserFixture, 'LocalAppData');
    const yandexPath = path.join(browserRoot, 'Yandex', 'YandexBrowser', 'Application', 'browser.exe');
    fs.mkdirSync(path.dirname(yandexPath), { recursive: true });
    fs.writeFileSync(yandexPath, 'browser');

    assert.deepStrictEqual(browserRouting.readBrowserRouting(browserFixture), {
      onboarding: 'pending',
      mode: 'default',
      browserPath: '',
      browserLabel: '',
    });
    assert.strictEqual(browserRouting.isBrowserExecutable(yandexPath), true);
    assert.strictEqual(browserRouting.isBrowserExecutable(path.join(browserFixture, 'browser.cmd')), false);

    const savedRouting = browserRouting.saveBrowserRouting(browserFixture, {
      onboarding: 'complete',
      mode: 'dedicated',
      browserPath: yandexPath,
      browserLabel: 'Yandex Browser',
    });
    assert.deepStrictEqual(browserRouting.readBrowserRouting(browserFixture), savedRouting);
    assert.deepStrictEqual(
      browserRouting.discoverBrowsers({
        LOCALAPPDATA: browserRoot,
        ProgramFiles: '',
        'ProgramFiles(x86)': '',
        APPDATA: '',
      }),
      [{ id: 'yandex', label: 'Yandex Browser', path: yandexPath, recommended: true }],
    );
  } finally {
    fs.rmSync(browserFixture, { recursive: true, force: true });
  }

  const yandexBrowserUrls = [];
  const defaultBrowserUrls = [];
  const openByBrowserPolicy = (url, forceYandexBrowser) => {
    (forceYandexBrowser || isYandexBrowserOnlyUrl(url) ? yandexBrowserUrls : defaultBrowserUrls).push(url);
  };
  handleExternalWindow('https://vk.com/example', openByBrowserPolicy);
  handleExternalNavigation('https://max.ru/example', 'http://127.0.0.1:8765', openByBrowserPolicy);
  handleExternalWindow('https://example.com', openByBrowserPolicy);
  handleExternalWindow('https://example.com/site', openByBrowserPolicy, true);
  await new Promise(setImmediate);
  assert.deepStrictEqual(yandexBrowserUrls, ['https://vk.com/example', 'https://max.ru/example', 'https://example.com/site']);
  assert.deepStrictEqual(defaultBrowserUrls, ['https://example.com']);

  // Навигация наружу не заменяет локальный интерфейс внутри Electron.
  assert.strictEqual(
    handleExternalNavigation('https://example.com', 'http://127.0.0.1:8765', (url) => openedUrls.push(url)),
    true,
  );
  await new Promise(setImmediate);
  assert.deepStrictEqual(openedUrls, ['https://yandex.ru/maps', 'https://example.com']);
  assert.strictEqual(
    handleExternalNavigation('http://127.0.0.1:8765/api/settings/export', 'http://127.0.0.1:8765', (url) => openedUrls.push(url)),
    false,
  );
  assert.strictEqual(
    handleExternalNavigation('file:///C:/Windows/System32', 'http://127.0.0.1:8765', (url) => openedUrls.push(url)),
    true,
  );

  console.log('selfcheck ok');
})().catch((e) => { console.error(e); process.exit(1); });
