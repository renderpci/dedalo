<?php declare(strict_types=1);

require_once __DIR__ . '/../../class.config_scope.php';
require_once __DIR__ . '/../../class.config_merge.php';
require_once __DIR__ . '/../../class.config_key.php';

/**
 * rag domain — optional RAG / vector subsystem (see core/rag/).
 * Mirrors the constants in config/sample.config_db.php verbatim. Every key is
 * read by the RAG code through `defined() ? CONST : <fallback>`, so RAG stays
 * fully dormant while DEDALO_RAG_ENABLED is false (the catalog default). The
 * five credential keys are SECRET (env-only, never compiled); the four
 * threshold knobs are float (needs config_caster 'float').
 *
 * @return config_key[]
 */
return [

	// --- Global switches -------------------------------------------------------
	new config_key(path: 'rag.enabled', const: 'DEDALO_RAG_ENABLED', type: 'bool', default: false, doc: 'Master switch for ingestion + retrieval. false = RAG fully dormant.'),
	new config_key(path: 'rag.chat_enabled', const: 'DEDALO_RAG_CHAT_ENABLED', type: 'bool', default: false, doc: 'Enables the grounded Q&A (ask) action.'),
	new config_key(path: 'rag.media_enabled', const: 'DEDALO_RAG_MEDIA_ENABLED', type: 'bool', default: false, doc: 'Enables image ingestion/retrieval (multimodal). Read by class.embedding_provider_multimodal.'),

	// --- Vector store (SEPARATE, dedicated Postgres + pgvector instance) --------
	new config_key(path: 'rag.db.hostname', const: 'DEDALO_RAG_DB_HOSTNAME_CONN', type: 'string', default: 'localhost', doc: 'RAG vector store host (never the matrix DB).'),
	new config_key(path: 'rag.db.port', const: 'DEDALO_RAG_DB_PORT_CONN', type: 'int', default: 5433, doc: 'RAG vector store port. null when using a socket.'),
	new config_key(path: 'rag.db.database', const: 'DEDALO_RAG_DB_DATABASE_CONN', type: 'string', default: 'dedalo_rag', doc: 'RAG vector store database name.'),
	new config_key(path: 'rag.db.username', const: 'DEDALO_RAG_DB_USERNAME_CONN', type: 'string', default: 'dedalo_rag', doc: 'RAG vector store username.'),
	new config_key(path: 'rag.db.password', const: 'DEDALO_RAG_DB_PASSWORD_CONN', type: 'string', scope: config_scope::SECRET, doc: 'RAG vector store password (env-only; never compiled).'),
	new config_key(path: 'rag.db.socket', const: 'DEDALO_RAG_DB_SOCKET_CONN', type: 'string', default: null, doc: 'RAG vector store unix socket path. Used when hostname is null.'),

	// --- Embedding provider (pluggable; MULTILINGUAL default) -------------------
	new config_key(path: 'rag.provider', const: 'DEDALO_RAG_PROVIDER', type: 'string', default: 'local_http', doc: "Embedding provider: 'local_http' | 'openai' | 'voyage' | 'cohere' | 'jina'."),
	new config_key(path: 'rag.model', const: 'DEDALO_RAG_MODEL', type: 'string', default: 'bge-m3', doc: 'Embedding model (default multilingual bge-m3 / multilingual-e5).'),
	new config_key(path: 'rag.endpoint', const: 'DEDALO_RAG_ENDPOINT', type: 'string', default: 'http://localhost:11434/api/embed', doc: 'Embedding endpoint (e.g. Ollama).'),
	new config_key(path: 'rag.api_key', const: 'DEDALO_RAG_API_KEY', type: 'string', scope: config_scope::SECRET, doc: 'Embedding provider API key (env-only). Required for external providers.'),
	new config_key(path: 'rag.unix_socket', const: 'DEDALO_RAG_UNIX_SOCKET', type: 'string', default: null, doc: 'Embedding provider unix socket.'),
	new config_key(path: 'rag.batch_size', const: 'DEDALO_RAG_BATCH_SIZE', type: 'int', default: 32, doc: 'Embedding batch size.'),
	new config_key(path: 'rag.provider_timeout', const: 'DEDALO_RAG_PROVIDER_TIMEOUT', type: 'int', default: 30, doc: 'Embedding provider timeout (seconds).'),
	new config_key(path: 'rag.embeddable_models', const: 'DEDALO_RAG_EMBEDDABLE_MODELS', type: 'list', default: ['component_text_area', 'component_input_text', 'component_text'], doc: 'Candidate component models scanned for rag.embed.'),

	// --- Chunking (token-budgeted, structure-aware semantic) --------------------
	new config_key(path: 'rag.chunk_strategy', const: 'DEDALO_RAG_CHUNK_STRATEGY', type: 'string', default: 'structural_semantic', doc: "Chunking: 'structural' | 'structural_semantic'."),
	new config_key(path: 'rag.chunk_tokens', const: 'DEDALO_RAG_CHUNK_TOKENS', type: 'int', default: 450, doc: 'Target chunk size in tokens.'),
	new config_key(path: 'rag.chunk_min_tokens', const: 'DEDALO_RAG_CHUNK_MIN_TOKENS', type: 'int', default: 120, doc: 'Minimum chunk size in tokens.'),
	new config_key(path: 'rag.chunk_overlap_tokens', const: 'DEDALO_RAG_CHUNK_OVERLAP_TOKENS', type: 'int', default: 60, doc: 'Overlap between chunks in tokens.'),
	new config_key(path: 'rag.semantic_breakpoint_threshold', const: 'DEDALO_RAG_SEMANTIC_BREAKPOINT_THRESHOLD', type: 'float', default: 0.92, doc: 'Semantic breakpoint threshold (percentile 0..1).'),
	new config_key(path: 'rag.contextual_retrieval', const: 'DEDALO_RAG_CONTEXTUAL_RETRIEVAL', type: 'bool', default: false, doc: 'LLM situating blurb at index time (extra cost).'),

	// --- HNSW tuning (recall/latency knobs) -------------------------------------
	new config_key(path: 'rag.hnsw_m', const: 'DEDALO_RAG_HNSW_M', type: 'int', default: 16, doc: 'HNSW M parameter.'),
	new config_key(path: 'rag.hnsw_ef_construction', const: 'DEDALO_RAG_HNSW_EF_CONSTRUCTION', type: 'int', default: 64, doc: 'HNSW ef_construction parameter.'),
	new config_key(path: 'rag.hnsw_ef_search', const: 'DEDALO_RAG_HNSW_EF_SEARCH', type: 'int', default: 100, doc: 'HNSW ef_search parameter.'),

	// --- Hybrid retrieval -------------------------------------------------------
	new config_key(path: 'rag.hybrid_enabled', const: 'DEDALO_RAG_HYBRID_ENABLED', type: 'bool', default: true, doc: 'Enable hybrid retrieval (text + vector).'),
	new config_key(path: 'rag.rrf_k', const: 'DEDALO_RAG_RRF_K', type: 'int', default: 60, doc: 'Reciprocal Rank Fusion K parameter.'),
	new config_key(path: 'rag.rerank_candidates', const: 'DEDALO_RAG_RERANK_CANDIDATES', type: 'int', default: 40, doc: 'Number of candidates passed to the reranker.'),

	// --- Retrieval / generation budgets -----------------------------------------
	new config_key(path: 'rag.top_k', const: 'DEDALO_RAG_TOP_K', type: 'int', default: 8, doc: 'Top K results for retrieval.'),
	new config_key(path: 'rag.context_token_budget', const: 'DEDALO_RAG_CONTEXT_TOKEN_BUDGET', type: 'int', default: 12000, doc: 'Context token budget for generation.'),
	new config_key(path: 'rag.parent_expansion', const: 'DEDALO_RAG_PARENT_EXPANSION', type: 'bool', default: true, doc: 'Small-to-big parent expansion at generation.'),

	// --- Generation LLM (pluggable; may be Claude) ------------------------------
	new config_key(path: 'rag.llm_provider', const: 'DEDALO_RAG_LLM_PROVIDER', type: 'string', default: 'anthropic', doc: "Generation LLM provider: 'anthropic' | 'local' | 'openai_compatible'."),
	new config_key(path: 'rag.llm_endpoint', const: 'DEDALO_RAG_LLM_ENDPOINT', type: 'string', default: 'https://api.anthropic.com/v1/messages', doc: 'Generation LLM endpoint.'),
	new config_key(path: 'rag.llm_local_endpoint', const: 'DEDALO_RAG_LLM_LOCAL_ENDPOINT', type: 'string', default: null, doc: 'OpenAI-compatible local endpoint for restricted content.'),
	new config_key(path: 'rag.llm_api_key', const: 'DEDALO_RAG_LLM_API_KEY', type: 'string', scope: config_scope::SECRET, doc: 'Generation LLM API key (env-only).'),
	new config_key(path: 'rag.llm_model', const: 'DEDALO_RAG_LLM_MODEL', type: 'string', default: 'claude-opus-4-8', doc: 'Generation LLM model.'),
	new config_key(path: 'rag.llm_max_output_tokens', const: 'DEDALO_RAG_LLM_MAX_OUTPUT_TOKENS', type: 'int', default: 1024, doc: 'Generation LLM max output tokens.'),
	new config_key(path: 'rag.llm_timeout', const: 'DEDALO_RAG_LLM_TIMEOUT', type: 'int', default: 60, doc: 'Generation LLM timeout (seconds).'),

	// --- Privacy / egress policy (per-RECORD; index-time AND generation) --------
	new config_key(path: 'rag.allow_external_provider_default', const: 'DEDALO_RAG_ALLOW_EXTERNAL_PROVIDER_DEFAULT', type: 'bool', default: false, doc: 'Default-deny external egress policy.'),
	new config_key(path: 'rag.external_provider_forbidden_sections', const: 'DEDALO_RAG_EXTERNAL_PROVIDER_FORBIDDEN_SECTIONS', type: 'list', default: [], doc: 'Section_tipos forbidden from external providers.'),
	new config_key(path: 'rag.audit_log', const: 'DEDALO_RAG_AUDIT_LOG', type: 'bool', default: false, doc: 'Log questions/answers to a dedicated sink.'),

	// --- Round-2 hardening: relevance / diversity / reranker / generation -------
	new config_key(path: 'rag.max_distance', const: 'DEDALO_RAG_MAX_DISTANCE', type: 'float', default: 0.35, doc: 'Cosine-distance relevance floor (null = off).'),
	new config_key(path: 'rag.overfetch_factor', const: 'DEDALO_RAG_OVERFETCH_FACTOR', type: 'int', default: 3, doc: 'ACL/collapse over-fetch multiplier for semantic_search.'),
	new config_key(path: 'rag.max_passages_per_record', const: 'DEDALO_RAG_MAX_PASSAGES_PER_RECORD', type: 'int', default: 0, doc: 'Caps passages per record (>0 caps; 0 = off).'),
	new config_key(path: 'rag.rerank_endpoint', const: 'DEDALO_RAG_RERANK_ENDPOINT', type: 'string', default: null, doc: 'Cross-encoder reranker endpoint (pass-through when unset).'),
	new config_key(path: 'rag.rerank_model', const: 'DEDALO_RAG_RERANK_MODEL', type: 'string', default: 'bge-reranker-v2-m3', doc: 'Reranker model.'),
	new config_key(path: 'rag.rerank_api_key', const: 'DEDALO_RAG_RERANK_API_KEY', type: 'string', scope: config_scope::SECRET, doc: 'Reranker API key (env-only).'),
	new config_key(path: 'rag.rerank_timeout', const: 'DEDALO_RAG_RERANK_TIMEOUT', type: 'int', default: 30, doc: 'Reranker timeout (seconds).'),
	new config_key(path: 'rag.llm_temperature', const: 'DEDALO_RAG_LLM_TEMPERATURE', type: 'float', default: 0.0, doc: 'Generation LLM temperature (factual default for grounded Q&A).'),
	new config_key(path: 'rag.llm_system_prompt', const: 'DEDALO_RAG_LLM_SYSTEM_PROMPT', type: 'string', default: '', doc: "Generation LLM system prompt. '' = built-in default."),
	new config_key(path: 'rag.ask_rate_per_min', const: 'DEDALO_RAG_ASK_RATE_PER_MIN', type: 'int', default: 20, doc: 'ask() throttle: requests per user per minute.'),

	// --- Phase 5b: image similarity & object characterization (multimodal) ------
	new config_key(path: 'rag.multimodal_provider', const: 'DEDALO_RAG_MULTIMODAL_PROVIDER', type: 'string', default: 'local', doc: "Multimodal encoder provider: 'local' | 'external'."),
	new config_key(path: 'rag.multimodal_model', const: 'DEDALO_RAG_MULTIMODAL_MODEL', type: 'string', default: 'siglip2', doc: 'Multimodal model (e.g. siglip2 / jina-clip-v2 / open-clip id).'),
	new config_key(path: 'rag.multimodal_endpoint', const: 'DEDALO_RAG_MULTIMODAL_ENDPOINT', type: 'string', default: null, doc: 'Multimodal encoder endpoint (POST /image, /text).'),
	new config_key(path: 'rag.multimodal_api_key', const: 'DEDALO_RAG_MULTIMODAL_API_KEY', type: 'string', scope: config_scope::SECRET, doc: 'Multimodal encoder API key (env-only).'),
	new config_key(path: 'rag.image_max_px', const: 'DEDALO_RAG_IMAGE_MAX_PX', type: 'int', default: 512, doc: 'Downscale encoder input to this longest side (px).'),
	new config_key(path: 'rag.image_hybrid', const: 'DEDALO_RAG_IMAGE_HYBRID', type: 'bool', default: true, doc: 'Blend visual NN with metadata/context (RRF).'),
	new config_key(path: 'rag.near_duplicate_similarity', const: 'DEDALO_RAG_NEAR_DUPLICATE_SIMILARITY', type: 'float', default: 0.93, doc: "Near-duplicate ('same in the collection') threshold."),
	new config_key(path: 'rag.characterize_top_k', const: 'DEDALO_RAG_CHARACTERIZE_TOP_K', type: 'int', default: 20, doc: 'Neighbours aggregated into a characterization proposal.'),
];
