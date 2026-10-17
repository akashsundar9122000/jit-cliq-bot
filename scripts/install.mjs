#!/usr/bin/env node
// Installs the JIT Access Bot into the Cliq org your MCP login belongs to. Safe to re-run:
// every step finds what already exists and only creates what is missing.
//
//   node scripts/install.mjs                     → bot, audit channel, 24 sweeps, datastores,
//                                                  functions, handlers, settings
//   node scripts/install.mjs --widget-id <id>    → also deploy the widget (created in the UI)
//
// Before: the `jitaccess` connection exists (Cliq UI) and the MCP is logged in
// (scripts/mcp-connect.mjs). Optional: ~/.jit-cliq/client.json for the admin sign-in client.
// Writes the org's ids to extension/org.json (gitignored) and reads every step back.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { connect, call } from './lib/mcp-client.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORG_FILE = path.join(ROOT, 'extension', 'org.json');
const args = process.argv.slice(2);
const widgetArg = args.includes('--widget-id') ? args[args.indexOf('--widget-id') + 1] : undefined;
const BOT_NAME = 'JIT Access Bot';
const BOT_UNIQUE = 'jitaccessbot';
const AUDIT = 'jitaudit';
const letters = 'abcdefghijklmnopqrstuvwx';
const todo = [];
const step = (n, msg) => console.log(`${String(n).padStart(2)}. ${msg}`);
const run = (script, extra = []) => execFileSync('node', [path.join(ROOT, 'scripts', script), ...extra], { cwd: ROOT, stdio: 'inherit' });
const data = (r) => r?.data?.data ?? r?.data ?? [];

const org = fs.existsSync(ORG_FILE) ? JSON.parse(fs.readFileSync(ORG_FILE, 'utf8')) : { _comment: 'Per-org deployment ids, written by scripts/install.mjs. Not committed: each org that installs the bot has its own.' };
const saveOrg = () => fs.writeFileSync(ORG_FILE, JSON.stringify(org, null, 2) + '\n');

// 0. The code's own checks first: a broken tree must not reach an org.
step(0, 'checks (gate + unit tests)');
run('gate.mjs');
execFileSync('node', ['--test', ...fs.readdirSync(path.join(ROOT, 'tests')).filter((f) => f.endsWith('.test.mjs')).map((f) => path.join('tests', f))], { cwd: ROOT, stdio: 'ignore' });

await connect();

// 1. The bot. Its unique name is derived from the display name by Cliq, and the code refers to
// it as "jitaccessbot" — so a bot that came out under another name is a stop, not a warning.
let bot = data(await call('ZohoCliq_list_bots', {})).find((b) => b.unique_name === BOT_UNIQUE);
if (!bot) {
  const made = data(await call('ZohoCliq_create_bot', { body: { name: BOT_NAME, description: 'Temporary, owner-approved access to private Cliq channels: granted after a channel admin approves, removed automatically when it ends.', scope: 'organization', execution_type: 'deluge', channel_participation: ['send_message'] } }));
  bot = data(await call('ZohoCliq_list_bots', {})).find((b) => b.unique_name === BOT_UNIQUE);
  if (!bot) {
    console.error(`The bot was created as "${made?.unique_name ?? '?'}", not "${BOT_UNIQUE}". Rename it in the Cliq UI, or change botName in extension/lib/config.dg, then re-run.`);
    process.exit(1);
  }
  step(1, `bot ${BOT_UNIQUE}: created (${bot.id})`);
} else step(1, `bot ${BOT_UNIQUE}: found (${bot.id})`);
const me = bot.creator?.id;
org.bot = { id: bot.id };
saveOrg();

// 2. The private audit channel, with the bot in it (it posts there as itself).
const listChannels = async () => { const r = await call('ZohoCliq_list_channels', { query_params: { limit: 100 } }); return r.data?.channels ?? r.data?.data ?? []; };
let audit = (await listChannels()).find((c) => c.unique_name === AUDIT);
if (!audit) {
  await call('ZohoCliq_create_channel', { body: { name: AUDIT, description: 'JIT Access Bot audit trail: every request, decision, grant and removal. Keep membership to people who should see all of it.', level: 'private', user_ids: [me] } });
  audit = (await listChannels()).find((c) => c.unique_name === AUDIT);
  if (!audit) { console.error(`Could not create or find #${AUDIT}.`); process.exit(1); }
  step(2, `#${AUDIT}: created (private)`);
} else step(2, `#${AUDIT}: found`);
try {
  await call('ZohoCliq_add_bot_to_channel', { path_variables: { BOT_UNIQUE_NAME: BOT_UNIQUE }, body: { channel_unique_name: AUDIT } });
} catch (e) {
  if (!/already|exist/i.test(e.message)) todo.push(`Add the JIT Access Bot to #${AUDIT} (channel settings → add bot): ${e.message.slice(0, 120)}`);
}

// 3. The 24 hourly sweeps. Cliq schedulers repeat at most daily; names must be letters only.
const existing = data(await call('ZohoCliq_list_schedulers_v2', { query_params: { limit: 100 } }));
const ids = [];
let created = 0;
for (let h = 0; h < 24; h++) {
  const name = `jitsweep${letters[h]}`;
  let s = existing.find((x) => x.name === name);
  if (!s) {
    const made = data(await call('ZohoCliq_create_scheduler_v2', { body: { name, description: `JIT Access Bot hourly sweep, ${String(h).padStart(2, '0')}:00 IST (one of 24: jitsweepa..x). Reminders, expiry removal, retries, reconciliation, heartbeat.`, recurrence: { frequency: 'daily', interval: 1, timezone: 'Asia/Kolkata', time: `${String(h).padStart(2, '0')}:00`, ends_on: { type: 'never' } } } }));
    s = made?.id ? made : data(await call('ZohoCliq_list_schedulers_v2', { query_params: { limit: 100 } })).find((x) => x.name === name);
    created++;
  }
  if (!s?.id) { console.error(`Could not create or find scheduler ${name}.`); process.exit(1); }
  ids.push(s.id);
}
org.schedulers = ids;
saveOrg();
step(3, `sweeps jitsweepa..x: ${created} created, ${24 - created} found`);

// 4. The widget is created in the UI (the widget API fails); only its id comes in here.
if (widgetArg) org.widget = { id: widgetArg };
saveOrg();

// 5. Datastores, functions and every handler. A missing `jitaccess` connection shows up here:
// Cliq refuses to save a script that names a connection it does not have.
step(5, 'deploy');
const entries = JSON.parse(fs.readFileSync(path.join(ROOT, 'extension', 'manifest.json'), 'utf8')).entries
  .filter((e) => e.target.kind !== 'spike_webhook' && (org.widget?.id || e.target.kind !== 'widget_handler'))
  .map((e) => e.id);
try {
  run('deploy.mjs', entries);
} catch {
  console.error('\nDeploy failed. If the error mentions a connection, create the `jitaccess` connection in the Cliq UI (see docs/setup-cliq.md step 2) and re-run.');
  process.exit(1);
}

// 6. Settings: defaults, the installer as alert recipient, and the sign-in client if present.
step(6, 'settings');
const clientFile = path.join(os.homedir(), '.jit-cliq', 'client.json');
run('seed-config.mjs', ['--admins', me, ...(fs.existsSync(clientFile) ? ['--client'] : [])]);
const cfgRows = data(await call('ZohoCliq_list_datastore_records_v2', { path_variables: { DATASTORE_UNIQUE_NAME: 'jitconfig' }, query_params: { limit: 100 } }));
// The org may already hold a client from an earlier install; only a missing one is a to-do.
if (!fs.existsSync(clientFile) && !cfgRows.some((r) => r.ckey === 'clientid')) todo.push('Create an API Console "Non-browser Applications" client, save it to ~/.jit-cliq/client.json (mode 600), then: node scripts/seed-config.mjs --client');

// 7. Read back: every sweep holds the sweep script.
let ok = 0;
for (const id of ids) {
  const h = data(await call('ZohoCliq_get_scheduler_handler_v2', { path_variables: { SCHEDULER_ID: id, HANDLER_TYPE: 'execution_handler' } }));
  if ((h.script ?? '').includes('schedulers/sweep.dg')) ok++;
}
step(7, `read back: ${ok}/24 sweeps hold the sweep`);
if (ok !== 24) { console.error('Not every sweep was deployed; re-run.'); process.exitCode = 1; }

if (!org.widget?.id) todo.push('Create the widget in the Cliq UI (Bots & Tools → Widgets → Create Widget, name "JIT Access", Organization, Dynamic tabs, add Tabs and View), then: node scripts/install.mjs --widget-id <id>');
else todo.push('Open the JIT Access widget\'s settings in the Cliq UI and press Save once — until then other users see "trouble populating data".');
todo.push('Each channel admin sends the bot "connect", then "enrol #channel".');
console.log('\nInstalled. Still to do:');
todo.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
