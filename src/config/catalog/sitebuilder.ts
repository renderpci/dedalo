/**
 * CONFIG CATALOG — domain: sitebuilder
 *
 * The engine's connection to the standalone Site Builder daemon
 * (publication/site_builder). The daemon may run on a different host (next to the
 * publication MariaDB + API), so the engine reaches it over HTTP(S) with a shared bearer
 * token. When the URL is unset the feature does not exist on this install: the
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

Leave it **unset** and the feature does not exist on this install: the site-builder tool hides itself from every toolbar and its actions refuse. Set it, set \`DEDALO_SITE_BUILDER_TOKEN\` to match the daemon's \`SERVICE_TOKEN\`, grant the tool to the users who should build sites, and they get a workspace where an agent writes the site, a live preview, and a gated publish to production.

\`\`\`bash
DEDALO_SITE_BUILDER_URL="https://sites.example.org/publication/site_builder"
\`\`\``,
	},
	DEDALO_SITE_BUILDER_TOKEN: {
		type: 'string',
		scope: 'secret',
		default: undefined,
		heading: 'Defining the site builder service token',
		typeLabel: 'string',
		doc: `The shared bearer token the engine presents to the Site Builder daemon on every call. It MUST equal the daemon's own \`SERVICE_TOKEN\` (the daemon's installer generates one and prints it).

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
