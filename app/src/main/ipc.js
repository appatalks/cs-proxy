'use strict';

const { ipcMain, BrowserWindow } = require('electron');
const path = require('path');

/**
 * Wire renderer requests to the controller and forward controller events to the
 * renderer. Every handler resolves with either a result or { __error } so the
 * renderer can surface failures without an unhandled rejection.
 */
function registerIpc(controller, getWindow) {
  const send = (channel, payload) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };
  controller.on('state', (s) => send('state', s));
  controller.on('log', (l) => send('log', l));

  const handle = (channel, fn) =>
    ipcMain.handle(channel, async (_e, ...args) => {
      try {
        return await fn(...args);
      } catch (err) {
        return { __error: err && err.message ? err.message : String(err) };
      }
    });

  handle('deps:check', () => controller.checkDeps());
  handle('deps:install', (name) => controller.installDep(name));
  handle('privilege:check', () => controller.privilegeStatus());
  handle('privilege:install', () => controller.installPrivilege());
  handle('gh:auth', () => controller.authStatus());
  handle('gh:listCodespaces', () => controller.listCodespaces());
  handle('gh:listRepos', () => controller.listRepos());
  handle('gh:listMachines', (repo) => controller.listMachines(repo));
  handle('settings:get', () => controller.getSettings());
  handle('settings:set', (patch) => controller.setSettings(patch));
  handle('vpn:enable', () => controller.enable());
  handle('vpn:disable', () => controller.disable());
  handle('vpn:validate', () => controller.validateNow());
  handle('vpn:status', () => controller.getStatus());

  handle('window:close', () => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.close();
  });

  handle('window:opacity', (val) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      const o = Math.max(0.3, Math.min(1, parseFloat(val) || 0.85));
      win.setOpacity(o);
    }
  });

  let settingsWin = null;
  handle('window:openSettings', () => {
    if (settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.focus();
      return;
    }
    const parent = getWindow();
    settingsWin = new BrowserWindow({
      width: 420,
      height: 480,
      minWidth: 340,
      minHeight: 360,
      title: 'Settings',
      frame: false,
      transparent: true,
      autoHideMenuBar: true,
      parent: parent || undefined,
      modal: false,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false
      }
    });
    settingsWin.once('ready-to-show', () => settingsWin.show());
    settingsWin.loadFile(path.join(__dirname, '..', 'renderer', 'settings.html'));
    settingsWin.on('closed', () => { settingsWin = null; });
  });

  handle('settings:saved', () => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('settings-saved');
  });
}

module.exports = { registerIpc };
