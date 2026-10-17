# Runbook

For org admins and channel admins operating the JIT Access Bot. Everything the bot does is in
the private **#jitaudit** channel; start there.

## Is it healthy?

Open **JIT Access** (More apps) → **Admin**. Check:

- **Running** (not PAUSED).
- **Last sweep** within the last hour. Sweeps run at every IST hour (:00).
- **removal failed: 0** and **with an admin for review: 0**.

If a sweep is ever missed, the next one alerts everyone in *Alerts go to* ("Missed sweep") and
writes `[heartbeat]` to #jitaudit.

## Alerts and what to do

### "Missed sweep" — the sweep did not run for N hours

1. In Bots & Tools → Schedulers, check all 24 `jitsweepa`…`jitsweepx` are **enabled**.
2. Expiries and reminders from the gap are handled by the run that raised the alert; nothing is
   skipped, only late.
3. If it repeats, check a scheduler's execution history (MCP
   `list_scheduler_handler_executions_v2`); an execution log that says "try again later" means
   "not yet", not "did not run".

### "Removal failed" — someone's access should have ended but they are still a member

The sweep retries after 15 min, 30 min, 1 h, 2 h, then every 4 h. Common causes, from `lasterror`:

| Error | Cause | Fix |
|---|---|---|
| `still_member:400` | channel archived, or the person became an admin | unarchive / change their role, then **Retry removal** |
| `no_admin_connection` | no admin of the channel has a working `connect` | an admin sends the bot `connect`, then **Retry removal** |
| `readback:…` | members list unreadable | usually transient; wait for the next retry |

To stop the retries: **Manual review** (with a reason), remove the person by hand in the channel,
then **Mark resolved** — it refuses while they are still a member. All three are in `pending` (chat)
and in the widget's **Approvals** tab.

### "Access not granted" — an approval could not add the person

The request is approved but nobody was added. Fix the cause (archived channel, admin's
connection lapsed), then **Retry** (card or `pending`), or **Close request** to tell the
requester nothing was granted.

## Emergency pause

Admin tab → **Change settings** → State **Paused**. New requests, approvals, grant retries and
extensions stop; **removals keep running**, so nothing outlives its end. Everyone in *Alerts go
to* is told. Resume the same way. Only Cliq org admins can change settings; every change is
audited as `[settings]`.

## People and channels

- **An admin leaves or disconnects**: grants they approved are removed by any other connected
  admin of the channel. If none is connected, removals fail with `no_admin_connection` (above).
- **Stop a channel taking requests**: an admin sends `unenrol #channel`. Live access still ends
  on schedule.
- **Someone removed by hand** before their end: the next sweep notices, closes the request and
  says so (`removed from the channel outside the bot`).

## Records and the 1,000-record cap

Each request leaves 3–6 lock rows. The sweep deletes finished requests and their locks after
*Finished requests kept* (default 7 days) and posts `[pruned]`. If the org nears its cap, lower
retention in settings; the audit channel keeps the history either way.

## Secrets

- **OAuth client secret** (API Console): regenerate there, update `~/.jit-cliq/client.json`, run
  `node scripts/seed-config.mjs --client`. Admins' existing sign-ins keep working.
- **An admin's stored grant**: they send `disconnect`; or revoke "JIT Access Bot" in their Zoho
  account's connected apps.
- **Cliq MCP server URL**: regenerate in Bots & Tools → Cliq MCP and update local config. It grants
  full API access; never paste it anywhere.
- **Who can read approvers' grants**: any Deluge script using the `jitaccess` connection can read
  the stored refresh tokens (they decrypt inside Deluge). Keep editing rights to the bot's
  components with org admins only.

## Alerts from the security fixes

- **"Removal blocked"** (`[revoke-blocked]`): the removal could not even take its lock, usually
  because the org's datastores are full. Lower retention, then **Retry removal**.
- **`[settled]`** entries: the sweep found a grant or removal that had stopped part-way and settled
  it against the members list. A settled grant that shows "needs Retry or Close" is in `pending`.

## Deploying a change

```sh
npm run gate && npm test && npm run selftest && node scripts/deploy.mjs
```

If you changed a widget handler, open the widget's settings in the UI and press **Save** once, or
other users get "trouble populating data". After a deploy that uses a new Deluge task, people see
one extra consent prompt.

## Where to look

| What | Where |
|---|---|
| Every grant, removal, decision, setting change | #jitaudit |
| Request records and locks | Bots & Tools → Databases (`jitrequests`, `jitlocks`) |
| Sweep runs | scheduler execution history (MCP) |
| Button / form function runs | not available through the MCP; the function editor's *Show Logs* |
