# dd_manager

> See also: [JSON API v1](../dedalo_api_v1.md) · [dd_core_api](dd_core_api.md)

Internal manager/router that receives the decoded RQO and dispatches the call to the correct API class and method. Clients do not call it directly — use the JSON entry point instead.

## How it works

- `core/api/v1/json/index.php` decodes the incoming JSON into `$rqo` and passes it to `dd_manager->manage_request($rqo)`.
- `dd_manager` maps `dd_api` + `action` to the final static method call, and handles error wrapping and debug output.

## Notes for integrators

- You normally do not need to call `dd_manager` directly. Use the endpoint and construct a valid RQO.
- When extending or adding a new API class, make sure the manager can discover it and that it follows the same static-method convention: `public static function <action>(object $rqo): object`.

## manage_request

- Purpose: Core dispatcher — validates the request, enforces access controls, and calls the target API class method. Wraps any exceptions and returns a normalized response.
- Accepts: decoded `rqo` object with keys like `dd_api`, `action`, `source`, `options`, `sqo`, `data`, `prevent_lock`.
- Returns: the object returned by the target API method, or on error `{ result: false, msg: string, errors: [...] }`.

### Example Request: manage_request

```json
{
  "dd_api": "dd_core_api",
  "action": "read",
  "source": { "section_tipo": "rsc167", "mode": "edit" },
  "sqo": { "limit": 10 }
}
```

### Example Response: manage_request

```json
{
  "result": { "context": [ { "component": "title", "model": "component_input_text" } ], "data": [ { "id": 2, "title": "Example" } ] },
  "msg": "OK",
  "errors": []
}
```
