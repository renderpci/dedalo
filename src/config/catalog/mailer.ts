/**
 * CONFIG CATALOG — domain: mailer
 *
 * Outbound email (SMTP relay) + the password-recovery flow that depends on it.
 * Dédalo never runs its own mail server: it relays through an EXISTING mailbox
 * over SMTP. `src/core/mailer/mailer.ts` is the single consumer of the SMTP
 * keys; `src/core/security/password_reset.ts` reads the PWRESET pair.
 */

import type { CatalogEntry } from '../catalog_types.ts';

export const MAILER_KEYS = {
	DEDALO_SMTP_HOST: {
		type: 'string',
		scope: 'operator',
		default: '',
		heading: 'Defining the SMTP server',
		typeLabel: 'string',
		doc: `The hostname of the SMTP server Dédalo relays outbound email through (recovery
codes, notifications). Leaving it empty **disables the mailer entirely** — features
that need email (the login screen's password recovery) will silently skip sending.

\`\`\`bash
DEDALO_SMTP_HOST="smtp.example.org"
\`\`\``,
	},
	DEDALO_SMTP_PORT: {
		type: 'number',
		scope: 'operator',
		default: 587,
		heading: 'Defining the SMTP port',
		typeLabel: 'int',
		doc: `The TCP port of the SMTP server. The default \`587\` is the submission port used
with STARTTLS; use \`465\` with \`DEDALO_SMTP_SECURE='ssl'\` for implicit TLS.

\`\`\`bash
DEDALO_SMTP_PORT=587
\`\`\``,
	},
	DEDALO_SMTP_SECURE: {
		type: 'string',
		scope: 'operator',
		default: 'tls',
		heading: 'Defining the SMTP encryption mode',
		typeLabel: 'string',
		doc: `How the SMTP connection is encrypted:

* \`'tls'\` : STARTTLS on a plain connection (default, pairs with port 587)
* \`'ssl'\` : implicit TLS from the first byte (pairs with port 465)
* \`'none'\` : no encryption — only ever acceptable for a relay on localhost

\`\`\`bash
DEDALO_SMTP_SECURE=tls
\`\`\``,
	},
	DEDALO_SMTP_USER: {
		type: 'string',
		scope: 'operator',
		default: '',
		heading: 'Defining the SMTP credentials',
		typeLabel: 'string',
		doc: `The SMTP AUTH username (usually the mailbox login). Leave it empty for a relay
that accepts unauthenticated mail (e.g. a local MTA).

\`\`\`bash
DEDALO_SMTP_USER="dedalo@example.org"
\`\`\``,
	},
	DEDALO_SMTP_PASS: {
		type: 'string',
		scope: 'secret',
		default: '',
		heading: 'Defining the SMTP credentials',
		typeLabel: 'string',
		doc: `The SMTP AUTH password for \`DEDALO_SMTP_USER\`. Ignored when the user is empty.

\`\`\`bash
DEDALO_SMTP_PASS="my_smtp_password"
\`\`\``,
	},
	DEDALO_SMTP_FROM: {
		type: 'string',
		scope: 'operator',
		default: '',
		heading: 'Defining the From address',
		typeLabel: 'string',
		doc: `The envelope/header From address of outbound mail. It must be an address the
relay is allowed to send as (most providers refuse arbitrary senders). When empty,
\`DEDALO_SMTP_USER\` is used; if both are empty the mailer refuses to send.

\`\`\`bash
DEDALO_SMTP_FROM="dedalo@example.org"
\`\`\``,
	},
	DEDALO_SMTP_FROM_NAME: {
		type: 'string',
		scope: 'operator',
		default: '',
		heading: 'Defining the From address',
		typeLabel: 'string',
		typeSuffix: '(optional)',
		doc: `An optional display name shown next to the From address.

\`\`\`bash
DEDALO_SMTP_FROM_NAME="Dédalo"
\`\`\``,
	},
	DEDALO_PWRESET_CODE_TTL: {
		type: 'number',
		scope: 'operator',
		default: 600,
		heading: 'Defining the password recovery code lifetime',
		typeLabel: 'int',
		doc: `How long, **in seconds**, an emailed password-recovery code stays valid. The code
is single-use and its short life is part of what makes the 8-digit space safe, so
keep this small. Default \`600\` (10 minutes).

\`\`\`bash
DEDALO_PWRESET_CODE_TTL=600
\`\`\``,
	},
	DEDALO_PWRESET_MAX_ATTEMPTS: {
		type: 'number',
		scope: 'operator',
		default: 5,
		heading: 'Defining the password recovery attempt cap',
		typeLabel: 'int',
		doc: `How many wrong guesses are allowed against a single issued recovery code before
it is invalidated and the user must request a new one. Together with the short
\`DEDALO_PWRESET_CODE_TTL\` this caps brute-force odds against the 8-digit code at
a few in a hundred million. Default \`5\`.

\`\`\`bash
DEDALO_PWRESET_MAX_ATTEMPTS=5
\`\`\``,
	},
} as const satisfies Record<string, CatalogEntry>;
