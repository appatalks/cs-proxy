'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('path');
const Controller = require('./services/controller');
const { registerIpc } = require('./ipc');

let mainWindow = null;
let controller = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 380,
    height: 160,
    minWidth: 380,
    minHeight: 140,
    title: 'CS-Proxy',
    frame: false,
    transparent: true,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  controller = new Controller();
  registerIpc(controller, () => mainWindow);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Make sure we never leave orphaned sshuttle / ssh tunnel processes behind.
let shuttingDown = false;
app.on('before-quit', async (event) => {
  if (shuttingDown || !controller) return;
  event.preventDefault();
  shuttingDown = true;
  try {
    await controller.shutdown();
  } catch (_) {
    /* best effort */
  } finally {
    app.quit();
  }
});
