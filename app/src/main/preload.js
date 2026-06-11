'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Secure bridge between the renderer and the main process.
 * The renderer never gets Node or ipcRenderer directly; only the
 * explicit functions below are exposed on window.api.
 */
const api = {
  deps: {
    check: () => ipcRenderer.invoke('deps:check'),
    install: (name) => ipcRenderer.invoke('deps:install', name)
  },
  privilege: {
    check: () => ipcRenderer.invoke('privilege:check'),
    install: () => ipcRenderer.invoke('privilege:install')
  },
  gh: {
    authStatus: () => ipcRenderer.invoke('gh:auth'),
    listCodespaces: () => ipcRenderer.invoke('gh:listCodespaces'),
    listRepos: () => ipcRenderer.invoke('gh:listRepos'),
    listMachines: (repo) => ipcRenderer.invoke('gh:listMachines', repo)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch)
  },
  vpn: {
    enable: () => ipcRenderer.invoke('vpn:enable'),
    disable: () => ipcRenderer.invoke('vpn:disable'),
    validate: () => ipcRenderer.invoke('vpn:validate'),
    status: () => ipcRenderer.invoke('vpn:status')
  },
  /** Subscribe to controller state transitions. Returns an unsubscribe fn. */
  onState: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('state', listener);
    return () => ipcRenderer.removeListener('state', listener);
  },
  /** Subscribe to streaming log lines. Returns an unsubscribe fn. */
  onLog: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('log', listener);
    return () => ipcRenderer.removeListener('log', listener);
  },
  /** Subscribe to settings-saved notifications from the settings window. */
  onSettingsSaved: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('settings-saved', listener);
    return () => ipcRenderer.removeListener('settings-saved', listener);
  },
  closeWindow: () => ipcRenderer.invoke('window:close'),
  setOpacity: (val) => ipcRenderer.invoke('window:opacity', val),
  openSettings: () => ipcRenderer.invoke('window:openSettings'),
  settingsSaved: () => ipcRenderer.invoke('settings:saved')
};

contextBridge.exposeInMainWorld('api', api);
