# OAuth scopes and identities

For admins and security reviewers. The bot acts under three identities; each has the least it
needs that has been proven to work, and anything not yet proven is marked.

## 1. The `jitaccess` connection (the org admin who set the bot up)

Used for: datastore reads and writes, bot messages to people (`postToBot`), audit posts
(`postToChannelAsBot`). **Not** used to add or remove channel members.

| Scope | Why | Proven? |
|---|---|---|
| `ZohoCliq.StorageData.ALL` | every `zoho.cliq.*Record*` task; without a connection they return `oauthtoken_scope_invalid` | Yes |
| `ZohoCliq.Channels.READ` / `UPDATE` | present on the tested connection | Not needed by the bot today (channel calls use admin tokens); kept until removed and retested |
| `ZohoCliq.Webhooks.CREATE` | present on the tested connection; likely bot messaging | Not isolated |
| `ZohoCliq.Users.READ` | present on the tested connection | Not used by the bot; candidate for removal |

Narrowing this list is a follow-up: remove one scope, run `npm run selftest` and one live request
through to removal, and keep the change only if everything still passes.

## 2. Each channel admin's own grant (device-flow sign-in)

Requested when an admin sends `connect` (`ownerScopes` in `extension/lib/config.dg`):

| Scope | Why |
|---|---|
| `ZohoCliq.Channels.READ` | read the channel and its members as that admin: the live admin check before every decision, and the read-back that proves each add and removal |
| `ZohoCliq.Channels.UPDATE` | add an approved person, remove them at the end |
| `AaaServer.profile.Read` | after sign-in, confirm the grant belongs to the person who asked (a code approved from another Zoho account is discarded) |

Stored as: refresh token and short-lived access token in **encrypted** fields of `jitowners`.
Access tokens are cached until a minute before they expire, because Zoho throttles rapid
refreshes and a throttled refresh looks like a revoked one. `disconnect` clears both.

Why not the org admin's connection for membership? An org admin's token cannot see or manage a
private channel it is not in — verified live. Acting as a current admin of the channel is the
only way that works for every private channel.

## 3. The OAuth client (API Console, "Non-browser Applications")

Client id and secret live in encrypted fields of `jitconfig`, written by
`scripts/seed-config.mjs` from `~/.jit-cliq/client.json`. They never appear in source, output,
the audit channel or messages.

## Not requested

WorkDrive scopes: WorkDrive and Writer support is not built (see [limitations](limitations.md)).
A `jitworkdrive` connection was created during the feasibility work and is unused; delete it.
