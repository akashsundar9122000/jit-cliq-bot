# JIT Access Bot — project rules

A native Zoho Cliq extension (Deluge, Cliq datastores, Cliq schedulers) that grants
temporary, owner-approved access and revokes exactly what it granted. Contest rule: pure
native Cliq — no external backend. Plan:
`/Users/akash/.claude/plans/pasted-content-id-a419-build-the-misty-crane.md`.
Live evidence for every platform claim: `docs/capability-matrix.md`.

## Accounts and tenant

- zohotest org `60083388416`, India DC (`cliq.zoho.in`, `www.zohoapis.in`, `accounts.zoho.in`).
- **Akash Test** (`akash.sundartest@zohomail.in`, org admin) owns the MCP login, bot,
  datastores, connections and API Console client. **Test 1** (`akash.sundar@zohotest.com`)
  is the requester; its MCP login is `~/.jit-cliq/mcp.test1.json` (`JIT_MCP_CREDS=…`).
- Secrets live only in `~/.jit-cliq/` (mode 600) and in encrypted datastore fields. Never
  in this repo. The MCP server URL is itself a credential.

## Tooling

- `node scripts/mcp.mjs list|schema|dump|call` — dev MCP client (never used by the bot).
- `node scripts/spike.mjs <file.dg> ['{json}']` — run Deluge as the `jitspike` bot's
  webhook handler and print the execution result or the compile/runtime error.
- Connections are created in the Cliq UI (via the Chrome extension);
  everything else deploys through the MCP.

## Bitten register — each of these cost time; do not relearn them

| Trap | Rule |
|---|---|
| Cliq/WorkDrive calls report failure by *returning* an error map (`{code,message}`), not throwing | A datastore task succeeded only if `status == "SUCCESS"`; every `invokeurl` result is checked before use |
| Datastore tasks without a connection return `oauthtoken_scope_invalid` | Every `zoho.cliq.*Record*` call passes the `jitaccess` connection |
| Datastore field names with `_` or digits fail `input_pattern_mismatch` | Field `unique_name`s are letters only |
| Number fields read back as strings | `.toLong()` before comparing |
| Large-text over 1,000 chars is rejected whole | Keep the JSON blob under 1,000 chars; check the update status |
| Membership add/remove return 204 with an empty body | Prove a grant or revoke by reading the members list back |
| `invokeurl` is a statement, not an expression | Assign its result to a variable |
| A method called on a literal (`{...}.toString()`) and `(a != b) == c` do not parse | Assign the literal first; spell boolean comparisons out with `if` |
| `for each x in a.b().c()` does not parse | Iterate over a variable |
| Compile errors: the `line_number` field is right; the "Error at line :N" text is 2 lines late | Read `line_number` against `dist/<id>.dg` (`node scripts/compile.mjs`) |
| An org admin's connection cannot see or manage a private channel it is not in | Grant/revoke run as a current admin of that channel (the approver's stored token) |
| WorkDrive `owner` id ≠ Cliq user id | Resolve people by email, never by comparing those ids |
| Cliq strips digits from channel unique names | Resolve channel links through the API |
| Connection link names are unique across the org | Pick a fresh name; check the UI error text |
| `create_scheduler_v2` fails with bare `operation_failed` when the name has digits or `_` | Scheduler names letters only (`jitsweepa`..`x`); then set the script with `update_scheduler_handler_v2` |
| Scheduler handlers are `void` | No `return`; record results in a datastore or `info` |
| Execution log lags ~20 s and intermittently says "try again later" | Treat a failed log fetch as "not yet", never as "did not run" |
| A form input without a `placeholder` makes Cliq reject the whole form: bare 1011 `operation.failed`, nothing shown | Every visible input carries a placeholder (gate rule `form placeholders`) |
| Writing a field a datastore does not have fails the whole update (`platform_storage_column_not_exists`) | Write only schema fields; the self-test pushes a real record through `lib/transition.dg` |
| A decision lock kept after its write failed strands the request for ever | Release the lock when the transition fails; keep it only once a decision is recorded |
| Each `@include` is pasted in full, so a handler that inlines decide + grant + revoke passes the ~40 KB limit | One function per heavy path (`jitgrant`, `jitchange`, `jitend`); buttons name the function they call |
| A button label over 20 characters makes Cliq drop the whole message, returned as a value | Labels ≤ 20 (gate rule `button labels`); a failed DM is appended to its audit line |
| `map.get(k).add(x);` as a statement does not parse | Assign the inner value first |
| A card posted by a test harness runs its buttons as the harness's bot | Test button flows on cards sent by the real handler or scheduler |
| A scheduler's card asks every user to consent to that scheduler (one of 24) | No buttons in anything a scheduler sends (gate); `my access` / `pending` carry the actions |
| Two `createRecord`s with the same unique key 2 ms apart both succeed | Locks claim with `zoho.cliq.updateRecords(store, "(lockkey==K)&&(owner==none)", {"owner":nonce})` and read back (`lib/lock.dg`) |
| Widget create API fails; other users see `widget_cache_not_found` | Create the widget in the UI and save its settings once after deploying handlers |
| A widget refuses replies over ~100 characters and chat-style replies to its forms | Widget forms carry `origin=widget`; replies go through `lib/reply.dg` (banner, capped); gate rule `form error length` |
| In a Deluge string one backslash reaches the regex as is; a doubled one matches a literal backslash | Write regexes with single backslashes (`"[\[\]]"`); prove them in the self-test |
| No MCP log for function runs | Hook `executefunction.do` in the browser, or use *Show Logs* in the function editor |
| MCP `send_message_to_bot` is the bot posting *to* the user (same shape as `postToBot`); it never runs the message handler | Drive anything a person types, submits or clicks through the Cliq UI in the browser |

## Working agreement

British spelling. Comments explain why and name the failure they prevent. Phase by
phase with a check-in after each; commit only when asked.
