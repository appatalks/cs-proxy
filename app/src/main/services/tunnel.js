'use strict';

const { spawn } = require('child_process');

/**
 * Owns the long-running sshuttle process and the optional reverse SSH tunnel.
 * Both are spawned without a shell and tracked so they are always cleaned up.
 */
class Tunnel {
  constructor() {
    this.sshuttle = null;
    this.reverse = null;
  }

  startSshuttle({ alias, routes, dns, onLine = () => {} }) {
    return new Promise((resolve, reject) => {
      // --no-sudo-pythonpath makes sshuttle's elevated command the plain
      // `<sshuttle> ... --firewall` form that our sudoers rule whitelists.
      const args = ['--no-sudo-pythonpath', '-r', alias];
      if (dns) args.push('--dns');
      for (const r of routes) args.push(r);
      onLine(`$ sshuttle ${args.join(' ')}`, 'stdout');

      // detached: run in a new session with no controlling terminal, and ignore
      // stdin. If passwordless sudo is not set up, sudo then fails immediately
      // ("a terminal is required") instead of silently blocking on a password
      // prompt and hanging until the timeout.
      const child = spawn('sshuttle', args, {
        env: process.env,
        windowsHide: true,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      this.sshuttle = child;
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Timed out waiting for sshuttle to connect'));
        }
      }, 45000);

      const onData = (buf, stream) => {
        for (const line of buf.toString().split(/\r?\n/)) {
          if (!line) continue;
          onLine(line, stream);
          if (settled) continue;
          if (/connected to server/i.test(line)) {
            settled = true;
            clearTimeout(timer);
            resolve({ pid: child.pid });
          } else if (/a terminal is required|a password is required|sudo:.*password|askpass/i.test(line)) {
            // NOPASSWD rule not matching. Note: sshuttle always prints the
            // "[local sudo] Password:" banner, so we do NOT treat that alone as
            // failure; we key off sudo's actual "password is required" error.
            settled = true;
            clearTimeout(timer);
            this._killGroup(child);
            reject(new Error('Passwordless sudo for sshuttle is not set up. Open Settings and run "Set up" under firewall authorization.'));
          }
        }
      };

      child.stdout.on('data', (b) => onData(b, 'stdout'));
      child.stderr.on('data', (b) => onData(b, 'stderr'));
      child.on('error', (err) => {
        if (!settled) { settled = true; clearTimeout(timer); reject(err); }
      });
      child.on('close', (code) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error(`sshuttle exited (${code}) before connecting`));
        }
      });
    });
  }

  startReverse({ alias, localPort, remotePort, onLine = () => {} }) {
    return new Promise((resolve, reject) => {
      const forward = `${remotePort}:localhost:${localPort}`;
      const args = [
        '-N',
        '-o', 'ExitOnForwardFailure=yes',
        '-o', 'ServerAliveInterval=30',
        '-o', 'StrictHostKeyChecking=accept-new',
        '-R', forward,
        alias
      ];
      onLine(`$ ssh ${args.join(' ')}`, 'stdout');

      const child = spawn('ssh', args, { env: process.env, windowsHide: true });
      this.reverse = child;
      let settled = false;

      // ssh -N is silent on success; ExitOnForwardFailure makes it exit fast on
      // failure. So: if it's still alive after a grace period, the forward took.
      const timer = setTimeout(() => {
        if (!settled && child.exitCode === null) {
          settled = true;
          resolve({ pid: child.pid, forward });
        }
      }, 4000);

      child.stdout.on('data', (b) => onLine(b.toString().trim(), 'stdout'));
      child.stderr.on('data', (b) => {
        for (const line of b.toString().split(/\r?\n/)) {
          if (line) onLine(line, 'stderr');
        }
      });
      child.on('error', (err) => {
        if (!settled) { settled = true; clearTimeout(timer); reject(err); }
      });
      child.on('close', (code) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error(`Reverse tunnel exited (${code})`));
        }
      });
    });
  }

  isSshuttleAlive() {
    return !!(this.sshuttle && this.sshuttle.exitCode === null && !this.sshuttle.killed);
  }

  isReverseAlive() {
    return !!(this.reverse && this.reverse.exitCode === null && !this.reverse.killed);
  }

  _killChild(child) {
    return new Promise((resolve) => {
      if (!child || child.exitCode !== null) return resolve();
      child.once('close', () => resolve());
      try {
        child.kill('SIGTERM');
      } catch (_) {
        return resolve();
      }
      setTimeout(() => {
        try { if (child.exitCode === null) child.kill('SIGKILL'); } catch (_) { /* noop */ }
      }, 5000);
    });
  }

  // sshuttle is spawned detached (its own process group). SIGTERM the leader so
  // sshuttle restores the firewall cleanly, then SIGKILL the whole group as a
  // fallback to mop up any stragglers (ssh, etc.).
  _killGroup(child) {
    return new Promise((resolve) => {
      if (!child || child.exitCode !== null) return resolve();
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      child.once('close', finish);
      try {
        child.kill('SIGTERM');
      } catch (_) {
        return finish();
      }
      setTimeout(() => {
        try { if (child.exitCode === null && child.pid) process.kill(-child.pid, 'SIGKILL'); } catch (_) { /* noop */ }
        finish();
      }, 5000);
    });
  }

  async stop() {
    await Promise.all([this._killChild(this.reverse), this._killGroup(this.sshuttle)]);
    this.reverse = null;
    this.sshuttle = null;
  }
}

module.exports = { Tunnel };
