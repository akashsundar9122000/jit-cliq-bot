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
- Connections and schedulers are created in the Cliq UI (via the Chrome extension);
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
| `invokeurl` is a statement, not an expression; nested map literals inside it do not parse | Assign the result; build bodies in variables first |
| An org admin's connection cannot see or manage a private channel it is not in | Grant/revoke run as a current admin of that channel (the approver's stored token) |
| WorkDrive `owner` id ≠ Cliq user id | Resolve people by email, never by comparing those ids |
| Cliq strips digits from channel unique names | Resolve channel links through the API |
| Connection link names are unique across the org | Pick a fresh name; check the UI error text |
| `create_scheduler_v2` fails with bare `operation_failed` | Create schedulers in the UI, then set the script with `update_scheduler_handler_v2` |
| Scheduler handlers are `void` | No `return`; record results in a datastore or `info` |
| Execution log lags ~20 s and intermittently says "try again later" | Treat a failed log fetch as "not yet", never as "did not run" |

## Working agreement

British spelling. Comments explain why and name the failure they prevent. Phase by
phase with a check-in after each; commit only when asked.
