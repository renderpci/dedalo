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
		// The host steps (phase 4).
		db_mode: {
			label: 'Database',
			description:
				'create = the installer creates the role and the database on this host (peer login, no password stored); existing = a database you created, probed as it is.',
		},
		web_server: {
			label: 'Web server',
			description:
				"The one that serves this instance. Empty = the one this host has, else nginx. Only this instance's own site file is written.",
		},
		server_name: {
			label: 'Public address',
			description: 'The domain name browsers use (e.g. dedalo.museum.org) — not an IP address.',
		},
		http_port: { label: 'HTTP port', description: 'Plain HTTP (redirects to HTTPS).' },
		https_port: { label: 'HTTPS port', description: 'The port browsers use.' },
		tls_mode: { label: 'Certificate', description: 'Where the TLS certificate comes from.' },
		letsencrypt_email: {
			label: "Let's Encrypt e-mail",
			description: "Expiry notices from Let's Encrypt go here.",
		},
		tls_cert_path: {
			label: 'Certificate file',
			description:
				'The fullchain PEM (certificate + intermediates), absolute path; used where it is.',
		},
		tls_key_path: {
			label: 'Key file',
			description: 'The private key PEM, absolute path; checked against the certificate.',
		},
		backup_dir: {
			label: 'Backup directory',
			description:
				'Where the nightly backup of the database, the media and the configuration goes.',
		},
		image_source: { label: 'Image', description: 'Which Dédalo image the stack runs.' },
		image_repository: {
			label: 'Image repository',
			description: 'Your own registry repository (custom image only).',
		},
		image_version: {
			label: 'Image version',
			description: 'The image tag; empty = the version of this installer.',
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
	db_mode: {
		create: {
			label: 'Create it',
			description: 'The role ded_<instance> and its database, on this host’s PostgreSQL 18.',
		},
		existing: { label: 'Use an existing one', description: 'Probed as it is; nothing is created.' },
	} as Record<string, { label: string; description: string }>,
	web_server: {
		'': { label: 'Detect', description: 'The web server this host has, else nginx.' },
		nginx: {
			label: 'nginx',
			description: 'conf.d/dedalo-<instance>.conf (nginx 1.25.1 or newer).',
		},
		apache: {
			label: 'Apache',
			description: 'One virtual host file; its modules are checked, never enabled.',
		},
	} as Record<string, { label: string; description: string }>,
	tls_mode: {
		letsencrypt: {
			label: "Let's Encrypt",
			description:
				'Issued and renewed automatically (the address must reach this host on port 80).',
		},
		files: {
			label: 'Our own certificate',
			description:
				'Your institution’s fullchain and key, checked against the address and the expiry.',
		},
		local_ca: {
			label: 'Local CA',
			description: 'A certificate from a local authority (internal networks; Docker only).',
		},
	} as Record<string, { label: string; description: string }>,
	image_source: {
		official: { label: 'Official', description: 'The signed Dédalo image, verified before use.' },
		custom: { label: 'Custom', description: 'An image from your own registry.' },
		build: { label: 'Build', description: 'Built here from this checkout.' },
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
	databaseCreated:
		'The installer creates the role and the database on this host (PostgreSQL 18, peer login over the local socket: no database password is stored).',
	stackDbPassword:
		'The database of the stack gets a generated password, written to .dedalo.env (0600) — never shown.',
	hostCommands:
		'Every host command is listed on the Review, exactly as it will run. Packages, repositories and the firewall are never removed or changed behind your back: packages stay installed on --abort, the firewall is only checked.',
	databaseProbe: (msg: string) => `Database check: ${msg}`,
	noMail: 'Without mail, a forgotten password needs the server console.',
	probeOk: (msg: string) => `Check passed: ${msg}`,
	probeFailed: (msg: string) => `Check failed: ${msg}`,
	systemVersion: (version: string, seed: string) => `Dédalo ${version} · seed ${seed}`,
	systemSummary: (failed: number, warned: number) =>
		failed === 0
			? `System ready${warned === 0 ? '' : ` (${warned} warning${warned === 1 ? '' : 's'})`}.`
			: `${failed} check${failed === 1 ? '' : 's'} failed — fix ${failed === 1 ? 'it' : 'them'} and re-check.`,
	envSecret: 'supplied by the environment — kept',
	trialProbesSkipped:
		'The stack is not running yet, so the connection is tested by the install inside the container.',
	mediaProbe: (msg: string) => `Media directory: ${msg}`,
	reviewEnvHelp:
		'The .env keys below are written to <private>/.env (0600); the values are never shown here.',
	reviewRoot:
		'The production route runs as root (sudo sh install.sh); the engine steps then run as the instance user.',
	reviewInstallOffered: 'Type install to start, or edit a step.',
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
	address: 'address',
	certificate: 'certificate',
	backups: 'backups',
	hostCommands: 'host commands',
});

/**
 * The end of a run, in ONE place: the plain CLI prints these sentences and the
 * full-screen Done screen shows them (scripts/install.ts plainReporter,
 * ui/screens/done.ts).
 */
const DONE_TEXT_ENGINE_SUPERVISOR =
	'Start the server under its supervisor (systemd: `systemctl enable --now dedalo-ts` — docs/install/production.md) or with `bun run start:supervised`; plain `bun run start` is unsupervised and cannot take code updates.';
const DONE_TEXT_ENGINE_ABORTED =
	'install aborted — what the install created is removed; the database itself is kept.';

export const DONE_TEXT = Object.freeze({
	complete: (verified: boolean) => `install complete${verified ? ' — root login verified' : ''}`,
	/** The engine-only run's next step (a host route says its own: `next`). */
	supervisor: DONE_TEXT_ENGINE_SUPERVISOR,
	aborted: DONE_TEXT_ENGINE_ABORTED,
	browser:
		'Then open the web interface and log in as root: Maintenance installs further thesauri and toponymies, restores a backup and offers updates.',
	written: (path: string) => `answers written to ${path} (no secret is in it)`,
	writtenNext:
		'Run the install from them with: bun run scripts/install.ts --answers <file> (the passwords via DEDALO_INSTALL_* or --secrets-stdin).',
	saltStored: "A generated secret is also stored in the install's private .env (0600).",
	/** What comes next after a complete install — per route: a host route already started it. */
	next: (ending: DoneEnding): string => {
		if (ending.route === 'production') {
			const unit = `dedalo-ts@${ending.instance}`;
			return `${unit} is running under systemd and starts at boot; its health watchdog and nightly backup timer are armed (systemctl status ${unit} · journalctl -u ${unit}). Do not start dedalo-ts.service — that is the single-instance unit of the manual procedure, not this instance.`;
		}
		if (ending.route === 'docker' || ending.route === 'trial') {
			return 'The stack is up under Docker and restarts with it — `docker compose ps` / `docker compose logs dedalo` from this checkout (with its compose.override.yaml and .dedalo.env).';
		}
		return DONE_TEXT_ENGINE_SUPERVISOR;
	},
	/** The aborted sentence — per route, and whether a live instance was kept. */
	abortedFor: (ending: DoneEnding): string => {
		if (ending.keptLive) {
			return 'install partly undone — the host steps after the engine are undone; the instance itself (its user, database and code) is kept, and --resume puts the undone steps back.';
		}
		if (ending.route === 'production') {
			return "install aborted — what this install created is removed: its site, units, user, directories and, as confirmed, its database and role; the installed packages and any backups are kept.";
		}
		if (ending.route === 'docker' || ending.route === 'trial') {
			return 'install aborted — the stack is down; the files, certificates and volumes this install created are removed (the database volume as confirmed); the image is kept.';
		}
		return DONE_TEXT_ENGINE_ABORTED;
	},
});

/** How a run ended (structurally run_events.ts RunEnding — this file imports nothing). */
interface DoneEnding {
	readonly route: string;
	readonly instance: string;
	readonly keptLive: boolean;
}
