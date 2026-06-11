'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { run, runOk } = require('./proc');

const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

function sshAlias(name) {
  return `cs.${name}.main`;
}

/** `gh auth status` -> { ok, login }. */
async function authStatus() {
  const res = await run('gh', ['auth', 'status']);
  const text = `${res.stdout}\n${res.stderr}`;
  const m = text.match(/account (\S+)/i) || text.match(/as (\S+)/i);
  return { ok: res.code === 0, login: m ? m[1] : '' };
}

/** All codespaces for the authenticated user. */
async function listCodespaces() {
  const res = await run('gh', [
    'codespace', 'list',
    '--json', 'name,displayName,state,repository,gitStatus,lastUsedAt,createdAt'
  ]);
  if (res.code !== 0) {
    throw new Error(res.stderr.trim() || 'gh codespace list failed');
  }
  try {
    return JSON.parse(res.stdout || '[]');
  } catch (_) {
    return [];
  }
}

/**
 * Find a codespace this app previously created (tagged with our display name),
 * so repeated Enable clicks reuse it instead of creating duplicates. Prefers a
 * matching repo and the most recently used one.
 */
async function findManaged(repo, displayName = 'cs-proxy') {
  let list;
  try {
    list = await listCodespaces();
  } catch (_) {
    return null;
  }
  let matches = list.filter((c) => c.displayName === displayName);
  if (repo) matches = matches.filter((c) => c.repository === repo);
  if (!matches.length) return null;
  matches.sort((a, b) =>
    new Date(b.lastUsedAt || b.createdAt || 0) - new Date(a.lastUsedAt || a.createdAt || 0));
  return matches[0];
}

/** Current state of a single codespace, or '' if unknown. */
async function codespaceState(name) {
  const res = await run('gh', ['codespace', 'view', '-c', name, '--json', 'state']);
  if (res.code !== 0) return '';
  try {
    return JSON.parse(res.stdout).state || '';
  } catch (_) {
    return '';
  }
}

/** Repositories the user can create codespaces from. */
async function listRepos(limit = 100) {
  const res = await run('gh', ['repo', 'list', '--json', 'nameWithOwner', '--limit', String(limit)]);
  if (res.code !== 0) return [];
  try {
    return JSON.parse(res.stdout).map((r) => r.nameWithOwner);
  } catch (_) {
    return [];
  }
}

/** Machine types available for a repo (best effort). */
async function listMachines(repo) {
  if (!REPO_RE.test(repo || '')) return [];
  const res = await run('gh', [
    'api', `repos/${repo}/codespaces/machines`,
    '--jq', '.machines[].name'
  ]);
  if (res.code !== 0) return [];
  return res.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Ensure ~/.ssh/config contains a Host block for this codespace so sshuttle and
 * the reverse tunnel can reference `cs.<name>.main`.
 */
async function ensureSshConfig(name) {
  const sshDir = path.join(os.homedir(), '.ssh');
  const cfgPath = path.join(sshDir, 'config');
  let text = '';
  try { text = fs.readFileSync(cfgPath, 'utf8'); } catch (_) { /* no config yet */ }
  if (text.includes(sshAlias(name))) return { added: false };

  const res = await runOk('gh', ['codespace', 'ssh', '-c', name, '--config']);
  fs.mkdirSync(sshDir, { recursive: true, mode: 0o700 });
  const sep = text.length && !text.endsWith('\n') ? '\n' : '';
  fs.appendFileSync(cfgPath, `${sep}${res.stdout.trimEnd()}\n`, { mode: 0o600 });
  return { added: true };
}

/** Wake a stopped codespace (gh has no `start`, so we SSH a no-op into it). */
async function wake(name, onLine) {
  return runOk('gh', ['codespace', 'ssh', '-c', name, '--', 'echo', 'cs-proxy-ready'],
    { timeout: 180000, onLine });
}

/** Create a new codespace; resolves with its generated name. */
async function create({ repo, branch, machine, displayName }, onLine) {
  if (!REPO_RE.test(repo || '')) throw new Error(`Invalid repository: ${repo}`);

  // gh prompts for a machine type when -m is omitted. That prompt needs a TTY,
  // which we don't have when spawned from the app, so it fails with
  // "error getting machine: no terminal". Default to the first (cheapest)
  // available type to keep the command non-interactive.
  let machineType = machine;
  if (!machineType) {
    const machines = await listMachines(repo);
    if (!machines.length) {
      throw new Error(`No machine types available for ${repo}. Check repository access and Codespaces billing.`);
    }
    machineType = machines[0];
    if (onLine) onLine(`No machine type set; defaulting to ${machineType}`, 'stdout');
  }

  const args = ['codespace', 'create', '-R', repo, '-m', machineType, '--default-permissions'];
  if (branch) args.push('-b', branch);
  if (displayName) args.push('--display-name', displayName);

  const res = await run('gh', args, { timeout: 240000, onLine });
  if (res.code !== 0) {
    throw new Error(res.stderr.trim() || 'gh codespace create failed');
  }
  const lines = res.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const created = lines[lines.length - 1];
  if (!created) throw new Error('Codespace created but no name was returned');
  return created;
}

async function stop(name) {
  return runOk('gh', ['codespace', 'stop', '-c', name], { timeout: 120000 });
}

async function remove(name) {
  return runOk('gh', ['codespace', 'delete', '-c', name, '--force'], { timeout: 120000 });
}

/** Run a command inside the codespace and return its stdout. */
async function exec(name, argv, opts = {}) {
  const res = await run('gh', ['codespace', 'ssh', '-c', name, '--', ...argv],
    { timeout: opts.timeout || 20000 });
  return { code: res.code, stdout: res.stdout.trim(), stderr: res.stderr.trim() };
}

module.exports = {
  authStatus,
  listCodespaces,
  findManaged,
  codespaceState,
  listRepos,
  listMachines,
  ensureSshConfig,
  wake,
  create,
  stop,
  remove,
  exec,
  sshAlias
};
