# Capability matrix — live findings

Tenant: zohotest org `60083388416`, India DC. Owner/developer account: **Akash Test**
(`akash.sundartest@zohomail.in`, org admin, id `60082781327`) — the MCP, bot, datastores and
connection all belong to it. Requester test account: **Test 1** (`akash.sundar@zohotest.com`, id `60084023939`). Each row says whether it was **read back
live** (`LIVE`), taken from official docs only (`DOCS`), or not yet known (`OPEN`).
Nothing is marked supported on docs alone.

## Platform

| Capability | Status | Finding |
|---|---|---|
| Build via MCP (bots, handlers, functions, schedulers, datastores, widgets, commands) | LIVE | `ZohoCliq_create_bot` + `create_bot_handler` created and compiled a Deluge bot; see `docs/mcp-tools.md` |
| Run Deluge on demand | LIVE | Fire `ZohoCliq_send_bot_webhook_message` → bot `incoming_webhook_handler`; `scripts/spike.mjs` |
| Read results / errors | LIVE | `ZohoCliq_list_bot_handler_executions` returns `output`, or `line_number` + `error_statement` on failure. ~20 s lag, 10 req/min |
| Handler `user` map | LIVE | `id` = `zoho_user_id`, `email`, `organization_id`, `admin` (bool), `timezone` (`Asia/Kolkata`) |
| `zoho.currenttime` | LIVE | IST wall-clock, second precision |
| Datastore schema | LIVE | Field `unique_name` must be **letters only** — `_` and digits both fail with `input_pattern_mismatch` (undocumented). Unique keys accepted on limited-text |
| Datastore tasks without a connection | LIVE | `zoho.cliq.createRecord/getRecords` from a standalone bot → `{code:"oauthtoken_scope_invalid"}` **returned, not thrown** |
| Connection `jitaccess` | LIVE | Created 2026-10-17 by Akash Test via UI; login-user credentials **off**; scopes `ZohoCliq.Channels.READ/UPDATE`, `StorageData.ALL`, `Users.READ`, `Webhooks.CREATE`. Compiler rejects unknown connection names at save time |
| Connection link names | LIVE | **Unique across the org**, not per user (`jitcliq` was taken by Test 1's earlier connection) |
| MCP identity | LIVE | The MCP acts as whichever Zoho user completed its consent; re-consenting switched it from Test 1 to Akash Test |
| Unique key as a lock | LIVE — **not safe under concurrency** | Sequential 2nd insert → `{status:"FAILURE", code:"platform_storage_unique_key_constraint_violated"}`. But two `zoho.cliq.createRecord` calls 2 ms apart (a double-clicked button, 2026-10-17) **both succeeded**, leaving two rows with the same unique key. (Eight simultaneous REST inserts were correctly refused, so the gap is in the Deluge task path.) |
| Conditional update (compare-and-set) | LIVE | `zoho.cliq.updateRecords("<store>", "<criteria string>", {values}, "jitaccess")` exists (undocumented), returns `{status:"success"}` whether or not anything matched. A conditional update `(lockkey==K)&&(owner==none)` → `owner=<nonce>` had exactly one winner in 6 trials of 6–8 simultaneous racers; the read-back says who. `lib/lock.dg` is built on it. REST `PATCH /api/v3/datastores/{name}/records` needs a scope `jitaccess` lacks (`oauthtoken_scope_invalid`); PUT is `request_method_invalid` |
| Datastore result shape | LIVE | Success `{status:"SUCCESS", object}` / `{status:"SUCCESS", list}`. Errors vary: some carry `status:"FAILURE"`, some only `code`. **Success iff `status=="SUCCESS"`** |
| Number fields | LIVE | Read back as strings (`"n":"5"`) — convert before comparing |
| Criteria | LIVE | `lockkey==value`, `(n>=5)&&(flag==true)` both work |
| Large-text limit | LIVE | 1,000 chars; over-limit update rejected with `input_maxlength_reached`, record unchanged |
| Encrypted-text | LIVE | Reads back as plaintext inside Deluge (masked only in UI/exports) |
| Connection `jitworkdrive` | LIVE | Created by Akash Test; login-user off; `WorkDrive.files.READ/CREATE/DELETE`, `files.sharing.CREATE/READ/UPDATE/DELETE`, `team.READ`, `teamfolders.READ/CREATE`, `users.READ`, `members.READ`. Spike-only — production grants run as the owner |
| WorkDrive scope names | LIVE | `WorkDrive.files.sharing.*` exist in the connection scope list (resolves the doc contradiction) |
| Schedulers | DOCS+LIVE | daily/weekly/monthly/yearly only; per-scheduler IANA timezone and `HH:mm`. **`ZohoCliq_create_scheduler_v2` works when the name is letters only** (2026-10-17: `jitsweepa`..`jitsweepx` created this way; Phase 0's bare `operation_failed` came from names with digits/underscores) (time on/off 15-min boundary, `ends_on` never/after, other names); creating in the UI works and `update_scheduler_handler_v2` then sets the script. Scheduler handlers are `void` (`return` is a compile error). The editor has *Save & Execute* for an immediate run |
| Owner OAuth (device flow) | LIVE | API Console client type *Non-browser Applications* (`JIT Access Bot`, Akash Test). From Deluge: `POST https://accounts.zoho.in/oauth/v3/device/code` (`client_id`, `scope`, `grant_type=device_request`, `access_type=offline`) → `user_code`, `device_code`, `verification_uri_complete`, `expires_in` 300000 ms, `interval` 5000 ms. Owner approves at accounts.zoho.in; `POST /oauth/v3/device/token` (`grant_type=device_token`, `code`) → `access_token` + `refresh_token`. A probe with that token reads `current_user_role: super_admin` on the owner's channel. Refresh token stored in an encrypted datastore field. No redirect URL or public callback needed |
| Connections | DOCS | UI only (no MCP tool); run as creator, or as the login user when that toggle is on |
| Scheduler acting via a stored owner token | LIVE | Scheduler `jitspikesched` fired on schedule at 14:00:01 IST (505 ms); refreshed the stored refresh token, added Test 1 to `jitsandbox` (204, read back as `member`), removed (204); an independent MCP read afterwards shows only Akash Test. Channel calls used **no connection** — only the token. Caveat: scheduler creator and token owner were the same user; the cross-identity check (Test 1's token on Test 1's channel) is scheduled for the Phase 2 end-to-end run |
| Scheduler `user` | LIVE | The scheduler's creator (`akash.sundartest@zohomail.in`) |
| Button function for a non-owner | LIVE | Test 1 pressing a bot-message button runs `jitaction` as Test 1 (`user.id` = `60084023939`) after a one-time function consent; `zoho.cliq.getRecords(..., "jitaccess")` returns `SUCCESS` in that context (2026-10-17) |
| Button function returning a message | LIVE | `executefunction.do` → 200; the returned map shows to the clicker only ("Only visible to you") |
| Form from a button function | LIVE | Works for the owner and for Test 1 (2026-10-17), **provided every visible input has a `placeholder`**. One input without one (`text`, `textarea`, `select`, `datetime` all checked) and `executefunction.do` returns 500 `{ERRCODE:1011, I18N.KEY:"operation.failed"}` with nothing shown — found by bisecting 17 probes. `version`, the form `name`, inline `{{...}}` vs `list()` inputs, and MCP- vs UI-created form functions all made no difference. Gate rule `form placeholders` enforces it |
| Form from a bot message handler | LIVE — not shown | The returned form (which then lacked placeholders) displayed nothing; not retried since the cause was found. The bot opens forms from a **Request access** button instead |
| Function consent | LIVE | Each person sees a one-time "Allow JIT Access Bot" consent (Account details, Deluge tasks, External APIs; 60 days) for the bot and again for each function; the first `jitaction` consent for Test 1 returned "technical error" yet was recorded |
| Function execution logs | LIVE | No MCP tool for function executions; the function editor in the Cliq UI has *Show Logs*. In the browser, `executefunction.do`'s response carries the function output or the error code |
| Datastore unknown field | LIVE | An update with one key the store does not have fails whole with `platform_storage_column_not_exists`; covered by the live self-test's transition case |
| Cross-identity removal | LIVE | Test 1 (no token) ended its own access; the removal ran with the granting admin's stored token and was confirmed by members read-back (2026-10-17). Closes the Phase 0 caveat on the scheduler row |
| Archived channel | LIVE | `GET /channels/{id}` and the admin role check still succeed; `POST …/members` returns **400**. Unarchive restores adds |
| Handler size | LIVE | A 29 KB build saved as 33 KB (the platform re-formats); split work across functions rather than inline the same snippets twice |
| Button label length | LIVE | Over **20 characters** and `postToBot` returns `{code:"input_maxlength_reached"}` — the whole message is dropped, as a value, not an error. Gate rule `button labels` |
| Message attribution | LIVE | A card posted from a bot's handler (e.g. the `jitspike` test harness) is attributed to *that* bot even when sent with `postToBot("jitaccessbot", …)`: its buttons then ask consent for, and run as, the posting bot |
| Scheduler message attribution | LIVE | A card posted by a scheduler is attributed to *that scheduler* (form footer "jitsweeps"); its buttons work but ask each user to consent to the scheduler as an app — one of 24. Scheduler messages therefore carry no buttons; `my access` and `pending` (answered by the bot) carry the actions |
| Consent after a deploy | LIVE | Adding a task a function never used before (`updateRecords`) re-prompts every user once ("Zoho Tasks") |
| Widgets | LIVE | `create_widget_v2` and `list_widgets_v2` fail with `operation_failed` in this org; created in the UI. Handlers (`dynamic_tabs_handler`, `dynamic_view_handler`) deploy through `update_widget_handler_v2`. **Other users get `widget_cache_not_found` until the widget's own settings are saved once in the UI**; after a consent change the cache is briefly missing again (a refresh fixes it) |
| Widget buttons | LIVE | Call a `widget_button` function with `target.id`; it may return a banner or a plain `{"type":"form"}` (an applet-wrapped form fails with `operation_failed`). The form submits to any form function; its reply must be a banner — a chat message replaces the view with an error page |
| Widget reply length | LIVE | Banners / form errors over ~100 characters are refused with "Something went wrong" (104 and ~140 refused; 26, 54, 79 shown) |
| Widget consent | LIVE | "JIT Access" is its own app: each person consents once to the widget and again per function used from it ("Zoho Tasks"), separately from the bot's consents |
| Creating an extension | LIVE — not available | My Extensions shows only an empty "sandbox" page with no Create Extension anywhere (2026-10-17); likely the org's plan. The MCP can manage an extension's handlers but not create one. Docs also cap an extension at "4 … schedulers" (ambiguous), against the sweep's 24. Other orgs install through `scripts/install.mjs` instead |
| Datastore `<=` criteria | LIVE | `(nextactionat<=N)` works (live self-test case) |

## Resources

| Resource | Resolve | Owner/approver | Current access | Grant | Provider id | Revoke | Native expiry | Status |
|---|---|---|---|---|---|---|---|---|
| Cliq channel | LIVE `GET https://cliq.zoho.in/api/v2/channels/{channel_id}` (`creator_id`, `level`, `participant_count`) | LIVE members `user_role` ∈ `super_admin`, `member` seen (admins: `admin`, to confirm) | LIVE `GET …/members` → `members[].user_id/email_id/user_role` | LIVE `POST …/members` `{"user_ids":[uid]}` → 204, empty body | user id | LIVE `DELETE …/members/{uid}` → 204, empty body | none | **Verified** (sandbox `jitsandbox`, owner Akash Test adding requester Test 1, 2026-10-17): add and remove each confirmed only by members read-back |
| WorkDrive file/folder | LIVE `GET https://www.zohoapis.in/workdrive/api/v1/files/{id}` → `type` (`folder`/`writer`/…), `is_folder`, `capabilities.can_share/can_remove_share`, `permalink` | LIVE `creator` = Zoho/Cliq user id; **`owner` is a different id** (`60083082682` vs `60082781327`) — never compare it to a Cliq id | DOCS `GET /files/{id}/permissions` | DOCS `POST /permissions` | DOCS `data[].id` | DOCS `DELETE /permissions/{id}` | DOCS `expiration_date` (tz unknown) | OPEN |
| Writer | LIVE: a Writer doc *is* a WorkDrive file — `POST /files` with `service_type:"zw"` returns a WorkDrive id; permalink `https://writer.zoho.in/writer/open/<id>` | via WorkDrive | via WorkDrive | LIVE: share on a never-opened new doc → `R012` (resource not active) | — | — | — | OPEN |
| Learn | — | — | — | DOCS add only | — | none documented | — | **Unsupported** |

## Rules this has already produced

- Every `zoho.cliq.*` task and `invokeurl` response is checked before use; a datastore
  task succeeded only if `status == "SUCCESS"`. A returned error map is a failure, never a result.
- Every datastore task passes the `jitaccess` connection.
- Numbers read from a datastore are converted with `.toLong()` before comparison.
- `invokeurl` is a statement, not an expression: assign it before use. Membership writes return
  204 with an empty body, so success is proven by reading the members list back.

## WorkDrive findings (2026-10-17)

- Team `akashdotsundart0zohotestdotcom` (`a68br548f44d053aa43f690d496174dd10943`) has **one member: Akash
  Test**. Cliq org membership does not imply WorkDrive team membership.
- Sharing to a Cliq user outside the WorkDrive team → `R952 "User doesn't provide permission for sharing
  to outside org user"` (HTTP 500); read-back confirms nothing was granted. The adapter must check
  the requester is an ACTIVE WorkDrive team user (`GET /teams/{id}/users`) before offering WorkDrive.
- Sharing a freshly created, never-opened Writer doc → `R012 "Resource is not in active status"`.
- Errors come back as HTTP 500 with `{"errors":[{"id","title"}]}`.
- Test resources (owner Akash Test): folder `kdgm3563f32f9c21b47039422df6d4802ec65` (`jit-spike-folder`),
  Writer doc `kdgm34b57d1611e4b4261ab47bcf9d22525a7`, team folder `kdgm329938a41ed624532b88f50fda3e8e4be`
  (`jit-spike-team`) with Writer doc `kdgm305c7c4ba7ba64cc3ba5508593d97f250`.
- Link formats seen: `https://workdrive.zoho.in/folder/<id>`, `https://writer.zoho.in/writer/open/<id>`.

## Decision: WorkDrive deferred (Akash, 2026-10-17)

The WorkDrive team is on the Free Essentials plan with **0 remaining licences**, so no second
internal user can be added, and sharing to non-members is blocked by policy (`R952`). Live
grant/revoke for WorkDrive cannot be verified. The MVP ships with **Cliq channels** fully live.
The WorkDrive adapter is built and unit-tested against the recorded API shapes but stays
`support_status = manual_only` (the bot explains the requester must be a WorkDrive team member)
until a seat exists and the share → expiry read-back → PATCH → DELETE cycle passes live.

## Channel identity finding (2026-10-17)

An **org admin's connection cannot read or manage a private channel it is not in**: against
Test 1's private channel `jitsandboxt` (`P1207169000000136006`), `jitaccess` (Akash Test, org admin)
got `operation_not_allowed` on GET channel and GET members, `400 operation_failed` on add, and
`operation_not_allowed` on remove. Test 1's own read-back confirmed no member was added.

Consequence: a single developer/operator connection only works for channels that account belongs
to as admin. For arbitrary channels, grant and revoke must run as a **current admin of that
channel** — the approver. Grant can use the approver at click time; revocation at expiry runs in a
scheduler (whose identity is its creator), so it needs the approver's stored refresh token.
This makes the owner-token spike the deciding item for channels too.

Also: Cliq strips digits from a channel's unique name (`jitsandboxt1` → `jitsandboxt`), so links
must be resolved through the API, never by assuming the unique name equals the display name.

## Phase 0 conclusion (2026-10-17)

- **Cliq channels: supported.** Resolve, current-access lookup, grant and exact revoke all verified
  with read-back. Grant and revoke run as the approving channel admin using that admin's own
  OAuth grant (device flow), stored encrypted; schedulers can use it.
- **WorkDrive (and Writer via WorkDrive): manual-only** until a WorkDrive seat exists (see above).
- **Learn: unsupported.**
- Expiry precision: hourly sweep from 24 daily schedulers created in the UI (API creation fails).
