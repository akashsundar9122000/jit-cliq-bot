#!/usr/bin/env node
// Compile-checks Deluge files by saving each as the jitspike bot's webhook handler
// (saving compiles; nothing runs). Prints OK or the compiler's line and message.
//   node scripts/compile.mjs <file.dg> [...]
import fs from 'node:fs';
import { connect, call } from './lib/mcp-client.mjs';

await connect();
const bots = (await call('ZohoCliq_list_bots', {})).data?.data ?? [];
const BOT_ID = bots.find((b) => b.unique_name === 'jitspike')?.id;
let failed = 0;
for (const file of process.argv.slice(2)) {
  try {
    await call('ZohoCliq_update_bot_handler', {
      path_variables: { BOT_ID, HANDLER_TYPE: 'incoming_webhook_handler' },
      body: { script: fs.readFileSync(file, 'utf8') },
    });
    console.log(`OK    ${file}`);
  } catch (err) {
    failed++;
    const m = err.message.match(/"error_data":(\{.*?\})/);
    console.log(`FAIL  ${file}  ${m ? m[1] : err.message.slice(0, 300)}`);
  }
}
process.exit(failed ? 1 : 0);
