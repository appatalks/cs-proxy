'use strict';

const $ = (sel) => document.querySelector(sel);

function unwrap(res) {
  if (res && typeof res === 'object' && '__error' in res) throw new Error(res.__error);
  return res;
}

let settings = {};

/* ---------- form helpers ---------- */

function toggleSourceRows(source) {
  $('#rowExisting').hidden = source !== 'existing';
  $('#rowCreate').hidden = source !== 'create';
}

function toggleModeRows() {
  $('#inpDomains').hidden = $('#selMode').value !== 'domains';
  $('#rowPorts').hidden = !$('#chkGateway').checked;
}

function updateTeardownNote() {
  const v = $('#selTeardown').value;
  const note = $('#teardownNote');
  if (v === 'delete') {
    note.textContent = 'Warning: the codespace is permanently deleted on Disable.';
    note.classList.add('is-error');
  } else if (v === 'stop') {
    note.textContent = 'Codespace is stopped and can be restarted later.';
    note.classList.remove('is-error');
  } else {
    note.textContent = 'Codespace keeps running after Disable.';
    note.classList.remove('is-error');
  }
}

function populateForm(s) {
  $('#srcExisting').checked = s.source !== 'create';
  $('#srcCreate').checked = s.source === 'create';
  $('#inpBranch').value = s.createBranch || '';
  $('#selTeardown').value = s.teardown || 'stop';
  $('#selMode').value = s.mode || 'all';
  $('#inpDomains').value = s.domains || '';
  $('#chkDns').checked = !!s.dns;
  $('#chkGateway').checked = !!s.gateway;
  $('#inpLocalPort').value = s.localPort || 8000;
  $('#inpRemotePort').value = s.remotePort || 9000;
  $('#selTheme').value = s.theme || 'green';
  const op = s.opacity != null ? s.opacity : 0.85;
  $('#rngOpacity').value = op;
  $('#opacityVal').textContent = Math.round(op * 100) + '%';
  $('#chkAutoInstall').checked = !!s.autoInstallDeps;
  toggleSourceRows(s.source || 'existing');
  toggleModeRows();
  updateTeardownNote();
}

function gatherForm() {
  return {
    source: $('#srcCreate').checked ? 'create' : 'existing',
    codespace: $('#selCodespace').value || settings.codespace || '',
    createRepo: $('#selRepo').value || '',
    createBranch: $('#inpBranch').value.trim(),
    createMachine: $('#selMachine').value || '',
    teardown: $('#selTeardown').value,
    mode: $('#selMode').value,
    domains: $('#inpDomains').value.trim(),
    dns: $('#chkDns').checked,
    gateway: $('#chkGateway').checked,
    localPort: $('#inpLocalPort').value,
    remotePort: $('#inpRemotePort').value,
    theme: $('#selTheme').value,
    opacity: parseFloat($('#rngOpacity').value),
    autoInstallDeps: $('#chkAutoInstall').checked
  };
}

/* ---------- data refresh ---------- */

async function refreshAuth() {
  const el = $('#authStatus');
  el.textContent = 'checking…';
  try {
    const a = unwrap(await window.api.gh.authStatus());
    el.textContent = a.ok ? `signed in${a.login ? ' as ' + a.login : ''}` : 'not signed in — run: gh auth login';
    el.classList.toggle('is-error', !a.ok);
  } catch (err) {
    el.textContent = err.message;
    el.classList.add('is-error');
  }
}

async function refreshCodespaces() {
  const sel = $('#selCodespace');
  sel.innerHTML = '<option value="">loading…</option>';
  try {
    const list = unwrap(await window.api.gh.listCodespaces());
    sel.innerHTML = '';
    if (!list.length) {
      sel.innerHTML = '<option value="">no codespaces found</option>';
      return;
    }
    for (const c of list) {
      const opt = document.createElement('option');
      opt.value = c.name;
      const label = c.displayName || (c.repository ? c.repository : c.name);
      opt.textContent = `${label} · ${c.state}`;
      sel.appendChild(opt);
    }
    if (settings.codespace) sel.value = settings.codespace;
  } catch (err) {
    sel.innerHTML = `<option value="">${err.message}</option>`;
  }
}

async function refreshRepos() {
  const sel = $('#selRepo');
  sel.innerHTML = '<option value="">loading…</option>';
  try {
    const repos = unwrap(await window.api.gh.listRepos());
    sel.innerHTML = '';
    for (const r of repos) {
      const opt = document.createElement('option');
      opt.value = r;
      opt.textContent = r;
      sel.appendChild(opt);
    }
    if (settings.createRepo) sel.value = settings.createRepo;
    refreshMachines();
  } catch (err) {
    sel.innerHTML = `<option value="">${err.message}</option>`;
  }
}

async function refreshMachines() {
  const repo = $('#selRepo').value;
  const sel = $('#selMachine');
  sel.innerHTML = '<option value="">default machine</option>';
  if (!repo) return;
  try {
    const machines = unwrap(await window.api.gh.listMachines(repo));
    for (const m of machines) {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      sel.appendChild(opt);
    }
    if (settings.createMachine) sel.value = settings.createMachine;
  } catch (_) { /* keep default */ }
}

async function refreshDeps() {
  const list = $('#depList');
  list.innerHTML = '<li>checking…</li>';
  try {
    const res = unwrap(await window.api.deps.check());
    list.innerHTML = '';
    for (const t of res.tools) {
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = t.ok ? `${t.name} · ${t.version || 'ok'}` : `${t.name} · missing`;
      label.className = t.ok ? 'ok' : 'bad';
      li.appendChild(label);
      if (!t.ok) {
        const btn = document.createElement('button');
        btn.className = 'btn btn--mini';
        btn.textContent = 'Install';
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          btn.textContent = '…';
          try {
            const r = unwrap(await window.api.deps.install(t.name));
            if (!r.ok) console.error(r.error);
          } catch (err) {
            console.error(err.message);
          }
          refreshDeps();
        });
        li.appendChild(btn);
      }
      list.appendChild(li);
    }
  } catch (err) {
    list.innerHTML = `<li class="bad">${err.message}</li>`;
  }
}

async function refreshPrivilege() {
  const status = $('#privStatus');
  const btn = $('#btnPrivSetup');
  try {
    const p = unwrap(await window.api.privilege.check());
    if (!p.needed) {
      status.textContent = 'Firewall authorization: not required';
      btn.disabled = true;
    } else if (p.configured) {
      status.textContent = 'Firewall authorization: ready';
      status.classList.remove('is-error');
      btn.disabled = true;
    } else {
      status.textContent = 'Firewall authorization: required for routing';
      status.classList.add('is-error');
      btn.disabled = false;
    }
  } catch (err) {
    status.textContent = err.message;
  }
}

/* ---------- save ---------- */

async function saveSettings() {
  try {
    settings = unwrap(await window.api.settings.set(gatherForm()));
    window.api.settingsSaved();
    window.close();
  } catch (err) {
    console.error(err.message);
  }
}

/* ---------- wiring ---------- */

function wire() {
  $('#btnSaveSettings').addEventListener('click', saveSettings);
  $('#btnCloseSettings').addEventListener('click', () => window.close());
  $('#btnRefreshCs').addEventListener('click', refreshCodespaces);
  $('#btnRefreshRepos').addEventListener('click', refreshRepos);
  $('#selRepo').addEventListener('change', refreshMachines);

  // Tab switching
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('is-active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('is-active'));
      btn.classList.add('is-active');
      const panel = document.getElementById('tab-' + btn.dataset.tab);
      if (panel) panel.classList.add('is-active');
    });
  });

  $('#rngOpacity').addEventListener('input', () => {
    const v = parseFloat($('#rngOpacity').value);
    $('#opacityVal').textContent = Math.round(v * 100) + '%';
    window.api.setOpacity(v);
  });

  $('#btnPrivSetup').addEventListener('click', async () => {
    $('#btnPrivSetup').disabled = true;
    try {
      unwrap(await window.api.privilege.install());
    } catch (err) {
      console.error(err.message);
    }
    refreshPrivilege();
  });

  $('#selMode').addEventListener('change', toggleModeRows);
  $('#chkGateway').addEventListener('change', toggleModeRows);
  $('#selTeardown').addEventListener('change', updateTeardownNote);
  document.querySelectorAll('input[name="source"]').forEach((r) =>
    r.addEventListener('change', () => {
      const src = $('#srcCreate').checked ? 'create' : 'existing';
      toggleSourceRows(src);
      if (src === 'create' && !$('#selRepo').options.length) refreshRepos();
    })
  );
}

/* ---------- boot ---------- */

window.addEventListener('DOMContentLoaded', async () => {
  try {
    settings = unwrap(await window.api.settings.get());
  } catch (_) {
    settings = {};
  }
  document.body.dataset.theme = settings.theme || 'green';

  populateForm(settings);
  wire();
  refreshAuth();
  refreshDeps();
  refreshPrivilege();
  refreshCodespaces();
  if (settings.source === 'create') refreshRepos();
});
