'use strict';

const { spawn } = require('child_process');

/**
 * Run a command to completion without a shell (args are passed as an array,
 * so user-supplied values like codespace names can never be interpreted as
 * shell syntax). Resolves with { code, stdout, stderr, timedOut }.
 *
 * @param {string} cmd
 * @param {string[]} args
 * @param {object} [opts]
 * @param {number} [opts.timeout] ms before the process is killed
 * @param {string} [opts.input] written to stdin then closed
 * @param {object} [opts.env] extra environment variables
 * @param {(line:string, stream:'stdout'|'stderr')=>void} [opts.onLine]
 */
function run(cmd, args = [], opts = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, {
        env: { ...process.env, ...(opts.env || {}) },
        windowsHide: true
      });
    } catch (err) {
      resolve({ code: -1, stdout: '', stderr: String(err && err.message || err), timedOut: false, spawnError: true });
      return;
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let timer = null;

    const handleChunk = (buf, stream, sink) => {
      const text = buf.toString();
      sink.push(text);
      if (opts.onLine) {
        for (const line of text.split(/\r?\n/)) {
          if (line.length) opts.onLine(line, stream);
        }
      }
    };

    const outParts = [];
    const errParts = [];
    child.stdout.on('data', (b) => handleChunk(b, 'stdout', outParts));
    child.stderr.on('data', (b) => handleChunk(b, 'stderr', errParts));

    if (opts.timeout) {
      timer = setTimeout(() => {
        timedOut = true;
        try { child.kill('SIGKILL'); } catch (_) { /* noop */ }
      }, opts.timeout);
    }

    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      resolve({ code: -1, stdout: outParts.join(''), stderr: String(err.message), timedOut, spawnError: true });
    });

    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      stdout = outParts.join('');
      stderr = errParts.join('');
      resolve({ code: code == null ? -1 : code, stdout, stderr, timedOut });
    });

    if (opts.input != null) {
      child.stdin.write(opts.input);
      child.stdin.end();
    }
  });
}

/** Run and throw if the exit code is non-zero. */
async function runOk(cmd, args = [], opts = {}) {
  const res = await run(cmd, args, opts);
  if (res.code !== 0) {
    const detail = (res.stderr || res.stdout || '').trim().split(/\r?\n/).slice(-3).join(' ');
    const err = new Error(`${cmd} exited ${res.code}${detail ? `: ${detail}` : ''}`);
    err.result = res;
    throw err;
  }
  return res;
}

/** True if an executable is resolvable on PATH. */
async function exists(cmd) {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  const res = await run(probe, [cmd]);
  return res.code === 0 && res.stdout.trim().length > 0;
}

module.exports = { run, runOk, exists, spawn };
