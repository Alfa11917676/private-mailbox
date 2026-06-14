# Deploying the mailbox (always-on, free)

This app is **not serverless-compatible**: the backend keeps a long-lived pooled
IMAP connection and an in-memory cache, so it needs a persistent Node process.
That rules out Vercel/Netlify/Cloudflare Pages for the API. In production the
Node server **also serves the built web app**, so the whole thing runs from a
single origin (keeps the httpOnly-cookie + CSRF model simple — no CORS).

Recommended free host: an **always-free VM** + **Caddy** (automatic HTTPS).
- **Oracle Cloud "Always Free"** — Ampere ARM VM, generous, free forever.
- **Google Cloud "Always Free"** — one `e2-micro` in an eligible US region.

Both require a credit card at signup (not charged for Always-Free resources).

---

## 0. DNS

Point a hostname at the VM's public IP once you have it:

```
mail.arnabray.me.  A   <VM_PUBLIC_IP>
```

(Use your real domain/subdomain; update `deploy/Caddyfile` to match.)

## 1. Provision the VM

Create an **Ubuntu 22.04/24.04** instance (Oracle Ampere or GCP e2-micro).

**Open ports 80 and 443** — in TWO places:
- The cloud firewall: Oracle *VCN → Security List → Ingress*; GCP *VPC firewall rules*.
- The OS firewall (Oracle Ubuntu images ship restrictive iptables):
  ```bash
  sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
  sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
  sudo netfilter-persistent save   # persist (install iptables-persistent if needed)
  ```
  (On GCP the OS firewall is usually open; the VPC rule is what matters.)

## 2. Install runtime + tools

```bash
# Node 20 (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git
sudo corepack enable && sudo corepack prepare pnpm@latest --activate

# Caddy
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy
```

## 3. Get the code + a service user

```bash
sudo useradd --system --create-home --home-dir /opt/private-mailbox mailbox
sudo -u mailbox git clone https://github.com/Alfa11917676/private-mailbox.git /opt/private-mailbox
cd /opt/private-mailbox
```

## 4. Configure secrets (NEVER committed)

```bash
sudo -u mailbox cp server/.env.example server/.env
# Generate a session secret:
sudo -u mailbox bash -c 'echo "SESSION_SECRET=$(node -e "console.log(require(\"crypto\").randomBytes(32).toString(\"hex\"))")"'
sudo -u mailbox nano server/.env    # fill APP_PASSPHRASE, MAIL_PASSWORD, SESSION_SECRET
sudo chmod 600 server/.env
```
Required keys (see `server/.env.example`): `APP_PASSPHRASE`, `SESSION_SECRET`,
`MAIL_USER`, `MAIL_PASSWORD`, `IMAP_HOST/PORT`, `SMTP_HOST/PORT`, `PORT` (3001).
Quote any value containing `#`/spaces in single quotes, e.g. `APP_PASSPHRASE='#secret'`.

## 5. Build

```bash
sudo -u mailbox pnpm install --frozen-lockfile
sudo -u mailbox pnpm --filter server build   # -> server/dist/src/index.js
sudo -u mailbox pnpm --filter web build       # -> web/dist (served by the server)
```

## 6. Run as a service

```bash
sudo cp deploy/private-mailbox.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now private-mailbox
journalctl -u private-mailbox -f          # confirm "Server listening at http://127.0.0.1:3001"
```

## 7. HTTPS via Caddy

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile   # edit the hostname first if needed
sudo systemctl reload caddy
```
Caddy fetches a certificate automatically. Visit **https://mail.arnabray.me** and
log in with your app passphrase.

---

## Updating later

```bash
cd /opt/private-mailbox
sudo -u mailbox git pull
sudo -u mailbox pnpm install --frozen-lockfile
sudo -u mailbox pnpm --filter server build && sudo -u mailbox pnpm --filter web build
sudo systemctl restart private-mailbox
```

## Notes

- **Secrets** live only in `server/.env` on the VM (chmod 600, gitignored). They
  are never in the repo, API responses, or logs.
- Cookies are `Secure` + `SameSite=Lax` in production (set via `NODE_ENV=production`);
  HTTPS is required, which Caddy provides.
- The login route is rate-limited; consider `fail2ban` on SSH for extra hygiene.
- The Node server binds `127.0.0.1` only — it's reachable solely through Caddy.
