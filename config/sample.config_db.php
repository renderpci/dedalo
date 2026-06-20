<?php

// Reviewed: 05-10-2022



// POSTGRESQL (PRIVATE DATA)
// Default PotsgreSQL connection, for investigation system
// DEDALO_DB_TYPE: string|null 'postgresql'
define('DEDALO_DB_TYPE',				'postgresql');
// DB_BIN_PATH: string '' . Ex. /usr/bin/'
define('DB_BIN_PATH',					'/usr/bin/');
// PHP_BIN_PATH: string '/usr/bin/php' . Ex. /usr/bin/php
define('PHP_BIN_PATH',					'/usr/bin/php');
// DEDALO_HOSTNAME_CONN: string|null 'localhost'
define('DEDALO_HOSTNAME_CONN',			'localhost');
// DEDALO_DB_PORT_CONN: string|null '5432'
define('DEDALO_DB_PORT_CONN',			'5432');
// DEDALO_SOCKET_CONN: string|null null . Ex '/var/pgsql-socket'
define('DEDALO_SOCKET_CONN',			null);
// DEDALO_DATABASE_CONN: string 'dedalo_mydatabase'
define('DEDALO_DATABASE_CONN',			'dedalo_mydatabase');
// DEDALO_USERNAME_CONN: string
define('DEDALO_USERNAME_CONN',			'myusername');
// DEDALO_PASSWORD_CONN: string
define('DEDALO_PASSWORD_CONN',			'mypassword');
// DEDALO_INFORMATION: string . (!) Change it to any string before install, but don't change it after install
define('DEDALO_INFORMATION',			'Dédalo install version');
// DEDALO_INFO_KEY: string . (!) Change it with any string before install, but don't change it after install
define('DEDALO_INFO_KEY',				DEDALO_ENTITY);
// SLOW_QUERY_MS: int 6000
define('SLOW_QUERY_MS',					6000);
// DEDALO_DB_MANAGEMENT: bool . Used to activate or not the management of the DDBB by Dédalo. If false, all administration tasks will need to be done manually.
define('DEDALO_DB_MANAGEMENT',			true);



// MYSQL (PUBLIC DATA)
// MySQL connection for publication
// MYSQL_DEDALO_HOSTNAME_CONN: string|null 'hostname' . Ex. 'localhost', '127.0.0.1' etc.
define('MYSQL_DEDALO_HOSTNAME_CONN',	'localhost');
// MYSQL_DEDALO_USERNAME_CONN: string 'username'
define('MYSQL_DEDALO_USERNAME_CONN',	'username');
// MYSQL_DEDALO_PASSWORD_CONN: string 'password'
define('MYSQL_DEDALO_PASSWORD_CONN',	'password');
// MYSQL_DEDALO_DATABASE_CONN: string 'web_dedalo'
define('MYSQL_DEDALO_DATABASE_CONN',	'web_dedalo');
// MYSQL_DEDALO_DB_PORT_CONN: string|null . Ex. 3306 or null for socket
define('MYSQL_DEDALO_DB_PORT_CONN',		3306);
// MYSQL_DEDALO_SOCKET_CONN: string|null . Ex. /tmp/mysql.sock if use
define('MYSQL_DEDALO_SOCKET_CONN',		null);
// MYSQL_DB_BIN_PATH: string '' . Ex. /usr/bin/' . Optional
define('MYSQL_DB_BIN_PATH',				'/usr/bin/');


// =============================================================================
// RAG / VECTOR DATA PROCESSING (optional subsystem; see core/rag/)
// All constants are optional — the RAG code guards every one with defined().
// Leave DEDALO_RAG_ENABLED=false (or unset) to keep RAG fully dormant.
// =============================================================================

// --- Global switches -------------------------------------------------------
// DEDALO_RAG_ENABLED: bool. Master kill switch for ingestion + retrieval.
define('DEDALO_RAG_ENABLED',				false);
// DEDALO_RAG_CHAT_ENABLED: bool. Enables the grounded Q&A (ask) action.
define('DEDALO_RAG_CHAT_ENABLED',			false);

// --- Vector store (SEPARATE, dedicated Postgres + pgvector instance) --------
// Never the matrix DB. Run install/db/rag_embeddings.sql against this instance,
// and install/db/matrix_rag_index_queue.sql against the MATRIX DB.
// DEDALO_RAG_DB_HOSTNAME_CONN: string|null
define('DEDALO_RAG_DB_HOSTNAME_CONN',		'localhost');
// DEDALO_RAG_DB_PORT_CONN: int|null
define('DEDALO_RAG_DB_PORT_CONN',			5433);
// DEDALO_RAG_DB_DATABASE_CONN: string
define('DEDALO_RAG_DB_DATABASE_CONN',		'dedalo_rag');
// DEDALO_RAG_DB_USERNAME_CONN: string
define('DEDALO_RAG_DB_USERNAME_CONN',		'dedalo_rag');
// DEDALO_RAG_DB_PASSWORD_CONN: string
define('DEDALO_RAG_DB_PASSWORD_CONN',		'mypassword');
// DEDALO_RAG_DB_SOCKET_CONN: string|null. Used when hostname is null.
define('DEDALO_RAG_DB_SOCKET_CONN',			null);

// --- Embedding provider (pluggable; MULTILINGUAL default) -------------------
// DEDALO_RAG_PROVIDER: 'local_http' | 'openai' | 'voyage' | 'cohere' | 'jina'
define('DEDALO_RAG_PROVIDER',				'local_http');
// DEDALO_RAG_MODEL: string. Default multilingual (bge-m3 / multilingual-e5).
define('DEDALO_RAG_MODEL',					'bge-m3');
// DEDALO_RAG_ENDPOINT: string. e.g. Ollama http://localhost:11434/api/embed
define('DEDALO_RAG_ENDPOINT',				'http://localhost:11434/api/embed');
// DEDALO_RAG_API_KEY: string|null. Required for external providers.
define('DEDALO_RAG_API_KEY',				null);
// DEDALO_RAG_UNIX_SOCKET: string|null.
define('DEDALO_RAG_UNIX_SOCKET',			null);
// DEDALO_RAG_BATCH_SIZE: int.
define('DEDALO_RAG_BATCH_SIZE',				32);
// DEDALO_RAG_PROVIDER_TIMEOUT: int seconds.
define('DEDALO_RAG_PROVIDER_TIMEOUT',		30);
// DEDALO_RAG_EMBEDDABLE_MODELS: array. Candidate component models scanned for rag.embed.
define('DEDALO_RAG_EMBEDDABLE_MODELS',		['component_text_area','component_input_text','component_text']);

// --- Chunking (token-budgeted, structure-aware semantic) --------------------
define('DEDALO_RAG_CHUNK_STRATEGY',			'structural_semantic'); // 'structural' | 'structural_semantic'
define('DEDALO_RAG_CHUNK_TOKENS',			450);
define('DEDALO_RAG_CHUNK_MIN_TOKENS',		120);
define('DEDALO_RAG_CHUNK_OVERLAP_TOKENS',	60);
define('DEDALO_RAG_SEMANTIC_BREAKPOINT_THRESHOLD', 0.92); // percentile 0..1
define('DEDALO_RAG_CONTEXTUAL_RETRIEVAL',	false); // LLM situating blurb (extra cost)

// --- HNSW tuning (recall/latency knobs) -------------------------------------
define('DEDALO_RAG_HNSW_M',					16);
define('DEDALO_RAG_HNSW_EF_CONSTRUCTION',	64);
define('DEDALO_RAG_HNSW_EF_SEARCH',			100);

// --- Hybrid retrieval -------------------------------------------------------
define('DEDALO_RAG_HYBRID_ENABLED',			true);
define('DEDALO_RAG_RRF_K',					60);
define('DEDALO_RAG_RERANK_CANDIDATES',		40);
// Optional reranker (pass-through if unset): DEDALO_RAG_RERANK_PROVIDER / _MODEL / _ENDPOINT / _API_KEY

// --- Retrieval / generation budgets -----------------------------------------
define('DEDALO_RAG_TOP_K',					8);
define('DEDALO_RAG_CONTEXT_TOKEN_BUDGET',	12000);
define('DEDALO_RAG_PARENT_EXPANSION',		true); // small-to-big at generation

// --- Generation LLM (pluggable; may be Claude) ------------------------------
define('DEDALO_RAG_LLM_PROVIDER',			'anthropic'); // 'anthropic' | 'local' | 'openai_compatible'
define('DEDALO_RAG_LLM_ENDPOINT',			'https://api.anthropic.com/v1/messages');
define('DEDALO_RAG_LLM_LOCAL_ENDPOINT',		null); // OpenAI-compatible local endpoint for restricted content
define('DEDALO_RAG_LLM_API_KEY',			null);
define('DEDALO_RAG_LLM_MODEL',				'claude-opus-4-8');
define('DEDALO_RAG_LLM_MAX_OUTPUT_TOKENS',	1024);
define('DEDALO_RAG_LLM_TIMEOUT',			60);

// --- Privacy / egress policy (per-RECORD; governs index-time AND generation) -
// DEDALO_RAG_ALLOW_EXTERNAL_PROVIDER_DEFAULT: bool. Default-deny external egress.
define('DEDALO_RAG_ALLOW_EXTERNAL_PROVIDER_DEFAULT', false);
// DEDALO_RAG_EXTERNAL_PROVIDER_FORBIDDEN_SECTIONS: array of section_tipo.
define('DEDALO_RAG_EXTERNAL_PROVIDER_FORBIDDEN_SECTIONS', []);
// DEDALO_RAG_AUDIT_LOG: bool. Log questions/answers to a dedicated sink.
define('DEDALO_RAG_AUDIT_LOG',				false);

// --- RAG round-2 hardening knobs --------------------------------------------
// Retrieval relevance + diversity
define('DEDALO_RAG_MAX_DISTANCE',			0.35);  // cosine-distance relevance floor (null = off)
define('DEDALO_RAG_OVERFETCH_FACTOR',		3);     // ACL/collapse over-fetch multiplier for semantic_search
define('DEDALO_RAG_MAX_PASSAGES_PER_RECORD',0);     // >0 caps passages per record (retrieve/ask); 0 = off
// Reranker (cross-encoder; pass-through when endpoint unset)
define('DEDALO_RAG_RERANK_ENDPOINT',		null);  // e.g. http://localhost:8081/rerank
define('DEDALO_RAG_RERANK_MODEL',			'bge-reranker-v2-m3');
define('DEDALO_RAG_RERANK_API_KEY',			null);
define('DEDALO_RAG_RERANK_TIMEOUT',			30);
// Generation tuning
define('DEDALO_RAG_LLM_TEMPERATURE',		0.0);   // factual default for grounded heritage Q&A
define('DEDALO_RAG_LLM_SYSTEM_PROMPT',		'');    // '' = built-in default; per-section override via properties.rag.system_prompt
// ask() throttle (planned; simple per-user/min counter)
define('DEDALO_RAG_ASK_RATE_PER_MIN',		20);
