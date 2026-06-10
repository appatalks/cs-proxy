# gh-cs-proxy
### GitHub Cli Extension: Proxy-Gateway & VPN for Codespaces <p><p>

> [!NOTE]
> This project aims to be a replacement for the no longer maintained as described GH CLI [Extension](https://docs.github.com/en/codespaces/developing-in-a-codespace/connecting-to-a-private-network#using-the-github-cli-extension-to-access-remote-resources) for _access to remote resources_ in GitHub documentation.

Send chosen internet traffic through your GitHub Codespace with [`sshuttle`](https://github.com/sshuttle/sshuttle)([**download**](https://sshuttle.readthedocs.io/en/stable/installation.html#)), and optionally open a reverse SSH tunnel so the Codespace can reach services running on targeted local/private networks.


<img title="Gateway" alt="--gateway" src="img/gh-cs-proxy-gateway.png"> <p> 
Image: `gh cs-proxy connect my-codespace --gateway`

<p>
 
----

## Desktop App (GUI)

Prefer a one-click interface? The [`app/`](app/) folder contains a cross-platform desktop build (Electron) that runs the whole flow for you. Pick or create a Codespace, press ENABLE, and it starts the Codespace, opens the tunnel, and validates the connection. Press DISABLE to tear it down and optionally stop or delete the Codespace. It has a dot-matrix status display and selectable skins.

```bash
cd app
npm install
npm start
```

See [app/README.md](app/README.md) for setup, routing modes, and the one-time firewall authorization. Linux and macOS for now.

----
 
## Installation

```bash
gh extension install appatalks/gh-cs-proxy
chmod +x ~/.local/share/gh/extensions/gh-cs-proxy/gh-cs-proxy
```

## Usage

```bash
gh cs-proxy connect <codespace-name> [flags]
```

## Flags

```txt
`--all`             Route all traffic (0.0.0.0/0) through the Codespace
`--only-443`        Route only HTTPS/TLS traffic (0.0.0.0/0:443)
`--dns`             Include DNS queries in the tunnel
`--domains "..."`   Route HTTPS traffic for specific domains (space-separated list)
`--gateway`         Set up a reverse SSH tunnel so the Codespace can reach your localhost (default local:8000 → remote:9000)
`-h`,`--help`       Show usage
```
```bash
gh cs-proxy help
Usage: gh cs-proxy connect <codespace-name> [--all] [--dns] [--only-443] [--domains "domain1 domain2"] [--gateway]
```

## Examples

1. Route only TLS + DNS:
  ```bash
  gh cs-proxy connect my-codespace --only-443 --dns
  ```

2. Route GitHub domains + set up local gateway:
  ```bash
  gh cs-proxy connect my-codespace --domains "github.com api.github.com" --gateway
  ```

3. Route all traffic:
  ```bash
  gh cs-proxy connect my-codespace --all
  ```

4. Custom local port mapping (optionally, use env vars before running):
  ```bash
  export LOCAL_PORT=3000 REMOTE_PORT=9001
  gh cs-proxy connect my-codespace --gateway
  ```
<br>

 ###### `Appa's Thoughts: Epic.`
