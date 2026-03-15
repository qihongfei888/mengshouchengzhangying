const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // 加载现有的前端页面（项目根目录下的 index.html）
  const indexPath = path.join(__dirname, '..', 'index.html');
  mainWindow.loadFile(indexPath);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 选择数据目录：默认是当前离线应用目录下的 data 文件夹
function getDataDir() {
  const baseDir = path.join(__dirname, 'data');
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }
  return baseDir;
}

function getLocalSnapshotPath() {
  const dataDir = getDataDir();
  return path.join(dataDir, 'localStorageSnapshot.json');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // 在 Windows 上，全部窗口关闭时退出应用
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ===== IPC: 读写本地 localStorage 快照到磁盘 =====
ipcMain.handle('offline:loadLocalSnapshot', async () => {
  try {
    const filePath = getLocalSnapshotPath();
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('读取本地快照失败:', e);
    return {};
  }
});

ipcMain.handle('offline:saveLocalSnapshot', async (_event, snapshot) => {
  try {
    const filePath = getLocalSnapshotPath();
    const tmpPath = filePath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(snapshot, null, 2), 'utf-8');
    fs.renameSync(tmpPath, filePath);
    return { ok: true };
  } catch (e) {
    console.error('写入本地快照失败:', e);
    return { ok: false, error: String(e) };
  }
});

