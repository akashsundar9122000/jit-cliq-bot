#!/usr/bin/env node
// Seeds jitconfig in a fresh org, through the MCP (as the logged-in org admin).
//
//   node scripts/seed-config.mjs --admins <cliqUserId>[,<id>…]   → defaults + alert recipients
//   node scripts/seed-config.mjs --client                       → also (re)write the OAuth client
//
// Settings that already exist are never overwritten: after setup they belong to the admins
// and the JIT Access widget, and a re-run must not undo a pause. The OAuth client (API Console
// "Non-browser Applications" client) is read only from ~/.jit-cliq/client.json
// ({"client_id": …, "client_secret": …}, mode 600) and written to the encrypted csecret field;
// it is never printed, logged or kept in the repo. Output names keys only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { connect, call } from './lib/mcp-client.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const value = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const admins = value('--admins') ?? '';
if (admins && !/^[0-9]+(,[0-9]+)*$/.test(admins)) {
  console.error('--admins takes Cliq user ids, comma-separated (digits only).');
  process.exit(1);
}

await connect();
const now = Date.now();
const rows = (await call('ZohoCliq_list_datastore_records_v2', { path_variables: { DATASTORE_UNIQUE_NAME: 'jitconfig' }, query_params: { limit: 100 } })).data?.data ?? [];
const byKey = new Map(rows.map((r) => [r.ckey, r]));

async function put(ckey, cvalue, csecret = '', overwrite = false) {
  const existing = byKey.get(ckey);
  if (existing && !overwrite) return console.log(`${ckey.padEnd(13)} kept (already set)`);
  const values = { ckey, cvalue, csecret, updatedat: now, updatedby: 'seed-config' };
  if (existing) {
    await call('ZohoCliq_update_datastore_record_v2', { path_variables: { DATASTORE_UNIQUE_NAME: 'jitconfig', RECORD_ID: existing.id }, body: { values } });
  } else {
    await call('ZohoCliq_create_datastore_record_v2', { path_variables: { DATASTORE_UNIQUE_NAME: 'jitconfig' }, body: { values } });
  }
  // Read back: a write that reports success and changes nothing is the failure to rule out.
  const after = (await call('ZohoCliq_list_datastore_records_v2', { path_variables: { DATASTORE_UNIQUE_NAME: 'jitconfig' }, query_params: { criteria: `ckey==${ckey}` } })).data?.data ?? [];
  const ok = after.length === 1 && after[0].cvalue === cvalue && (csecret === '' || (after[0].csecret ?? '') !== '');
  console.log(`${ckey.padEnd(13)} ${existing ? 'updated' : 'created'}${ok ? '' : '  — READ-BACK MISMATCH'}`);
  if (!ok) process.exitCode = 1;
}

await put('maxhours', '720');
await put('paused', 'false');
await put('retaindays', '7');
if (admins) await put('admins', admins);
else if (!byKey.has('admins')) console.log('admins        not set — pass --admins so missed-sweep alerts reach someone');

if (flag('--client')) {
  const file = path.join(os.homedir(), '.jit-cliq', 'client.json');
  if (!fs.existsSync(file)) {
    console.error(`No ${file}. Create it (mode 600) with {"client_id": "…", "client_secret": "…"}.`);
    process.exit(1);
  }
  // Windows has no POSIX modes: Node reports every file as 0o666, so this check would refuse
  // every client file there. Access is governed by NTFS ACLs on the user's profile instead.
  if (process.platform !== 'win32' && (fs.statSync(file).mode & 0o077) !== 0) {
    console.error(`${file} is readable by others; chmod 600 it first.`);
    process.exit(1);
  }
  const client = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!client.client_id || !client.client_secret) {
    console.error(`${file} needs client_id and client_secret.`);
    process.exit(1);
  }
  await put('clientid', '(encrypted)', client.client_id, true);
  await put('clientsecret', '(encrypted)', client.client_secret, true);
}
