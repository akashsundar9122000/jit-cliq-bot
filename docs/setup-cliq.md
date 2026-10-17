# Setting up the JIT Access Bot in a Zoho Cliq org

> **Most people want [install.md](install.md):** `scripts/install.mjs` does steps 1, 3, 5, 6 and 7
> below in one command. This page is the manual reference behind it.

For the org admin (or developer) installing the bot in a new org. India data centre
(`cliq.zoho.in`); for another DC, change the hosts in `extension/lib/config.dg` first.
Allow about an hour. Steps marked **UI** must be done in the Cliq web app because the API
fails for them in this setup (see the [capability matrix](capability-matrix.md)).

## 0. Before you start

- An org admin account to own the bot, its datastores, connection and schedulers.
- Node 22+, and the Cliq MCP server connected locally (`node scripts/mcp.mjs list` works). The
  MCP is used only to deploy and verify; the bot never calls it. **Its URL is a credential:**
  keep it out of the repo, and rotate it when you finish (step 9).

## 1. Create the bot — UI or MCP

Create a bot with unique name `jitaccessbot`, display name **JIT Access Bot**. Put its id in
`extension/org.json` → `bot.id` (per-org ids live there; see `extension/org.example.json`).

## 2. Create the connection `jitaccess` — UI

Bots & Tools → Connections → Zoho Cliq (built-in), link name **`jitaccess`**, "use login user's
credentials" **off**, scopes:

- `ZohoCliq.Channels.READ`, `ZohoCliq.Channels.UPDATE`
- `ZohoCliq.StorageData.ALL` (datastore tasks)
- `ZohoCliq.Webhooks.CREATE`, `ZohoCliq.Users.READ`

These four are what the tested connection has. Datastore tasks are proven to need
`StorageData`; which of the others the bot's messages (`postToBot`, `postToChannelAsBot`) need
has not been isolated, so keep all four until it is (see [OAuth scopes](oauth-scopes.md)).

Connection names are unique across the org; if `jitaccess` is taken, pick another and replace
the literal everywhere (`grep -r '"jitaccess"' extension`). Authorise it as the org admin.

## 3. Create the audit channel — UI

A **private** channel with unique name `jitaudit`, the bot added to it. Only people who should
see every grant and removal belong in it.

## 4. Create an OAuth client for admin sign-in — API Console

At `api-console.zoho.in`: **Non-browser Applications** client named "JIT Access Bot". It is used
for the device-flow sign-in channel admins do with `connect` (no redirect URL needed). Save its
id and secret to `~/.jit-cliq/client.json`, mode 600:

```json
{"client_id": "1004.…", "client_secret": "…"}
```

Never commit this file or paste the secret into a chat.

## 5. Datastores, functions, handlers — deploy

```sh
npm run gate && npm test
node scripts/deploy.mjs
```

This creates the five datastores (letters-only field names, unique keys from
`extension/schema/datastores.json`), the eight functions, and deploys every handler. A deploy is
also the compile check: an error prints the line from `dist/`.

## 6. Settings — seed

```sh
node scripts/seed-config.mjs --client --admins <your Cliq user id>
```

Writes the OAuth client into encrypted fields and creates the defaults (longest access 720 h,
running, finished requests kept 7 days). Existing settings are never overwritten. Every write is
read back.

## 7. The hourly sweep — 24 schedulers

Cliq schedulers repeat at most daily, so the sweep is 24 schedulers, one per IST hour. Create
them through the MCP (names must be **letters only** — anything else fails with a bare
`operation_failed`): `jitsweepa` at 00:00 … `jitsweepx` at 23:00, daily, `Asia/Kolkata`. Put their
ids, in hour order, in `extension/org.json` → `schedulers` (the gate requires exactly 24), then:

```sh
node scripts/deploy.mjs sweep
```

## 8. The widget — UI, then deploy

Bots & Tools → Widgets → Create Widget: name **JIT Access**, access **Organization**. Choose
**Dynamic tabs** and add both the **Tabs** and **View** handlers (save the samples). Put the widget
id in `extension/org.json` → `widget.id`, deploy (`node scripts/deploy.mjs widget-tabs widget-view`),
then **open the widget's settings in the UI and press Save once** — until you do, everyone
except you gets "trouble populating data" (`widget_cache_not_found`).

## 9. Finish

1. `npm run selftest` — the Deluge tests, run in Cliq (all must pass).
2. As each channel admin: send the bot `connect`, approve the code at accounts.zoho.in, press
   **I've approved**; then `enrol #channel` for each channel they run.
3. Try one request end to end with a second account; check `#jitaudit`.
4. **Rotate the Cliq MCP server URL** (Cliq → Bots & Tools → Cliq MCP → regenerate), update your
   local MCP config, and confirm the old URL no longer works. The URL grants full API access as
   whoever authorised it.

Every person sees a one-time "Allow JIT Access Bot …" consent the first time they use the bot,
and again for the widget; that is Cliq's own prompt.
