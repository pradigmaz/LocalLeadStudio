const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');
const { handleExternalNavigation, handleExternalWindow, shouldOpenInDedicatedBrowser } = require('./external-links');
const {
  discoverBrowsers,
  isBrowserExecutable,
  readBrowserRouting,
  saveBrowserRouting,
} = require('./browser-routing');
const { waitForPort, portStartupError } = require('./wait-port');

const PORT = 8765;
const BACKEND_DIR = path.join(__dirname, '..', 'backend');
let backend = null;
let mainWindow = null;

function getDataDir() {
  const baseDir = app.isPackaged
    ? process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath)
    : path.join(__dirname, '..');
  return path.join(baseDir, 'lead_studio_data');
}

function getBrowserRoutingDataDir() {
  return app.getPath('userData');
}

function selectedBrowserLabel(routing) {
  return routing.browserLabel || path.basename(routing.browserPath || 'браузер', '.exe');
}

function openDedicatedBrowser(url, routing) {
  const child = spawn(routing.browserPath, [url], {
    detached: true,
    shell: false,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.once('error', () => { void showUnavailableBrowserDialog(url, routing); });
  child.unref();
}

async function chooseBrowserExecutable() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Выберите браузер',
    properties: ['openFile'],
    filters: [{ name: 'Браузер', extensions: ['exe'] }],
  });
  const browserPath = result.canceled ? '' : result.filePaths[0];
  if (!browserPath) return null;
  if (!isBrowserExecutable(browserPath)) throw new Error('Выберите существующий файл браузера с расширением .exe.');
  return { path: browserPath, label: path.basename(browserPath, '.exe') };
}

async function showUnavailableBrowserDialog(url, routing) {
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Отдельный браузер не найден',
    message: `${selectedBrowserLabel(routing)} больше недоступен.`,
    detail: 'Откройте ссылку браузером Windows по умолчанию или выберите другой браузер.',
    buttons: ['Использовать браузер Windows по умолчанию', 'Выбрать другой браузер', 'Отмена'],
    defaultId: 1,
    cancelId: 2,
    noLink: true,
  });
  if (response === 0) {
    saveBrowserRouting(getBrowserRoutingDataDir(), { onboarding: 'complete', mode: 'default' });
    await shell.openExternal(url);
    return;
  }
  if (response === 1) {
    try {
      const browser = await chooseBrowserExecutable();
      if (!browser) return;
      const nextRouting = saveBrowserRouting(getBrowserRoutingDataDir(), {
        onboarding: 'complete',
        mode: 'dedicated',
        browserPath: browser.path,
        browserLabel: browser.label,
      });
      openDedicatedBrowser(url, nextRouting);
    } catch (error) {
      console.error(`Не удалось выбрать браузер: ${error.message}`);
    }
  }
}

async function openExternalLink(url, forceDedicatedBrowser = false) {
  const routing = readBrowserRouting(getBrowserRoutingDataDir());
  if (!shouldOpenInDedicatedBrowser(url, forceDedicatedBrowser, routing.mode)) {
    await shell.openExternal(url);
    return;
  }
  if (!isBrowserExecutable(routing.browserPath)) {
    await showUnavailableBrowserDialog(url, routing);
    return;
  }
  openDedicatedBrowser(url, routing);
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
    backend = spawn(exe, ['--port', String(PORT)], {
      cwd: path.dirname(exe),
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, LLS_DATA_DIR: getDataDir() },
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
      env: { ...process.env, LLS_DATA_DIR: getDataDir() },
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
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
    `<h2 style="font-family:sans-serif;padding:2rem">${message}</h2>`
  ));
}

function validateLocalSender(event) {
  try {
    return new URL(event.senderFrame.url).origin === `http://127.0.0.1:${PORT}`;
  } catch {
    return false;
  }
}

function requireLocalSender(event) {
  if (!validateLocalSender(event)) throw new Error('Настройки браузера доступны только локальному окну LeadStudio.');
}

function saveRoutingFromRenderer(value) {
  if (!value || typeof value !== 'object') throw new Error('Переданы некорректные настройки браузера.');
  if (value.mode !== 'dedicated') {
    return saveBrowserRouting(getBrowserRoutingDataDir(), { onboarding: 'complete', mode: 'default' });
  }
  if (!isBrowserExecutable(value.browserPath)) {
    throw new Error('Выбранный браузер не найден. Выберите существующий файл .exe.');
  }
  return saveBrowserRouting(getBrowserRoutingDataDir(), {
    onboarding: 'complete',
    mode: 'dedicated',
    browserPath: value.browserPath,
    browserLabel: typeof value.browserLabel === 'string' ? value.browserLabel : path.basename(value.browserPath, '.exe'),
  });
}

function registerBrowserRoutingIpcHandlers() {
  ipcMain.handle('browser-routing:get', (event) => {
    requireLocalSender(event);
    return readBrowserRouting(getBrowserRoutingDataDir());
  });
  ipcMain.handle('browser-routing:list', (event) => {
    requireLocalSender(event);
    return discoverBrowsers();
  });
  ipcMain.handle('browser-routing:save', (event, value) => {
    requireLocalSender(event);
    return saveRoutingFromRenderer(value);
  });
  ipcMain.handle('browser-routing:choose-executable', async (event) => {
    requireLocalSender(event);
    const browser = await chooseBrowserExecutable();
    return browser && { id: 'custom', label: browser.label, path: browser.path, recommended: false };
  });
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
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  mainWindow = win;
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
  try {
    await win.loadFile(path.join(__dirname, 'startup.html'));
  } catch (err) {
    loadBackendError(win, `Не удалось открыть экран запуска: ${err.message}`);
    return;
  }
  if (startupError) {
    loadBackendError(win, startupError);
    return;
  }
  try {
    await waitForPort(PORT);
    win.loadURL(`http://127.0.0.1:${PORT}`);
    win.webContents.on('did-finish-load', () => win.webContents.setZoomFactor(1));
    win.webContents.setWindowOpenHandler(({ url, frameName }) => (
      handleExternalWindow(url, openExternalLink, frameName === 'lead-studio-site')
    ));
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
    registerBrowserRoutingIpcHandlers();
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
