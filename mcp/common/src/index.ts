/**
	* @dedalo/mcp-common
	* Shared library for both Dédalo MCP servers.
	*
	* What: exports Zod schemas, TypeScript types, HTTP clients, auth
	* helpers, and utility functions used by `dedalo-work-mcp` and
	* `dedalo-public-mcp`.
	*
	* Why: centralising the API contract definitions prevents drift between
	* the two servers.  Any change to Dédalo's RQO/SQO envelope, error
	* codes, or CSRF flow is made once here and inherited by both packages.
	*
	* Modules:
	* - `types`        — Zod schemas and TS types for RQO, SQO, Source, Filter, Locator, Response, PublicationRequest/Options.
	* - `client/work_client`  — Session-aware client with auto-login and CSRF rotation.
	* - `client/public_client` — Stateless client for the read-only Publication API.
	* - `auth/work_auth`       — Session vs token auth discriminated unions.
	* - `auth/public_auth`     — Shared-code validation for publication access.
	* - `utils/sqo_builder`    — Fluent builder for Dédalo search queries.
	* - `utils/errors`         — `DedaloError` exception and error-code mapping.
	* - `utils/redact`         — Recursive sensitive-field stripping.
	* - `utils/rate_limit`     — Token-bucket rate limiter.
	*/
export * from './types/index.js';
export * from './client/work_client.js';
export * from './client/public_client.js';
export * from './auth/work_auth.js';
export * from './auth/public_auth.js';
export * from './utils/sqo_builder.js';
export * from './utils/errors.js';
export * from './utils/redact.js';
export * from './utils/rate_limit.js';