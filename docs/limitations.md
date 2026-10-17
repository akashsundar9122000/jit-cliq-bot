# Limitations

What the JIT Access Bot does not do, and the platform behaviour behind it. Evidence for each
platform claim is in the [capability matrix](capability-matrix.md).

## Scope

- **Cliq channels only.** WorkDrive files and folders and Writer documents are "coming soon":
  in the test org there are no WorkDrive licences and sharing to people outside a team is
  blocked by policy, so a grant could not be proven. Pasting such a link says so.
- **Zoho Learn** is not supported: it has no documented way to remove a member.
- **India data centre** hosts are built in (`extension/lib/config.dg`).
- **Private channels the bot can act on** are those with at least one admin who has sent
  `connect`. Organisation-wide channels anyone can join need no temporary access.

## Timing

- **Hourly precision.** Cliq schedulers repeat at most daily, so the sweep is 24 schedulers at
  each IST hour. End times are rounded *up* to the next hour and shown that way; access ends at
  that hour's sweep (in tests, within 2 seconds of it).
- **A missed sweep makes removals late, not lost**: the next run handles them and alerts admins.

## Approvals

- **Approvers are the channel's admins**, re-checked live on every click. A request card goes to
  the admins at the time of the request; an admin added later can act from `pending` or the
  widget.
- **One open request per person per channel**, and one extension ask per end time.
- **Retrying a failed grant** is only on the chat card and in `pending` (not the widget): the grant
  step is too large to duplicate into the widget's function.

## Platform behaviour you will notice

- **Consent prompts.** Each person allows "JIT Access Bot" once, the widget "JIT Access" once, and
  some functions again ("Zoho Tasks") the first time they are used — and once more after a deploy
  that adds a new Deluge task.
- **Reminders and failure alerts have no buttons.** A scheduler's card is attributed to that
  scheduler, so its buttons would ask everyone to consent to one of 24 apps. The actions are in
  `my access`, `pending` and the widget instead.
- **The widget does not refresh after an action**; refresh it to see the new state. Its replies
  are short (Cliq refuses over ~100 characters).
- **Button replies in chat are visible only to the person who pressed** ("Only visible to you");
  the lasting record is the DM cards and #jitaudit.

## Limits that are deliberate

- **10 requests per person per 24 hours**, so nobody can fill the org's 1,000-record store.
- **A request's reason is plain text**: Markdown characters and line breaks are removed before an
  approver sees it. Bare URLs stay as text (Cliq may still link them).

## Not yet verified live

- Settling a removal that stopped part-way (its handler died) — the sweep code exists.
- A person who is neither requester nor admin pressing an admin button (needs a third account;
  the server-side check is in place and tested for settings).
- A removal while paused (the removal path has no pause check).
- The minimal scope set for the `jitaccess` connection ([OAuth scopes](oauth-scopes.md)).
