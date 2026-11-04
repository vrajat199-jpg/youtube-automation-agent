# Cloud runtime scaffold

The repository is not yet a horizontally scalable cloud application. This folder
records the target runtime contract while preserving the current local Express app.

## Current milestone

- Express remains the web/API server.
- SQLite remains supported for local development and a single persistent instance.
- Cloud environment variables are opt-in.
- Multi-channel registry and web OAuth are not yet wired into publishing.
- Durable queue workers and object storage are future milestones.

See [Cloud deployment](../docs/cloud-deployment.md) and
[Multi-channel architecture](../docs/multi-channel-architecture.md).

## Production warning

Do not scale this app to multiple replicas while it uses its local SQLite database,
filesystem token store, local scheduler, or local media paths. A production deployment
must use persistent volumes, backups, HTTPS, a managed secret store, and a reviewed
OAuth web flow. Publishing stays disabled until a real channel is connected and the
human approval gates are satisfied.
