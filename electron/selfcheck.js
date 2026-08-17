// ponytail-минимум: проверяет нетривиальную логику waitForPort без запуска Electron.
const assert = require('assert');
const net = require('net');
const { waitForPort } = require('./wait-port');
const { handleExternalNavigation, handleExternalWindow } = require('./external-links');

(async () => {
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
