#!/usr/bin/env node
// The project's gate: every check here must pass before a phase is called done.
// Cheap, offline, catastrophic-first. Live Deluge tests are `npm run selftest`; live
// end-to-end checks are listed in docs/e2e.md.
//
//   node scripts/gate.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildAll, loadManifest } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (p) => path.relative(ROOT, p);

// Each rule returns a list of human-readable problems; an empty list is a pass.
export const rules = {
  // A credential in a tracked file is already in history: it must be rotated, not just removed.
  secrets(files) {
    const patterns = [
      [/zohomcp\.in\/mcp\/[0-9a-f]{16,}/, 'Zoho MCP server URL (contains an API key)'],
      [/\b1000\.[0-9a-f]{32}\.[0-9a-f]{32}\b/, 'Zoho OAuth token'],
      [/\b1004\.[A-Z0-9]{20,}\b/, 'Zoho OAuth client id'],
      [/client_secret["':=\s]+[0-9a-f]{30,}/i, 'OAuth client secret'],
      [/Zoho-oauthtoken\s+1000\./, 'Zoho access token'],
    ];
    const out = [];
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8');
      for (const [re, what] of patterns) if (re.test(text)) out.push(`${rel(f)}: looks like a ${what}`);
    }
    return out;
  },

  // Datastore tasks without the connection return oauthtoken_scope_invalid as a *value*,
  // and the connection must be a literal: Deluge resolves it when the script is saved.
  connection(sources) {
    const out = [];
    const call = /zoho\.cliq\.(createRecord|getRecords|getRecordById|updateRecords?|deleteRecord|postToBot|postToChannelAsBot)\(/g;
    for (const [file, src] of sources) {
      for (const line of src.split('\n')) {
        if (line.trim().startsWith('//')) continue;
        if (call.test(line) && !/"jitaccess"\)/.test(line)) out.push(`${file}: datastore/bot call without the "jitaccess" connection: ${line.trim()}`);
        call.lastIndex = 0;
      }
    }
    return out;
  },

  // Request state may only change through lib/transition.dg (legality + re-read). A new
  // request starts as PENDING_APPROVAL, which is the single permitted literal outside it.
  stateWrites(sources) {
    const out = [];
    for (const [file, src] of sources) {
      if (file === 'lib/transition.dg' || file === 'lib/state.dg' || file.startsWith('tests/')) continue;
      for (const line of src.split('\n')) {
        if (line.trim().startsWith('//')) continue;
        const m = line.match(/"status"\s*:\s*"([A-Z_]{4,})"/) || line.match(/\.put\("status",\s*"([A-Z_]{4,})"\)/);
        if (m && !(file === 'functions/jitform.dg' && m[1] === 'PENDING_APPROVAL')) out.push(`${file}: writes request state ${m[1]} outside lib/transition.dg`);
      }
    }
    return out;
  },

  // Tenant isolation: every query on requests or resources is scoped by organisation.
  orgScope(sources) {
    const out = [];
    for (const [file, src] of sources) {
      const criteria = new Map();
      for (const m of src.matchAll(/(\w+)\.put\("criteria",\s*([^;]+)\);/g)) criteria.set(m[1], m[2]);
      for (const m of src.matchAll(/getRecords\("(jitrequests|jitresources)",\s*(\w+)/g)) {
        const expr = criteria.get(m[2]);
        if (!expr || !expr.includes('orgid')) out.push(`${file}: getRecords("${m[1]}", ${m[2]}) without an orgid criterion`);
      }
    }
    return out;
  },

  // Hosts are fixed in one place so a pasted link can never choose where the bot calls.
  hosts(sources) {
    const out = [];
    for (const [file, src] of sources) {
      if (file === 'lib/config.dg' || file.startsWith('tests/')) continue;
      for (const m of src.matchAll(/url\s*:\s*("https?:[^"]*")/g)) out.push(`${file}: invokeurl with a literal host ${m[1]} (use cliqApi/accountsUrl)`);
    }
    return out;
  },

  // Scheduler handlers are void: a `return` fails to compile only at deploy time. And a
  // scheduler's messages are attributed to the scheduler, so a button in one asks every user
  // to consent to that scheduler; shared snippets take a flag (rkButtons) instead.
  schedulers(entries, sourcesById) {
    const out = [];
    for (const e of entries.filter((x) => x.target.kind === 'scheduler')) {
      if (/^\s*return\b/m.test(sourcesById[e.id])) out.push(`${e.source}: scheduler handlers are void; remove return`);
      if (/"buttons"\s*:/.test(sourcesById[e.id])) out.push(`${e.source}: scheduler messages must not carry buttons (they run as the scheduler)`);
    }
    return out;
  },

  // Schedulers repeat at most daily, so the hourly sweep is 24 of them. One missing means an
  // hour whose expiries wait until the next run — late removal that looks like a quiet hour.
  sweepHours(manifest) {
    // Only a deployment (extension/org.json present) has scheduler ids; a fresh clone does not.
    if (!manifest.deployed || !manifest.entries.some((e) => e.target.kind === 'scheduler')) return [];
    const ids = manifest.schedulers ?? [];
    return new Set(ids).size === 24 && ids.length === 24 ? [] : [`manifest.schedulers has ${new Set(ids).size} distinct ids; the hourly sweep needs 24`];
  },

  // Verified platform limits for datastores.
  schema(schema) {
    const out = [];
    const caps = { 'limited-text': 5, number: 5, boolean: 5, 'encrypted-text': 3, 'large-text': 1 };
    for (const ds of schema.datastores) {
      if (!/^[a-z]{1,20}$/.test(ds.unique_name)) out.push(`${ds.unique_name}: datastore name must be lowercase letters`);
      const counts = {};
      for (const f of ds.fields) {
        if (!/^[a-z]{1,20}$/.test(f.unique_name)) out.push(`${ds.unique_name}.${f.unique_name}: field names must be letters only`);
        counts[f.type] = (counts[f.type] ?? 0) + 1;
      }
      for (const [t, n] of Object.entries(counts)) if (n > (caps[t] ?? 0)) out.push(`${ds.unique_name}: ${n} ${t} fields (limit ${caps[t]})`);
      if (ds.fields.length > 19) out.push(`${ds.unique_name}: ${ds.fields.length} fields (limit 19)`);
    }
    return out;
  },

  // Cliq rejects a whole form whose visible inputs lack a placeholder: the button press gets
  // a bare 1011 "operation failed" and the person sees nothing (cost an afternoon, Phase 1).
  formPlaceholders(sources) {
    const out = [];
    const start = /\{"type":"(text|textarea|select|datetime|date|number|email)"/g;
    for (const [file, src] of sources) {
      let m;
      while ((m = start.exec(src))) {
        // Walk to the matching brace so inline option lists do not end the input early.
        let depth = 0, i = m.index;
        for (; i < src.length; i++) {
          if (src[i] === '{') depth++;
          else if (src[i] === '}' && --depth === 0) break;
        }
        const input = src.slice(m.index, i + 1);
        if (/"name":/.test(input) && !/"placeholder":/.test(input)) out.push(`${file}: form input without a placeholder: ${input.slice(0, 80)}`);
      }
    }
    return out;
  },

  // Cliq refuses a whole message (returned as a value, so silently) when a button label is
  // over 20 characters — it cost a lost "removal failed" alert in Phase 3.
  buttonLabels(sources) {
    const out = [];
    for (const [file, src] of sources) {
      for (const m of src.matchAll(/\{"label":"([^"]*)","type":"[+-]"/g)) {
        if (m[1].length > 20) out.push(`${file}: button label "${m[1]}" is ${m[1].length} characters (Cliq's limit is 20)`);
      }
    }
    return out;
  },

  // A widget refuses a reply over ~100 characters with a bare "Something went wrong" (104 and
  // ~140 refused, 79 shown — Phase 4). Banners are capped in lib/reply.dg; form errors are
  // returned directly, so their fixed text must leave room for the names joined into it.
  formErrorLength(sources) {
    const out = [];
    for (const [file, src] of sources) {
      for (const m of src.matchAll(/\{"type":"form_error","text":(.*?)(\}|,"inputs")/g)) {
        const fixed = [...m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1]).join('');
        if (fixed.length > 100) out.push(`${file}: form error text is ${fixed.length} characters before any names are added (widgets refuse ~100+): ${fixed.slice(0, 60)}…`);
      }
    }
    return out;
  },

  // The platform refused a ~49 KB handler; stay well clear.
  size(built) {
    return built.filter((b) => b.bytes > 38000).map((b) => `${b.id}: ${b.bytes} bytes (keep under 38,000)`);
  },
};

function trackedFiles() {
  const list = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' });
  return list.split('\n').filter(Boolean).map((f) => path.join(ROOT, f)).filter((f) => fs.existsSync(f) && fs.statSync(f).isFile() && fs.statSync(f).size < 2_000_000);
}

function sourceFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.dg')) out.push([path.relative(path.join(ROOT, 'extension'), p), fs.readFileSync(p, 'utf8')]);
    }
  };
  walk(path.join(ROOT, 'extension'));
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const manifest = loadManifest();
  const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'extension/schema/datastores.json'), 'utf8'));
  const sources = sourceFiles();
  const sourcesById = Object.fromEntries(manifest.entries.filter((e) => fs.existsSync(path.join(ROOT, 'extension', e.source))).map((e) => [e.id, fs.readFileSync(path.join(ROOT, 'extension', e.source), 'utf8')]));
  let built = [];
  const results = [];
  try {
    built = buildAll(Object.keys(sourcesById));
    results.push(['build', []]);
  } catch (err) {
    results.push(['build', [err.message]]);
  }
  results.push(['secrets', rules.secrets(trackedFiles())]);
  results.push(['connection', rules.connection(sources)]);
  results.push(['state writes', rules.stateWrites(sources)]);
  results.push(['org scope', rules.orgScope(sources)]);
  results.push(['hosts', rules.hosts(sources)]);
  results.push(['schedulers', rules.schedulers(manifest.entries, sourcesById)]);
  results.push(['sweep hours', rules.sweepHours(manifest)]);
  results.push(['schema', rules.schema(schema)]);
  results.push(['form placeholders', rules.formPlaceholders(sources)]);
  results.push(['button labels', rules.buttonLabels(sources)]);
  results.push(['form error length', rules.formErrorLength(sources)]);
  results.push(['size', rules.size(built)]);
  let failed = 0;
  for (const [name, problems] of results) {
    console.log(`${problems.length ? 'FAIL' : 'ok  '}  ${name}`);
    for (const p of problems) console.log(`        ${p}`);
    if (problems.length) failed++;
  }
  console.log(failed ? `\n${failed} check(s) failed.` : '\nGate passed.');
  process.exit(failed ? 1 : 0);
}
