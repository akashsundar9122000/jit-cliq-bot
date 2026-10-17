#!/usr/bin/env node
// One-time OAuth 2.1 (dynamic client registration + PKCE) login for the Zoho Cliq MCP
// server, for development and verification only — production bot code never calls MCP.
//
// The server URL contains an API key, so it is read from the environment, never from
// source, and credentials are written to ~/.jit-cliq/mcp.json (mode 600), outside the repo.
//
//   JIT_MCP_URL='https://…/message' node scripts/mcp-connect.mjs
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';

const SERVER_URL = process.env.JIT_MCP_URL;
if (!SERVER_URL) {
  console.error('Set JIT_MCP_URL to the Cliq MCP server URL.');
  process.exit(1);
}
const PORT = 8765;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const STORE_DIR = path.join(os.homedir(), '.jit-cliq');
const STORE = path.join(STORE_DIR, 'mcp.json');

// Only Cliq scopes: the server also advertises Calendar and People scopes this project
// has no use for, and a token is only as dangerous as what it was granted.
const wantScope = (s) => s.startsWith('zohocliq.');

const b64url = (buf) => buf.toString('base64url');

async function getJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${new URL(url).pathname} → ${res.status}: ${text.slice(0, 300)}`);
  return body;
}

const origin = new URL(SERVER_URL).origin;
const resourceMeta = await getJson(`${origin}/.well-known/oauth-protected-resource`);
const authBase = resourceMeta.authorization_servers[0];
const authMeta = await getJson(`${authBase}/.well-known/oauth-authorization-server`);
const scope = (authMeta.scopes_supported ?? []).filter(wantScope).join(' ');

const client = await getJson(authMeta.registration_endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    client_name: 'JIT Access Bot dev (Claude Code)',
    redirect_uris: [REDIRECT_URI],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    scope,
  }),
});

const verifier = b64url(crypto.randomBytes(32));
const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
const state = b64url(crypto.randomBytes(16));

const authUrl = new URL(authMeta.authorization_endpoint);
authUrl.search = new URLSearchParams({
  response_type: 'code',
  client_id: client.client_id,
  redirect_uri: REDIRECT_URI,
  scope,
  state,
  code_challenge: challenge,
  code_challenge_method: 'S256',
  resource: SERVER_URL,
  access_type: 'offline',
}).toString();

const code = await new Promise((resolve, reject) => {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, REDIRECT_URI);
    if (u.pathname !== '/callback') { res.writeHead(404).end(); return; }
    // A stale tab from an earlier run carries an old state; ignore it rather than
    // abort, otherwise one leftover tab kills the login that is actually in progress.
    if (u.searchParams.get('state') !== state) {
      res.writeHead(400).end('Stale login attempt — use the newest tab.');
      return;
    }
    const err = u.searchParams.get('error');
    res.writeHead(200, { 'Content-Type': 'text/plain' })
      .end(err ? `Login failed: ${err}` : 'JIT Access Bot: login complete. You can close this tab.');
    server.close();
    err ? reject(new Error(err)) : resolve(u.searchParams.get('code'));
  });
  server.listen(PORT, () => {
    // JIT_MCP_PRINT_URL lets the consent page be opened in a specific browser profile:
    // the system default browser may be signed in to a different Zoho account, and the
    // token then silently belongs to whoever that is.
    if (process.env.JIT_MCP_PRINT_URL) {
      console.log(`CONSENT_URL ${authUrl.toString()}`);
    } else {
      console.log('Opening the Zoho consent page in your browser…');
      execFile('open', [authUrl.toString()]);
    }
  });
  setTimeout(() => { server.close(); reject(new Error('Timed out after 10 minutes waiting for consent')); }, 600_000);
});

const tokens = await getJson(authMeta.token_endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: client.client_id,
    code_verifier: verifier,
    resource: SERVER_URL,
  }),
});
if (!tokens.access_token) throw new Error(`Token exchange returned no access token: ${JSON.stringify(Object.keys(tokens))}`);

fs.mkdirSync(STORE_DIR, { recursive: true, mode: 0o700 });
fs.writeFileSync(STORE, JSON.stringify({
  server_url: SERVER_URL,
  token_endpoint: authMeta.token_endpoint,
  client_id: client.client_id,
  refresh_token: tokens.refresh_token ?? null,
  access_token: tokens.access_token,
  expires_at: Date.now() + (Number(tokens.expires_in) || 3600) * 1000,
  scope: tokens.scope ?? scope,
}, null, 2), { mode: 0o600 });
console.log(`Saved credentials to ${STORE} (refresh token: ${tokens.refresh_token ? 'yes' : 'NO'}).`);
