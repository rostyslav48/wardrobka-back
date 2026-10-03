# Deploying the backend

The whole stack runs on one small VPS with `docker-compose.prod.yml`: Postgres, RabbitMQ,
the six services, and Caddy in front of the gateway for HTTPS. Only Caddy publishes ports
(80 and 443). Images stay in S3 and AI calls go to Gemini, so the box itself only needs about
2 GB of RAM.

Target: Hetzner Cloud CX23 (2 vCPU, 4 GB RAM, 40 GB disk), roughly €4–5/month.

## 1. Create the server

In the Hetzner Cloud console:

1. Create a project, then **Add server**:
   - Location: any EU location (Falkenstein, Nuremberg or Helsinki).
   - Image: **Apps → Docker CE** (Ubuntu 24.04 with Docker and the compose plugin
     preinstalled).
   - Type: CX23.
   - SSH key: add your public key (`cat ~/.ssh/id_ed25519.pub`). Skip the root password.
   - Backups: optional (+20% of the price). Skipped during development; turn them on in
     the console once you depend on the data. Without them the only off-box copy of the
     database is whatever you `scp` from `/root/backups` (step 7).
2. **Firewalls → Create firewall** with inbound TCP 22, 80 and 443, and apply it to the
   server. Use the Hetzner firewall rather than `ufw`: Docker writes its own iptables rules
   and bypasses `ufw` for published ports.

Note the server's IPv4 address. The examples below use `203.0.113.10`.

## 2. Prepare the box

```sh
ssh root@203.0.113.10

apt update && apt upgrade -y   # the image's Docker is as old as the image

# 2 GB swap: building six webpack bundles on a 4 GB box is tight without it.
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

docker compose version   # preinstalled by the Docker CE image
```

## 3. Get the code

The repo is on GitHub. If it is private, create a read-only deploy key on the server and add
it under the repo's **Settings → Deploy keys**:

```sh
ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N ''
cat ~/.ssh/github_deploy.pub     # paste into GitHub → Deploy keys
printf 'Host github.com\n  IdentityFile ~/.ssh/github_deploy\n' >> ~/.ssh/config

git clone git@github.com:rostyslav48/wardrobka-back.git /opt/wardrobka-back
cd /opt/wardrobka-back
```

## 4. Create the env files

Copy every `.env.example` to `.env` and fill it in:

```sh
for f in $(find . -name .env.example -not -path './node_modules/*' -not -path './.claude/*'); do
  cp -n "$f" "${f%.example}"
done
```

Generate each secret with `openssl rand -hex 32`. The values that differ from local dev:

| File | Variable | Production value |
|---|---|---|
| `.env` | `NODE_ENVIRONMENT` | `production` |
| `.env` | `API_DOMAIN` | `203-0-113-10.sslip.io` (your IP with dashes), or your own domain |
| `libs/common/src/database/.env` | `POSTGRES_PASSWORD` | a generated secret |
| `libs/common/src/jwt/.env` | `JWT_SECRET_KEY` | a generated secret |
| `apps/ai-assistant/.env` | `PROTECTED_DATA_SECRET` | a generated secret |
| `apps/ai-assistant/.env` | `GEMINI_API_KEY`, `OPENWEATHERMAP_API_KEY` | your keys |
| `apps/ai-assistant/.env` | `GOOGLE_OAUTH_REDIRECT_URI` | `https://<API_DOMAIN>/calendar/google/callback`, also registered on the Google OAuth client |
| `apps/media-storage/.env` | `AWS_*` | the S3 credentials and bucket |

Leave `POSTGRES_HOST`, `POSTGRES_DOCKER_HOST` and `RABBIT_MQ_URI` at their example values.
The compose file already points them at the containers.

`sslip.io` resolves `203-0-113-10.sslip.io` to `203.0.113.10`, so Caddy can get a real Let's
Encrypt certificate without you buying a domain. If you buy a domain later, point an A record
at the server and change `API_DOMAIN`.

## 5. Start the stack

```sh
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

The first build takes a few minutes. The `migrate` container creates the database, applies
all migrations and exits with code 0. The services start after it. Caddy requests its
certificate on the first HTTPS request.

Check it from your laptop:

```sh
curl -X POST https://203-0-113-10.sslip.io/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"<a real password>","name":"You"}'
```

A `201` with an `accessToken` means the full path works: Caddy, gateway, RabbitMQ, auth and
Postgres. That request also creates your real account.

Logs: `docker compose -f docker-compose.prod.yml logs -f <service>`.

## 6. Point the app at it

In `wardrobe-assistant-front/.env.local`:

```
EXPO_PUBLIC_API_BASE_URL=https://203-0-113-10.sslip.io
```

Then rebuild or restart the dev client. `CORS_ORIGINS` only matters for browser clients; the
native app sends no `Origin` header.

## 7. Nightly database dump

Hetzner backups snapshot the whole disk. A plain SQL dump is easier to restore from, so add
one with `crontab -e`:

```
0 3 * * * mkdir -p /root/backups && docker compose -f /opt/wardrobka-back/docker-compose.prod.yml exec -T postgresDb pg_dump -U postgres wardrobe_assistant | gzip > /root/backups/db-$(date +\%F).sql.gz && find /root/backups -name 'db-*.sql.gz' -mtime +14 -delete
```

## Updating

```sh
cd /opt/wardrobka-back
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

New migrations run automatically, because `migrate` runs on every `up`.

## Later

- **Try Oracle Cloud Always Free.** Its ARM instances give up to 4 OCPUs and 24 GB RAM for
  $0. Signup is unreliable, free ARM capacity is often unavailable, and idle instances can be
  reclaimed, so it was skipped for the first deploy. The same compose file runs there
  unchanged: the images are multi-arch.
- Build images in GitHub Actions and pull them on the server instead of building on the box.
