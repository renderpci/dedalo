<?php declare(strict_types=1);

require_once __DIR__ . '/../../class.config_scope.php';
require_once __DIR__ . '/../../class.config_merge.php';
require_once __DIR__ . '/../../class.config_key.php';

// Outgoing email (SMTP relay) + password-recovery tunables.
// Consumed by core/dd_mailer (class.dd_mailer.php) and core/password_reset
// (class.password_reset.php). Dédalo never runs its own MTA: mail is relayed
// through an existing mailbox over SMTP. Leave DEDALO_SMTP_HOST unset to disable
// all outgoing mail (dd_mailer::is_configured() returns false). Per-install values
// go in ../private/.env (DEDALO_SMTP_PASS is a SECRET, env-only — never compiled).
return [
	// SMTP transport
	new config_key(
		path:    'mailer.smtp.host',
		const:   'DEDALO_SMTP_HOST',
		type:    'string',
		default: null,
		doc:     'SMTP server hostname for outgoing mail (e.g. password recovery). Null/empty disables all outgoing mail.',
	),
	new config_key(
		path:    'mailer.smtp.port',
		const:   'DEDALO_SMTP_PORT',
		type:    'int',
		default: 587,
		doc:     'SMTP port. 587 = STARTTLS, 465 = SMTPS.',
	),
	new config_key(
		path:    'mailer.smtp.secure',
		const:   'DEDALO_SMTP_SECURE',
		type:    'string',
		default: 'tls',
		doc:     "Transport security: 'tls' (STARTTLS), 'ssl' (SMTPS) or 'none'.",
	),
	new config_key(
		path:    'mailer.smtp.user',
		const:   'DEDALO_SMTP_USER',
		type:    'string',
		default: null,
		doc:     'SMTP auth username (mailbox login). Null/empty = no authentication.',
	),
	new config_key(
		path:    'mailer.smtp.password',
		const:   'DEDALO_SMTP_PASS',
		type:    'string',
		scope:   config_scope::SECRET,
		doc:     'SMTP auth password (env-only; never compiled).',
	),
	new config_key(
		path:    'mailer.smtp.from',
		const:   'DEDALO_SMTP_FROM',
		type:    'string',
		default: null,
		doc:     'From address (a mailbox the relay owns). Falls back to DEDALO_SMTP_USER when null.',
	),
	new config_key(
		path:    'mailer.smtp.from_name',
		const:   'DEDALO_SMTP_FROM_NAME',
		type:    'string',
		default: 'Dédalo',
		doc:     'Optional From display name.',
	),
	new config_key(
		path:    'mailer.smtp.verify_peer',
		const:   'DEDALO_SMTP_VERIFY_PEER',
		type:    'bool',
		default: true,
		doc:     'Verify the SMTP server TLS certificate. Keep true in production.',
	),
	// Password-recovery tunables (core/password_reset)
	new config_key(
		path:    'mailer.password_reset.code_ttl',
		const:   'DEDALO_PWRESET_CODE_TTL',
		type:    'int',
		default: 600,
		doc:     'Password-recovery code lifetime in seconds.',
	),
	new config_key(
		path:    'mailer.password_reset.max_attempts',
		const:   'DEDALO_PWRESET_MAX_ATTEMPTS',
		type:    'int',
		default: 5,
		doc:     'Wrong-code guesses allowed per recovery code before it is voided.',
	),
];
