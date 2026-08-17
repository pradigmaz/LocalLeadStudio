const { app, BrowserWindow, shell } = require('electron');
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const { handleExternalWindow } = require('./external-links');
const { waitForPort } = require('./wait-port');

const PORT = 8765;
const BACKEND_DIR = path.join(__dirname, '..', 'backend');
let backend = null;

// Одна попытка коннекта: занят ли порт уже живым backend.
function isPortListening(port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const sock = net.connect(port, '127.0.0.1');
    const done = (up) => { sock.destroy(); resolve(up); };
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
    sock.setTimeout(timeoutMs, () => done(false));
  });
}

// Packaged: запускаем самодостаточный PyInstaller-бандл (Python не нужен на машине).
// Dev: системный `python` + установленные backend-зависимости.
async function startBackend() {
  // Зомби-инстанс с прошлого запуска уже держит порт — переиспользуем его,
  // иначе новый процесс не сможет забиндиться (WinError 10048) и окно упадёт.
  if (await isPortListening(PORT)) {
    console.log(`backend already running on ${PORT}, reusing`);
    return;
  }
  if (app.isPackaged) {
    const exe = path.join(process.resourcesPath, 'lls-backend', 'lls-backend.exe');
    // Данные — рядом с портативным .exe (а не во временной папке распаковки).
    const baseDir = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath);
    const dataDir = path.join(baseDir, 'lead_studio_data');
    backend = spawn(exe, ['--port', String(PORT)], {
      cwd: path.dirname(exe),
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, LLS_DATA_DIR: dataDir },
    });
  } else {
    const fs = require('fs');
    const isWin = process.platform === 'win32';
    const venvPython = isWin
      ? path.join(BACKEND_DIR, 'venv', 'Scripts', 'python.exe')
      : path.join(BACKEND_DIR, 'venv', 'bin', 'python3');
    const pythonBin = fs.existsSync(venvPython) ? venvPython : (isWin ? 'python' : 'python3');

    backend = spawn(pythonBin, ['yamap_landing_web.py', '--port', String(PORT)], {
      cwd: BACKEND_DIR,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, LLS_DATA_DIR: path.join(__dirname, '..', 'lead_studio_data') },
    });
  }
  backend.on('exit', (code) => {
    if (code) console.error(`backend exited with code ${code}`);
  });
}

function killBackend() {
  if (backend && !backend.killed) backend.kill();
  backend = null;
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    title: 'Local Lead Studio',
    backgroundColor: '#f1f5f9',
  });
  try {
    await waitForPort(PORT);
    win.loadURL(`http://127.0.0.1:${PORT}`);
    win.webContents.on('did-finish-load', () => win.webContents.setZoomFactor(1));
    win.webContents.setWindowOpenHandler(({ url }) => handleExternalWindow(url, shell.openExternal));
  } catch (err) {
    win.loadURL('data:text/html,' + encodeURIComponent(
      `<h2 style="font-family:sans-serif;padding:2rem">Backend не запустился: ${err.message}.<br>Проверь, что установлен Python и зависимости backend.</h2>`
    ));
  }
}

app.whenReady().then(async () => {
  await startBackend();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  killBackend();
  app.quit();
});
app.on('quit', killBackend);
