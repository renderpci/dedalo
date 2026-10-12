/**
 * THE TERMINAL INSTALLER'S PROSE (phase 2, 2026-10-12) — every sentence the
 * screen model (screen_model.ts) puts on a screen, in ONE place, English,
 * owned by the installer.
 *
 * NOT the wizard's `installation_*` labels: those die with the wizard (phase 5),
 * and pinning them here would keep ~47 dead labels alive. Translation, if it is
 * ever wanted, is an installer-owned catalog (owner flag 1). The ONE shared
 * text is the password policy's rule list, which belongs to component_password
 * and lives in src/core/labels/master.json (`password_rule_*`) — read there,
 * never copied (screen_model.ts passwordFeedback).
 *
 * Plain data: no imports, no logic beyond string templates. Every value is
 * passed through the plain UI's sanitizer before it reaches a terminal; what
 * comes from a catalog (an ontology server's names) is untrusted and is never
 * part of this file.
 */

/** The docs the Install-type and Review screens link (the docs site's own URLs). */
export const HELP_LINKS = Object.freeze({
	guide: { label: 'Install guide', url: 'https://dedalo.dev/docs/v7/install/' },
	reference: {
		label: 'Installer reference',
		url: 'https://dedalo.dev/docs/v7/install/installer_reference/',
	},
	production: {
		label: 'Production install',
		url: 'https://dedalo.dev/docs/v7/install/production/',
	},
	multiInstance: {
		label: 'Several instances on one host',
		url: 'https://dedalo.dev/docs/v7/install/multi_instance/',
	},
	docker: { label: 'Docker install', url: 'https://dedalo.dev/docs/v7/install/docker/' },
});

/** Screen titles and descriptions, by screen id. */
export const SCREEN_TEXT: Readonly<Record<string, { title: string; description: string }>> =
	Object.freeze({
		route: {
			title: 'Install type',
			description: 'How will this Dédalo run? The steps that follow adapt to the route.',
		},
		system: {
			title: 'System check',
			description: 'What this machine has. A failed row must be fixed before the install.',
		},
		database: {
			title: 'Database',
			description: 'PostgreSQL for the records, the ontology and the search stores.',
		},
		image: { title: 'Image', description: 'Which Dédalo image the stack runs.' },
		tls_address: { title: 'TLS & address', description: 'How browsers reach the stack.' },
		containers: {
			title: 'Containers',
			description: 'Where the stack keeps its data and how it is published.',
		},
		identity: {
			title: 'Identity',
			description:
				'Who this installation belongs to. The install fingerprint can never change later.',
		},
		web_tls: { title: 'Web server & TLS', description: 'How browsers reach this instance.' },
		services: {
			title: 'Services',
			description: 'Where this instance keeps its media and listens for the web server.',
		},
		ontologies: {
			title: 'Ontologies',
			description:
				'What kind of collection is this? The core is always installed; declared dependencies tick themselves.',
		},
		thesauri: {
			title: 'Thesauri',
			description:
				'The thesauri your ontologies declare are pre-ticked. Untick what you do not need.',
		},
		languages: {
			title: 'Languages',
			description: 'The languages the records and the interface use.',
		},
		publication: {
			title: 'Publication',
			description:
				'Optional. Publish records to a public website database (diffusion, MariaDB). Can be added later from Maintenance.',
		},
		mail: {
			title: 'Mail',
			description:
				'Optional. Outgoing mail through an existing SMTP relay: password recovery sends an 8-digit code by mail. Dédalo runs no mail server of its own.',
		},
		administrator: {
			title: 'Administrator',
			description:
				'The root account manages users, ontologies and maintenance. Its password is set here, in the terminal.',
		},
		review: {
			title: 'Review plan',
			description: 'Everything that will happen, before anything runs. Nothing has changed yet.',
		},
	});

/** One question's label and description, by answer key (or question id for keyless ones). */
export const QUESTION_TEXT: Readonly<Record<string, { label: string; description: string }>> =
	Object.freeze({
		route: { label: 'Install type', description: 'Pick the route.' },
		instance: {
			label: 'Instance name',
			description:
				'A short name for this instance (e.g. prado): lowercase letters, digits and _. Its database, role, media and socket derive from it, so several Dédalo instances can share this host.',
		},
		db_hostname: {
			label: 'Database host',
			description: 'Host name or address of the PostgreSQL server.',
		},
		db_port: { label: 'Database port', description: 'TCP port of the PostgreSQL server.' },
		db_socket: {
			label: 'Database socket',
			description:
				'Absolute path of the PostgreSQL socket directory, to connect through it instead of TCP. Empty = TCP.',
		},
		db_database: { label: 'Database name', description: 'The database to install into.' },
		db_username: {
			label: 'Database role',
			description: 'The PostgreSQL role that owns the database.',
		},
		db_password: {
			label: 'Database password',
			description: 'Empty for a peer or trust connection.',
		},
		entity: {
			label: 'Entity code',
			description:
				'A short code for the institution: a letter, then letters, digits and _. It becomes a directory and a key prefix.',
		},
		entity_label: { label: 'Entity name', description: 'The full name shown to users.' },
		information: {
			label: 'Information',
			description:
				'The install fingerprint, written once to ts_state.json and never changed later. The engine only uses it to read passwords migrated from a v6 install; keep the default unless you are moving a v6 installation.',
		},
		info_key: {
			label: 'Info key',
			description:
				'The short key of the install fingerprint (see Information). Never changed later.',
		},
		timezone: { label: 'Time zone', description: 'An IANA time zone (e.g. Europe/Madrid).' },
		locale: { label: 'Locale', description: 'A BCP 47 locale tag (e.g. es-ES).' },
		media_path: {
			label: 'Media directory',
			description:
				'Absolute path where images, documents and recordings are stored (often its own volume).',
		},
		unix_socket: {
			label: 'Server socket',
			description: 'Absolute path of the unix socket the web server proxies to.',
		},
		media_access_mode: {
			label: 'Media access mode',
			description:
				'private = only logged-in users read media; publication = published media is public too; false = no control.',
		},
		update_servers: {
			label: 'Update servers',
			description: 'Where ontology and code updates come from. Nothing installs by itself.',
		},
		ontology_source: {
			label: 'Offline ontology package',
			description:
				'A directory or .tar.gz in the ontology server export layout; empty = built-in oh only.',
		},
		ontologies: {
			label: 'Ontologies',
			description: 'Tick the domain ontologies this collection needs.',
		},
		hierarchies: {
			label: 'Thesauri',
			description: 'Tick the thesauri to install. Only country toponymies ship terms.',
		},
		langs: {
			label: 'Languages',
			description: 'The working languages: records can be written in each of them.',
		},
		app_lang_default: {
			label: 'Interface language',
			description: 'The default interface language (one of the ticked languages).',
		},
		data_lang_default: {
			label: 'Data language',
			description: 'The default language records are written in (one of the ticked languages).',
		},
		diffusion: {
			label: 'Publish to a website',
			description: 'Set up diffusion to a MariaDB website database now.',
		},
		mysql_hostname: { label: 'MariaDB host', description: 'Host of the website database.' },
		mysql_port: { label: 'MariaDB port', description: 'TCP port of the website database.' },
		mysql_socket: {
			label: 'MariaDB socket',
			description: 'Absolute socket path, instead of TCP. Empty = TCP.',
		},
		mysql_database: {
			label: 'Website database',
			description: 'The MariaDB database publication writes to.',
		},
		mysql_username: {
			label: 'MariaDB user',
			description: 'The MariaDB user publication writes as.',
		},
		mysql_password: { label: 'MariaDB password', description: 'The password of that user.' },
		mailer: {
			label: 'Send mail through an SMTP relay',
			description: 'Needed for password recovery by mail.',
		},
		smtp_host: { label: 'SMTP server', description: 'Host name of the relay.' },
		smtp_port: { label: 'SMTP port', description: '587 for STARTTLS, 465 for implicit TLS.' },
		smtp_secure: { label: 'SMTP security', description: 'How the connection is encrypted.' },
		smtp_user: { label: 'SMTP user', description: 'The mailbox the relay authenticates.' },
		smtp_pass: { label: 'SMTP password', description: 'The password of that mailbox.' },
		smtp_from: {
			label: 'From address',
			description: 'The sender address; empty uses the SMTP user.',
		},
		smtp_from_name: { label: 'From name', description: 'The sender name shown to recipients.' },
		root_password: {
			label: 'Root password',
			description: 'Never written to the plan file, the log or the shell history.',
		},
		'route.trial_no_media_protection': {
			label: 'Trial without media protection',
			description:
				'The trial stack has NO media access control: anyone who can reach this server can read every image, document and recording in it, without logging in. Fine for a public collection or an evaluation; never for a restricted fonds, an embargoed deposit or personal data. Type yes to accept.',
		},
		'thesauri.none_selected': {
			label: 'No thesaurus selected',
			description:
				'The install will carry no thesaurus beyond Languages. Thesauri can be installed later from Maintenance › Install hierarchies. Type yes to continue without one.',
		},
		'publication.probe_override': {
			label: 'Keep the publication settings untested',
			description:
				'The MariaDB connection did not pass. Type yes to keep these settings anyway (shown on the review).',
		},
		'mail.probe_override': {
			label: 'Keep the mail settings untested',
			description:
				'The SMTP test did not pass. Type yes to keep these settings anyway (shown on the review).',
		},
	});

/** The route options. */
export const ROUTE_TEXT = Object.freeze({
	production: {
		label: 'Production',
		badge: 'recommended for a museum',
		description:
			'Native services on this host (systemd, nginx or Apache, TLS, backups, watchdog); a named instance that can share the server with others.',
	},
	docker: {
		label: 'Docker',
		badge: 'compose stack',
		description: 'Containers for Dédalo, PostgreSQL and the web server; volumes on this host.',
	},
	trial: {
		label: 'Trial',
		badge: 'Docker without media protection',
		description:
			'The Docker stack WITHOUT media access control: any file is served to anyone with its URL. Evaluation only.',
	},
	developer: {
		label: 'Developer',
		badge: 'from a git checkout',
		description: 'bun run dev against a local PostgreSQL.',
	},
});

/** The choice options' own words. */
export const OPTION_TEXT = Object.freeze({
	update_servers: {
		official: (url: string) => ({
			label: 'Official Dédalo servers',
			description: `Ontology and code updates are offered from ${url} (Maintenance; never automatic).`,
		}),
		none: {
			label: 'None (air-gapped)',
			description:
				'No update server is configured (ONTOLOGY_SERVERS and CODE_SERVERS are written empty): no update is ever offered, and only the built-in oh ontology can be installed unless an offline package is given.',
		},
	},
	media_access_mode: {
		'': { label: 'Engine default', description: 'Not written; the engine default applies.' },
		private: { label: 'private', description: 'Only logged-in users read media.' },
		publication: {
			label: 'publication',
			description: 'Logged-in users read everything; anyone reads published media.',
		},
		false: { label: 'false', description: 'No media access control.' },
	} as Record<string, { label: string; description: string }>,
	smtp_secure: {
		tls: { label: 'STARTTLS', description: 'Plain connection upgraded to TLS (port 587).' },
		ssl: { label: 'Implicit TLS', description: 'TLS from the first byte (port 465).' },
		none: { label: 'None', description: 'Unencrypted: only on a trusted local relay.' },
	} as Record<string, { label: string; description: string }>,
});

/** The marks an option can carry, as words (a screen reader reads them). */
export const MARK_TEXT = Object.freeze({
	core: 'always installed',
	default: 'default',
	ships_terms: 'ships terms',
	empty: 'definition, you fill it',
	needed_by: (by: readonly string[]) => `needed by ${by.join(', ')}`,
	recommended_by: (by: readonly string[]) => `strongly recommended by ${by.join(', ')}`,
	also_installs: (tlds: readonly string[]) => `also installs ${tlds.join(', ')}`,
	undeclared_vendored: 'dependencies not declared (built-in file predates them)',
	undeclared_server: 'dependencies not declared by its source',
});

/** The explanatory notes under a TLD — one per ontology_choice.ts ONTOLOGY_NOTE_LABELS key (gated equal). */
export const ONTOLOGY_NOTE_TEXT: Readonly<Record<string, string>> = Object.freeze({
	oh: 'Oral history: interviews, their audiovisual recordings, transcriptions and indexing. Built in — installable without a network.',
	tch: 'Tangible cultural heritage: the general inventory model for objects and collections. Downloaded from the update server.',
});

/** Every other sentence a screen shows. */
export const NOTICE_TEXT = Object.freeze({
	coreOntologies: (tlds: readonly string[]) => `Always installed: ${tlds.join(', ')} (core).`,
	coreThesauri: (labels: readonly string[]) => `Always installed: ${labels.join(', ')}.`,
	airGapped:
		'Air-gapped: ONTOLOGY_SERVERS and CODE_SERVERS are written empty — no update is ever offered. Only oh is offered unless an offline package is given.',
	onlyOh: 'Air-gapped without an offline package: only oh is offered.',
	catalogUnreachable: (msg: string) =>
		`The ontology catalog could not be read (${msg}) — only the built-in ontologies are offered.`,
	catalogSource: (label: string) => `Ontologies offered by ${label}.`,
	thesauriIntro:
		'Thesauri ship EMPTY by design — definitions you fill — except the country toponymies, which ship their terms. A large country toponymy uses database space and import time.',
	// The example code is a REAL tld of the vendored offer (gated: install_screen_model_tripwire).
	toponymyExample: 'np',
	toponymy: (example: string) =>
		`No country toponymy selected. Type a country code (e.g. ${example}) to add one, or press enter to skip.`,
	databasePrerequisite:
		'The database must exist and be EMPTY, owned by the role below (it creates tables, indexes and functions): CREATE DATABASE <name> OWNER <role>.',
	databaseProbe: (msg: string) => `Database check: ${msg}`,
	noMail: 'Without mail, a forgotten password needs the server console.',
	probeOk: (msg: string) => `Check passed: ${msg}`,
	probeFailed: (msg: string) => `Check failed: ${msg}`,
	systemVersion: (version: string, seed: string) => `Dédalo ${version} · seed ${seed}`,
	systemSummary: (failed: number, warned: number) =>
		failed === 0
			? `System ready${warned === 0 ? '' : ` (${warned} warning${warned === 1 ? '' : 's'})`}.`
			: `${failed} check${failed === 1 ? '' : 's'} failed — fix ${failed === 1 ? 'it' : 'them'} and re-check.`,
	secretsElsewhere:
		'On this route the passwords are given to install.sh (or DEDALO_INSTALL_* in the container run), not here.',
	envSecret: 'supplied by the environment — kept',
	trialProbesSkipped:
		'The stack is not running yet, so the connection is tested by the install inside the container.',
	mediaPrerequisite:
		'Phase-4 host steps are manual today: create the instance user ded_<instance>, its media directory and its PostgreSQL role and database as docs/install/multi_instance.md shows, BEFORE the install.',
	mediaProbe: (msg: string) => `Media directory: ${msg}`,
	reviewEnvHelp:
		'The .env keys below are written to <private>/.env (0600); the values are never shown here.',
	reviewDockerOnly:
		'Docker and trial host steps: run install.sh (it brings the stack up and runs this installer inside the container). Here you can write the answers.',
	reviewInstallOffered: 'Type install to start, or edit a step.',
});

/** The placeholder screens' manual steps (the host automation is phase 4). */
export const PLACEHOLDER_TEXT = Object.freeze({
	web_tls:
		'The web server site and the certificate are configured by hand today: docs/install/production.md §11 (reverse proxy, TLS and media access). The installer will add them in a later release.',
	services:
		'The systemd units, the watchdog and the backups are configured by hand today: docs/install/production.md §10 and docs/install/multi_instance.md. The installer will add them in a later release.',
	image: 'install.sh chooses and verifies the image today (docs/install/docker.md).',
	tls_address:
		'install.sh asks for the certificate and the address today (docs/install/docker.md).',
	containers: 'install.sh writes the compose environment today (docs/install/docker.md).',
	administrator_stack:
		'On this route install.sh asks for the root password and passes it to the container run.',
});

/** The review's line labels. */
export const REVIEW_TEXT = Object.freeze({
	route: 'route',
	instance: 'instance',
	database: 'database',
	ontologies: 'ontologies',
	thesauri: 'thesauri',
	languages: 'languages',
	publication: 'publication',
	mail: 'mail',
	media: 'media',
	socket: 'socket',
	admin: 'administrator',
	steps: 'steps',
	envKeys: '.env keys',
	planFile: 'plan file',
	sameAs: 'same as',
	prerequisites: 'before the install',
	off: 'off',
	tested: 'tested',
	untested: 'not tested',
	acknowledged: 'kept untested (acknowledged)',
	passwordSet: 'root · password set',
	passwordMissing: 'root · password NOT set',
	notWritten: 'not written (engine default)',
});

/**
 * The end of a run, in ONE place: the plain CLI prints these sentences and the
 * full-screen Done screen shows them (scripts/install.ts plainReporter,
 * ui/screens/done.ts).
 */
export const DONE_TEXT = Object.freeze({
	complete: (verified: boolean) => `install complete${verified ? ' — root login verified' : ''}`,
	supervisor:
		'Start the server under its supervisor (systemd: `systemctl enable --now dedalo-ts` — docs/install/production.md) or with `bun run start:supervised`; plain `bun run start` is unsupervised and cannot take code updates.',
	aborted: 'install aborted — what the install created is removed; the database itself is kept.',
	browser:
		'Then open the web interface and log in as root: Maintenance installs further thesauri and toponymies, restores a backup and offers updates.',
	written: (path: string) => `answers written to ${path} (no secret is in it)`,
	writtenNext:
		'Run the install from them with: bun run scripts/install.ts --answers <file> (the passwords via DEDALO_INSTALL_* or --secrets-stdin).',
	saltStored: "A generated secret is also stored in the install's private .env (0600).",
});
