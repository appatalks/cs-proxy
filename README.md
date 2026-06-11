# cs-proxy

Route internet traffic through a GitHub Codespace using [`sshuttle`](https://github.com/sshuttle/sshuttle), with an optional reverse SSH tunnel so the Codespace can reach local or private networks.

Available as a **CLI extension** for `gh` and as a standalone **desktop app**.

> [!NOTE]
> Replaces the no-longer-maintained GH CLI [extension for remote resource access](https://docs.github.com/en/codespaces/developing-in-a-codespace/connecting-to-a-private-network#using-the-github-cli-extension-to-access-remote-resources).

---

## Desktop app

<img src="img/cs-proxy-desktop.png" alt="CS-Proxy desktop app" width="420">

Cross-platform Electron app (Linux, macOS) with a one-click connect/disconnect flow. Pick or create a Codespace, press play, and the app handles everything: authentication, codespace startup, sshuttle routing, and tunnel validation.

- Frosted glass UI with five color themes and adjustable opacity
- Canvas-rendered dot-matrix status display
- Tabbed settings window (Connection, Routing, Appearance, System)

### Run from source

```bash
cd app && npm install && npm start
```

### Build a standalone binary

```bash
npm run dist           # Linux AppImage + deb
npm run dist:mac       # macOS dmg
```

### AppImage (Linux)

```bash
chmod +x CS-Proxy-*.AppImage
./CS-Proxy-*.AppImage
```

Self-contained, no install needed. Settings are stored in `~/.config/CS-Proxy/`. The host still needs `gh`, `sshuttle`, and `ssh` (the app can auto-install missing tools from Settings > System).

See [app/README.md](app/README.md) for routing details, firewall authorization, and security notes.

---

## CLI extension

### Install

```bash
gh extension install appatalks/cs-proxy
chmod +x ~/.local/share/gh/extensions/cs-proxy/cs-proxy
```

### Usage

```bash
gh cs-proxy connect <codespace-name> [flags]
```

| Flag | Description |
|------|-------------|
| `--all` | Route all traffic (`0.0.0.0/0`) |
| `--only-443` | Route HTTPS/TLS only (`0.0.0.0/0:443`) |
| `--dns` | Tunnel DNS queries |
| `--domains "..."` | Route specific domains (space-separated) |
| `--gateway` | Reverse SSH tunnel to your localhost (default local:8000, remote:9000) |

### Examples

Route TLS + DNS:
```bash
gh cs-proxy connect my-codespace --only-443 --dns
```

Route specific domains with a local gateway:
```bash
gh cs-proxy connect my-codespace --domains "github.com api.github.com" --gateway
```

Route all traffic:
```bash
gh cs-proxy connect my-codespace --all
```

Custom port mapping:
```bash
export LOCAL_PORT=3000 REMOTE_PORT=9001
gh cs-proxy connect my-codespace --gateway
```

<img src="img/cs-proxy-gateway.png" alt="Gateway mode" width="600">

---

###### `Appa's Thoughts: Epic.`
