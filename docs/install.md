# Install the JIT Access Bot in your own Cliq org

For an org admin who wants their own copy, and may develop it further. Your copy is fully
yours: its bot, data and settings live in your org, and nothing is shared with any other.
India data centre (`cliq.zoho.in`); for another DC see "Other data centres" below.

About 20 minutes: one command, plus a few things Cliq only lets you do in its UI.
A 3-minute narrated walkthrough of these steps: [media/install-walkthrough.mp4](media/install-walkthrough.mp4).
On Windows, read [Installing on Windows](#installing-on-windows) first.

## You need

- Admin rights in your Cliq org.
- A laptop with **Node 22+** and this repository.

## 1. Two things in the Cliq UI first (5 min)

1. **Connection.** Bots & Tools → **Connections** → Zoho Cliq, link name **`jitaccess`**,
   "use login user's credentials" off, scopes `ZohoCliq.Channels.READ`, `ZohoCliq.Channels.UPDATE`,
   `ZohoCliq.StorageData.ALL`, `ZohoCliq.Webhooks.CREATE`, `ZohoCliq.Users.READ`. Authorise it.
2. **MCP URL.** Bots & Tools → **Cliq MCP** → copy your server URL. Treat it like a password:
   it gives full API access as you. Never commit it or share it.

## 2. Log your laptop in (1 min)

```sh
JIT_MCP_URL='<your MCP URL>' node scripts/mcp-connect.mjs
node scripts/mcp.mjs list | head -3      # works? you're in
```

Credentials go to `~/.jit-cliq/mcp.json` (mode 600), outside the repo.

## 3. Optional: the admin sign-in client (3 min)

Channel admins sign in once (`connect`) so the bot can add and remove members as them. That
needs an OAuth client: at **api-console.zoho.in** create a **Non-browser Applications** client
named "JIT Access Bot" and save it as `~/.jit-cliq/client.json` (mode 600):

```json
{"client_id": "1004.…", "client_secret": "…"}
```

If you skip this now, the installer reminds you; add it later with
`node scripts/seed-config.mjs --client`.

## 4. Install (one command, ~5 min)

```sh
node scripts/install.mjs
```

It runs the project's checks, then creates in your org — or reuses, if you run it again: the
bot, the private `#jitaudit` audit channel (with the bot in it), the 24 hourly sweep
schedulers, the five datastores, eight functions and every handler, and the default settings
with you as the alert recipient. It reads every step back and finishes with a short to-do list.
Your org's ids are written to `extension/org.json` (not committed).

## 5. The widget (5 min, UI)

Bots & Tools → **Widgets** → Create Widget: name **JIT Access**, access **Organization**, choose
**Dynamic tabs**, add the **Tabs** and **View** handlers (save the samples). Copy the widget's id
from the address bar, then:

```sh
node scripts/install.mjs --widget-id <id>
```

Then open the widget's **settings** in the UI and press **Save** once — until you do, everyone
except you sees "trouble populating data".

## 6. Start using it

- Each channel admin sends the bot **`connect`** (one-time Zoho sign-in), then **`enrol #channel`**.
- Anyone pastes a channel link to the bot to ask for access. See the [README](../README.md) for
  the commands and [docs/demo-script.md](demo-script.md) for a 3-minute walkthrough.

Everyone sees Cliq's one-time "Allow JIT Access Bot …" prompt the first time, and again for the
widget.

---

## Installing on Windows

The Cliq UI steps and every `node scripts/…` command are the same. What differs is the shell
around them. Use **PowerShell 7** (`pwsh`): the older Windows PowerShell 5.1 has no `&&`.

- **Clone with Git**, not a ZIP download: the project checks list files with `git`. The
  repository's `.gitattributes` keeps Unix line endings, which the build and checks are tested with.
- **Step 2** (log in) becomes:

  ```powershell
  $env:JIT_MCP_URL = '<your MCP URL>'
  node scripts/mcp-connect.mjs
  Remove-Item Env:JIT_MCP_URL          # don't leave the URL in the session
  node scripts/mcp.mjs list | Select-Object -First 3
  ```

- **`~/.jit-cliq/`** is `C:\Users\<you>\.jit-cliq\`; the scripts find it on their own. There is
  no `chmod 600` on Windows — your profile folder is already private to your account, so keep the
  files there and nowhere shared (not OneDrive-synced Desktop or Documents).
- **Step 3** (`client.json`): create it in that folder, for example with
  `notepad $HOME\.jit-cliq\client.json`.
- Steps 4–6 and the commands under "Developing your own copy" run unchanged.

Not yet run on a Windows machine: these differences come from reading the scripts, not from a
Windows install. If something breaks, the error names the step — please report it.

## Developing your own copy

The repository is the source of truth; the org runs what you deploy.

```sh
# edit extension/** (Deluge), then:
npm run gate && npm test          # project checks — must pass
node scripts/deploy.mjs           # build + deploy everything (or name entries: fn-jitform sweep …)
```

- Shared code lives in `extension/lib/` and is inlined by `// @include lib/x.dg`. Read
  `CLAUDE.md` first: its "bitten register" lists the Cliq traps that already cost time
  (letters-only names, ~40 KB handler limit, 20-character button labels, 100-character widget
  replies, regex escaping, and more).
- After changing a widget handler, re-save the widget's settings in the UI.
- **Live tests** (`npm run selftest`) run on a throwaway bot named `jitspike` with an incoming
  webhook handler; create one if you want them.
- Your ids stay in `extension/org.json`, so you can pull changes from the original repository
  without conflicts.

"Publishing" a new version is simply deploying it to your org. (Cliq extensions with a one-click
install link would need an org whose plan allows creating extensions; the test org's did not.)

## Other data centres

Edit `extension/lib/config.dg`: `cliqApi`, `accountsUrl`, `allowedHosts` (swap `.in` for your
DC's domain), and `tz` / `tzOffsetMs`; and in `scripts/install.mjs` the scheduler `timezone`.
Expiry rounding assumes a fixed UTC offset — correct for India, an hour out during daylight
saving elsewhere.

## Removing it

Delete the bot, the eight `jit…` functions, the 24 `jitsweep…` schedulers, the widget and the
five `jit…` datastores in Bots & Tools, and the `#jitaudit` channel. Members the bot added are
not removed by deleting it — end active access first (`my access` / the widget).
