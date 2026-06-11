# CS-Proxy Desktop

A small cross-platform control panel for routing traffic through a GitHub
Codespace. It wraps the same tools the CLI extension uses (`gh`, `sshuttle`, and
an SSH reverse tunnel) behind a one-click interface styled like a hardware
remote with a dot-matrix display.

Linux and macOS are supported today. Windows is not yet supported because
`sshuttle`'s client does not run natively there.

## Requirements

- Node.js and npm (to install and launch)
- [`gh`](https://cli.github.com/) authenticated (`gh auth login`)
- [`sshuttle`](https://sshuttle.readthedocs.io/) and `ssh`
- Linux: `pkexec` (PolicyKit) for the one-time firewall authorization
- macOS: Homebrew if you want missing tools auto-installed

Missing tools can be installed from the Settings panel, or automatically on
connect when "Auto-install missing tools" is on.

## Run

```bash
cd app
npm install
npm start
```

## How it works

Press ENABLE and the app runs the whole sequence for you:

1. Check dependencies (and install them if enabled).
2. Confirm `gh` is authenticated.
3. Resolve the Codespace: start a saved one, or create a new one from a repo.
4. Write the Codespace SSH config block.
5. Start `sshuttle` for the selected routes (DNS optional).
6. Open the reverse SSH tunnel if the gateway is enabled.
7. Validate that traffic is actually leaving through the Codespace.

Press DISABLE to tear the tunnel down. What happens to the Codespace depends on
the teardown setting: leave it running, stop it (restartable later), or delete
it.

## The display

The dot-matrix panel shows live status: current phase, the active Codespace, the
egress IP, and the tunnel/validation state. The three LEDs report busy activity,
tunnel state, and the last validation result. Five skins are included (Amber,
Green Phosphor, Ice Blue, Synthwave, LCD); cycle them with the SKIN button or
pick one in Settings.

## Routing modes

- All traffic: `0.0.0.0/0`
- HTTPS only: `0.0.0.0/0:443`
- Specific domains: a space-separated list, each routed on `:443`
- DNS: optionally tunnel DNS queries
- Gateway: reverse tunnel so the Codespace can reach a local port
  (defaults: local 8000 to remote 9000)

## Validation

CHECK (and the automatic step after connect) confirms the tunnel is live: the
`sshuttle` process is running, the Codespace answers over SSH, and for full or
HTTPS routing the local egress IP matches the Codespace's public IP. For domain
routing it confirms a routed domain is reachable.

## Firewall authorization

`sshuttle` needs root to install local firewall rules, which a GUI cannot prompt
for on every connect. The app installs a scoped, passwordless `sudoers` entry
once, via `pkexec` on Linux or an administrator prompt on macOS. `sshuttle`
itself still runs as your user, so it keeps using your `gh` auth, SSH config,
and keys; only the firewall step is elevated. Set this up from Settings before
the first routed connection.

The rule whitelists the resolved `sshuttle` path (e.g.
`<user> ALL=(root) NOPASSWD: /usr/bin/sshuttle *`), and the app runs `sshuttle`
with `--no-sudo-pythonpath` so the elevated command matches exactly. This is
deliberate: `sshuttle --sudoers-no-modify` generates a rule that injects a
`/usr/bin/python3` token the real command never uses, so that rule never matches
and sudo keeps prompting for a password.

Security note: as `sshuttle` itself documents for this setup, allowing
passwordless `sshuttle` as root effectively grants root (via `--ssh-cmd`). The
rule is scoped to your user and validated with `visudo` before install.

## Security notes

- The renderer runs with `contextIsolation` on and `nodeIntegration` off. It
  talks to the main process only through a small, explicit preload bridge.
- All external commands are spawned without a shell and receive arguments as an
  array, so Codespace names and other values can never be interpreted as shell
  syntax.
- The `sudoers` rule is scoped to the current user and validated with `visudo`
  before being installed.
