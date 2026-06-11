'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { app } = require('electron');
const { run } = require('./proc');

const SUDOERS_PATH = '/etc/sudoers.d/gh-cs-proxy';
// Bump when the rule format changes so existing installs get re-provisioned.
const RULE_VERSION = 2;

function markerPath() {
  return path.join(app.getPath('userData'), '.sshuttle-sudoers-installed');
}

/** Absolute path to the sshuttle that will actually run (e.g. /usr/bin/sshuttle). */
async function resolveSshuttlePath() {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  const w = await run(probe, ['sshuttle']);
  const first = w.stdout.trim().split(/\r?\n/)[0];
  if (!first) return '';
  const real = await run('readlink', ['-f', first]);
  return (real.code === 0 && real.stdout.trim()) || first;
}

/**
 * sshuttle needs root to install local firewall rules, which a GUI cannot
 * prompt for on every connect. We install a scoped, passwordless sudoers entry.
 *
 * We do NOT use `sshuttle --sudoers-no-modify`: its generated rule injects a
 * `/usr/bin/python3` token that sshuttle's actual sudo invocation does not use
 * (it runs `<sshuttle> --method ... --firewall` directly), so that rule never
 * matches and sudo keeps asking for a password. Instead we whitelist the real
 * sshuttle path. The app runs sshuttle with `--no-sudo-pythonpath` so the
 * elevated command is exactly `<sshuttle> ... --firewall`.
 *
 * Security note: like sshuttle's own generated rule, this lets the user run
 * sshuttle as root with arbitrary arguments (e.g. --ssh-cmd), which is
 * effectively root. That is the same posture sshuttle documents for this setup.
 */
function buildSudoers(user, sshuttlePath) {
  return [
    '# Installed by gh-cs-proxy desktop. Allows passwordless sshuttle firewall setup.',
    `# rule-version: ${RULE_VERSION}`,
    `Cmnd_Alias GHCSPROXY_SSHUTTLE = ${sshuttlePath} *`,
    `${user} ALL=(root) NOPASSWD: GHCSPROXY_SSHUTTLE`,
    ''
  ].join('\n');
}

function isConfigured() {
  // The sudoers file lives in a root-only directory, so we rely on a marker we
  // write after a successful install. The marker records the rule version so an
  // outdated rule triggers a re-install.
  try {
    const txt = fs.readFileSync(markerPath(), 'utf8');
    return txt.includes(`v${RULE_VERSION}`);
  } catch (_) {
    return false;
  }
}

async function status() {
  return {
    configured: isConfigured(),
    needed: process.platform !== 'win32',
    path: SUDOERS_PATH,
    platform: process.platform
  };
}

async function install(onLine = () => {}) {
  if (process.platform === 'win32') {
    return { ok: false, error: 'Windows is not supported yet.' };
  }

  const user = os.userInfo().username;
  const sshuttlePath = await resolveSshuttlePath();
  if (!sshuttlePath) {
    return { ok: false, error: 'sshuttle not found on PATH. Install it first.' };
  }
  const content = buildSudoers(user, sshuttlePath);

  const tmp = path.join(os.tmpdir(), 'gh-cs-proxy.sudoers');
  try {
    fs.writeFileSync(tmp, content, { mode: 0o600 });
  } catch (err) {
    return { ok: false, error: `Could not write temp file: ${err.message}` };
  }

  // Fixed paths only (tmp is ours, SUDOERS_PATH is constant) -> safe to inline.
  // Use numeric -g 0 instead of -g root for macOS compatibility (GID 0 = wheel on mac).
  const inner =
    `install -o root -g 0 -m 0440 '${tmp}' '${SUDOERS_PATH}' && ` +
    `visudo -cf '${SUDOERS_PATH}'`;

  let cmd;
  let args;
  if (process.platform === 'darwin') {
    const escaped = inner.replace(/"/g, '\\"');
    cmd = 'osascript';
    args = ['-e', `do shell script "${escaped}" with administrator privileges`];
  } else {
    cmd = 'pkexec';
    args = ['sh', '-c', inner];
  }

  onLine('Requesting administrator authorization...', 'stdout');
  const res = await run(cmd, args, { timeout: 120000, onLine });
  try { fs.unlinkSync(tmp); } catch (_) { /* noop */ }

  if (res.code !== 0) {
    const tail = (res.stderr || res.stdout || '').trim().split(/\r?\n/).slice(-2).join(' ');
    return { ok: false, error: tail || `Authorization failed (exit ${res.code})` };
  }

  try {
    fs.mkdirSync(path.dirname(markerPath()), { recursive: true });
    fs.writeFileSync(markerPath(), `v${RULE_VERSION} ${new Date().toISOString()} ${sshuttlePath}\n`, 'utf8');
  } catch (_) { /* marker is best effort */ }

  return { ok: true, path: SUDOERS_PATH };
}

module.exports = { status, install, isConfigured, SUDOERS_PATH, RULE_VERSION };
