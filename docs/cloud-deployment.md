# Cloud deployment foundation

This document describes the first cloud-readiness layer for YouTube Automation Agent.
The existing Express dashboard and SQLite database remain the default runtime. Cloud
services are opt-in so existing self-hosted installations continue to work.

## Target deployment shape

- **Web/API:** the existing Express application, behind HTTPS on a managed container or VM.
- **Database:** begin with the existing SQLite file on a persistent volume. Do not place
  SQLite on an ephemeral container filesystem or a shared network filesystem.
- **Object storage:** store generated video/audio/image assets in a private S3-compatible
  bucket (for example, AWS S3 or Cloudflare R2). Keep public access disabled.
- **Queue/workers:** move long-running generation and FFmpeg work to dedicated workers
  in a later phase. A durable queue such as Redis + BullMQ is the recommended target.
- **Secrets:** inject provider keys and OAuth secrets through the hosting platform's
  secret manager. Never commit `.env`, OAuth client files, refresh tokens, or media.

## Environment

See `.env.example` for the opt-in cloud settings. Cloud mode must not be enabled until
persistent storage, HTTPS, backups, and secret injection have been configured.

## YouTube web OAuth

The current credential setup is an interactive/loopback flow intended for a desktop
installation. A hosted deployment needs a Google OAuth **Web application** client and
an exact HTTPS redirect URI, for example:

`https://your-domain.example/auth/youtube/callback`

Configure the same URI in Google Cloud Console and set `YOUTUBE_REDIRECT_URI`.
The web OAuth callback, encrypted token storage, account/channel ownership checks,
CSRF state validation, and token rotation are a separate implementation milestone.
Do not expose the current local token JSON file through a web route.

## Multiple channels

The first cloud milestone introduces a channel registry contract without changing the
existing generation pipeline. Every content project, scheduled publish action, analytics
snapshot, and approval must eventually be scoped to one channel. Channel credentials
must be isolated per connection and encrypted at rest. A channel ID from a request must
never be trusted as proof of authorization.

## Safety gates

- Generated content remains private/unlisted until an explicit human approval.
- Fact review and media-rights confirmation remain required approval gates.
- Placeholder or simulated assets must never be published.
- Publishing must be idempotent and retry-safe.
- Enforce per-channel quotas and global provider spend limits before queueing work.

## Suggested rollout

1. Deploy the current app to a persistent single-instance environment and verify backups.
2. Add web OAuth and a secure channel-connection model.
3. Introduce a channel-scoped data layer and migrate existing single-channel records.
4. Add PostgreSQL and durable queue/worker services.
5. Move media to private object storage and make FFmpeg workers stateless.
6. Add multi-instance scaling, observability, restore drills, and production security review.

Do not run multiple app instances against the current SQLite database. Do not enable
publishing from an unreviewed or unapproved queue.
