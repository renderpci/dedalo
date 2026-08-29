/**
 * CONFIG CATALOG — domain: sitebuilder
 *
 * The engine's connection to the standalone Site Builder daemon
 * (publication/site_builder). The topology is 1:1 and fixed: one museum is one complete
 * Dédalo install paired with exactly ONE site-builder instance, so this engine holds ONE
 * daemon address and there is no tenant map on either side.
 *
 * TWO TRANSPORTS, ONE PAIRING. A provisioned daemon publishes no TCP listener at all: it
 * answers on a per-instance unix socket owned `<service user>:<engine group>`, mode 0660,
 * so the engine can open it because it GROUP-OWNS it and no other uid on the host —
 * another museum's service user included — can connect. That is
 * `DEDALO_SITE_BUILDER_SOCKET`, and it is what the daemon's own provisioner renders into
 * the pairing fragment an operator appends here. `DEDALO_SITE_BUILDER_URL` remains for a
 * daemon reached over the network (a separate host, a laptop, a reverse proxy).
 *
 * `DEDALO_SITE_BUILDER_INSTANCE` names the tenancy the engine is paired with, and it is
 * REQUIRED as soon as either transport is set: the engine proves the pairing before it
 * sends anything (see that key's prose), and it cannot prove what it was never told.
 *
 * When no transport is set the feature does not exist on this install: the
 * tool_sitebuilder tool hides itself (its isAvailable returns false).
 */

import type { CatalogEntry } from '../catalog_types.ts';

export const SITEBUILDER_KEYS = {
	DEDALO_SITE_BUILDER_URL: {
		type: 'string',
		scope: 'operator',
		default: undefined,
		heading: 'Defining the site builder service URL',
		typeLabel: 'string',
		typeSuffix: '*optional*',
		doc: `This parameter is the base URL of the **Site Builder** service — the standalone daemon that lets your users build their own public websites over the published data by talking to a coding agent.

The daemon is a separate deployable (\`publication/site_builder\`) and may run on another host, typically the one that already serves the publication API and its MariaDB. Point this key at the address your reverse proxy publishes it under, including the base path, for example \`https://sites.example.org/publication/site_builder\`.

**A daemon installed on this same host does not need it.** A provisioned instance publishes no network port: it answers on a private unix socket, which you name with \`DEDALO_SITE_BUILDER_SOCKET\` instead. Set this key only when the daemon really is reached over the network. When BOTH are set the socket is the transport, and this URL contributes only its path prefix and its host name (the daemon is mounted under a base path, \`/publication/site_builder\` by default).

Leave both **unset** and the feature does not exist on this install: the site-builder tool hides itself from every toolbar and its actions refuse. Set a transport, set \`DEDALO_SITE_BUILDER_INSTANCE\` to the museum the daemon serves, set \`DEDALO_SITE_BUILDER_TOKEN\` to match the daemon's \`SERVICE_TOKEN\`, grant the tool to the users who should build sites, and they get a workspace where an agent writes the site, a live preview, and a gated publish to production.

\`\`\`bash
DEDALO_SITE_BUILDER_URL="https://sites.example.org/publication/site_builder"
\`\`\``,
	},
	DEDALO_SITE_BUILDER_SOCKET: {
		type: 'string',
		scope: 'operator',
		default: undefined,
		heading: 'Defining the site builder unix socket',
		typeLabel: 'string',
		typeSuffix: '*optional*',
		doc: `The absolute path of the **unix socket** the Site Builder daemon listens on, for a daemon installed on this same machine. When it is set, the socket **is** the transport: the engine dials it directly and never opens a network connection.

This is what a provisioned daemon offers, and it is preferred over a URL wherever it is available. The daemon's installer creates one socket per instance — \`/run/dedalo-sites/<instance>/daemon.sock\` — owned by the daemon's own service user with the **engine's group**, mode \`0660\`. The engine may open it because it group-owns it; no other account on the machine can connect at all, including another museum's daemon or another museum's engine. There is no port to firewall, no token travelling over a network interface, and no way for a second install on the same host to reach this one's daemon.

The path is **not a secret** — it already contains the instance name, the directory above it is world-traversable, and the access decision is the operating system's, not the path's obscurity.

You will not normally type this key by hand: the daemon's provisioner writes an engine pairing fragment (\`<config dir>/engine.env.fragment\`) carrying exactly these lines, and you append it to this file. When both this key and \`DEDALO_SITE_BUILDER_URL\` are set, the socket wins and the URL is used only for the path prefix and the host name.

\`\`\`bash
DEDALO_SITE_BUILDER_SOCKET="/run/dedalo-sites/example/daemon.sock"
\`\`\``,
	},
	DEDALO_SITE_BUILDER_INSTANCE: {
		type: 'string',
		scope: 'operator',
		default: undefined,
		heading: 'Defining the paired site builder instance',
		typeLabel: 'string',
		typeSuffix: '*required when a site builder transport is set*',
		doc: `The name of the site-builder **instance** — the tenancy — this install is paired with. One museum is one Dédalo install and one site-builder instance, so this is a single fixed name, never a list and never something a user chooses at run time.

**It is required as soon as \`DEDALO_SITE_BUILDER_URL\` or \`DEDALO_SITE_BUILDER_SOCKET\` is set**, and without it the site-builder tool stays hidden exactly as if nothing were configured. That is not bookkeeping. Before every request, the engine asks the daemon for its identity and refuses to send anything unless it matches: it computes a fingerprint from this name together with \`DEDALO_SITE_BUILDER_TOKEN\`, and the daemon computes the same fingerprint from its own instance name and its own \`SERVICE_TOKEN\`. Equal fingerprints prove both that this is the right daemon and that the two sides hold the same credential — and they prove it without either side ever disclosing the name or the token.

The failure that pays for: a private configuration file copied from one museum's server to another's is the single easiest mistake to make in a fleet, and a wrongly pointed engine is not a broken feature — it is one museum's staff driving an agent inside another museum's website, spending that museum's budget and publishing on that museum's public address. With this key set, that arrangement refuses on the first call instead of working.

The value must equal the daemon's \`DEDALO_SITE_INSTANCE\`. The daemon's provisioner writes it into the engine pairing fragment for you, so appending that fragment sets it correctly.

\`\`\`bash
DEDALO_SITE_BUILDER_INSTANCE="example"
\`\`\``,
	},
	DEDALO_SITE_BUILDER_TOKEN: {
		type: 'string',
		scope: 'secret',
		default: undefined,
		heading: 'Defining the site builder service token',
		typeLabel: 'string',
		doc: `The shared bearer token the engine presents to the Site Builder daemon on every call. It MUST equal the daemon's own \`SERVICE_TOKEN\` (the daemon's installer generates one and prints it).

It is also one half of the pairing proof: together with \`DEDALO_SITE_BUILDER_INSTANCE\` it produces the fingerprint the engine checks against the daemon's before it sends anything, so a token that does not match refuses at the door rather than after the fact.

The engine is the daemon's only client and its only authorizer: it authenticates the Dédalo user, decides who may build and who may publish, then calls the daemon with this token and the acting user's identity. The token is what proves the request came from the engine and not from anyone who can reach the daemon's port.

It is a secret: keep it in \`../private/.env\`, never in a repository. There is no default — without it (and without the URL) the feature is simply off.

\`\`\`bash
DEDALO_SITE_BUILDER_TOKEN="..."
\`\`\``,
	},
	DEDALO_SITE_BUILDER_TIMEOUT_MS: {
		type: 'number',
		scope: 'operator',
		default: 10000,
		heading: 'Defining the site builder request timeout',
		typeLabel: 'int',
		doc: `How long, in milliseconds, the engine waits for a JSON response from the Site Builder daemon before giving up and reporting the service unreachable. It bounds the ordinary control calls (list sites, start a session, trigger a build); the live event stream a session produces is NOT subject to it — a streamed turn may run for many minutes.

The default is \`10000\` (ten seconds), which is generous for a daemon on the same network. Raise it if the daemon is far away or under load; lower it if you would rather fail fast.

\`\`\`bash
DEDALO_SITE_BUILDER_TIMEOUT_MS=10000
\`\`\``,
	},
} satisfies Record<string, CatalogEntry>;
