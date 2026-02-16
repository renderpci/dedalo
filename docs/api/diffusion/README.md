# Diffusion API Documentation

Welcome to the technical documentation for the Dédalo Diffusion Engine. This system is responsible for resolving complex data structures from the Matrix and preparing them for external distribution (Diffusion).

## Documentation Index

1.  **[Architecture](architecture.md)**
    Overview of the hybrid Bun/PHP model, showing the flow from the browser through the middleware to the resolution engine.

2.  **[API Endpoints](endpoints.md)**
    Detailed specifications for the Bun API endpoints, including the `diffuse` streaming action and the `get_process_status` reconnection handler.

3.  **[Data Model](data_model.md)**
    Explanation of the record mapping, table structures, and the parser pipeline that prepares data for MariaDB.

## Related Resources

- **[Existing PHP API Docs](../diffusion_api_documentation.md)**: Details on the raw PHP resolution engine and SQO structure.
- **[Search Query Object (SQO)](../core/sqo.md)**: Comprehensive guide to the search object used to filter records.
- **[DDO Mapping](../../diffusion/ddo_mapping.md)**: How the ontology defines the output structure.

## Quick Start for Developers

To run the Diffusion API locally:

```bash
cd diffusion/api/v1
bun install
bun run dev
```

The API will listen on the unix socket defined in `SOCKET_PATH` (default: `/tmp/diffusion.sock`), typically proxied via Apache or Nginx.
