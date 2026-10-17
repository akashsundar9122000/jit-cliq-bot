#!/usr/bin/env node
// Runs a Deluge file on the throwaway `jitspike` bot and prints what it returned.
// Cliq has no "execute Deluge" API, so the file becomes the bot's incoming-webhook
// handler, the webhook is fired, and the result is read back from the execution log.
//
//   node scripts/spike.mjs spikes/<file>.dg ['{"key":"value"}']
import fs from 'node:fs';
import { connect, call } from './lib/mcp-client.mjs';

const BOT_NAME = 'jitspike';
const [file, payload = '{}'] = process.argv.slice(2);
if (!file) { console.error('usage: spike.mjs <file.dg> [json payload]'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let BOT_ID;

async function executions(fromMs) {
  const r = await call('ZohoCliq_list_bot_handler_executions', {
    path_variables: { BOT_ID, HANDLER_TYPE: 'incoming_webhook_handler' },
    query_params: { from_time: fromMs, to_time: Date.now() + 60_000 },
  });
  return r.data?.data ?? [];
}

await connect();
// Look the bot up by name: its id changes whenever it is recreated (for example under a
// different owner), and a stale id would update a bot that no longer exists.
const bots = (await call('ZohoCliq_list_bots', {})).data?.data ?? [];
BOT_ID = bots.find((b) => b.unique_name === BOT_NAME)?.id;
if (!BOT_ID) { console.error(`No bot named ${BOT_NAME} — create it first.`); process.exit(1); }
await call('ZohoCliq_update_bot_handler', {
  path_variables: { BOT_ID, HANDLER_TYPE: 'incoming_webhook_handler' },
  body: { script: fs.readFileSync(file, 'utf8') },
});

const firedAt = Date.now() - 5_000;
const before = new Set((await executions(firedAt - 60_000)).map((e) => e.execution_id));
await call('ZohoCliq_send_bot_webhook_message', {
  path_variables: { BOT_UNIQUE_NAME: BOT_NAME },
  body: JSON.parse(payload),
});

// The execution log lags by ~20 s, and its rate limit is 10 requests/minute, so poll
// slowly and give up loudly rather than print nothing: an empty result must never be
// mistaken for a spike that ran and found nothing.
for (let i = 0; i < 6; i++) {
  await sleep(i === 0 ? 15_000 : 10_000);
  // The log endpoint intermittently answers "try again later"; that says nothing about
  // whether the handler ran, so it counts as "not visible yet" rather than a failure.
  let list;
  try {
    list = await executions(firedAt);
  } catch (err) {
    console.error(`(log fetch failed, retrying: ${err.message.slice(0, 120)})`);
    continue;
  }
  const fresh = list.filter((e) => !before.has(e.execution_id));
  if (fresh.length) {
    const e = fresh.sort((a, b) => b.execution_time - a.execution_time)[0];
    if (e.error_statement) {
      console.error(`execution ${e.execution_id} FAILED at line ${e.line_number}: ${e.error_statement}`);
      process.exit(3);
    }
    let out = e.output;
    try { out = JSON.stringify(JSON.parse(e.output), null, 2); } catch { /* raw text */ }
    console.log(`execution ${e.execution_id} (${e.time_taken} ms)\n${out}`);
    process.exit(0);
  }
}
console.error('No new execution appeared within ~65 s — the handler may not have run.');
process.exit(2);
