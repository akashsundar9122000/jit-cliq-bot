# Live end-to-end checks

Run in the sandbox org (`60083388416`) with two people: **Akash Test** (channel admin,
approver) in one browser and **Test 1** (requester) in another. Everything a person types,
submits or presses is driven through the Cliq UI. A case passes only when its effect is read
back from storage or from the provider (datastore records via the MCP, channel members via the
MCP, audit channel messages via the MCP), never from the bot's reply alone.

Before a run: `node scripts/gate.mjs`, `node --test tests/*.test.mjs`, `npm run selftest`,
`node scripts/deploy.mjs`.

## Phase 1 — request and approval loop (2026-10-17, all on #jitsandbox / #jitsandboxb)

| # | Case | Result | Read back |
|---|---|---|---|
| 1 | Welcome on first open | PASS | "Hi Test!" card after subscribing |
| 2 | `help`, `pending` with nothing waiting | PASS | Replies in chat |
| 3 | Link allowlist: `http://`, lookalike host, `user@`, port, IP, shortener | PASS | Each refused; no request record |
| 4 | Admin pastes own channel → "already a member" | PASS | Members read live with the enroller's token |
| 5 | Enrol a channel (`enrol <link>`) | PASS | `jitresources` row; `[enrol]` audit |
| 6 | Request via link and via `#channel`; form opens from **Request access** | PASS | `jitrequests` `PENDING_APPROVAL`; `open:` lock; expiry rounded up to the IST hour (16:06 + 4 h → 21:00; 16:20 + 1 d → 17:00 next day) |
| 7 | Approval card to the channel's admins only | PASS | Card in the approver's bot chat with Approve / Change & approve / Ask for details / Reject; `[request]` audit |
| 8 | Second request for the same channel while one is open | PASS | Form refused; still one record |
| 9 | Ask for details → requester answers | PASS | Question card to requester, answer card (with decision buttons) to approvers; `[asked]`/`[answered]` audit; state stays `PENDING_APPROVAL` |
| 10 | Approve by **double-click** | PASS | One `APPROVED_PENDING_GRANT`, one `[approved]` audit; second click told "decided a moment ago" |
| 11 | Approve on an already-decided card | PASS | "already approved. Nothing changed."; record unchanged |
| 12 | Requester told of approval | PASS | "Request approved" card in Test 1's chat |
| 13 | Reject with a reason | PASS | `REJECTED`, `note` stored, `open:` lock released, requester sees the reason; `[rejected]` audit |
| 14 | Requester cancels | PASS | `CANCELLED`, `open:` lock released, approvers told "No action needed"; `[cancelled]` audit |
| 15 | Cancel on an already-rejected request; Approve on a cancelled one | PASS | Both refused; records unchanged |
| 16 | Change & approve (1 day → 2 hours, with a note) | PASS | `expiresat` 19:00, `note` stored; requester and audit both show the old and new end |
| 17 | `my access` | PASS | Four requests, newest first; end time shown only on live ones |
| 18 | No grant in Phase 1 | PASS | Both channels' members read back: Akash Test only |

### Not yet covered live

- **Non-admin presses Approve.** Needs a third account that is neither the requester nor a
  channel admin; only two are signed in. The server-side check (`lib/decide.dg`, live
  `current_user_role` read) is in place but unexercised.
- **Requester decides own request.** The card goes only to admins, so this needs a forwarded
  card or a requester who is also an admin.
- Phone width and dark theme: the cards and forms are Cliq's own rendering; not checked.

### Found and fixed during the run

- Forms were silently refused — every visible input needs a `placeholder` (gate rule added).
- Forms returned from the bot's message handler were not shown; the form now opens from a
  **Request access** button.
- Approve failed with `platform_storage_column_not_exists` (`lib/transition.dg` wrote
  `updatedat`, which `jitrequests` lacks) and the failed attempt kept its decision lock, so the
  request could never be decided. Both fixed; the self-test now writes a real record through
  `lib/transition.dg` and was shown to fail on the old code.

## Phase 2 — grant and revoke, Cliq channels (2026-10-17)

WorkDrive and Writer stay manual-only (Phase 0), so the channel adapter is the only one.
Membership was read back from Cliq through the MCP after every add and remove.

| # | Case | Result | Read back |
|---|---|---|---|
| 1 | `pending` lists approved-but-not-added requests with **Retry** (the two Phase 1 leftovers) | PASS | Both listed; Retry granted each |
| 2 | Retry grants as the clicking admin | PASS | Test 1 `member`; `ACTIVE`, `createdbybot`, `grantedby`, `nextactionat` = expiry; `[granted] … (read back: member)` |
| 3 | Requester presses **End access now** (removal runs as the granting admin's token) | PASS | Not a member; `REVOKED_EARLY`; `open:` lock released; approvers told; `[revoked-early] … (read back: not a member)` |
| 4 | Admin presses **End access now** on its own lasting card | PASS | As above, ended by the admin |
| 5 | **Approve** decides and grants in one click; double-clicked | PASS | One `decide:` and one `grant:` lock, one `[granted]`; second click "already approved" |
| 6 | **Change & approve** (`jitchange`) grants with the new end | PASS | `expiresat` Sun 01:00 (16:43 + 8 h); member |
| 7 | **End access now** double-clicked | PASS | One `revoke:` lock, one `[revoked-early]`; second click "already removing" |
| 8 | Already a member when approved (added by hand first) | PASS | `NOT_NEEDED`, `createdbybot` false, still a member afterwards; `[not-needed]`; `open:` lock released |
| 9 | Grant fails for real (channel archived between request and approval) | PASS | `GRANT_FAILED`, `attempts` 1, `lasterror` `not_added:400`; Retry/Close card to approvers; requester told |
| 10 | Retry while still failing, then after unarchiving | PASS | `attempts` 2 with a fresh `grant:…:1` lock, `grantposted` cleared; then `ACTIVE`, member |
| 11 | **Close request** on a failed grant | PASS | `CANCELLED`; `open:` lock released; requester told; `[closed]` |
| 12 | Stale buttons: Retry on an ended request, Close on an active one | PASS | Both refused; records unchanged |
| 13 | Requester pastes a channel they hold temporary access to | PASS | "You already have temporary access … until …" |

Ended state: no `open:` locks, both channels back to Akash Test only.

### Not yet covered live

- **Revocation failure** (`REVOCATION_FAILED`, back-off, admin alert): the code is in
  `lib/revoke.dg` but no real removal failure was produced. Phase 3 retries it.
- **Expiry**: nothing removes access at `expiresat` until Phase 3's sweep exists.
- A non-admin pressing Retry / Close / End: still needs a third account.
- The final wording of the retry click response and the channel name on `pending`'s Retry
  buttons were deployed after the run, not re-run.

### Found and fixed during the run

- The approving admin had no lasting **End access now** card (the click response vanishes);
  every approver now gets one.
- `grantposted` stayed true after a read-back proved the add did nothing, so a later Retry could
  have claimed (and at expiry removed) access gained another way; it is now cleared then.

## Phase 3 — hourly sweeps (2026-10-17)

24 daily schedulers `jitsweepa`..`jitsweepx` (00:00–23:00 IST), all holding `schedulers/sweep.dg`
(read back one by one). "Real" = fired by the scheduler at its hour, nothing simulated.
"Harness" = the same built sweep run on demand as Akash Test, with the test record's
`expiresat` / `nextactionat` (or the heartbeat) moved into the past via the MCP.

| # | Case | How | Result | Read back |
|---|---|---|---|---|
| 1 | Reminder at the computed time (2 h grant → 18:00) | Real 18:00 | PASS | DM to requester; `remind:…:1` lock; `nextactionat` → expiry; `[reminder]` |
| 2 | Removal at expiry | Real 20:00 | PASS | 20:00:01 `EXPIRED_REVOKED`; members: admin only; `open:` lock released; `[expired] … (read back: not a member)` |
| 3 | Quiet hours write a heartbeat and no alert | Real 19:00, 20:00 | PASS | Runs logged (342 / 720 ms); no `[heartbeat]` entry |
| 4 | Missed hour alerts org admins | Harness (heartbeat −3 h) | PASS | Admin DM "did not run for about 3 hours"; `[heartbeat]`; heartbeat rewritten |
| 5 | Member removed by hand is noticed | Harness | PASS | `REVOKED_EARLY` "removed from the channel outside the bot"; lock released |
| 6 | Removal fails for real (channel archived) and backs off | Harness + real 18:00 | PASS | `REVOCATION_FAILED`, `still_member:400`; next try +15 min, +30, +60, +120; immediate re-run does nothing |
| 7 | Retry removal from `pending` | UI | PASS | `EXPIRED_REVOKED`, read back not a member |
| 8 | Manual review → sweep ignores it → Resolve refused while a member → Resolve | UI + harness | PASS | `MANUAL_REVIEW`; sweep work 0; refusal text; `CLOSED_MANUAL`, one `[resolved]` (double-clicked) |
| 9 | Request more time → rejected | UI (`my access`) | PASS | `EXTENSION_PENDING` → `ACTIVE`, end unchanged, proposal cleared |
| 10 | Request more time → approved (double-clicked) | UI | PASS* | End 23:00 → 03:00, `expiryversion` 2, reminder reset. *Exposed the lock race below: two `[extended]` lines |
| 11 | Reminder / failure cards from a scheduler carry no buttons | Real 18:00 + harness | PASS (after fix) | Text points to `my access` / `pending`, which carry the buttons |

### Found and fixed during the run

- **Locks were not single-use under real concurrency.** Two `createRecord` calls 2 ms apart both
  inserted the same unique `lockkey`. `lib/lock.dg` now inserts, then claims with a conditional
  `updateRecords` (`owner==none` → nonce) and reads back; 46 simultaneous racers over 6 trials
  always produced exactly one winner. This also hardens every Phase 1–2 lock (decide, grant, revoke).
- **Scheduler cards are attributed to the scheduler**, so their buttons asked for consent to
  "jitsweeps". Scheduler messages are now button-free (gate rule).
- **Button labels over 20 characters** made Cliq drop the whole message silently (a lost
  "removal failed" alert). Gate rule added; a failed DM is now appended to its audit line.
- `Mark resolved` could close a review while the person was still in the channel; it now
  refuses until the members list shows them gone.

### Not yet covered live

- **A removal that stopped part-way** (`REVOCATION_IN_PROGRESS` older than 10 minutes, settled
  against the members list): producing one needs hand-editing a record's status.
- The Deluge-path concurrency of the new lock under a true simultaneous double-click: the second
  click of the Resolve double-click left no trace, so it may not have overlapped.
- `my access` button labels truncate both sandbox names to "#jitsand…", so two live grants in
  similarly named channels are hard to tell apart.

## Phase 4 — JIT Access widget, settings, pause, pruning (2026-10-17)

The widget "JIT Access" (More apps) has tabs My access / Approvals / Admin. Its buttons open
forms that submit to the functions already owning each action (`jitchange`, `jitform`,
`jitactive`, `jitconfirm`), so every decision is re-checked from live data on submit.

| # | Case | Result | Read back |
|---|---|---|---|
| 1 | Tabs per person: Admin only for an org admin | PASS | Akash Test: 3 tabs; Test 1: My access + Approvals |
| 2 | Admin tab: state, limits, retention, alert count, last sweep, live counts | PASS | Matched the config rows and request states |
| 3 | Approve from the widget ("As requested") | PASS | `ACTIVE`, member read back; `[approved]` + `[granted]` |
| 4 | Request more time from the widget → approved from the widget | PASS | End 01:00 → 05:00; `[extension-requested]`, `[extended]` |
| 5 | End access from the widget (requester) | PASS | `REVOKED_EARLY`, not a member; lock released |
| 6 | Cancel from the widget | PASS | `CANCELLED`; banner reply shown |
| 7 | Reject from the widget | PASS | `REJECTED`; `[rejected]` |
| 8 | Pause from settings | PASS | `paused=true` stored; `[settings]` audit; alert DM to recipients |
| 9 | While paused: new request, widget Approve, card Approve | PASS | All refused; request stayed `PENDING_APPROVAL`, nobody added |
| 10 | Resume + retention 0 → sweep prunes finished requests and their locks | PASS | 16 requests and 53 lock rows deleted; `[pruned] 16 …`; retention set back to 7 |
| 11 | Non-admin opens or submits settings | PASS (harness) | Both refused; config unchanged |
| 12 | Real sweep after the changes | PASS | 21:00 run, no alerts |

### Not yet covered live

- A removal *while paused* (the removal code has no pause check, but no grant was active).
- Retention was restored to 7 through the MCP, not the settings form: the browser extension
  disconnected mid-run. The row's `updatedby` says so; there is no `[settings]` audit line for it.
- Widgets do not refresh after a form; the view shows the old state until the person refreshes.

### Found and fixed during the run

- Widget replies over ~100 characters are refused ("Something went wrong"): banners are capped in
  `lib/reply.dg`, and a gate rule bounds form-error text.
- A form opened from the widget must answer with a banner, not a chat message (the latter
  replaced the view with an error page); forms carry `origin=widget` and replies go through
  `lib/reply.dg`.
- `jitactive` would have been 42 KB with the confirmation logic inlined: it moved to
  `jitconfirm`, one shared copy (`lib/liveact.dg`) with the `jitend` card buttons.

## Phase 5 — security fixes, smoke test (2026-10-17)

| Case | How | Result |
|---|---|---|
| WorkDrive link → "coming soon" | Live | PASS |
| Reason with `*Until:*`, a Markdown link and backticks → approver card shows plain text | Live | PASS |
| `disconnect`: revoke at Zoho, clear, read back | Harness, throwaway owner row with a bogus token (Zoho 400, cleared, reply says so) | PASS |
| `lib/clean.dg` cases; reminder, lock, transition cases | Live self-test | 50/50 |
| New sweep (stuck-grant settling, lock errors) on all 24 schedulers | Read back + on-demand run | PASS |

A request `R417768660405` on #jitsandbox ("Test test") was made outside this session and was left
untouched.
