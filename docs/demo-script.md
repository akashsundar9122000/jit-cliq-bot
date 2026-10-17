# Demo script (about 3 minutes)

For whoever presents the JIT Access Bot. Two browser windows side by side: **left = the
requester** (e.g. Test 1), **right = a channel admin** (e.g. Akash Test). Spoken lines are in
quotes; actions are in plain text.

## Prepare (10 minutes before)

- [ ] The channel (e.g. `#jitsandbox`) is enrolled and the admin has `connect`ed.
- [ ] The requester is **not** a member of it; nothing is pending (`pending` says so).
- [ ] Both people have opened the bot and the **JIT Access** widget once and accepted every
      consent prompt — run one throwaway request through approve → end, so no prompt appears
      mid-demo.
- [ ] Right window: open `#jitaudit` in a second tab. Settings: Running.
- [ ] Zoom the browser so the cards are readable on screen.

## Script

**0:00 — The problem (15 s)**
"People need short-term access to private channels — an incident, an audit. Today someone adds
them and forgets to remove them. The JIT Access Bot makes that access temporary, approved by the
channel's own admins, and it removes it on time."

**0:15 — Ask (30 s)** · left
Paste the channel link to the JIT Access Bot → **Request access** → *2 hours*, reason
"INC-142: following the on-call thread" → **Send for approval**.
"The end time is fixed up front and rounded up to the hour. I can't approve my own request."

**0:45 — Approve (30 s)** · right
The request card arrives → **Approve**.
"The bot checks I'm an admin of this channel right now — not when the card was sent — then adds
them as me, and only says 'added' once the channel's member list shows them."
Left: the **Access granted** card; the channel appears in the sidebar.

**1:15 — More time, from the widget (35 s)** · left, then right
Left: More apps → **JIT Access** → My access → **Request more time** → *4 more hours*, a reason.
Right: JIT Access → **Approvals** → **Approve extension** → confirm.
"Extensions are a fresh approval. Until someone approves, the original end still stands."

**1:50 — The trail (15 s)** · right, #jitaudit
"Every request, decision, grant and removal is here, with who and when — the record that
outlives the requests themselves, which are pruned after a week."

**2:05 — Emergency pause (25 s)** · right, then left
JIT Access → **Admin** → **Change settings** → *Paused* → Save. Left: paste the link again →
refused. Right: set *Running* again.
"Pause stops anything new being granted. Removals keep running, so nothing outlives its end."

**2:30 — End (20 s)** · left
JIT Access → My access → **End access now** → confirm. The channel leaves the sidebar.
"Normally the hourly sweep does this at the end time, after a reminder. If a removal ever fails,
it retries with growing gaps and alerts the admins — it never assumes success."

**2:50 — Close (10 s)**
"Temporary, approved, verified, and removed on time — all native Cliq, no external server."

## If something goes wrong

| Symptom | Recovery |
|---|---|
| A consent prompt appears | Press *Proceed to allow* and carry on; mention it is Cliq's one-time prompt |
| Widget shows "trouble populating data" | Press its refresh button |
| Widget still shows the old state after an action | Refresh — the widget does not re-render by itself |
| "You already have an open request" | A request is still pending: cancel it from `my access` |
