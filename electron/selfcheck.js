// ponytail-минимум: проверяет нетривиальную логику waitForPort без запуска Electron.
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const packageJson = require('./package.json');
const { waitForPort, portStartupError } = require('./wait-port');
const { handleExternalNavigation, handleExternalWindow, isYandexBrowserOnlyUrl } = require('./external-links');
const { compareDirectoryHashes, findBundledFrontend } = require('./release-preflight');

(async () => {
  assert.strictEqual(packageJson.scripts.dist, 'node release-preflight.js && electron-builder --win portable');
  const mainSource = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
  assert.match(mainSource, /\bminWidth:\s*1120\b/, 'desktop window must keep the collection settings readable');
  assert.match(
    mainSource,
    /if \(isYandexBrowserOnlyUrl\(url\)\) \{\s+openYandexBrowser\(url\);\s+return;\s+\}/,
    'VK, MAX and Yandex Maps must never fall back to the default browser',
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
  await new Promise(setImmediate);
  assert.deepStrictEqual(openedUrls, ['https://yandex.ru/maps']);

  assert.strictEqual(isYandexBrowserOnlyUrl('https://vk.ru/example'), true);
  assert.strictEqual(isYandexBrowserOnlyUrl('https://web.max.ru/example'), true);
  assert.strictEqual(isYandexBrowserOnlyUrl('https://yandex.ru/maps/-/example'), true);
  assert.strictEqual(isYandexBrowserOnlyUrl('https://yandex.ru/search'), false);
  assert.strictEqual(isYandexBrowserOnlyUrl('https://example.com'), false);

  const yandexBrowserUrls = [];
  const defaultBrowserUrls = [];
  const openByBrowserPolicy = (url) => {
    (isYandexBrowserOnlyUrl(url) ? yandexBrowserUrls : defaultBrowserUrls).push(url);
  };
  handleExternalWindow('https://vk.com/example', openByBrowserPolicy);
  handleExternalNavigation('https://max.ru/example', 'http://127.0.0.1:8765', openByBrowserPolicy);
  handleExternalWindow('https://example.com', openByBrowserPolicy);
  await new Promise(setImmediate);
  assert.deepStrictEqual(yandexBrowserUrls, ['https://vk.com/example', 'https://max.ru/example']);
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
