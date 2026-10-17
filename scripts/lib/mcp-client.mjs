// Development/verification client for the Cliq MCP server. Never used by the bot itself.
// Reads credentials written by scripts/mcp-connect.mjs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// JIT_MCP_CREDS selects another saved login (e.g. the requester account) so end-to-end
// tests can act as a second person; the default is the developer/owner login.
const STORE = process.env.JIT_MCP_CREDS ?? path.join(os.homedir(), '.jit-cliq', 'mcp.json');
const creds = JSON.parse(fs.readFileSync(STORE, 'utf8'));

async function accessToken() {
  // Refresh a minute early: a token that expires mid-call surfaces as a bare 401
  // that looks exactly like a revoked grant.
  if (creds.access_token && creds.expires_at - 60_000 > Date.now()) return creds.access_token;
  const res = await fetch(creds.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: creds.refresh_token,
      client_id: creds.client_id,
      resource: creds.server_url,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new Error(`Token refresh failed (${res.status}): ${body.error ?? 'no access_token'}`);
  creds.access_token = body.access_token;
  creds.expires_at = Date.now() + (Number(body.expires_in) || 3600) * 1000;
  if (body.refresh_token) creds.refresh_token = body.refresh_token;
  fs.writeFileSync(STORE, JSON.stringify(creds, null, 2), { mode: 0o600 });
  return creds.access_token;
}

let sessionId;
let nextId = 1;

async function rpc(method, params, { notify = false } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    // A failed write once came back with a body that claimed gzip but was not; asking
    // for identity keeps the real error text readable instead of a zlib crash.
    'Accept-Encoding': 'identity',
    Authorization: `Bearer ${await accessToken()}`,
  };
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;
  const msg = { jsonrpc: '2.0', method, ...(params ? { params } : {}), ...(notify ? {} : { id: nextId++ }) };
  const res = await fetch(creds.server_url, { method: 'POST', headers, body: JSON.stringify(msg) });
  sessionId = res.headers.get('mcp-session-id') ?? sessionId;
  const text = await res.text();
  if (notify) return null;
  if (!res.ok) throw new Error(`${method} → HTTP ${res.status}: ${text.slice(0, 400)}`);
  // Replies arrive either as plain JSON or as an SSE stream of `data:` lines.
  const payloads = text.trim().startsWith('{')
    ? [text]
    : text.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim());
  for (const p of payloads) {
    const obj = JSON.parse(p);
    if (obj.id === msg.id) {
      if (obj.error) throw new Error(`${method} → ${JSON.stringify(obj.error)}`);
      return obj.result;
    }
  }
  throw new Error(`${method} → no matching response: ${text.slice(0, 400)}`);
}

export async function connect() {
  await rpc('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'jit-access-bot-dev', version: '0.0.0' },
  });
  await rpc('notifications/initialized', undefined, { notify: true });
}

export async function allTools() {
  const tools = [];
  let cursor;
  do {
    const r = await rpc('tools/list', cursor ? { cursor } : undefined);
    tools.push(...r.tools);
    cursor = r.nextCursor;
  } while (cursor);
  return tools;
}


// Calls a tool and returns its structured payload. MCP reports tool failures as a
// successful JSON-RPC reply with isError set, so that flag is turned into a throw here;
// otherwise a failed write would read as a success to every caller.
export async function call(name, args = {}) {
  const r = await rpc('tools/call', { name, arguments: args });
  const payload = r.structuredContent ?? r.content;
  if (r.isError || payload?.status === 'failure') {
    throw new Error(`${name} failed: ${JSON.stringify(payload).slice(0, 600)}`);
  }
  return payload;
}
