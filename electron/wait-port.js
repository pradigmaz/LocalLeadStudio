const net = require('net');

// Резолвится, когда на 127.0.0.1:port кто-то слушает; реджектится по таймауту.
function waitForPort(port, timeoutMs = 30000, intervalMs = 400) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const sock = net.connect(port, '127.0.0.1');
      sock.once('connect', () => { sock.destroy(); resolve(); });
      sock.once('error', () => {
        sock.destroy();
        if (Date.now() >= deadline) reject(new Error(`port ${port} not up in ${timeoutMs}ms`));
        else setTimeout(tryOnce, intervalMs);
      });
    };
    tryOnce();
  });
}

function portStartupError(port, occupied) {
  return occupied
    ? `Порт ${port} уже занят. Закройте запущенный LeadStudio или другое приложение и повторите запуск.`
    : null;
}

module.exports = { waitForPort, portStartupError };
