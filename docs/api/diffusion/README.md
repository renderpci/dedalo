# Diffusion API (Bun engine)

> See also: [PHP Diffusion API](../diffusion_api_documentation.md) · [Diffusion engine internals](../../diffusion/engine_internals.md) · [Search Query Object (SQO)](../../core/sqo.md)

This is the technical documentation for the Bun-based Dédalo Diffusion engine. The system resolves complex data structures from the matrix and prepares them for external distribution (diffusion).

## Documentation index

- **[Architecture](architecture.md)** — the hybrid Bun/PHP model, showing the flow from the browser through the middleware to the resolution engine.
- **[API endpoints](endpoints.md)** — specifications for the Bun API endpoints, including the `diffuse` streaming action and the `get_process_status` reconnection handler.
- **[Data model](data_model.md)** — the record mapping, table structures, and the parser pipeline that prepares data for MariaDB.

## Related resources

- **[PHP Diffusion API](../diffusion_api_documentation.md)** — the PHP resolution engine, RQO format, and SQO structure.
- **[Publication API](../../diffusion/publication_api/index.md)** — the read-only public API that serves the diffusion-published databases to websites, integrations and AI agents. Use [v2](../../diffusion/publication_api/v2/index.md) (Bun/TypeScript) for new integrations.
- **[Search Query Object (SQO)](../../core/sqo.md)** — guide to the search object used to filter records.
- **[Diffusion engine internals](../../diffusion/engine_internals.md#the-ddo_map)** — how the DDO map defines the output structure.

## Quick start for developers

To run the Diffusion API locally:

```bash
cd diffusion/api/v1
bun install
bun run dev
```

The API will listen on the unix socket defined in `SOCKET_PATH` (default: `/tmp/diffusion.sock`), typically proxied via Apache or Nginx.
