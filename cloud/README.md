# Cloud deployment

The project now includes a secure single-instance Docker deployment path. The runtime
uses Express, SQLite on a persistent volume, local media files on a persistent volume,
and the existing in-process scheduler.

## Implemented

- Docker image based on the matching Playwright browser image.
- Docker Compose with persistent data and uploads volumes.
- Cloud owner sign-in with an eight-hour signed HTTP-only session cookie.
- Google OAuth Web application flow with expiring, one-use state.
- Per-channel refresh tokens encrypted with AES-256-GCM before database storage.
- Channel registry UI to connect, select and disconnect channel connections.
- Selected default channel credentials are loaded by the existing pipeline at startup.

## Important limitations

This is not yet a horizontally scalable or fully multi-tenant product. The existing
production pipeline uses one selected default channel at a time. Channel-specific
strategies, channel-scoped production/job/approval/analytics data, PostgreSQL,
Redis/BullMQ workers and object storage remain future milestones.

See [Cloud deployment](../docs/cloud-deployment.md) and
[Multi-channel architecture](../docs/multi-channel-architecture.md).

Do not run multiple replicas or enable autoscaling. Use HTTPS, persistent volumes,
backups, a managed secret store, and keep human approval gates enabled.
