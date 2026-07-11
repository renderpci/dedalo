/**
 * bun test preload — S2-20 boot registration (mirrors production boot).
 *
 * The ontology resolver's component-model lookup (alias map + matrix column)
 * is REGISTERED by core/components/registry.ts at module load — the inversion
 * that broke the 33-file import SCC (ontology/ no longer imports components/).
 * Production entrypoints (server.ts, diffusion/runner.ts, rag_drain.ts) load
 * the registry explicitly; tests get the same guarantee here so a unit test
 * that imports only ontology/resolver.ts resolves models exactly like a booted
 * process instead of tripping the loud unregistered-lookup error.
 */
import '../../src/core/components/registry.ts';
