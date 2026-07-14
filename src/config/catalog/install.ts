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
		doc: `This parameter defines which addresses may reach the install wizard.

A fresh installation has no users yet, so the wizard cannot ask anyone to log in: until the installation is SEALED (the last step of the wizard), its actions are reachable without a password by whoever can open the page. That is harmless on a laptop and dangerous on a network. Set this parameter — a comma-separated list of addresses, where the word \`loopback\` stands for the local machine — before you expose an unsealed installation to anything but yourself.

Unset, the wizard is open to any address, which is the convenient default for a local installation. The address is taken from the trusted hop reported by the web server in front of Dédalo, so behind a proxy \`loopback\` will NOT match: name the real address of the machine you install from. Once the installation is sealed, the whole install surface answers "not found" for good and this parameter no longer matters.

\`\`\`bash
DEDALO_INSTALL_ALLOWED_IPS="loopback,203.0.113.10"
\`\`\``,
	},
	DEDALO_INSTALL_NO_RESTART: {
		type: 'string',
		scope: 'internal',
		default: undefined,
		heading: 'Suppressing the post-install restart',
		typeLabel: 'bool',
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
