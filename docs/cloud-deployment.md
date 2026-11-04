# Cloud deployment

The current cloud deployment is a **single application instance** using Express, SQLite
on a persistent volume, local media files on a persistent volume, and the built-in
scheduler. PostgreSQL, Redis/BullMQ, distributed workers, and object storage are planned
infrastructure and are not wired into the current runtime.

## Requirements

- Docker Engine and Docker Compose.
- A stable HTTPS domain behind a reverse proxy or managed HTTPS ingress.
- A persistent disk/volume for `/app/data` and `/app/uploads`.
- One Google OAuth 2.0 client of type **Web application**.
- At least one AI text-provider key (for example Gemini or OpenAI).

## 1. Configure Google OAuth

1. In Google Cloud Console, create/select a project.
2. Enable YouTube Data API v3 and YouTube Analytics API.
3. Configure the OAuth consent screen and add your Google account as a test user while the app is in Testing.
4. Create an OAuth 2.0 client with application type **Web application**.
5. Add this exact Authorized redirect URI: `https://YOUR_DOMAIN/auth/youtube/callback`.
6. Keep the client ID and client secret private.

The cloud web flow is different from the desktop/loopback OAuth flow used by local setup.
For a publicly used OAuth app, complete the applicable Google verification requirements
for the scopes you request.

## 2. Prepare environment variables

Copy the example file and generate three independent secrets:

```bash
cp .env.example .env
openssl rand -hex 32   # use one output for APP_SESSION_SECRET
openssl rand -hex 32   # use a different output for TOKEN_ENCRYPTION_KEY
```

Configure these values in `.env`:

- `CLOUD_MODE=true`
- `APP_ADMIN_PASSWORD`: a unique password with at least 16 characters.
- `APP_SESSION_SECRET`: at least 32 bytes; use a randomly generated value.
- `TOKEN_ENCRYPTION_KEY`: exactly 64 hexadecimal characters (32 bytes).
- `YOUTUBE_OAUTH_CLIENT_ID` and `YOUTUBE_OAUTH_CLIENT_SECRET`.
- `YOUTUBE_OAUTH_REDIRECT_URI=https://YOUR_DOMAIN/auth/youtube/callback`.
- At least one AI provider key, such as `GEMINI_API_KEY` or `OPENAI_API_KEY`.

Do not commit `.env`. Store these values in your hosting provider's secret manager where
available. Back up `TOKEN_ENCRYPTION_KEY` securely: losing it makes saved channel refresh
tokens undecryptable. Rotating it requires re-encrypting every stored credential.

## 3. Start the container

```bash
docker compose build
docker compose up -d
docker compose logs -f youtube-automation-agent
```

The container listens on port 3456 but Compose binds it to `127.0.0.1` on the host.
Put a TLS reverse proxy in front of it and proxy to `http://127.0.0.1:3456`. Do not expose
the container directly to the public internet without HTTPS. The application sets
`Secure`, `HttpOnly`, and `SameSite=Lax` session-cookie attributes in cloud mode.

The named Docker volumes `youtube-agent-data` and `youtube-agent-uploads` persist the
database and uploaded/generated media across container recreation. Back up both volumes.
Only run one replica because the scheduler, SQLite database and local media pipeline are
not coordinated across multiple instances.

## 4. Sign in and connect a channel

1. Open `https://YOUR_DOMAIN/login` and sign in with `APP_ADMIN_PASSWORD`.
2. Open **Manage channels** from the dashboard.
3. Choose **Connect YouTube channel** and complete Google's consent flow.
4. The Google account chooser appears for each connection, so you can sign in with the
   Google account that owns or manages the next channel. The channel is saved with
   encrypted refresh tokens. Secrets are never returned by the channel-list API.
5. Restart the container after the first connection or after changing the default channel:

```bash
docker compose restart youtube-automation-agent
```

The selected default channel is loaded into the existing generation/publishing agents at
startup. The channel registry and connection manager support several saved connections,
but the content pipeline still uses one selected default channel at a time. Per-channel
strategies, pipeline isolation and concurrent publishing are not complete yet.

## 5. Verify health and logs

- Health endpoint: `https://YOUR_DOMAIN/health` (public, minimal status only).
- Owner console: `https://YOUR_DOMAIN/`.
- Channel manager: `https://YOUR_DOMAIN/channels`.

Watch logs after the first restart. A missing AI provider or connected default channel
will leave the app in setup mode and disable generation/publishing.

## Security and operations

- Keep cloud mode enabled; startup fails unless owner/session/encryption and HTTPS OAuth
  redirect settings are configured.
- Use a strong unique owner password. The built-in login applies a basic per-process
  rate limit and issues an eight-hour signed HTTP-only session cookie.
- Do not put API keys or OAuth tokens in browser code, URLs, screenshots, issue reports,
  or logs.
- Keep generated media, the database and uploads on persistent storage.
- Back up the database, uploads and encryption key; periodically test restoration.
- Use one app instance only. Do not add replicas or enable autoscaling.
- Do not enable automatic public publishing without human review. Fact review and media
  rights confirmation remain required approval gates.

## Not yet implemented

`DATABASE_URL`, `REDIS_URL` and `OBJECT_STORAGE_*` are reserved for later infrastructure
work. They are not read by the current runtime. A future cloud scale-out milestone must
migrate all channel-owned records to channel-scoped queries, move jobs to a durable queue,
and move media to object storage before multi-instance deployment is safe.
