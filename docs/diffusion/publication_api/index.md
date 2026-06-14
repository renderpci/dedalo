# Publication API

The Publication API serves the **published** data produced by the Dédalo diffusion process. The
back-end stores all work data in a private PostgreSQL database; the diffusion engine flattens and
publishes a selected subset into one or more read-only MySQL/MariaDB databases, and the Publication
API exposes those databases to websites, integrations and AI agents — without ever touching the
editing back-end.

There are **two versions** of the Publication API. They can run side by side against the same
diffusion-published databases (read-only).

!!! tip "Which version should I use?"
    Use **v2** for every new project and integration. v1 is kept only so that existing public
    websites built against it keep working unchanged.

## v2 — current, recommended

A read-only, resource-oriented REST API built with **Bun + TypeScript**. It is the only version
receiving new features: resource routes (`/{db}/tables/{table}/records/{id}`), a bracketed filter
DSL, RFC 9457 Problem Details errors, `ETag` / `Link` caching, batch queries, per-IP rate limiting,
an OpenAPI 3.1 contract with offline Swagger UI + Scalar, and an MCP endpoint for AI agents.

- [Overview](v2/index.md) — what it is, architecture, runtime.
- [Endpoints](v2/endpoints.md) — the full resource catalog.
- [Querying](v2/querying.md) — the bracketed `filter[field][op]=value` DSL, sorting, pagination.
- [Records and languages](v2/records_and_languages.md) — record shape, `section_id`, multilingual rows.
- [Search and fragments](v2/search_and_fragments.md) — full-text search, text and AV fragments.
- [Batch](v2/batch.md) — running many GET queries in one request (`POST /batch`).
- [MCP](v2/mcp.md) — the Model Context Protocol endpoint and its structured tools.
- [HTTP semantics](v2/http_semantics.md) — status codes, errors, caching, `Link` headers, gzip.
- [Security](v2/security.md) — API keys, rate limiting, DoS bounds, request timeouts.
- [Deployment](v2/deployment.md) — running behind Apache/Nginx or standalone, `.env` configuration.
- [Migration from v1](v2/migration_from_v1.md) — maps every v1 action to its v2 endpoint.

## v1 — legacy

The original PHP Publication API (`…/server_api/v1/json/{action}`). It is **retained in Dédalo v7 for
backward compatibility** with existing published websites that depend on its action-verb URLs, shared
`code` authentication, JSON-stringified responses and `combi` / `resolve_portals_custom` semantics.
It is maintained in **read-only / maintenance mode** — no new features — and is **not recommended for
new integrations**.

- [Publication API (v1)](publication_api.md) — actions, parameters and response formats.
- [Server config (v1)](server_config_api.md) — editing `server_config_api.php`.
- [Public API configuration (v1)](public_api_configuration.md) — renaming and setting up config files.

## v1 vs v2 at a glance

| | v1 (legacy) | v2 (current) |
|---|---|---|
| Language / runtime | PHP (monolithic, `switch`-dispatched actions) | TypeScript on Bun (per-resource services, connection pools) |
| URL style | One action verb + flat query params (`/json/records?table=…`) | Resource-oriented, multi-database (`/{db}/tables/{table}/records/{id}`) |
| Filtering | Raw `sql_filter` strings (`=, >, LIKE, IN, IS NULL…`), `order=name ASC` | Bracketed `filter[field][op]=value` DSL (bound params), `sort=title,-section_id` |
| Responses | Bare arrays/objects, every value JSON-stringified (double-parse) | `{ data, pagination, meta }` (parsed JSON) |
| Errors | Ad-hoc JSON strings + `die()` | RFC 9457 `application/problem+json` with proper status codes |
| Caching / pagination | None natively | Weak `ETag` / `304`, `Cache-Control`, RFC 8288 `Link` rel=next/prev, gzip |
| Auth / security | Single shared `code` | Optional timing-safe `X-API-Key`, per-IP rate limiting, DoS bounds, timeouts |
| Batch | `combi` (`ar_calls`) | `POST /batch` (≤20 parallel GETs, per-query status) |
| Config | PHP `define()`s in `server_config_api.php` | `.env` (`DB_NAMES`, `API_KEYS`, rate limits, timeouts, deployment mode) |
| Docs | This section (`publication_api.md`, `server_config_api.md`, `public_api_configuration.md`) | OpenAPI 3.1 + Swagger UI + Scalar (`/docs`, `/openapi.yaml`) and the `v2/` pages |
| Status | Read-only / maintenance — kept for web compatibility | Actively developed — recommended for all new integrations |
