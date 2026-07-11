# Configuration reference

> Part of the [AI Assistant](index.md) section · Previous: [Connecting models](connecting_models.md) · Next: [Privacy & security](privacy_and_security.md) · See also: [Config system](../../../config/config.md)

Every assistant setting lives in `../private/.env` and is read once at boot. All settings are **fail-closed**: unset means the safest behaviour (disabled, read-only, no external egress). This page is the complete reference — one row per key, plus the request limits that are fixed in code.

!!! info "How config is read"
    Settings are read through the typed config layer (`readEnv`), never `process.env` directly (a [tripwire](../../../development/index.md) enforces this). `../private/.env` is **append-only, documented keys only**. The full census with inline comments is `../private/sample.env` §12; this page is the narrative version.

---

## The settings

### Master switch

| Key | Default | Effect |
|---|---|---|
| `DEDALO_AGENT_HTTP_ENABLED` | `false` | Enables the assistant's server actions (`agent_models`, `agent_chat`, `agent_chat_stream`, `agent_apply`). With it off, every one refuses like an unknown action and the chat panel shows a disabled message. **The one switch that turns the feature on.** |

### Models

| Key | Default | Effect |
|---|---|---|
| `DEDALO_AGENT_MODELS` | *(unset)* | The [model catalog](connecting_models.md) — a JSON array of selectable models, each with an egress class. Unset ⇒ an implicit single Anthropic model *iff* `ANTHROPIC_API_KEY` is set, else the assistant is disabled. Malformed ⇒ disabled (fail-closed). |
| `ANTHROPIC_API_KEY` | *(unset)* | The Anthropic key used by `anthropic` catalog entries (and by the implicit catalog). A model whose `api_key_env` names a different var uses that instead. |
| `AGENT_MODEL` | `claude-opus-4-8` | The model id for the **implicit** catalog only (when `DEDALO_AGENT_MODELS` is unset). Ignored when an explicit catalog is present. |
| `DEDALO_AGENT_MAX_TOKENS` | `16000` | Per-turn output-token cap, unless a catalog entry overrides it with its own `max_tokens`. |

### Write mode

| Key | Default | Effect |
|---|---|---|
| `DEDALO_AGENT_ALLOW_WRITE` | `false` | Exposes the write tools + the change-plan flow. Even on, the loop never writes — it proposes a plan a human confirms. **Refused to global-admin sessions** regardless (confused-deputy wall). |
| `DEDALO_AGENT_WRITE_SECTIONS` | *(unset = none extra)* | Comma-separated allowlist of section `tipo`s the assistant may propose writes to. |

### Privacy / egress

| Key | Default | Effect |
|---|---|---|
| `DEDALO_AGENT_ALLOW_EXTERNAL_PROVIDER_DEFAULT` | `false` | Whether **external**-egress conversations may receive record content at all. `false` (default) = external models get discovery/structure tools and can converse, but every record-content tool call is refused with `egress_restricted`. See [the egress gate](privacy_and_security.md#the-egress-gate). |
| `DEDALO_RAG_EXTERNAL_PROVIDER_FORBIDDEN_SECTIONS` | *(unset = none)* | Comma-separated section `tipo`s that may **never** reach an external provider, even when the default above is `true`. **Shared with the [RAG subsystem](../rag.md)** — one data classification, both surfaces. |

### Prompt

| Key | Default | Effect |
|---|---|---|
| `DEDALO_AGENT_SYSTEM_PROMPT_APPEND` | *(unset)* | Deployment-specific text appended to the built-in system prompt (after the invariants; it can extend, never reorder them). Use it to add institution context — *"This is the archive of the Museum of X; prefer Catalan labels; the main collection is oral history."* Boot-stable, so it stays inside the cached prompt prefix. |

---

## A worked `.env` for a real institution

A museum that wants a capable cloud model for public collections **and** a private local model for protected oral history, with confirmed edits enabled for cataloguers:

```bash
# --- AI Assistant ---------------------------------------------------------
DEDALO_AGENT_HTTP_ENABLED=true

# capable cloud model + private local model; user picks per conversation
ANTHROPIC_API_KEY=sk-ant-...
DEDALO_AGENT_MODELS=[{"id":"local","label":"Llama 3.1 (local, private)","provider":"openai_compatible","model":"llama3.1:70b","endpoint":"http://127.0.0.1:11434/v1/chat/completions","egress":"local"},{"id":"claude","label":"Claude Opus 4.8 (external)","provider":"anthropic","model":"claude-opus-4-8","egress":"external","vision":true}]

# proposed edits (confirmed by a human), limited to two sections
DEDALO_AGENT_ALLOW_WRITE=true
DEDALO_AGENT_WRITE_SECTIONS=oh1,rsc197

# external models may see PUBLIC record content, but never the oral-history section
DEDALO_AGENT_ALLOW_EXTERNAL_PROVIDER_DEFAULT=true
DEDALO_RAG_EXTERNAL_PROVIDER_FORBIDDEN_SECTIONS=oh1

# institution context for the prompt
DEDALO_AGENT_SYSTEM_PROMPT_APPEND=This is the archive of the Museum of X. Prefer Catalan (lg-cat) labels when they exist. The oral-history collection (section oh1) is sensitive.
```

Read the privacy lines together: external conversations *may* touch public records (`ALLOW_EXTERNAL_PROVIDER_DEFAULT=true`) but the oral-history section is on the never-egress list (`FORBIDDEN_SECTIONS=oh1`), so a Claude conversation can help catalogue coins yet is refused every oral-history record — while the local model is never restricted. The [Privacy & security](privacy_and_security.md) page explains exactly how those two settings interact.

---

## Request limits (fixed in code)

These bound each request to keep one chat turn from becoming a denial-of-service or a runaway cost. They are not env-tunable:

| Limit | Value | What it bounds |
|---|---|---|
| Question length | 32,768 chars | one user message |
| History entries | 64 | prior turns the client resends |
| History size | 256 KB | total resent history text |
| Images per turn | 8 | attachments on one message |
| Image size | ~5 MiB each (7,000,000 base64 chars) | one attachment |
| Images total | ~15 MiB per turn (21,000,000 base64 chars) | all attachments together |
| Context summary | 2,000 chars | the current-record context blurb |
| Loop iterations | 12 | model turns per question (a runaway-loop backstop) |

Accepted image types: JPEG, PNG, WebP, GIF.

---

## Precedence and the stand-alone MCP server (`DEDALO_MCP_*`) {#the-stand-alone-mcp-server-dedalo_mcp_}

**Precedence.** The real process environment wins over `../private/.env`. Administrators migrating from the PHP server can keep existing `DEDALO_*` lines; where a TS-native name differs, the PHP spelling is honoured as a fallback (the sample.env marks the aliased pairs).

**Not to be confused:** the `DEDALO_MCP_*` keys (`DEDALO_MCP_USER_ID`, `DEDALO_MCP_ALLOW_WRITE`, `DEDALO_MCP_WRITE_SECTIONS`, `DEDALO_MCP_MEDIA_IMPORT_DIR`, `DEDALO_MCP_MEDIA_MAX_BYTES`) configure the **stand-alone MCP server** — a separate process (`bun run src/ai/mcp/server.ts`) that exposes the same tool registry to *external* MCP clients (Claude Desktop, Claude Code) over stdio, as one fixed service user. They have **nothing** to do with the in-app assistant, which always runs as the logged-in browser user via the `DEDALO_AGENT_*` keys above. Configuring one does not affect the other.
