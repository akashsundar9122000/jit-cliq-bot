#!/usr/bin/env node
// Deploys the built Deluge to the Cliq org through the MCP so the org matches the repo.
//
//   node scripts/deploy.mjs                 → datastores + every manifest entry
//   node scripts/deploy.mjs bot-message ... → only those entries (datastores still checked)
//
// Saving a handler compiles it, so a deploy is also the authoritative compile check: a
// failure prints the compiler's line number together with that line from dist/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, call } from './lib/mcp-client.mjs';
import { buildAll, loadManifest } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const only = process.argv.slice(2);
const manifest = loadManifest();
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'extension/schema/datastores.json'), 'utf8'));

if (!manifest.bot?.id) {
  console.error('No extension/org.json for this org yet — run node scripts/install.mjs first.');
  process.exit(1);
}
await connect();

async function ensureDatastores() {
  const existing = (await call('ZohoCliq_list_datastores_v2', {})).data?.data ?? [];
  for (const ds of schema.datastores) {
    const found = existing.find((e) => e.unique_name === ds.unique_name);
    if (!found) {
      await call('ZohoCliq_create_datastore_v2', {
        body: {
          unique_name: ds.unique_name,
          name: ds.name,
          description: ds.description,
          fields: ds.fields.map((f) => ({ unique_name: f.unique_name, name: f.unique_name, type: f.type })),
          unique_keys: ds.unique_keys,
        },
      });
      console.log(`datastore ${ds.unique_name}: created`);
      continue;
    }
    // Field types are immutable, so drift is reported rather than "fixed" by recreating
    // the store, which would delete every record in it.
    const detail = (await call('ZohoCliq_get_datastore_v2', { path_variables: { DATASTORE_ID: found.id } })).data?.data ?? found;
    const have = new Map((detail.fields ?? []).map((f) => [f.unique_name, f.type]));
    const missing = ds.fields.filter((f) => !have.has(f.unique_name));
    const wrong = ds.fields.filter((f) => have.has(f.unique_name) && have.get(f.unique_name) !== f.type);
    if (wrong.length) throw new Error(`datastore ${ds.unique_name}: field type drift ${wrong.map((f) => `${f.unique_name} is ${have.get(f.unique_name)}, want ${f.type}`).join('; ')}`);
    if (missing.length) {
      await call('ZohoCliq_add_datastore_fields_v2', {
        path_variables: { DATASTORE_ID: found.id },
        body: { fields: missing.map((f) => ({ unique_name: f.unique_name, name: f.unique_name, type: f.type })) },
      });
      console.log(`datastore ${ds.unique_name}: added ${missing.map((f) => f.unique_name).join(', ')}`);
    } else {
      console.log(`datastore ${ds.unique_name}: ok`);
    }
  }
}

async function functionIds() {
  const list = (await call('ZohoCliq_list_functions_v2', {})).data?.data ?? [];
  const ids = {};
  for (const fn of manifest.functions) {
    let found = list.find((f) => f.name === fn.name);
    if (!found) {
      const created = await call('ZohoCliq_create_function_v2', { body: { name: fn.name, description: fn.description, function_type: fn.function_type } });
      found = created.data?.data ?? created.data;
      console.log(`function ${fn.name}: created (${found.id})`);
    }
    ids[fn.name] = { id: found.id, handlers: (found.handlers ?? []).map((h) => h.type ?? h) };
  }
  return ids;
}

function explain(err, dist) {
  const m = err.message.match(/"line_number":(\d+),"error_statement":"((?:[^"\\]|\\.)*)"/);
  if (!m) return err.message.slice(0, 500);
  const n = Number(m[1]);
  const lines = fs.readFileSync(dist, 'utf8').split('\n');
  const msg = m[2].replace(/\\n/g, ' ');
  return `line ${n}: ${msg}\n    ${n - 1}| ${lines[n - 2] ?? ''}\n  > ${n}| ${lines[n - 1] ?? ''}\n    ${n + 1}| ${lines[n] ?? ''}`;
}

await ensureDatastores();
const fnIds = await functionIds();
const bot = (await call('ZohoCliq_get_bot', { path_variables: { BOT_ID: manifest.bot.id } })).data?.data;
const botHandlers = new Set((bot?.handlers ?? []).map((h) => h.type ?? h));

let failed = 0;
for (const b of buildAll(only.length ? only : undefined)) {
  const script = fs.readFileSync(b.dist, 'utf8');
  try {
    if (b.target.kind === 'bot_handler') {
      const exists = botHandlers.has(b.target.handler);
      await call(exists ? 'ZohoCliq_update_bot_handler' : 'ZohoCliq_create_bot_handler', exists
        ? { path_variables: { BOT_ID: manifest.bot.id, HANDLER_TYPE: b.target.handler }, body: { script } }
        : { path_variables: { BOT_ID: manifest.bot.id }, body: { type: b.target.handler, script } });
    } else if (b.target.kind === 'function_handler') {
      const fn = fnIds[b.target.function];
      const exists = fn.handlers.includes(b.target.handler);
      await call(exists ? 'ZohoCliq_update_function_handler_v2' : 'ZohoCliq_create_function_handler_v2', exists
        ? { path_variables: { FUNCTION_ID: fn.id, FUNCTION_HANDLER_TYPE: b.target.handler }, body: { script } }
        : { path_variables: { FUNCTION_ID: fn.id }, body: { type: b.target.handler, script } });
      if (!exists) fn.handlers.push(b.target.handler);
    } else if (b.target.kind === 'widget_handler') {
      // The widget itself is created in the Cliq UI: the create API fails in this org.
      if (!manifest.widget?.id) throw new Error('no widget id in extension/org.json — create the widget in the Cliq UI, then node scripts/install.mjs --widget-id <id>');
      await call('ZohoCliq_update_widget_handler_v2', { path_variables: { LONG_ID: manifest.widget.id, widget_exe_handler_names: b.target.handler }, body: { script } });
    } else if (b.target.kind === 'scheduler') {
      for (const id of manifest.schedulers) {
        await call('ZohoCliq_update_scheduler_handler_v2', { path_variables: { SCHEDULER_ID: id, HANDLER_TYPE: 'execution_handler' }, body: { script } });
      }
      if (!manifest.schedulers.length) throw new Error('no scheduler ids in extension/org.json — run node scripts/install.mjs first');
    } else {
      console.log(`${b.id.padEnd(16)} skipped (${b.target.kind})`);
      continue;
    }
    console.log(`${b.id.padEnd(16)} deployed  (${b.statements} statements)`);
  } catch (err) {
    failed++;
    console.log(`${b.id.padEnd(16)} FAILED\n  ${explain(err, b.dist)}`);
  }
}
process.exit(failed ? 1 : 0);
