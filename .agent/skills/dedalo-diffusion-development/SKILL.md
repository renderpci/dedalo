---
name: dedalo-diffusion-development
description: Guidelines for extending and maintaining Dédalo's Diffusion API, Chain Processor, and DDO Map resolution.
---

# Dédalo Diffusion Development Skill

This skill provides the technical foundations for developing and debugging the Dédalo Diffusion system.

## Core Architecture

The Diffusion system follows a "Data Only" philosophy. The API resolves complex ontological chains into a standardized JSON structure, while external processors handle the final formatting (SQL, XML, RDF).

### 1. The Chain Processor (`diffusion_chain_processor`)
The engine behind the resolution. It traverses the `ddo_map` defined in the ontology.

- **Recursive Resolution**: When a component establishes a relationship (Relation, Portal), the processor checks for children in the `ddo_map`.
- **Level Deep**: Uses `resolve_chain` to navigate through multiple sections.
- **Flattening**: It automatically strips `diffusion_data_object` wrappers from child results to provide a flat array of values to the parent.

### 2. DDO Map Configuration
The `ddo_map` is stored in the `process` property of a diffusion node.

- **`tipo`**: The component to resolve.
- **`parent`**: The `tipo` of the parent component in the chain (or `self` for root).
- **`section_tipo`**: The section where the component resides (or `self`).
- **`id`**: (Optional) Used by parsers to reference specific values (e.g., `pattern: "${a} - ${b}"`).

## Development Guidelines

### Adding Support for New Components
1. Ensure the component implements `get_diffusion_data($ddo)`.
2. This method should return an array of `diffusion_data_object` items.
3. If the component is a relation, it must return locators that the `chain_processor` can use for recursion.

### Handling Metadata
Always use `wrap_into_diffusion_data_object` to ensure metadata is sourced correctly:
- **`label`** from Component Term.
- **`term`** from Diffusion Node Term.
- **`model`** from Diffusion Node Model.

### Debugging the Resolution
- **Accumulation Bug**: Always ensure `diffusion_api::$datum` and `diffusion_api::$datum_unresolved` are reset at the start of a request.
- **Cache**: Use `diffusion_chain_processor::reset_cache()` to clear the section resolution cache.
- **Debug Trace**: The `diffusion_chain_processor` maintains a `debug_chain` array. Include `include_debug: true` in the API `options` to see the full path taken during resolution.

## Common Pitfalls

1. **Missing Keys in Entries**: By default, the API skips keys with empty values. If a field is missing, check if the record actually has data for that component.
2. **Infinite Recursion**: The processor has a `MAX_DEPTH` (default 5). If resolving circular relations, ensure the ontology definition or the depth limit prevents infinite loops.
3. **Permission Checks**: Ensure the user executing the diffusion (often a restricted API user) has permissions to view the target sections and components.

## Testing
Always run the `test/server/api/dd_diffusion_api_Test.php` suite after changes to ensure:
- The JSON response structure remains consistent.
- Cross-section resolution still flattens correctly.
- Metadata is correctly assigned.
