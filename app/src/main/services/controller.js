'use strict';

const EventEmitter = require('events');
const os = require('os');
const path = require('path');

const { Store, DEFAULTS } = require('./store');
const deps = require('./deps');
const privilege = require('./privilege');
const gh = require('./gh');
const validate = require('./validate');
const { Tunnel } = require('./tunnel');

/**
 * Orchestrates the whole Enable/Disable lifecycle and exposes a small command
 * surface to the IPC layer. Emits:
 *   'state' -> full UI status snapshot on every transition
 *   'log'   -> { line, stream, t } streaming output lines
 */
class Controller extends EventEmitter {
  constructor() {
    super();
    this._augmentPath();
    this.store = new Store();
    this.tunnel = new Tunnel();
    this._active = null; // { codespace, created }
    this.state = {
      phase: 'disabled',
      detail: 'Idle',
      busy: false,
      error: '',
      codespace: '',
      mode: '',
      ip: '',
      tunnel: 'down',
      validated: null,
      checks: []
    };
  }

  // GUI apps launched from a desktop entry often inherit a minimal PATH, so make
  // sure the usual locations for gh / sshuttle / pip --user binaries are present.
  _augmentPath() {
    const extra = ['/usr/local/bin', '/opt/homebrew/bin', path.join(os.homedir(), '.local', 'bin')];
    const parts = (process.env.PATH || '').split(path.delimiter);
    for (const p of extra) if (p && !parts.includes(p)) parts.push(p);
    process.env.PATH = parts.join(path.delimiter);
  }

  _setState(patch) {
    Object.assign(this.state, patch);
    this.emit('state', { ...this.state });
  }

  _log(line, stream = 'stdout') {
    this.emit('log', { line: String(line), stream, t: Date.now() });
  }

  getStatus() {
    return { ...this.state };
  }

  getSettings() {
    return this.store.all();
  }

  setSettings(patch) {
    // Only persist known keys, and coerce the numeric/boolean ones.
    const clean = {};
    for (const key of Object.keys(DEFAULTS)) {
      if (!patch || !(key in patch)) continue;
      const v = patch[key];
      if (key === 'localPort' || key === 'remotePort') {
        const n = parseInt(v, 10);
        if (Number.isFinite(n) && n > 0 && n < 65536) clean[key] = n;
      } else if (key === 'opacity') {
        const n = parseFloat(v);
        if (Number.isFinite(n)) clean[key] = Math.max(0.3, Math.min(1, n));
      } else if (typeof DEFAULTS[key] === 'boolean') {
        clean[key] = !!v;
      } else {
        clean[key] = v;
      }
    }
    return this.store.set(clean);
  }

  // --- passthrough commands used by Settings UI ---
  checkDeps() { return deps.check(); }
  installDep(name) { return deps.install(name, (l, s) => this._log(l, s)); }
  privilegeStatus() { return privilege.status(); }
  installPrivilege() { return privilege.install((l, s) => this._log(l, s)); }
  authStatus() { return gh.authStatus(); }
  listCodespaces() { return gh.listCodespaces(); }
  listRepos() { return gh.listRepos(); }
  listMachines(repo) { return gh.listMachines(repo); }

  _routes(s) {
    const routes = [];
    if (s.mode === 'all') routes.push('0.0.0.0/0');
    else if (s.mode === 'only-443') routes.push('0.0.0.0/0:443');
    else if (s.mode === 'domains') {
      for (const d of (s.domains || '').trim().split(/\s+/)) if (d) routes.push(`${d}:443`);
    }
    return routes;
  }

  _modeLabel(s) {
    const base = s.mode === 'all' ? 'ALL' : s.mode === 'only-443' ? '443' : 'DOMAINS';
    const flags = [s.dns ? 'DNS' : null, s.gateway ? 'GW' : null].filter(Boolean).join('+');
    return flags ? `${base}+${flags}` : base;
  }

  async enable() {
    if (this.state.busy) return { ok: false, error: 'Busy' };
    const log = (l, s) => this._log(l, s);
    this._setState({ busy: true, error: '', phase: 'checking', detail: 'Checking dependencies', checks: [], ip: '', validated: null });

    try {
      const s = this.store.all();

      // 1. Dependencies
      const dep = await deps.check();
      const missing = dep.tools.filter((t) => !t.ok);
      if (missing.length) {
        if (!s.autoInstallDeps) {
          throw new Error(`Missing: ${missing.map((t) => t.name).join(', ')}. Enable auto-install or install manually.`);
        }
        for (const t of missing) {
          this._setState({ detail: `Installing ${t.name}` });
          this._log(`Installing ${t.name}...`);
          const r = await deps.install(t.name, log);
          if (!r.ok) throw new Error(`Could not install ${t.name}: ${r.error}`);
        }
      }

      // 2. GitHub auth
      const auth = await gh.authStatus();
      if (!auth.ok) throw new Error('Not logged in to GitHub. Run "gh auth login" in a terminal.');

      // 3. Resolve / create the codespace
      let name = s.codespace;
      let created = false;

      if (s.source === 'create') {
        if (!s.createRepo) throw new Error('No repository set for new codespace. Open Settings.');
        if (this._active && this._active.codespace) {
          // A previous attempt this session already created one. Reuse it so a
          // retry never spawns a duplicate.
          name = this._active.codespace;
          created = this._active.created;
          this._log(`Reusing codespace from this session: ${name}`);
        } else {
          // Reuse a codespace this app created earlier (survives restarts)
          // instead of creating another one each time Enable is pressed.
          const managed = await gh.findManaged(s.createRepo);
          if (managed) {
            name = managed.name;
            created = true;
            this._log(`Reusing managed codespace ${name} (${managed.state})`);
          } else {
            this._setState({ phase: 'starting', detail: 'Creating codespace' });
            this._log(`Creating codespace from ${s.createRepo}...`);
            name = await gh.create(
              { repo: s.createRepo, branch: s.createBranch, machine: s.createMachine, displayName: 'cs-proxy' },
              log
            );
            created = true;
            this._log(`Created codespace: ${name}`);
          }
        }
      } else if (!name) {
        throw new Error('No codespace selected. Open Settings to choose one.');
      }
      this._active = { codespace: name, created };
      this._setState({ codespace: name });

      // 4. Make sure it is running
      this._setState({ phase: 'starting', detail: 'Starting codespace' });
      await gh.wake(name, log);

      // 5. SSH config for sshuttle / reverse tunnel
      this._setState({ phase: 'configuring', detail: 'Configuring SSH' });
      await gh.ensureSshConfig(name);

      // 6. Routed traffic via sshuttle
      const routes = this._routes(s);
      if (routes.length) {
        const pstat = await privilege.status();
        if (pstat.needed && !pstat.configured) {
          this._setState({ detail: 'Authorizing firewall' });
          const pr = await privilege.install(log);
          if (!pr.ok) throw new Error(`Firewall authorization failed: ${pr.error}`);
        }
        this._setState({ phase: 'tunneling', detail: 'Starting tunnel' });
        await this.tunnel.startSshuttle({ alias: gh.sshAlias(name), routes, dns: s.dns, onLine: log });
        this._setState({ tunnel: 'up' });
      }

      // 7. Reverse gateway tunnel
      if (s.gateway) {
        this._setState({ phase: 'tunneling', detail: 'Opening reverse tunnel' });
        await this.tunnel.startReverse({
          alias: gh.sshAlias(name),
          localPort: s.localPort,
          remotePort: s.remotePort,
          onLine: log
        });
      }

      this._setState({ mode: this._modeLabel(s) });

      // 8. Validate
      this._setState({ phase: 'validating', detail: 'Validating tunnel' });
      const v = await validate.validate({
        codespace: name, mode: s.mode, domains: s.domains, gateway: s.gateway, tunnel: this.tunnel
      });
      this._setState({
        validated: v.ok,
        checks: v.checks,
        ip: v.localIp || v.codespaceIp || ''
      });

      this._setState({
        phase: 'enabled',
        detail: v.ok ? 'Connected' : 'Connected (check warnings)'
      });
      return { ok: true, validated: v.ok };
    } catch (err) {
      this._log(err.message, 'stderr');
      try { await this.tunnel.stop(); } catch (_) { /* noop */ }
      this._setState({ phase: 'error', detail: 'Error', error: err.message, tunnel: 'down' });
      return { ok: false, error: err.message };
    } finally {
      this._setState({ busy: false });
    }
  }

  async disable() {
    if (this.state.busy) return { ok: false, error: 'Busy' };
    this._setState({ busy: true, error: '', phase: 'disabling', detail: 'Stopping tunnel' });
    try {
      await this.tunnel.stop();
      this._setState({ tunnel: 'down' });

      const s = this.store.all();
      const active = this._active;
      if (active && active.codespace) {
        if (s.teardown === 'delete') {
          this._setState({ detail: 'Deleting codespace' });
          this._log(`Deleting codespace ${active.codespace}...`);
          await gh.remove(active.codespace);
        } else if (s.teardown === 'stop') {
          this._setState({ detail: 'Stopping codespace' });
          this._log(`Stopping codespace ${active.codespace}...`);
          await gh.stop(active.codespace);
        }
      }
      this._active = null;
      this._setState({
        phase: 'disabled', detail: 'Disabled', codespace: '', mode: '',
        ip: '', validated: null, checks: []
      });
      return { ok: true };
    } catch (err) {
      this._log(err.message, 'stderr');
      this._setState({ phase: 'error', detail: 'Error', error: err.message });
      return { ok: false, error: err.message };
    } finally {
      this._setState({ busy: false });
    }
  }

  async validateNow() {
    if (!this._active || !this._active.codespace) {
      return { ok: false, error: 'Not connected' };
    }
    const s = this.store.all();
    this._setState({ phase: 'validating', detail: 'Validating tunnel', busy: true });
    try {
      const v = await validate.validate({
        codespace: this._active.codespace, mode: s.mode, domains: s.domains,
        gateway: s.gateway, tunnel: this.tunnel
      });
      this._setState({
        validated: v.ok, checks: v.checks, ip: v.localIp || v.codespaceIp || '',
        phase: 'enabled', detail: v.ok ? 'Connected' : 'Connected (check warnings)'
      });
      return { ok: v.ok, ...v };
    } finally {
      this._setState({ busy: false });
    }
  }

  // Called on app quit: only tear down local processes, never touch the codespace.
  async shutdown() {
    try { await this.tunnel.stop(); } catch (_) { /* best effort */ }
  }
}

module.exports = Controller;
