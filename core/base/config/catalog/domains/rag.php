<?php declare(strict_types=1);

require_once __DIR__ . '/../../class.config_scope.php';
require_once __DIR__ . '/../../class.config_merge.php';
require_once __DIR__ . '/../../class.config_key.php';

// RAG / Vector data processing (core/rag/). Every setting below is overridable
// from ../private/.env by its constant name (e.g. DEDALO_RAG_ENABLED=true), and
// secrets (passwords / API keys) are env-only (scope SECRET, never compiled).
// The whole subsystem stays dormant unless rag.enabled (and, for images,
// rag.media.enabled) are true. Float-valued keys are declared `string` (the .env
// caster has no float type) and the RAG code casts them with (float).
return [

	// ── master switches ──────────────────────────────────────────────────────
	new config_key(
		path:    'rag.enabled',
		const:   'DEDALO_RAG_ENABLED',
		type:    'bool',
		default: false,
		doc:     'Master switch for RAG ingestion + retrieval. Dormant when false.',
	),
	new config_key(
		path:    'rag.chat_enabled',
		const:   'DEDALO_RAG_CHAT_ENABLED',
		type:    'bool',
		default: false,
		doc:     'Enable the grounded Q&A (ask) action.',
	),
	new config_key(
		path:    'rag.media_enabled',
		const:   'DEDALO_RAG_MEDIA_ENABLED',
		type:    'bool',
		default: false,
		doc:     'Enable image (multimodal) ingestion + object similarity/characterization.',
	),

	// ── vector store (SEPARATE, dedicated Postgres + pgvector instance) ───────
	new config_key(
		path:    'rag.db.hostname',
		const:   'DEDALO_RAG_DB_HOSTNAME_CONN',
		type:    'string',
		default: 'localhost',
		doc:     'RAG pgvector host (never the matrix DB).',
	),
	new config_key(
		path:    'rag.db.port',
		const:   'DEDALO_RAG_DB_PORT_CONN',
		type:    'string',
		default: '5433',
		doc:     'RAG pgvector port.',
	),
	new config_key(
		path:    'rag.db.database',
		const:   'DEDALO_RAG_DB_DATABASE_CONN',
		type:    'string',
		default: 'dedalo_rag',
		doc:     'RAG pgvector database name.',
	),
	new config_key(
		path:    'rag.db.username',
		const:   'DEDALO_RAG_DB_USERNAME_CONN',
		type:    'string',
		default: 'dedalo_rag',
		doc:     'RAG pgvector username.',
	),
	new config_key(
		path:    'rag.db.password',
		const:   'DEDALO_RAG_DB_PASSWORD_CONN',
		type:    'string',
		scope:   config_scope::SECRET,
		doc:     'RAG pgvector password (env-only; never compiled).',
	),
	new config_key(
		path:    'rag.db.socket',
		const:   'DEDALO_RAG_DB_SOCKET_CONN',
		type:    'string',
		default: null,
		doc:     'RAG pgvector unix socket path. Null = TCP.',
	),

	// ── embedding provider (text; pluggable, multilingual default) ───────────
	new config_key(
		path:    'rag.provider',
		const:   'DEDALO_RAG_PROVIDER',
		type:    'string',
		default: 'local_http',
		doc:     'Text embedding provider: local_http | openai | voyage | cohere | jina.',
	),
	new config_key(
		path:    'rag.model',
		const:   'DEDALO_RAG_MODEL',
		type:    'string',
		default: 'bge-m3',
		doc:     'Text embedding model. Default a multilingual model (heritage text is non-English).',
	),
	new config_key(
		path:    'rag.endpoint',
		const:   'DEDALO_RAG_ENDPOINT',
		type:    'string',
		default: null,
		doc:     'Text embeddings endpoint, e.g. http://127.0.0.1:8090/embed (the reference sidecar).',
	),
	new config_key(
		path:    'rag.api_key',
		const:   'DEDALO_RAG_API_KEY',
		type:    'string',
		scope:   config_scope::SECRET,
		doc:     'Text embedding API key (env-only; required for external providers).',
	),
	new config_key(
		path:    'rag.unix_socket',
		const:   'DEDALO_RAG_UNIX_SOCKET',
		type:    'string',
		default: null,
		doc:     'Unix socket for a socket-only local embedding service. Null = TCP.',
	),
	new config_key(
		path:    'rag.batch_size',
		const:   'DEDALO_RAG_BATCH_SIZE',
		type:    'int',
		default: 32,
		doc:     'Max texts per embedding request.',
	),
	new config_key(
		path:    'rag.provider_timeout',
		const:   'DEDALO_RAG_PROVIDER_TIMEOUT',
		type:    'int',
		default: 30,
		doc:     'Embedding HTTP timeout (seconds).',
	),
	new config_key(
		path:    'rag.embeddable_models',
		const:   'DEDALO_RAG_EMBEDDABLE_MODELS',
		type:    'list',
		default: ['component_text_area', 'component_input_text', 'component_text'],
		doc:     'Component models scanned for the per-component rag.embed flag.',
	),

	// ── chunking (structure-aware semantic; token-budgeted) ──────────────────
	new config_key(
		path:    'rag.chunk.strategy',
		const:   'DEDALO_RAG_CHUNK_STRATEGY',
		type:    'string',
		default: 'structural_semantic',
		doc:     'Chunking strategy: structural | structural_semantic.',
	),
	new config_key(
		path:    'rag.chunk.tokens',
		const:   'DEDALO_RAG_CHUNK_TOKENS',
		type:    'int',
		default: 450,
		doc:     'Target chunk size in tokens.',
	),
	new config_key(
		path:    'rag.chunk.min_tokens',
		const:   'DEDALO_RAG_CHUNK_MIN_TOKENS',
		type:    'int',
		default: 120,
		doc:     'Minimum chunk size (orphan double-merge floor).',
	),
	new config_key(
		path:    'rag.chunk.semantic_breakpoint_threshold',
		const:   'DEDALO_RAG_SEMANTIC_BREAKPOINT_THRESHOLD',
		type:    'string', // float; cast with (float) in code
		default: '0.92',
		doc:     'Semantic-breakpoint percentile (0..1) for sentence-distance splitting.',
	),

	// ── HNSW tuning (recall/latency knobs) ───────────────────────────────────
	new config_key(
		path:    'rag.hnsw.m',
		const:   'DEDALO_RAG_HNSW_M',
		type:    'int',
		default: 16,
		doc:     'HNSW M (graph degree).',
	),
	new config_key(
		path:    'rag.hnsw.ef_construction',
		const:   'DEDALO_RAG_HNSW_EF_CONSTRUCTION',
		type:    'int',
		default: 64,
		doc:     'HNSW ef_construction (build quality).',
	),
	new config_key(
		path:    'rag.hnsw.ef_search',
		const:   'DEDALO_RAG_HNSW_EF_SEARCH',
		type:    'int',
		default: 100,
		doc:     'HNSW ef_search (query recall/latency; set per session).',
	),

	// ── hybrid retrieval + reranker ──────────────────────────────────────────
	new config_key(
		path:    'rag.hybrid_enabled',
		const:   'DEDALO_RAG_HYBRID_ENABLED',
		type:    'bool',
		default: true,
		doc:     'Fuse dense ANN with lexical BM25/trigram (RRF). Recommended.',
	),
	new config_key(
		path:    'rag.rrf_k',
		const:   'DEDALO_RAG_RRF_K',
		type:    'int',
		default: 60,
		doc:     'Reciprocal Rank Fusion constant.',
	),
	new config_key(
		path:    'rag.rerank.candidates',
		const:   'DEDALO_RAG_RERANK_CANDIDATES',
		type:    'int',
		default: 40,
		doc:     'Candidates fetched before reranking.',
	),
	new config_key(
		path:    'rag.rerank.endpoint',
		const:   'DEDALO_RAG_RERANK_ENDPOINT',
		type:    'string',
		default: null,
		doc:     'Cross-encoder reranker endpoint. Null = pass-through (no rerank).',
	),
	new config_key(
		path:    'rag.rerank.model',
		const:   'DEDALO_RAG_RERANK_MODEL',
		type:    'string',
		default: 'bge-reranker-v2-m3',
		doc:     'Reranker model id.',
	),
	new config_key(
		path:    'rag.rerank.api_key',
		const:   'DEDALO_RAG_RERANK_API_KEY',
		type:    'string',
		scope:   config_scope::SECRET,
		doc:     'Reranker API key (env-only).',
	),
	new config_key(
		path:    'rag.rerank.timeout',
		const:   'DEDALO_RAG_RERANK_TIMEOUT',
		type:    'int',
		default: 30,
		doc:     'Reranker HTTP timeout (seconds).',
	),

	// ── retrieval budgets ────────────────────────────────────────────────────
	new config_key(
		path:    'rag.top_k',
		const:   'DEDALO_RAG_TOP_K',
		type:    'int',
		default: 8,
		doc:     'Default result/passage count.',
	),
	new config_key(
		path:    'rag.context_token_budget',
		const:   'DEDALO_RAG_CONTEXT_TOKEN_BUDGET',
		type:    'int',
		default: 12000,
		doc:     'Max tokens of passages packed into an ask() prompt.',
	),
	new config_key(
		path:    'rag.max_distance',
		const:   'DEDALO_RAG_MAX_DISTANCE',
		type:    'string', // float; cast with (float) in code
		default: '0.35',
		doc:     'Cosine-distance relevance floor (null = off).',
	),
	new config_key(
		path:    'rag.overfetch_factor',
		const:   'DEDALO_RAG_OVERFETCH_FACTOR',
		type:    'int',
		default: 3,
		doc:     'ACL/collapse over-fetch multiplier for semantic_search.',
	),
	new config_key(
		path:    'rag.max_passages_per_record',
		const:   'DEDALO_RAG_MAX_PASSAGES_PER_RECORD',
		type:    'int',
		default: 0,
		doc:     '>0 caps passages per record (diversify); 0 = off.',
	),
	new config_key(
		path:    'rag.parent_expansion',
		const:   'DEDALO_RAG_PARENT_EXPANSION',
		type:    'bool',
		default: true,
		doc:     'Small-to-big: expand a hit to its parent section at generation.',
	),

	// ── generation LLM (pluggable; may be Claude) ────────────────────────────
	new config_key(
		path:    'rag.llm.provider',
		const:   'DEDALO_RAG_LLM_PROVIDER',
		type:    'string',
		default: 'anthropic',
		doc:     'Generation LLM provider: anthropic | local | openai_compatible.',
	),
	new config_key(
		path:    'rag.llm.endpoint',
		const:   'DEDALO_RAG_LLM_ENDPOINT',
		type:    'string',
		default: 'https://api.anthropic.com/v1/messages',
		doc:     'Generation LLM endpoint.',
	),
	new config_key(
		path:    'rag.llm.local_endpoint',
		const:   'DEDALO_RAG_LLM_LOCAL_ENDPOINT',
		type:    'string',
		default: null,
		doc:     'Local/OpenAI-compatible endpoint — the only adapter allowed for restricted content.',
	),
	new config_key(
		path:    'rag.llm.api_key',
		const:   'DEDALO_RAG_LLM_API_KEY',
		type:    'string',
		scope:   config_scope::SECRET,
		doc:     'Generation LLM API key (env-only).',
	),
	new config_key(
		path:    'rag.llm.model',
		const:   'DEDALO_RAG_LLM_MODEL',
		type:    'string',
		default: 'claude-opus-4-8',
		doc:     'Generation LLM model id.',
	),
	new config_key(
		path:    'rag.llm.max_output_tokens',
		const:   'DEDALO_RAG_LLM_MAX_OUTPUT_TOKENS',
		type:    'int',
		default: 1024,
		doc:     'Max answer tokens.',
	),
	new config_key(
		path:    'rag.llm.timeout',
		const:   'DEDALO_RAG_LLM_TIMEOUT',
		type:    'int',
		default: 60,
		doc:     'Generation HTTP timeout (seconds).',
	),
	new config_key(
		path:    'rag.llm.temperature',
		const:   'DEDALO_RAG_LLM_TEMPERATURE',
		type:    'string', // float; cast with (float) in code
		default: '0.0',
		doc:     'Generation temperature. 0.0 for factual grounded Q&A.',
	),
	new config_key(
		path:    'rag.llm.system_prompt',
		const:   'DEDALO_RAG_LLM_SYSTEM_PROMPT',
		type:    'string',
		default: '',
		doc:     'Override the default ask() system prompt (per-section override via properties.rag.system_prompt).',
	),

	// ── privacy / egress policy (per-record; governs index AND generation) ───
	new config_key(
		path:    'rag.allow_external_provider_default',
		const:   'DEDALO_RAG_ALLOW_EXTERNAL_PROVIDER_DEFAULT',
		type:    'bool',
		default: false,
		doc:     'Default-deny external egress. Only publishable records may leave the host.',
	),
	new config_key(
		path:    'rag.external_provider_forbidden_sections',
		const:   'DEDALO_RAG_EXTERNAL_PROVIDER_FORBIDDEN_SECTIONS',
		type:    'list',
		default: [],
		doc:     'Section tipos that must never reach an external provider.',
	),

	// ── multimodal images (Phase 5b) ─────────────────────────────────────────
	new config_key(
		path:    'rag.multimodal.provider',
		const:   'DEDALO_RAG_MULTIMODAL_PROVIDER',
		type:    'string',
		default: 'local',
		doc:     'Image encoder provider: local | external. External only for publishable objects.',
	),
	new config_key(
		path:    'rag.multimodal.model',
		const:   'DEDALO_RAG_MULTIMODAL_MODEL',
		type:    'string',
		default: 'clip-ViT-B-32',
		doc:     'Joint image+text (CLIP/SigLIP) model id.',
	),
	new config_key(
		path:    'rag.multimodal.endpoint',
		const:   'DEDALO_RAG_MULTIMODAL_ENDPOINT',
		type:    'string',
		default: null,
		doc:     'Multimodal endpoint base (POST /image, /text), e.g. http://127.0.0.1:8090.',
	),
	new config_key(
		path:    'rag.multimodal.api_key',
		const:   'DEDALO_RAG_MULTIMODAL_API_KEY',
		type:    'string',
		scope:   config_scope::SECRET,
		doc:     'Multimodal API key (env-only).',
	),
	new config_key(
		path:    'rag.image.max_px',
		const:   'DEDALO_RAG_IMAGE_MAX_PX',
		type:    'int',
		default: 512,
		doc:     'Longest side the encoder input is downscaled to (ImageMagick).',
	),
	new config_key(
		path:    'rag.image.hybrid',
		const:   'DEDALO_RAG_IMAGE_HYBRID',
		type:    'bool',
		default: true,
		doc:     'Blend visual similarity with catalog metadata (RRF). Recommended for heritage.',
	),
	new config_key(
		path:    'rag.image.near_duplicate_similarity',
		const:   'DEDALO_RAG_NEAR_DUPLICATE_SIMILARITY',
		type:    'string', // float; cast with (float) in code
		default: '0.93',
		doc:     'Similarity threshold for the "same in the collection" near-duplicate mode.',
	),
	new config_key(
		path:    'rag.characterize_top_k',
		const:   'DEDALO_RAG_CHARACTERIZE_TOP_K',
		type:    'int',
		default: 20,
		doc:     'Neighbours aggregated into a typology/period proposal.',
	),
];
