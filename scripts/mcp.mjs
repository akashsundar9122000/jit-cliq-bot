#!/usr/bin/env node
// CLI over the dev MCP client.
//   node scripts/mcp.mjs list                 → tool names + descriptions
//   node scripts/mcp.mjs schema <tool>        → one tool's definition
//   node scripts/mcp.mjs dump                 → every tool definition as JSON
//   node scripts/mcp.mjs call <tool> '<json>' → call a tool (exits 1 on a tool error)
import { connect, allTools, call } from './lib/mcp-client.mjs';

const [cmd, arg, json] = process.argv.slice(2);
await connect();
if (cmd === 'list') {
  for (const t of await allTools()) {
    console.log(`${t.name}\t${(t.description ?? '').replace(/\s+/g, ' ').slice(0, 160)}`);
  }
} else if (cmd === 'schema') {
  const t = (await allTools()).find((x) => x.name === arg);
  console.log(t ? JSON.stringify(t, null, 2) : `No tool named ${arg}`);
} else if (cmd === 'dump') {
  console.log(JSON.stringify(await allTools(), null, 2));
} else if (cmd === 'call') {
  console.log(JSON.stringify(await call(arg, json ? JSON.parse(json) : {}), null, 2));
} else {
  console.error('usage: mcp.mjs list | schema <tool> | dump | call <tool> <json>');
  process.exit(1);
}
