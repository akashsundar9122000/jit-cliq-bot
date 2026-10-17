// Each gate rule must fail on the violation it exists for and pass on clean input;
// a rule that never fails is indistinguishable from no rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rules } from '../scripts/gate.mjs';
import { compact, statementCount } from '../scripts/build.mjs';

test('connection: flags a datastore call without the literal connection', () => {
  assert.equal(rules.connection([['a.dg', 'r = zoho.cliq.getRecords("jitrequests", q);']]).length, 1);
  assert.equal(rules.connection([['a.dg', 'r = zoho.cliq.getRecords("jitrequests", q, conn);']]).length, 1);
  assert.equal(rules.connection([['a.dg', 'r = zoho.cliq.getRecords("jitrequests", q, "jitaccess");']]).length, 0);
  assert.equal(rules.connection([['a.dg', '// zoho.cliq.getRecords("x", q);']]).length, 0);
});

test('stateWrites: only lib/transition.dg may set request state', () => {
  assert.equal(rules.stateWrites([['functions/x.dg', 'zoho.cliq.updateRecord("jitrequests", id, {"status":"ACTIVE"}, "jitaccess");']]).length, 1);
  assert.equal(rules.stateWrites([['functions/x.dg', 'v.put("status", "REVOKED_EARLY");']]).length, 1);
  assert.equal(rules.stateWrites([['lib/transition.dg', 'tVals.put("status", "ACTIVE");']]).length, 0);
  assert.equal(rules.stateWrites([['functions/jitform.dg', 'r = {"status":"PENDING_APPROVAL"};']]).length, 0);
  assert.equal(rules.stateWrites([['functions/jitform.dg', 'r = {"status":"ACTIVE"};']]).length, 1);
  // Owner and resource statuses are lower-case words, not request states.
  assert.equal(rules.stateWrites([['lib/token.dg', '{"status":"revoked"}']]).length, 0);
});

test('orgScope: request and resource queries must carry orgid', () => {
  assert.equal(rules.orgScope([['a.dg', 'q.put("criteria", "reqid==" + r);\nf = zoho.cliq.getRecords("jitrequests", q, "jitaccess");']]).length, 1);
  assert.equal(rules.orgScope([['a.dg', 'q.put("criteria", "(orgid==" + o + ")&&(reqid==" + r + ")");\nf = zoho.cliq.getRecords("jitrequests", q, "jitaccess");']]).length, 0);
  assert.equal(rules.orgScope([['a.dg', 'q.put("criteria", "userid==" + u);\nf = zoho.cliq.getRecords("jitowners", q, "jitaccess");']]).length, 0);
});

test('hosts: invokeurl hosts come from config only', () => {
  assert.equal(rules.hosts([['bot/m.dg', 'r = invokeurl\n[\n\turl :"https://evil.example/x"\n];']]).length, 1);
  assert.equal(rules.hosts([['bot/m.dg', 'r = invokeurl\n[\n\turl :cliqApi + "/channels"\n];']]).length, 0);
  assert.equal(rules.hosts([['lib/config.dg', 'r = invokeurl\n[\n\turl :"https://cliq.zoho.in"\n];']]).length, 0);
});

test('schema: letters-only names and per-type limits', () => {
  const ok = { datastores: [{ unique_name: 'jitx', fields: [{ unique_name: 'abc', type: 'limited-text' }] }] };
  assert.deepEqual(rules.schema(ok), []);
  const bad = { datastores: [{ unique_name: 'jitx', fields: [
    { unique_name: 'a_b', type: 'limited-text' }, { unique_name: 'c2', type: 'number' },
    ...['d', 'e', 'f', 'g', 'h', 'i'].map((n) => ({ unique_name: n, type: 'limited-text' })),
  ] }] };
  const problems = rules.schema(bad);
  assert.ok(problems.some((p) => p.includes('a_b')));
  assert.ok(problems.some((p) => p.includes('c2')));
  assert.ok(problems.some((p) => p.includes('7 limited-text')));
});

test('schedulers: a return in a scheduler source is refused', () => {
  const entries = [{ id: 's', source: 'scheduler/sweep.dg', target: { kind: 'scheduler' } }];
  assert.equal(rules.schedulers(entries, { s: 'x = 1;\nreturn x;' }).length, 1);
  assert.equal(rules.schedulers(entries, { s: 'x = 1;\ninfo x;' }).length, 0);
});

test('secrets: catches an MCP URL and a refresh token, ignores clean text', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-'));
  const bad = path.join(dir, 'bad.md');
  const clean = path.join(dir, 'clean.md');
  // Assembled at run time so this file never contains a key-shaped string itself.
  fs.writeFileSync(bad, `url https://x.${'zohomcp'}.in/mcp/${'0'.repeat(32)}/message\n`);
  fs.writeFileSync(clean, 'Use the jitaccess connection.\n');
  assert.equal(rules.secrets([bad]).length, 1);
  assert.equal(rules.secrets([clean]).length, 0);
  fs.rmSync(dir, { recursive: true });
});

test('size: handlers near the platform limit are refused', () => {
  assert.equal(rules.size([{ id: 'a', bytes: 40000 }]).length, 1);
  assert.equal(rules.size([{ id: 'a', bytes: 20000 }]).length, 0);
});

test('build: compact strips comments and indentation but keeps code', () => {
  const out = compact('// c\n\tx = 1; // tail\n\n\tif(a)\n\t{\n\t\ty = "//not a comment";\n\t}');
  assert.equal(out, 'x = 1; // tail\nif(a)\n{\ny = "//not a comment";\n}');
  assert.equal(statementCount(out), 2);
});

test('formPlaceholders: every visible form input needs a placeholder', () => {
  assert.equal(rules.formPlaceholders([['a.dg', 'i = {"type":"text","name":"reason","label":"Reason","mandatory":true};']]).length, 1);
  assert.equal(rules.formPlaceholders([['a.dg', 'i = {"type":"select","name":"d","label":"D","options":{{"label":"2h","value":"2h"}},"value":"2h"};']]).length, 1);
  assert.equal(rules.formPlaceholders([['a.dg', 'i = {"type":"select","name":"d","options":{{"label":"2h","value":"2h"}},"placeholder":"Choose"};']]).length, 0);
  assert.equal(rules.formPlaceholders([['a.dg', 'i = {"type":"textarea","name":"note","placeholder":"e.g. x"};']]).length, 0);
  // Hidden inputs show nothing, and card buttons are not form inputs.
  assert.equal(rules.formPlaceholders([['a.dg', 'i = {"type":"hidden","name":"reqid","value":r};']]).length, 0);
  assert.equal(rules.formPlaceholders([['a.dg', 'b = {"label":"Approve","type":"+"};']]).length, 0);
});

test('sweepHours: a scheduler entry needs 24 distinct scheduler ids', () => {
  const entries = [{ id: 's', target: { kind: 'scheduler' } }];
  const ids = Array.from({ length: 24 }, (_, i) => `id${i}`);
  assert.equal(rules.sweepHours({ deployed: true, entries, schedulers: ids }).length, 0);
  assert.equal(rules.sweepHours({ deployed: true, entries, schedulers: ids.slice(1) }).length, 1);
  // A fresh clone has no deployment yet, so nothing to count.
  assert.equal(rules.sweepHours({ entries, schedulers: [] }).length, 0);
  assert.equal(rules.sweepHours({ deployed: true, entries, schedulers: [...ids.slice(1), 'id0', 'id0'].slice(0, 24) }).length, 0);
  assert.equal(rules.sweepHours({ deployed: true, entries, schedulers: [...ids.slice(0, 23), 'id0'] }).length, 1);
  assert.equal(rules.sweepHours({ entries: [], schedulers: [] }).length, 0);
});

test('buttonLabels: a card button label over 20 characters is refused', () => {
  assert.equal(rules.buttonLabels([['a.dg', 'b = {"label":"Mark for manual review","type":"-","action":{}};']]).length, 1);
  assert.equal(rules.buttonLabels([['a.dg', 'b = {"label":"Manual review","type":"-","action":{}};']]).length, 0);
  // Select options carry labels too, but they are not buttons.
  assert.equal(rules.buttonLabels([['a.dg', 'o = {"label":"Until a date and time I choose","value":"custom"};']]).length, 0);
});

test('schedulers: a button in a scheduler source is refused', () => {
  const entries = [{ id: 's', source: 's.dg', target: { kind: 'scheduler' } }];
  assert.equal(rules.schedulers(entries, { s: 'm = {"text":"x","buttons":{b}};' }).length, 1);
  assert.equal(rules.schedulers(entries, { s: 'm = {"text":"Send me *my access*"};' }).length, 0);
});

test('formErrorLength: a form error over 100 fixed characters is refused', () => {
  const long = 'x'.repeat(101);
  assert.equal(rules.formErrorLength([['a.dg', `return {"type":"form_error","text":"${long}"};`]]).length, 1);
  assert.equal(rules.formErrorLength([['a.dg', 'return {"type":"form_error","text":"Paused by an admin: " + ch + " try later."};']]).length, 0);
  assert.equal(rules.formErrorLength([['a.dg', `return {"type":"form_error","text":"${'y'.repeat(60)}" + n + "${'z'.repeat(50)}","inputs":{}};`]]).length, 1);
});
