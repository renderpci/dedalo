/**
 * CONFIG CATALOG — domain: ai
 *
 * GENERATED SCAFFOLD (probe_emit_catalog.ts). Hand-edit from here on.
 */

import type { CatalogEntry } from '../catalog_types.ts';

export const AI_KEYS = {
	AGENT_MODEL: {
		type: 'string',
		scope: 'operator',
		default: 'claude-opus-4-8',
		heading: 'Defining the default assistant model',
		typeLabel: 'string',
		doc: `This parameter names the model the assistant uses when no model catalog is declared.
It only matters in the zero-configuration case: with \`DEDALO_AGENT_MODELS\` unset and an
\`ANTHROPIC_API_KEY\` present, Dédalo builds an implicit one-model catalog and this is the
model id it asks for. As soon as you declare an explicit catalog, this parameter is
ignored — each catalog entry carries its own model id.

Change it to move the single implicit model up or down a generation (a faster, cheaper
model for a small installation; a more capable one for heavy cataloguing work). The
default is \`"claude-opus-4-8"\`.

\`\`\`bash
AGENT_MODEL="claude-opus-4-8"
\`\`\``,
	},
	ANTHROPIC_API_KEY: {
		type: 'string',
		scope: 'secret',
		default: undefined,
		heading: 'Defining the Anthropic API key',
		typeLabel: 'string',
		doc: `The credential the assistant sends to Anthropic. It is used by every catalog entry
whose provider is \`anthropic\` and does not name its own key variable, and it is what makes
the implicit (zero-configuration) catalog exist at all: with no key and no
\`DEDALO_AGENT_MODELS\`, the assistant has no models and stays disabled.

The engine fails closed without it — a conversation with an Anthropic model refuses rather
than silently trying an unauthenticated call. It is a secret: keep it in \`../private/.env\`,
never in a repository. There is no default.

\`\`\`bash
ANTHROPIC_API_KEY="sk-ant-..."
\`\`\``,
	},
	DEDALO_AGENT_ALLOW_EXTERNAL_PROVIDER_DEFAULT: {
		type: 'boolean',
		scope: 'operator',
		default: false,
		heading: 'Allowing record content to reach external models',
		typeLabel: 'bool',
		doc: `This parameter decides whether a conversation held with an **external** model (one whose
catalog egress class is \`external\` — any model whose API call leaves your server) may
receive the content of your records at all. It is the privacy switch for institutions whose
data may not leave the building.

With the default \`false\`, an external conversation still works: the model can use the
discovery tools that describe the ontology (section names, field maps, relational paths),
and it can answer general questions — but **every tool call that would return record content
is refused** with an \`egress_restricted\` message, and the user is steered to a local model,
which is never gated. Set it to \`true\` to let external conversations read record content,
minus whatever you list in \`DEDALO_RAG_EXTERNAL_PROVIDER_FORBIDDEN_SECTIONS\`.

Note what the gate does *not* cover: the user's own question and any image they attach
travel to whichever model they picked — that is the user's own act. The gate protects the
repository, not the user's words.

\`\`\`bash
DEDALO_AGENT_ALLOW_EXTERNAL_PROVIDER_DEFAULT=false
\`\`\``,
	},
	DEDALO_AGENT_ALLOW_WRITE: {
		type: 'boolean',
		scope: 'operator',
		default: false,
		heading: 'Allowing the assistant to propose changes',
		typeLabel: 'bool',
		doc: `This parameter exposes the assistant's write tools and the change-plan flow. With the
default \`false\` the assistant is strictly read-only: the write tools are not even listed to
the model, and a call to one is refused.

Even when it is \`true\` the assistant never writes on its own. Write mode makes it produce a
**change plan** that a human reads and confirms; only that confirmation executes, and every
gate is re-checked at execution time — the user's own permissions, the per-record scope, and
the section allowlist (\`DEDALO_AGENT_WRITE_SECTIONS\`). Two limits are worth knowing before
you enable it: writes always run as the logged-in user (never as a service identity), and
write mode is **refused to global-admin sessions** — an administrator's unlimited reach must
not be lent to a model.

\`\`\`bash
DEDALO_AGENT_ALLOW_WRITE=false
\`\`\``,
	},
	DEDALO_AGENT_HTTP_ENABLED: {
		type: 'boolean',
		scope: 'operator',
		default: false,
		heading: 'Enabling the in-app assistant',
		typeLabel: 'bool',
		doc: `The master switch for the assistant inside the Dédalo client: the chat panel, the model
list, and the streaming answer. With the default \`false\` every assistant request is refused
like an unknown action, and the panel reports the feature as disabled — the rest of the
application is unaffected.

Turn it on once you have declared at least one model (\`DEDALO_AGENT_MODELS\`, or an
\`ANTHROPIC_API_KEY\` for the implicit catalog); with the switch on but no usable model the
assistant reports that none is configured. Enabling it grants no write capability by itself —
see \`DEDALO_AGENT_ALLOW_WRITE\`.

\`\`\`bash
DEDALO_AGENT_HTTP_ENABLED=true
\`\`\``,
	},
	DEDALO_AGENT_MAX_TOKENS: {
		type: 'number',
		scope: 'operator',
		default: 16000,
		heading: 'Defining the assistant output limit',
		typeLabel: 'int',
		doc: `The maximum number of tokens the assistant may produce in a single model turn. It caps
the length of one answer (and the cost of one runaway generation); it does not cap the
conversation, which may take several turns.

Raise it if long answers are being cut off mid-sentence, lower it to keep spend predictable.
A model catalog entry may override it with its own \`max_tokens\` — the entry always wins. A
missing or non-positive value falls back to the default \`16000\`.

\`\`\`bash
DEDALO_AGENT_MAX_TOKENS=16000
\`\`\``,
	},
	DEDALO_AGENT_MODELS: {
		type: 'json_array',
		scope: 'operator',
		default: undefined,
		heading: 'Defining the assistant model catalog',
		typeLabel: 'array of objects (JSON)',
		doc: `The list of models the assistant may use — the one place a deployment declares what the
user can pick from, and where each model's answers travel. It is a JSON array; each entry
takes \`id\`, \`label\` (what the user sees), \`provider\` (\`anthropic\` or \`openai_compatible\`),
\`model\` (the provider's own model id), and optionally \`endpoint\`, \`api_key_env\` (the NAME of
another variable holding the key — never the key itself), \`egress\` (\`local\` or \`external\`),
\`vision\`, \`max_tokens\` and \`timeout_s\`. The first entry is the default choice.

The catalog is validated fail-closed on every request: malformed JSON, an unknown field or a
single bad entry disables the assistant rather than half-enabling it. An \`anthropic\` entry is
always \`external\` — its call leaves your server, and declaring it \`local\` is rejected as a
configuration error. An \`openai_compatible\` entry must carry an \`endpoint\` and an explicit
\`egress\`, so that calling a model "local" is always a conscious statement. That egress class
is what the privacy gate acts on (see
\`DEDALO_AGENT_ALLOW_EXTERNAL_PROVIDER_DEFAULT\`).

Leave it unset for the zero-configuration case: a single Anthropic model, but only if
\`ANTHROPIC_API_KEY\` is set — otherwise the assistant stays disabled.

\`\`\`bash
DEDALO_AGENT_MODELS=[{"id":"local","label":"Llama 3.1 (local, private)","provider":"openai_compatible","model":"llama3.1:70b","endpoint":"http://127.0.0.1:11434/v1/chat/completions","egress":"local"},{"id":"claude","label":"Claude (external)","provider":"anthropic","model":"claude-opus-4-8","vision":true}]
\`\`\``,
	},
	DEDALO_AGENT_SYSTEM_PROMPT_APPEND: {
		type: 'string',
		scope: 'operator',
		default: undefined,
		heading: 'Defining the deployment prompt text',
		typeLabel: 'string',
		doc: `Free text appended to the assistant's built-in instructions, so it knows where it is
working. Use it for the facts a model cannot guess: what the institution holds, which
language its labels are in, which collection is the important one.

It is added *after* the built-in rules, which it can extend but never reorder or remove — the
safety and permission instructions are not overridable from configuration. The text is read
at boot and is the same for every conversation, so it stays in the cached part of the prompt
and costs nothing per question. Unset by default.

\`\`\`bash
DEDALO_AGENT_SYSTEM_PROMPT_APPEND="This is the archive of the Museum of X. Prefer Catalan (lg-cat) labels when they exist. The oral-history collection is sensitive."
\`\`\``,
	},
	DEDALO_AGENT_WRITE_SECTIONS: {
		type: 'string_list',
		scope: 'operator',
		default: undefined,
		heading: 'Defining the assistant writable sections',
		typeLabel: 'string[]',
		doc: `A comma-separated list of section \`tipo\`s the assistant's change plans may touch. It
narrows write mode to the part of the repository you are willing to let a model propose edits
in — a cataloguing section, say, and nothing else. A plan naming any other section is refused
before it reaches the database.

Read the default carefully: **unset (or empty) means no narrowing at all** — with
\`DEDALO_AGENT_ALLOW_WRITE=true\` and this list empty, a confirmed plan may write to any
section the logged-in user could already edit through the client. The allowlist is a
restriction, not a grant: it can only take sections away, never add permission the user does
not have. It has no effect while write mode is off.

\`\`\`bash
DEDALO_AGENT_WRITE_SECTIONS=oh1,rsc197
\`\`\``,
	},
	DEDALO_MCP_ALLOW_WRITE: {
		type: 'boolean',
		scope: 'operator',
		default: false,
		heading: 'Allowing writes in the stand-alone tool server',
		typeLabel: 'bool',
		doc: `Exposes the write tools in the **stand-alone tool server** — the separate process that
offers Dédalo's tools to an external AI client over a local pipe. With the default \`false\`
that server registers read tools only, and a write call is refused as read-only.

This is not the in-app assistant (that one is governed by \`DEDALO_AGENT_ALLOW_WRITE\`);
enabling one does nothing to the other. When you do enable it, remember that the tool server
acts as ONE fixed user (\`DEDALO_MCP_USER_ID\`) for its whole lifetime: every write is checked
against that user's permissions and record scope, so give it a real, narrowly-privileged
cataloguing user — never an administrator. Write mode refuses a global-admin or superuser
identity outright.

\`\`\`bash
DEDALO_MCP_ALLOW_WRITE=false
\`\`\``,
	},
	DEDALO_MCP_MEDIA_IMPORT_DIR: {
		type: 'string',
		scope: 'operator',
		default: undefined,
		heading: 'Defining the media import directory',
		typeLabel: 'string',
		doc: `The one directory from which the stand-alone tool server may ingest a media file **by
path**. Unset by default, and unset means the whole path-based branch is disabled: a tool
call that names a file path is refused, and media can only be uploaded as inline data.

Point it at a dedicated staging directory (an ingest drop-box), never at a home directory or
the media store itself. Every requested path is resolved to its real location and must land
inside this directory — a \`..\` traversal or a symbolic link that points outside is refused,
not followed.

\`\`\`bash
DEDALO_MCP_MEDIA_IMPORT_DIR="/var/dedalo/ingest"
\`\`\``,
	},
	DEDALO_MCP_MEDIA_MAX_BYTES: {
		type: 'number',
		scope: 'operator',
		default: 10485760,
		heading: 'Defining the media import size limit',
		typeLabel: 'int',
		doc: `The largest media file, in bytes, the stand-alone tool server will accept in one upload
tool call — whether it arrives as inline data or from the import directory. Anything larger is
refused with a "too large" message.

Raise it if you ingest high-resolution masters through the tool server; the default is
\`10485760\` (10 MiB). The value must be a plain positive integer of bytes: a value the engine
cannot read as one (\`10MB\`, \`0\`, empty) falls back to that default rather than removing the
limit.

\`\`\`bash
DEDALO_MCP_MEDIA_MAX_BYTES=10485760
\`\`\``,
	},
	DEDALO_MCP_USER_ID: {
		type: 'number',
		scope: 'operator',
		default: undefined,
		heading: 'Defining the tool-server service user',
		typeLabel: 'int',
		doc: `The Dédalo user the **stand-alone tool server** acts as. That server has no login: it
resolves this one identity at startup and keeps it for the whole process lifetime — every
tool call it serves is authorized against this user's permissions and record scope, exactly as
if that person had done it in the client. There is no tool to change identity mid-flight.

It is required by that server and by nothing else: the Dédalo server itself boots without it,
and the in-app assistant never uses it (it always acts as the logged-in browser user). A
missing or non-integer value is a hard startup error for the tool server — it refuses to start
rather than fall back to a privileged identity. Set it to the \`section_id\` of a user in the
users section; \`-1\` is the superuser and is acceptable only in trusted local development, and
read-only even there.

\`\`\`bash
DEDALO_MCP_USER_ID=42
\`\`\``,
	},
	DEDALO_MCP_WRITE_SECTIONS: {
		type: 'string_list',
		scope: 'operator',
		default: undefined,
		heading: 'Defining the tool-server writable sections',
		typeLabel: 'string[]',
		doc: `A comma-separated list of section \`tipo\`s the stand-alone tool server's write tools may
target. A write call addressing any other section is refused before the engine is reached.

As with the assistant's twin setting, **unset (or empty) means no narrowing**: with
\`DEDALO_MCP_ALLOW_WRITE=true\` and this list empty, the tool server may write to every section
its service user (\`DEDALO_MCP_USER_ID\`) is already allowed to edit. The list only ever removes
sections — it cannot grant permission that user does not have. It has no effect while write
mode is off.

\`\`\`bash
DEDALO_MCP_WRITE_SECTIONS=rsc197
\`\`\``,
	},
	DEDALO_RAG_BATCH_SIZE: {
		type: 'number',
		scope: 'operator',
		default: 32,
		heading: 'Defining the embedding batch size',
		typeLabel: 'int',
		doc: `How many text fragments Dédalo sends to the embedding service in one request while
indexing. It is a throughput knob for the indexer, invisible to end users.

Larger batches index a big collection faster but make each request heavier — lower it if your
embedding service times out or runs out of memory, raise it if indexing is slow and the
service has headroom. It only applies when an external embedding service is configured
(\`DEDALO_RAG_EMBEDDING_PROVIDER=sidecar\`). Unset or non-positive falls back to \`32\`.

\`\`\`bash
DEDALO_RAG_BATCH_SIZE=32
\`\`\``,
	},
	DEDALO_RAG_CHUNK_STRATEGY: {
		type: 'string',
		scope: 'operator',
		default: 'structural_semantic',
		heading: 'Defining the chunking strategy',
		typeLabel: 'string',
		doc: `How Dédalo cuts a long text into the fragments it indexes for semantic search. Two
strategies exist:

* \`structural_semantic\` (the default) — split on the text's own structure (headings,
  paragraphs, transcription time-codes), then also where the meaning shifts, so a fragment
  stays about one thing;
* \`structural\` — split on structure only. Cheaper and fully deterministic; a reasonable
  choice for short, uniform fields.

A component may override the installation-wide choice in the ontology
(\`properties.rag.strategy\`). Changing this value only affects fragments produced from then
on — re-index a section if you want the whole of it recut.

\`\`\`bash
DEDALO_RAG_CHUNK_STRATEGY="structural_semantic"
\`\`\``,
	},
	DEDALO_RAG_CHUNK_TOKENS: {
		type: 'number',
		scope: 'operator',
		default: 450,
		heading: 'Defining the maximum fragment size',
		typeLabel: 'int',
		doc: `The largest fragment, in tokens, the chunker will emit. Bigger fragments carry more
context into an answer but blur the match — the embedding of a long passage is an average of
everything in it, so a precise question retrieves it less sharply. Smaller fragments match
precisely but may arrive without the sentence that explains them.

450 suits the descriptive prose typical of catalogue records. Raise it for long-form
transcriptions where an answer usually needs a whole paragraph; lower it for short, dense
fields. A component may override it in the ontology (\`properties.rag\`).

Changing this only affects fragments produced from then on — re-index a section to recut it.

\`\`\`bash
DEDALO_RAG_CHUNK_TOKENS=450
\`\`\``,
	},
	DEDALO_RAG_CHUNK_MIN_TOKENS: {
		type: 'number',
		scope: 'operator',
		default: 120,
		heading: 'Defining the minimum fragment size',
		typeLabel: 'int',
		doc: `The floor, in tokens, below which the chunker will not leave a fragment standing on its
own: a shorter one is merged into its neighbour. Without a floor, a heading or a one-line
field becomes a fragment of its own, and such a fragment matches many questions weakly and
none of them well.

Lower it only if your records genuinely carry meaning in very short fields.

\`\`\`bash
DEDALO_RAG_CHUNK_MIN_TOKENS=120
\`\`\``,
	},
	DEDALO_RAG_SEMANTIC_BREAKPOINT_THRESHOLD: {
		type: 'number',
		scope: 'operator',
		default: 0.92,
		heading: 'Defining the semantic breakpoint sensitivity',
		typeLabel: 'float',
		doc: `Under the \`structural_semantic\` strategy, how different two consecutive passages must be
before the chunker cuts between them. It is a similarity threshold between 0 and 1: the cut
is made when similarity falls *below* it.

A HIGHER value cuts more eagerly (more, tighter fragments); a lower value cuts only at a
pronounced change of subject (fewer, broader fragments). 0.92 is deliberately close to 1 —
catalogue prose tends to stay on topic, so only a clear shift should split a record.

Has no effect under the \`structural\` strategy.

\`\`\`bash
DEDALO_RAG_SEMANTIC_BREAKPOINT_THRESHOLD=0.92
\`\`\``,
	},
	DEDALO_RAG_DB_HOSTNAME_CONN: {
		type: 'string',
		scope: 'operator',
		default: undefined,
		heading: 'Defining the semantic index database connection',
		typeLabel: 'string',
		doc: `The host of the vector database. Set it only when the semantic index lives on a
**different** database server than the catalogue: when unset (the default), Dédalo reuses the
main database's host, and the same goes for \`DEDALO_RAG_DB_PORT_CONN\`,
\`DEDALO_RAG_DB_USERNAME_CONN\` and \`DEDALO_RAG_DB_PASSWORD_CONN\`. The typical installation sets
none of them.

Give it a host name or IP; a path is also accepted and is treated as a socket directory. A
Unix socket set in \`DEDALO_RAG_DB_SOCKET_CONN\` wins over this value.

\`\`\`bash
DEDALO_RAG_DB_HOSTNAME_CONN="10.0.0.42"
\`\`\``,
	},
	DEDALO_RAG_DB_NAME: {
		type: 'string',
		scope: 'operator',
		default: undefined,
		heading: 'Defining the semantic index database',
		typeLabel: 'string',
		doc: `The name of the database that holds the semantic index — the vectors and the indexed text
fragments. It is deliberately **separate** from the catalogue database: nothing in it is
irreplaceable, since the whole index can be rebuilt from the records at any time.

Leave it unset unless you host several installations on one database server and need distinct
index databases. Unset, Dédalo uses the compatibility spelling \`RAG_DB_NAME\` if present, and
otherwise \`dedalo7_rag\`.

\`\`\`bash
DEDALO_RAG_DB_NAME="dedalo7_rag"
\`\`\``,
	},
	DEDALO_RAG_DB_PASSWORD_CONN: {
		type: 'string',
		scope: 'secret',
		default: undefined,
		heading: 'Defining the semantic index database connection',
		typeLabel: 'string',
		doc: `The password used to connect to the vector database. Needed only when the semantic index
lives on a different database server (or under a different role) than the catalogue: unset,
Dédalo reuses the main database password.

It is a secret — keep it in \`../private/.env\`. An empty value is a legitimate configuration
when the vector database authenticates by trust or peer.

\`\`\`bash
DEDALO_RAG_DB_PASSWORD_CONN="•••••"
\`\`\``,
	},
	DEDALO_RAG_DB_PORT_CONN: {
		type: 'number',
		scope: 'operator',
		default: undefined,
		heading: 'Defining the semantic index database connection',
		typeLabel: 'int',
		doc: `The port of the vector database server. Set it only when the semantic index lives on a
different server, or on a non-standard port; unset (the default), Dédalo reuses the main
database's port. A value that is not a positive number is ignored and the main database's port
is used.

\`\`\`bash
DEDALO_RAG_DB_PORT_CONN=5432
\`\`\``,
	},
	DEDALO_RAG_DB_SOCKET_CONN: {
		type: 'string',
		scope: 'operator',
		default: '',
		heading: 'Defining the semantic index database connection',
		typeLabel: 'string',
		doc: `The Unix socket directory of the vector database, for a local connection that does not go
through the network stack. When set it **wins** over the host and port settings.

Leave it empty (the default) to connect over the network — that is what an installation whose
vector database sits on a separate server needs.

\`\`\`bash
DEDALO_RAG_DB_SOCKET_CONN="/var/run/postgresql"
\`\`\``,
	},
	DEDALO_RAG_DB_USERNAME_CONN: {
		type: 'string',
		scope: 'operator',
		default: undefined,
		heading: 'Defining the semantic index database connection',
		typeLabel: 'string',
		doc: `The role used to connect to the vector database. Set it only when the semantic index lives
on a different database server, or is owned by a different role, than the catalogue; unset (the
default), Dédalo reuses the main database user.

\`\`\`bash
DEDALO_RAG_DB_USERNAME_CONN="dedalo"
\`\`\``,
	},
	DEDALO_RAG_EMBEDDABLE_MODELS: {
		type: 'string_list',
		scope: 'operator',
		default: ['component_text_area', 'component_input_text', 'component_text'],
		heading: 'Defining the embeddable component models',
		typeLabel: 'string[]',
		doc: `Which kinds of component may be considered for the semantic index at all — a coarse,
installation-wide filter applied before the ontology's own opt-in. Only components whose model
is on this list are examined; of those, only the ones that declare \`properties.rag.embed\` are
actually indexed. So this list never indexes anything by itself; it bounds what could be.

The default covers the text-bearing components (\`component_text_area\`, \`component_input_text\`,
\`component_text\`). Extend it only if you have another text-carrying component model you want
searchable. Accepts a comma-separated list or a JSON array.

\`\`\`bash
DEDALO_RAG_EMBEDDABLE_MODELS=component_text_area,component_input_text,component_text
\`\`\``,
	},
	DEDALO_RAG_EMBEDDING_ENDPOINT: {
		type: 'string',
		scope: 'operator',
		default: '',
		heading: 'Defining the embedding service endpoint',
		typeLabel: 'string',
		doc: `The base URL of the embedding service that turns text into vectors. It is **required** for
real semantic search: with \`DEDALO_RAG_EMBEDDING_PROVIDER=sidecar\` but no endpoint, Dédalo
silently keeps the built-in development embedder, whose results are reproducible but not
meaningful.

Dédalo posts the fragments to \`{endpoint}/embed\` and expects the vectors back. Any transport
failure is treated as a retryable indexing failure — a failed batch is never written as
garbage vectors. Empty by default.

\`\`\`bash
DEDALO_RAG_EMBEDDING_ENDPOINT="http://127.0.0.1:8085"
\`\`\``,
	},
	DEDALO_RAG_EMBEDDING_MODEL: {
		type: 'string',
		scope: 'operator',
		default: 'bge-m3',
		heading: 'Defining the embedding model',
		typeLabel: 'string',
		doc: `The model name Dédalo asks the embedding service for. It is also the **partition key** of
the semantic index: vectors are stored per model, so two models never contaminate each other's
results.

Because of that, changing this value on a populated installation does not convert the existing
index — it starts a new one, and the records must be re-indexed under the new model before
searches see them again. The default is \`"bge-m3"\`, a multilingual model that suits a
multi-language archive. It only applies when an external embedding service is configured.

\`\`\`bash
DEDALO_RAG_EMBEDDING_MODEL="bge-m3"
\`\`\``,
	},
	DEDALO_RAG_EMBEDDING_PROVIDER: {
		type: 'string',
		scope: 'operator',
		default: '',
		heading: 'Defining the embedding provider',
		typeLabel: 'string',
		doc: `Which embedder produces the vectors behind semantic search. Set it to \`sidecar\` to use a
real embedding service — and then \`DEDALO_RAG_EMBEDDING_ENDPOINT\` must be set too, or Dédalo
falls back to the built-in one.

The default (empty) selects the built-in **development embedder**: it runs offline, needs no
service and no key, and is perfectly reproducible — which makes it right for a test
installation and wrong for a real one, because it matches words rather than meaning. Any
production installation that wants genuine semantic search runs a service and sets \`sidecar\`.

\`\`\`bash
DEDALO_RAG_EMBEDDING_PROVIDER="sidecar"
\`\`\``,
	},
	DEDALO_RAG_ENABLED: {
		type: 'boolean',
		scope: 'operator',
		default: false,
		heading: 'Enabling semantic search',
		typeLabel: 'bool',
		doc: `The master switch for semantic search: the vector index, the indexing that follows a save,
and the search and question-answering actions built on them. With the default \`false\` the
subsystem costs nothing — no indexing work is queued when a record is saved, and every
semantic-search request is declined.

Turning it on is only the first half of the decision: nothing is indexed until you also opt
each section and component in through the ontology (\`properties.rag\`), so enabling the switch
never sweeps the whole repository into an index by surprise. It needs the vector database to
exist (see \`DEDALO_RAG_DB_NAME\`).

\`\`\`bash
DEDALO_RAG_ENABLED=true
\`\`\``,
	},
	DEDALO_RAG_EXTERNAL_PROVIDER_FORBIDDEN_SECTIONS: {
		type: 'string_list',
		scope: 'operator',
		default: undefined,
		heading: 'Defining sections forbidden to external providers',
		typeLabel: 'string[]',
		doc: `A comma-separated list of section \`tipo\`s whose content must **never** reach a model
hosted outside your server — the never-egress list. It is the one place an institution names
its protected material (an oral-history collection, a donor file), and it is honoured by both
AI surfaces: the assistant's conversations and the semantic question-answering. One
classification, applied twice.

It outranks the permissive setting: a section on this list stays restricted even with
\`DEDALO_AGENT_ALLOW_EXTERNAL_PROVIDER_DEFAULT=true\`. The gate errs towards refusal — a request
that merely *mentions* a forbidden section in a filter, or whose answer would surface a linked
record from one, is refused whole rather than trimmed, because a filter over protected values
answers questions about them just as surely as reading them does. Local models are never
gated, so the honest fallback is always available to the user.

Empty by default (nothing is on the list). Naming a section here does not hide it from the
people who may see it — it only stops it from leaving.

\`\`\`bash
DEDALO_RAG_EXTERNAL_PROVIDER_FORBIDDEN_SECTIONS=oh1,rsc45
\`\`\``,
	},
	DEDALO_RAG_PROVIDER_TIMEOUT: {
		type: 'number',
		scope: 'operator',
		default: 30,
		heading: 'Defining the embedding service timeout',
		typeLabel: 'int',
		doc: `How long, **in seconds**, Dédalo waits for the embedding service to answer one batch before
giving up on it. A timed-out batch is a retryable indexing failure, never a partial write.

Raise it if you embed long transcriptions on a service without hardware acceleration and see
indexing failures; lower it to fail fast on an unresponsive service. Unset or non-positive
falls back to \`30\`.

\`\`\`bash
DEDALO_RAG_PROVIDER_TIMEOUT=30
\`\`\``,
	},
	DEDALO_RAG_RRF_K: {
		type: 'number',
		scope: 'operator',
		default: 60,
		heading: 'Defining the hybrid ranking constant',
		typeLabel: 'int',
		doc: `A tuning constant of the hybrid ranking. A semantic search runs two searches — one on
meaning (vectors), one on words (full text) — and merges the two rankings by position rather
than by score, since the scores are not comparable. This value damps how much the very top
positions dominate that merge.

It is a fine-tuning knob most installations never touch: a lower value gives the leaders of
each list more weight, a higher one flattens the two lists together. Unset or non-positive
falls back to \`60\`, the widely used value.

\`\`\`bash
DEDALO_RAG_RRF_K=60
\`\`\``,
	},
	RAG_DB_NAME: {
		type: 'string',
		scope: 'operator',
		default: 'dedalo7_rag',
		heading: 'Defining the semantic index database',
		typeLabel: 'string',
		doc: `The compatibility spelling of the vector-database name, still honoured so that an
installation configured before \`DEDALO_RAG_DB_NAME\` existed keeps working untouched.

Use \`DEDALO_RAG_DB_NAME\` in new installations; it wins whenever both are present. With
neither set, the database is \`dedalo7_rag\`.

\`\`\`bash
RAG_DB_NAME="dedalo7_rag"
\`\`\``,
	},
} as const satisfies Record<string, CatalogEntry>;
