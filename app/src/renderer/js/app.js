'use strict';

const THEMES = ['amber', 'green', 'ice', 'synth', 'lcd'];

const DEFAULT_THEME = 'green';

const $ = (sel) => document.querySelector(sel);

let matrix = null;
let settings = {};

/* ---------- small helpers ---------- */

function unwrap(res) {
  if (res && typeof res === 'object' && '__error' in res) {
    throw new Error(res.__error);
  }
  return res;
}

let toastTimer = null;
function toast(msg, isError = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('is-error', isError);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4200);
}

function logLine({ line, stream }) {
  const pre = $('#log');
  const atBottom = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 4;
  pre.textContent += (stream === 'stderr' ? '! ' : '') + line + '\n';
  const lines = pre.textContent.split('\n');
  if (lines.length > 500) pre.textContent = lines.slice(-500).join('\n');
  if (atBottom) pre.scrollTop = pre.scrollHeight;
}

function applyTheme(name) {
  document.body.dataset.theme = THEMES.includes(name) ? name : DEFAULT_THEME;
  const cs = getComputedStyle(document.body);
  matrix.setColors(cs.getPropertyValue('--dot-on').trim(), cs.getPropertyValue('--dot-off').trim());
}

function applyOpacity(val) {
  const o = Math.max(0.3, Math.min(1, parseFloat(val) || 0.85));
  window.api.setOpacity(o);
}

/* ---------- state -> UI ---------- */

function setLed(el, on, bad = false) {
  el.classList.toggle('is-on', on && !bad);
  el.classList.toggle('is-bad', bad);
}

function updateUI(state) {
  const name = state.codespace || 'NONE';
  const ip = state.ip || '--';
  const tun = (state.tunnel || 'down').toUpperCase();
  const val = state.validated == null ? '--' : state.validated ? 'OK' : 'FAIL';

  const l1 = state.busy ? '> ' + (state.detail || 'WORKING') : 'STATUS ' + (state.phase || '').toUpperCase();
  matrix.setLines([l1, 'CS ' + name, 'IP ' + ip, 'TUN ' + tun + '  VAL ' + val]);

  setLed($('#ledBusy'), !!state.busy);
  setLed($('#ledTun'), state.tunnel === 'up');
  setLed($('#ledVal'), state.validated === true, state.validated === false);
  setLed($('#powerLed'), state.phase === 'enabled');

  const enabled = state.phase === 'enabled';
  $('#powerLabel').textContent = enabled ? '\u25A0' : '\u25B6';
  $('#btnPower').classList.toggle('is-on', enabled);
  $('#btnPower').disabled = !!state.busy;
  $('#btnValidate').disabled = !!state.busy || !enabled;

  const hint = $('#hint');
  hint.textContent = state.error ? state.error : (state.detail || 'Ready');
  hint.classList.toggle('is-error', !!state.error);
}

/* ---------- settings ---------- */

function openSettings() {
  window.api.openSettings();
}

async function reloadSettings() {
  try {
    settings = unwrap(await window.api.settings.get());
    applyTheme(settings.theme || DEFAULT_THEME);
    applyOpacity(settings.opacity);
  } catch (_) {}
}

async function saveSettings() {
  // no-op: settings are saved in the external window now
}

/* ---------- actions ---------- */

async function onPower() {
  const phase = (await safeStatus()).phase;
  try {
    if (phase === 'enabled') {
      unwrap(await window.api.vpn.disable());
    } else {
      unwrap(await window.api.vpn.enable());
    }
  } catch (err) {
    toast(err.message, true);
  }
}

async function safeStatus() {
  try { return unwrap(await window.api.vpn.status()); } catch (_) { return {}; }
}

async function onValidate() {
  try {
    const r = unwrap(await window.api.vpn.validate());
    if (r && r.checks) {
      const failed = r.checks.filter((c) => !c.ok).map((c) => c.name);
      toast(r.ok ? 'Tunnel validated' : 'Issues: ' + failed.join(', '), !r.ok);
    } else if (r && r.error) {
      toast(r.error, true);
    }
  } catch (err) {
    toast(err.message, true);
  }
}

function cycleTheme() {
  const next = THEMES[(THEMES.indexOf(settings.theme) + 1) % THEMES.length];
  settings.theme = next;
  applyTheme(next);
  $('#selTheme').value = next;
  window.api.settings.set({ theme: next });
  toast('Skin: ' + next);
}

/* ---------- wiring ---------- */

function wire() {
  $('#btnPower').addEventListener('click', onPower);
  $('#btnValidate').addEventListener('click', onValidate);
  $('#btnTheme').addEventListener('click', cycleTheme);
  $('#btnSettings').addEventListener('click', openSettings);

  $('#btnLog').addEventListener('click', () => { $('#logDrawer').hidden = !$('#logDrawer').hidden; });
  $('#btnLogClose').addEventListener('click', () => { $('#logDrawer').hidden = true; });
  $('#btnClose').addEventListener('click', () => window.api.closeWindow());

  window.api.onState(updateUI);
  window.api.onLog(logLine);
  window.api.onSettingsSaved(reloadSettings);
}

/* ---------- boot ---------- */

window.addEventListener('DOMContentLoaded', async () => {
  matrix = new window.DotMatrix($('#matrix'), { cols: 16, rows: 4 });
  matrix.setLines(['CS-PROXY', 'BOOTING', '', '']);
  matrix.start();

  wire();

  try {
    settings = unwrap(await window.api.settings.get());
  } catch (_) {
    settings = {};
  }
  applyTheme(settings.theme || DEFAULT_THEME);
  applyOpacity(settings.opacity);
  updateUI(await safeStatus());
});
