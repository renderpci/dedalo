/**
 * CONFIG CATALOG — domain: error_report
 *
 * GENERATED SCAFFOLD (probe_emit_catalog.ts). Hand-edit from here on.
 */

import type { CatalogEntry } from '../catalog_types.ts';

export const ERROR_REPORT_KEYS = {
	DEDALO_ERROR_REPORT_ALLOWED_IPS: {
		type: 'string',
		scope: 'operator',
		default: undefined,
		heading: 'Error reports: reporter IP allowlist',
		typeLabel: 'string',
		doc: `Only meaningful on the **master** installation (the one that receives reports). A
comma-separated list of the IP addresses allowed to reach the intake; a report from any
other address is refused. The shorthand \`loopback\` accepts the local machine.

Unset (the default) leaves the intake open to any address — it is still anonymous,
rate-limited and size-capped, but if you know which installations report to you, listing
them here is the cheapest way to keep everyone else out.

\`\`\`bash
DEDALO_ERROR_REPORT_ALLOWED_IPS="loopback,203.0.113.10,203.0.113.11"
\`\`\``,
	},
	DEDALO_ERROR_REPORT_MASTER_URL: {
		type: 'string',
		scope: 'operator',
		default: undefined,
		heading: 'Error reports: master installation URL',
		typeLabel: 'string',
		doc: `The JSON API endpoint of the **master** installation this Dédalo sends its error
reports to. **Setting it is what enables reporting**: with a master URL configured, global
administrators get a report button on every page, from which they can describe a problem
and send it — together with the page context and any JavaScript errors captured since the
page loaded — to the maintainers. Nothing ever leaves the machine without that explicit
click.

Leave it unset if this installation does not report anywhere. \`https\` is required (plain
\`http\` is accepted only for a loopback target while developing).

\`\`\`bash
DEDALO_ERROR_REPORT_MASTER_URL="https://master.example.org/dedalo/core/api/v1/json/"
\`\`\``,
	},
	DEDALO_ERROR_REPORT_RECEIVER: {
		type: 'boolean',
		scope: 'operator',
		default: false,
		heading: 'Error reports: act as the receiver',
		typeLabel: 'bool',
		doc: `Set to \`true\` **only on the designated master installation** — the one other
Dédalos point at with their master URL. It opens the intake endpoint that stores the
incoming reports, and it turns on the *Error reports* widget of the maintenance dashboard,
where an administrator can browse what has arrived.

The default is \`false\`, and while it is off the endpoint is indistinguishable from an
action that does not exist. A normal installation never turns this on.

\`\`\`bash
DEDALO_ERROR_REPORT_RECEIVER=true
\`\`\``,
	},
	DEDALO_ERROR_REPORT_RETENTION_DAYS: {
		type: 'number',
		scope: 'operator',
		default: 90,
		heading: 'Error reports: retention',
		typeLabel: 'int',
		doc: `Only meaningful on the **master** installation. Received reports older than this many
days are pruned. Default \`90\`; \`0\` keeps them forever.

Reports are user-written text and can quote record data, so a bounded retention is the
recommended posture — shorten it if your institution's data-protection policy asks for it.

\`\`\`bash
DEDALO_ERROR_REPORT_RETENTION_DAYS=90
\`\`\``,
	},
	DEDALO_ERROR_REPORT_TIMEOUT_MS: {
		type: 'number',
		scope: 'operator',
		default: 10000,
		heading: 'Error reports: relay timeout',
		typeLabel: 'int',
		doc: `How long (in milliseconds) this server waits for the master installation to accept a
relayed report before giving up. Default \`10000\` (ten seconds), minimum \`1000\`.

Raise it if the master is reached over a slow link and administrators see reports fail to
send; a timeout only loses that one report, it never blocks the user's work.

\`\`\`bash
DEDALO_ERROR_REPORT_TIMEOUT_MS=10000
\`\`\``,
	},
	DEDALO_ERROR_REPORT_TOKEN: {
		type: 'string',
		scope: 'secret',
		default: undefined,
		heading: 'Error reports: shared token',
		typeLabel: 'string',
		doc: `An optional shared secret sent with every relayed report and checked by the master
installation, which rejects a report that does not carry the matching value. It is a spam
filter, not authentication: the sending server, not the browser, adds it.

Both ends must hold the **same** value — set it on the master and on each installation
that reports to it. This is a **secret**: the shipped template carries a placeholder only,
so pick a long random string and set it for real. When it is unset on the master, the
check is skipped and any report is accepted (still rate-limited and size-capped).

\`\`\`bash
DEDALO_ERROR_REPORT_TOKEN="a-long-random-shared-secret"
\`\`\``,
	},
} as const satisfies Record<string, CatalogEntry>;
