// ponytail-минимум: проверяет нетривиальную логику waitForPort без запуска Electron.
const assert = require('assert');
const net = require('net');
const { waitForPort } = require('./wait-port');

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

  console.log('selfcheck ok');
})().catch((e) => { console.error(e); process.exit(1); });
