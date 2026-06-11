'use strict';

const { run } = require('./proc');

// Tools the app needs at runtime. ssh ships with virtually every OS; gh and
// sshuttle are the ones users may be missing.
const REQUIRED = ['gh', 'sshuttle', 'ssh'];

// Package name for each tool per package manager. null => not installable
// through that manager (use a fallback instead).
const PACKAGES = {
  brew:   { gh: 'gh',         sshuttle: 'sshuttle', ssh: null },
  apt:    { gh: 'gh',         sshuttle: 'sshuttle', ssh: 'openssh-client' },
  dnf:    { gh: 'gh',         sshuttle: 'sshuttle', ssh: 'openssh-clients' },
  pacman: { gh: 'github-cli', sshuttle: 'sshuttle', ssh: 'openssh' },
  zypper: { gh: 'gh',         sshuttle: 'sshuttle', ssh: 'openssh-clients' },
  pip:    { gh: null,         sshuttle: 'sshuttle', ssh: null }
};

async function which(cmd) {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  const res = await run(probe, [cmd]);
  return res.code === 0 ? res.stdout.trim().split(/\r?\n/)[0] : '';
}

async function version(name) {
  if (name === 'ssh') {
    const r = await run('ssh', ['-V']); // ssh prints its version to stderr
    return (r.stderr || r.stdout).trim().split(/\r?\n/)[0] || '';
  }
  const r = await run(name, ['--version']);
  return (r.stdout || r.stderr).trim().split(/\r?\n/)[0] || '';
}

async function detectManager() {
  if (process.platform === 'darwin') {
    return (await which('brew')) ? 'brew' : null;
  }
  for (const m of ['apt-get', 'dnf', 'pacman', 'zypper']) {
    if (await which(m)) return m === 'apt-get' ? 'apt' : m;
  }
  return null;
}

/** Inspect the toolchain and report what is present and how we could install it. */
async function check() {
  const tools = [];
  for (const name of REQUIRED) {
    const p = await which(name);
    tools.push({ name, ok: !!p, path: p, version: p ? await version(name) : '', required: true });
  }
  const manager = await detectManager();
  const hasPkexec = process.platform === 'darwin' ? true : !!(await which('pkexec'));
  const hasPip = !!(await which('pip3'));
  return {
    tools,
    manager,
    hasPkexec,
    hasPip,
    platform: process.platform,
    missing: tools.filter((t) => !t.ok).map((t) => t.name)
  };
}

function innerInstallCmd(manager, pkg) {
  switch (manager) {
    case 'apt': return `apt-get update && apt-get install -y ${pkg}`;
    case 'dnf': return `dnf install -y ${pkg}`;
    case 'pacman': return `pacman -S --noconfirm ${pkg}`;
    case 'zypper': return `zypper install -y ${pkg}`;
    default: return null;
  }
}

/**
 * Best-effort install of a single tool. Streams output through onLine.
 * Resolves with { ok, error?, manager?, version? }.
 */
async function install(name, onLine = () => {}) {
  if (!REQUIRED.includes(name)) return { ok: false, error: `Unknown dependency: ${name}` };
  const info = await check();
  const manager = info.manager;
  const pkgFor = (mgr) => (PACKAGES[mgr] || {})[name];

  let cmd;
  let args;
  let privileged = false;
  let usedManager = manager;

  if (process.platform === 'darwin') {
    if (manager === 'brew' && pkgFor('brew')) {
      cmd = 'brew';
      args = ['install', pkgFor('brew')];
    } else {
      return { ok: false, error: 'Homebrew not found. Install it from https://brew.sh then retry.' };
    }
  } else if (manager && pkgFor(manager)) {
    const inner = innerInstallCmd(manager, pkgFor(manager));
    privileged = true;
    if (!info.hasPkexec) {
      return { ok: false, error: `Root access needed. Run in a terminal:  sudo ${inner}` };
    }
    cmd = 'pkexec';
    args = ['sh', '-c', inner]; // inner is built from a fixed table, never user input
  } else if (info.hasPip && pkgFor('pip')) {
    cmd = 'pip3';
    args = ['install', '--user', pkgFor('pip')];
    usedManager = 'pip';
  } else {
    return { ok: false, error: `No supported installer found for ${name} on this system.` };
  }

  onLine(`$ ${cmd} ${args.join(' ')}`, 'stdout');
  const res = await run(cmd, args, { timeout: 180000, onLine });
  if (res.code !== 0) {
    const tail = (res.stderr || res.stdout || '').trim().split(/\r?\n/).slice(-2).join(' ');
    return { ok: false, error: `Install failed (exit ${res.code}). ${tail}`.trim(), manager: usedManager };
  }
  const after = await which(name);
  return { ok: !!after, manager: usedManager, version: after ? await version(name) : '' };
}

module.exports = { check, install, which, REQUIRED };
