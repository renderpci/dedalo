/**
 * CONFIG CATALOG — domain: install
 *
 * GENERATED SCAFFOLD (probe_emit_catalog.ts). Hand-edit from here on.
 */

import type { CatalogEntry } from '../catalog_types.ts';

export const INSTALL_KEYS = {
	DEDALO_INSTALL_ALLOWED_IPS: {
		type: 'string',
		scope: 'operator',
		default: undefined,
		heading: 'Restricting the install wizard by address',
		typeLabel: 'string',
		typeSuffix: '*comma list*',
		defaultDoc: 'loopback',
		doc: `This parameter defines which addresses may reach the install wizard.

A fresh installation has no users yet, so the wizard cannot ask anyone to log in: until the installation is SEALED (the last step of the wizard), its actions are reachable without a password by whoever can open the page — and those actions write the configuration file and restart the server. **Unset, the wizard answers the local machine and nobody else.** To install from another machine — which is the normal case for a container, a virtual machine or a hosted server — you must name the address you will browse from, before you start the wizard.

An entry is one of four things: the word \`loopback\` (the local machine), a literal address, a range in CIDR notation such as \`10.0.0.0/24\`, or the word \`any\`, which opens the wizard to every address. Write \`any\` only when nothing else can reach the machine — a firewall, or a laptop with no network — and remove it once the installation is sealed. Separate several entries with commas.

The address is taken from the trusted hop reported by the web server in front of Dédalo, so behind a proxy \`loopback\` will NOT match: name the real address of the machine you install from. If a request arrives with no such information the engine treats it as local, so put the wizard behind the proxy the production guide prescribes, or behind a closed port, whenever the machine is reachable from a network. The effective list is printed in the server log when the engine starts, so an installation you cannot reach tells you why. Once the installation is sealed, the whole install surface answers "not found" for good and this parameter no longer matters.

\`\`\`bash
DEDALO_INSTALL_ALLOWED_IPS="loopback,203.0.113.10,10.0.0.0/24"
\`\`\``,
	},
	DEDALO_INSTALL_NO_RESTART: {
		// A real boolean: restart.ts suppresses the exit for 'true' and restarts for
		// anything else, unset included. Same empty-value rule as 'string' (readers.ts
		// emptyIsUnset), so the declaration changes no boot.
		type: 'boolean',
		scope: 'internal',
		default: false,
		heading: 'Suppressing the post-install restart',
		typeLabel: 'bool',
		typeSuffix: '(optional)',
		doc: `Engine guard, not a setting. When the install wizard writes the configuration, the server must restart to boot into it, which it does by exiting with the code its supervisor respawns on. Set to \`true\`, this suppresses that exit: the test runner and the command-line installer set it so a run cannot kill the process out from under itself.

\`\`\`bash
DEDALO_INSTALL_NO_RESTART=true
\`\`\``,
	},
	DEDALO_INSTALL_PRIVATE_DIR: {
		type: 'string',
		scope: 'operator',
		default: undefined,
		heading: 'Defining the private directory the installer writes to',
		typeLabel: 'string',
		doc: `This parameter defines the directory the installer WRITES to — the configuration file it persists, the state file, the sessions and the backups.

By default that is the \`private\` directory next to the installation, which is where the server also reads its configuration from, and an ordinary installation never sets this key. It exists so that a run which must not touch the live configuration can be pointed somewhere else: the automated checks redirect it to a scratch directory so that a test of the installer can never overwrite the configuration of the machine it runs on.

\`\`\`bash
DEDALO_INSTALL_PRIVATE_DIR="/srv/dedalo_private"
\`\`\``,
	},
	DEDALO_TS_STATE_PATH: {
		type: 'string',
		scope: 'test_seam',
		default: undefined,
		heading: 'Server state file path',
		typeLabel: 'string',
		doc: `Test seam, not a setting. The server keeps its runtime state — the install status, the maintenance-mode flag, the runtime area overrides — in \`ts_state.json\` inside the private directory. This key redirects that file, so the test suite writes its own copy: a test that turns maintenance mode on must never put the live server into maintenance mode, nor leave it there if the run is killed.

\`\`\`bash
DEDALO_TS_STATE_PATH="/tmp/dedalo_test_state.json"
\`\`\``,
	},
} as const satisfies Record<string, CatalogEntry>;
