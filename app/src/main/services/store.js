'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  // Codespace selection
  source: 'existing',          // 'existing' | 'create'
  codespace: '',               // name of an existing codespace
  createRepo: '',              // owner/repo when source === 'create'
  createBranch: '',            // optional branch
  createMachine: '',           // machine type, e.g. basicLinux32gb

  // Teardown behaviour on Disable
  teardown: 'stop',            // 'leave' | 'stop' | 'delete'

  // Routing
  mode: 'all',                 // 'all' | 'only-443' | 'domains'
  domains: 'github.com api.github.com',
  dns: true,
  gateway: false,
  localPort: 8000,
  remotePort: 9000,

  // App
  theme: 'green',              // amber | green | ice | synth | lcd
  opacity: 0.85,               // 0.3 - 1.0
  autoInstallDeps: true
};

class Store {
  constructor() {
    this._file = null;
    this._data = null;
  }

  _path() {
    if (!this._file) {
      this._file = path.join(app.getPath('userData'), 'settings.json');
    }
    return this._file;
  }

  _load() {
    if (this._data) return this._data;
    try {
      const raw = fs.readFileSync(this._path(), 'utf8');
      this._data = { ...DEFAULTS, ...JSON.parse(raw) };
    } catch (_) {
      this._data = { ...DEFAULTS };
    }
    return this._data;
  }

  all() {
    return { ...this._load() };
  }

  get(key) {
    return this._load()[key];
  }

  set(patch) {
    const data = this._load();
    Object.assign(data, patch || {});
    try {
      fs.mkdirSync(path.dirname(this._path()), { recursive: true });
      fs.writeFileSync(this._path(), JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      // Non-fatal: settings just won't persist this run.
      console.error('Failed to persist settings:', err.message);
    }
    return { ...data };
  }
}

module.exports = { Store, DEFAULTS };
