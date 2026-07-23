# dd_error_report_api

> See also: [JSON API v1](../dedalo_api_v1.md) · [dispatch](dispatch.md)

The master installation's error-report intake: remote installations' servers relay admin-submitted error reports here machine-to-machine. It is a TS-native surface with no twin in the previous engine (WC-017), and its **one pre-auth action** is `receive_report`.

The registry entry is `src/core/api/dispatch.ts` → `errorReportApiActions` (`src/core/api/handlers/dd_error_report_api.ts`). Reachability is gated **before** the handler by the dispatcher's Gate 1c: the request is refused unless the receiver is explicitly enabled (`DEDALO_ERROR_REPORT_RECEIVER`) **and** the caller IP is on the allowlist. There is no session and no CSRF token — it is machine-to-machine intake, not a browser action.

## How to call

- POST JSON with `dd_api: "dd_error_report_api"` and `action: "receive_report"`. The report payload rides in `options`.

## Common fields

- `options` carries the self-reported report body against a strict shared schema (`src/core/error_report/schema.ts`) — `entity`, `dedalo_version`, `user_id`, `section_tipo`, `section_id`, `page_url`, `description`, `js_errors`, and context fields (`langs`, `user_agent`, `screenshot`, …). **Unknown fields are rejected.**

!!! note "The intake discipline runs in a fixed order"
    The handler owns, in order: (1) a per-trusted-hop-IP sliding-window throttle — **every** request spends budget, so junk floods and token-guessing loops rate-limit alike; (2) an optional constant-time shared-token check — a wrong/missing token answers the **exact** unregistered-action shape, no existence leak; (3) a total-size clamp (the 256 MiB global body cap is useless here); (4) the strict shared schema (unknown fields rejected); (5) append to the store, stamping `source_ip` from the trusted hop. It **never** fetches or resolves any URL-shaped field (no SSRF), never logs report text (log-injection), and never echoes internals in error envelopes.

## receive_report

- **Purpose:** Accept and store one error report relayed from a remote installation.
- **Accepts:** the report body in `options`, matching the strict wire schema; the shared token (when configured) travels out-of-band, checked constant-time.
- **Returns:** the `{result, msg, errors}` envelope:
- `result`: `true` on a stored report, `false` on any refusal.
- `msg`: `"OK"` on success; a terse generic string otherwise — never the payload or field-level detail.
- `errors`: array — empty on success; `report_id` accompanies a stored report.

### Example Request: receive_report

```json
{
  "dd_api": "dd_error_report_api",
  "action": "receive_report",
  "options": {
    "entity": "Example Archive",
    "dedalo_version": "7.0.0",
    "user_id": 42,
    "section_tipo": "oh1",
    "section_id": 3,
    "page_url": "https://example.org/…",
    "description": "Save button did nothing",
    "js_errors": []
  }
}
```

### Example Response: receive_report

```json
{
  "result": true,
  "msg": "OK",
  "errors": [],
  "report_id": 128
}
```

## Notes

- Refusals are deliberately indistinguishable: a disabled receiver, a wrong token, and an unregistered action all answer `{result:false, msg:"Undefined or unauthorized method (action)"}`. An oversize or schema-invalid body answers `{result:false, msg:"Invalid error report"}`; a throttled caller gets HTTP 429.
- Only `source_ip` (the trusted-hop address) and `received_at` are master-trusted; every other field is stored as **self-reported** context.
