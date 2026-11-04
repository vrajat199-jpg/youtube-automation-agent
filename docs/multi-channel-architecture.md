# Multi-channel architecture (implementation plan)

## Core rule

A connected YouTube channel is a tenant boundary. Every channel-owned resource must
carry a `channel_id`, and every read/write must verify that the authenticated user owns
or has been granted access to that channel.

## Proposed entities

| Entity | Purpose |
| --- | --- |
| users | Application identities |
| workspaces | A user's account/team boundary |
| workspace_members | Roles and access grants |
| channels | YouTube channel metadata and connection status |
| channel_credentials | Encrypted OAuth credentials, never returned to clients |
| channel_strategies | Niche, audience, pillars, cadence, KPI and limits |
| content_projects | Long-form or Short production projects |
| media_assets | Object-storage key, checksum, MIME type, rights/provenance |
| generation_jobs | Durable stage, retries, progress and channel scope |
| approvals | Fact check, rights review and final owner approval |
| publish_queue | Idempotency key, desired publish time and channel scope |
| analytics_snapshots | Channel/video metrics with measurement window |

## Channel isolation requirements

- Resolve the active channel from an authenticated workspace membership, not a
  client-supplied channel name.
- Scope database queries by workspace and channel.
- Encrypt OAuth refresh tokens using a managed KMS or envelope encryption.
- Redact secrets and authorization headers from logs and error reports.
- Support disconnect/revoke without deleting a channel's historical analytics.
- Enforce a unique YouTube channel ID per connection owner/workspace.

## Content formats

Use an explicit format discriminator such as `long_form` or `short` on content
projects. Shorts should retain their own 9:16 output profile, duration validation,
caption settings and metadata while reusing the same approval and publishing gates.

## Migration strategy

The existing application assumes one channel. First introduce a channel registry and
a compatibility adapter that resolves the configured legacy channel. Then add
`channel_id` to channel-owned tables and migrate existing rows to the legacy channel.
Only after migration and regression tests should the UI expose channel switching.

This file is an architecture contract, not a claim that multi-tenant enforcement is
already implemented.
