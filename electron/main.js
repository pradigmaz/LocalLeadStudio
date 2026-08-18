const { app, BrowserWindow, shell } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');
const { handleExternalNavigation, handleExternalWindow, isYandexBrowserOnlyUrl } = require('./external-links');
const { waitForPort, portStartupError } = require('./wait-port');

const PORT = 8765;
const BACKEND_DIR = path.join(__dirname, '..', 'backend');
let backend = null;
let mainWindow = null;

function findYandexBrowser() {
  const roots = [process.env.LOCALAPPDATA, process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean);
  return roots
    .map((root) => path.join(root, 'Yandex', 'YandexBrowser', 'Application', 'browser.exe'))
    .find((browserPath) => fs.existsSync(browserPath));
}

function openYandexBrowser(url) {
  const browserPath = findYandexBrowser();
  if (!browserPath) {
    console.error(`Yandex Browser не найден; ссылка не открыта: ${url}`);
    return;
  }
  const child = spawn(browserPath, [url], { detached: true, stdio: 'ignore', windowsHide: true });
  child.once('error', (error) => console.error(`Не удалось открыть Yandex Browser: ${error.message}`));
  child.unref();
}

function openExternalLink(url) {
  if (isYandexBrowserOnlyUrl(url)) {
    openYandexBrowser(url);
    return;
  }
  void shell.openExternal(url);
}

// Одна попытка коннекта: занят ли порт другим процессом.
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
  const startupError = portStartupError(PORT, await isPortListening(PORT));
  if (startupError) return startupError;
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
  return null;
}

function killBackend() {
  if (backend && !backend.killed) backend.kill();
  backend = null;
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

function loadBackendError(win, message) {
  win.loadURL('data:text/html,' + encodeURIComponent(
    `<h2 style="font-family:sans-serif;padding:2rem">${message}</h2>`
  ));
}

async function createWindow(startupError = null) {
  if (mainWindow) {
    focusMainWindow();
    return;
  }
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1120,
    title: 'Local Lead Studio',
    backgroundColor: '#f1f5f9',
  });
  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
  if (startupError) {
    loadBackendError(win, startupError);
    return;
  }
  try {
    await waitForPort(PORT);
    win.loadURL(`http://127.0.0.1:${PORT}`);
    win.webContents.on('did-finish-load', () => win.webContents.setZoomFactor(1));
    win.webContents.setWindowOpenHandler(({ url }) => handleExternalWindow(url, openExternalLink));
    win.webContents.on('will-navigate', (event, url) => {
      if (handleExternalNavigation(url, `http://127.0.0.1:${PORT}`, openExternalLink)) event.preventDefault();
    });
  } catch (err) {
    loadBackendError(win, `Backend не запустился: ${err.message}. Проверь, что установлен Python и зависимости backend.`);
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', focusMainWindow);
  app.whenReady().then(async () => {
    const startupError = await startBackend();
    await createWindow(startupError);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(startupError);
    });
  });

  app.on('window-all-closed', () => {
    killBackend();
    app.quit();
  });
  app.on('quit', killBackend);
}
