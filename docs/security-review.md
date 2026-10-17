# Security review — 2026-10-17

Scope: everything in `extension/`, `scripts/` and the tracked docs, plus what is deployed in the
sandbox org. Method: an independent static review of the sources, a check of the org for
leftover secrets, then fixes, each re-tested (gate, unit tests, live self-test, and a live or
harness run).

## Confirmed sound

- **Identity comes only from the platform.** The acting person is always Cliq's `user` map; no
  button argument or form field is trusted for who acts.
- **Authority is checked live.** Every decision re-reads the clicker's channel role through the
  Cliq API as that person; settings re-check `user.admin` at submit time. A requester cannot
  decide their own request or extension.
- **Tenant scoping.** Every request and resource query carries `orgid` (gate rule); a foreign or
  missing request gets the same "can't find" reply.
- **Secrets.** No credential in any tracked file or in git history. Tokens, the client secret
  and device codes are never logged, posted to the audit channel or shown to anyone. The device
  sign-in rejects a grant approved from a different Zoho account.
- **Links.** Only `https://cliq.zoho.in` channel links are accepted; `http`, credentials (`@`),
  ports, IPs, lookalike hosts and shorteners are refused, and no pasted URL is ever fetched.
- **Integrity.** State changes only through `lib/transition.dg` (re-read + legal-move check);
  removal only of access the bot created (`createdbybot`); pruning only of finished states.

## Findings and fixes

| # | Severity | Finding | Fix | Re-tested |
|---|---|---|---|---|
| 1 | High | A grant whose final record write failed (e.g. data over Cliq's 1,000-character limit) left the person in the channel with nothing to remove them | Request data capped at 550 characters at submit; the grant checks the final size *before* adding; the sweep settles grants stuck over 10 minutes against the members list (→ ACTIVE, NOT_NEEDED or GRANT_FAILED) | Self-test, sweep run |
| 2 | High | Request/cancel cycles could fill the 1,000-record store; a lock error then looked like "busy" and removals silently stopped | 10 requests per person per 24 h; a lock *error* (not "taken") is reported and, for removals, alerts the channel's admins (`[revoke-blocked]`) | Gate, live request |
| 3 | Medium | Request ids from hidden form fields went into datastore criteria and lock keys unchecked (`)&&(` could choose a lock key) | `R[0-9]{12}` / `cliqch:P[0-9]{6,25}` checked at every entry point; anything else becomes an id that matches nothing | Gate, self-test |
| 4 | Medium | `disconnect` said it worked without checking, and left the grant valid at Zoho | Revokes the refresh token at Zoho (as a form parameter, not in the URL), clears it, reads it back, and only then says so | Harness with a throwaway owner row |
| 5 | Medium | Requester text (reason, notes, answers) could add Markdown lines or links to an approver's card | `lib/clean.dg` strips Markdown characters and line breaks before storing | Self-test (3 cases), live card |
| 6 | Low | Extension decisions did not refuse the requester | Refused | Code review |

## Open items

- **Leftover secrets from the feasibility work** in the org: datastore `jitspikeauth` holds an
  owner refresh token, the OAuth client and a device code; `jitspike` and the `jitspike` bot are
  test leftovers; the `jitworkdrive` connection is unused. **Delete them** (they are not used by
  the product).
- **Rotate the Cliq MCP server URL** (Bots & Tools → Cliq MCP); it grants full API access as the
  person who authorised it. Then rotate the API Console client secret if it was ever shown in a
  terminal during development, and re-run `node scripts/seed-config.mjs --client`.
- **Insider risk:** approvers' refresh tokens (`ZohoCliq.Channels.UPDATE`) are decrypted for any
  Deluge script using the `jitaccess` connection. Only org admins should be able to edit the
  bot's components; review who can.
- **Bare URLs** in a reason are kept as text, and Cliq may still make them clickable.
- Not verified live: settling a stuck grant (requires a handler to die mid-grant), `disconnect`
  against a real grant (verified with a bogus token), the 10-per-day cap's refusal, whether Cliq
  criteria accept `||`.
