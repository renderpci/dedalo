/**
 * CONFIG CATALOG — domain: install
 *
 * GENERATED SCAFFOLD (probe_emit_catalog.ts). Hand-edit from here on.
 */

import type { CatalogEntry } from '../catalog_types.ts';

export const INSTALL_KEYS = {
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
	DEDALO_INSTALL_FAULT: {
		type: 'string',
		scope: 'test_seam',
		default: undefined,
		heading: 'Crashing the terminal installer on purpose',
		typeLabel: 'string',
		doc: `Test seam, not a setting. The resume gate kills the command-line installer at a chosen point to prove that \`--resume\` reaches the same installation as an uninterrupted run. The value is \`<step id>:before\` (the process is killed once the step is recorded as running) or \`<step id>:after\` (once it is recorded as done); any other value refuses the run at startup. It is read from the process environment only, never from the configuration file, so a stray line there can never kill a real installation.

\`\`\`bash
DEDALO_INSTALL_FAULT="install_ontologies:before"
\`\`\``,
	},
	DEDALO_INSTALL_HOST_ROOT: {
		type: 'string',
		scope: 'test_seam',
		default: undefined,
		heading: "Running the installer's host steps against a scratch directory",
		typeLabel: 'string',
		doc: `Test seam, not a setting. The production route's host steps install packages, create a user, write units and a web site, and run systemd — never on a machine that only tests the installer. Set to a directory that carries a \`.dedalo_install_scratch\` marker, this key makes every host path resolve inside it AND replaces every host command with a recording that answers from \`.dedalo_install_scratch/responses.json\` and logs to \`.dedalo_install_scratch/argv.log\` — both in one move, so a run can neither touch the real host with a fake command runner nor run real commands into a scratch tree. A directory without the marker is refused. It is read from the process environment only, never from the configuration file.

\`\`\`bash
DEDALO_INSTALL_HOST_ROOT="/tmp/dedalo_host_scratch"
\`\`\``,
	},
	DEDALO_INSTALL_PROBE_CA_FILE: {
		type: 'string',
		scope: 'test_seam',
		default: undefined,
		heading: 'Trusting a drill certificate authority in the public-address probe',
		typeLabel: 'string',
		doc: `Test seam, not a setting. At the end of a production install the installer requests the instance's public https address and checks the certificate chain against the system's trusted authorities. A rehearsal in a disposable container uses a certificate from its own throw-away authority; this key names that authority's certificate file for the probe only. It is accepted only inside a directory that carries a \`.dedalo_install_drill\` marker, so a stray value can never make the probe trust a certificate the system does not. It is read from the process environment only.

\`\`\`bash
DEDALO_INSTALL_PROBE_CA_FILE="/srv/drill/.dedalo_install_drill/ca.pem"
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
