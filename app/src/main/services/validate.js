'use strict';

const https = require('https');
const gh = require('./gh');

function httpsGet(url, timeout = 8000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    try {
      const req = https.get(url, { timeout }, (res) => {
        let body = '';
        res.on('data', (d) => { if (body.length < 2048) body += d.toString(); });
        res.on('end', () => finish({ ok: true, status: res.statusCode, body: body.trim() }));
      });
      req.on('timeout', () => { req.destroy(); finish({ ok: false, error: 'timeout' }); });
      req.on('error', (e) => finish({ ok: false, error: e.message }));
    } catch (e) {
      finish({ ok: false, error: e.message });
    }
  });
}

// Local egress IP. With sshuttle routing all/443 traffic, this request leaves
// through the codespace, so it should report the codespace's public IP.
async function localPublicIp() {
  const r = await httpsGet('https://api.ipify.org', 8000);
  return r.ok ? r.body : '';
}

async function codespacePublicIp(name) {
  const r = await gh.exec(name, ['curl', '-s', '--max-time', '8', 'https://api.ipify.org'], { timeout: 20000 });
  return r.code === 0 ? r.stdout.trim() : '';
}

/**
 * Confirm traffic is really flowing through the codespace.
 * Returns { ok, checks:[{name,ok,detail}], localIp, codespaceIp }.
 */
async function validate({ codespace, mode, domains, gateway, tunnel }) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail: detail || '' });

  const routing = mode === 'all' || mode === 'only-443' || mode === 'domains';
  if (routing) {
    const alive = tunnel.isSshuttleAlive();
    add('sshuttle process', alive, alive ? 'running' : 'not running');
  }
  if (gateway) {
    const alive = tunnel.isReverseAlive();
    add('reverse tunnel', alive, alive ? 'running' : 'not running');
  }

  const reach = await gh.exec(codespace, ['echo', 'ok'], { timeout: 20000 });
  add('codespace reachable', reach.code === 0 && /ok/.test(reach.stdout), reach.code === 0 ? 'ssh ok' : 'ssh failed');

  let localIp = '';
  let codespaceIp = '';

  if (mode === 'all' || mode === 'only-443') {
    [localIp, codespaceIp] = await Promise.all([localPublicIp(), codespacePublicIp(codespace)]);
    const match = !!localIp && localIp === codespaceIp;
    add('egress via codespace', match,
      localIp ? `local ${localIp} / cs ${codespaceIp || '?'}` : 'no local IP');
  } else if (mode === 'domains') {
    const first = (domains || '').trim().split(/\s+/)[0];
    if (first) {
      const r = await httpsGet(`https://${first}`, 8000);
      add(`route ${first}`, r.ok, r.ok ? `HTTP ${r.status}` : (r.error || 'unreachable'));
    }
    codespaceIp = await codespacePublicIp(codespace);
  }

  return { ok: checks.every((c) => c.ok), checks, localIp, codespaceIp };
}

module.exports = { validate, localPublicIp };
