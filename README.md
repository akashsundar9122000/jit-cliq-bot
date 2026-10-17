# JIT Access Bot for Zoho Cliq

Temporary, owner-approved access to private Cliq channels — granted only after a current
channel admin approves, and removed automatically when it ends. Built entirely from native
Cliq components (a bot, Deluge functions, Cliq datastores, schedulers and a widget). There is
no external server.

## What it does

1. **A person asks.** They paste a channel link (or `#channel`) to the JIT Access Bot, pick how
   long and say why.
2. **An admin of that channel decides.** Approve, change the end time, ask for details or
   reject — from the request card in chat or from the **JIT Access** widget. The admin's role is
   re-checked live on every click.
3. **The bot adds them** to the channel as that admin, and counts the grant only once the
   channel's members list shows them.
4. **It ends on time.** An hourly sweep reminds them before the end, lets them ask for more
   time (a fresh approval), and removes them at the end — again confirmed against the members
   list. It only ever removes access it granted itself.

Everything that happens is posted to a private audit channel.

## Commands (send to the bot)

| Command | Who | What |
|---|---|---|
| a channel link or `#channel` | anyone | request temporary access |
| `my access` | anyone | your requests, with Extend / End buttons for live access |
| `pending` | channel admins | requests waiting for you; failed grants and removals with their fix buttons |
| `enrol #channel` / `unenrol #channel` | that channel's admins | allow / stop temporary access to a channel |
| `connect` / `disconnect` | channel admins | let the bot add and remove members as you (one-time Zoho sign-in) |
| `help` | anyone | the list above |

The **JIT Access** widget (More apps) shows the same, with buttons; org admins also get an
**Admin** tab with settings and an emergency **pause**.

## How it is built

- `extension/` — Deluge sources. Deluge has no imports, so shared code lives in `extension/lib/`
  and is inlined where a source says `// @include lib/x.dg` (`scripts/build.mjs` → `dist/`).
  - `bot/` message and welcome handlers · `functions/` card buttons and forms (8 functions) ·
    `schedulers/sweep.dg` (the hourly sweep, in 24 daily schedulers) · `widget/` the widget ·
    `schema/datastores.json` five datastores.
- `scripts/` — `build`, `gate` (the project's checks), `selftest` (Deluge tests run in Cliq),
  `deploy` (pushes everything through the Cliq MCP), `seed-config`, and dev tools.
- `tests/` — unit tests for the gate's rules.
- `docs/` — [setup](docs/setup-cliq.md) · [OAuth scopes](docs/oauth-scopes.md) ·
  [security review](docs/security-review.md) ·
  [runbook](docs/runbook.md) · [limitations](docs/limitations.md) ·
  [demo script](docs/demo-script.md) · [live end-to-end record](docs/e2e.md) ·
  [platform capability matrix](docs/capability-matrix.md).

Key design points, each with the failure it prevents:

- **Grants and removals run as a channel admin**, using the admin's own Zoho grant (device-flow
  sign-in, refresh token in an encrypted field): an org admin's token cannot touch a private
  channel it is not in.
- **Every membership change is proven by reading the members list back** — Cliq answers adds and
  removes with an empty 204.
- **Single-use decisions use a compare-and-set lock** (`lib/lock.dg`): two clicks 2 ms apart both
  passed a plain unique-key insert.
- **Request state changes only through `lib/transition.dg`**, which re-reads the state and checks
  the move is legal (enforced by the gate).
- **Finished requests are pruned** after a retention period so the org's 1,000-record datastore
  cap is never reached; history lives in the audit channel.

## Status

All five build phases are done and were tested live in a sandbox org with two people
(requester and channel admin); see [docs/e2e.md](docs/e2e.md) for what was verified and what was
not. WorkDrive and Writer files are not supported yet (see [limitations](docs/limitations.md)).

## Install it in your own org

`node scripts/install.mjs` builds everything in the org your Cliq MCP login belongs to — see
[docs/install.md](docs/install.md) (about 20 minutes, including a few Cliq UI steps).

## Checks

```sh
npm run gate        # secrets, connection use, state writes, org scoping, sizes, Cliq limits…
npm test            # the gate's own rules
npm run selftest    # Deluge tests, run inside Cliq
npm run deploy      # build + deploy through the Cliq MCP
```
