<?php declare(strict_types=1);

require_once __DIR__ . '/../../class.config_scope.php';
require_once __DIR__ . '/../../class.config_merge.php';
require_once __DIR__ . '/../../class.config_key.php';

/**
 * mailer domain — SMTP relay (core/dd_mailer) + password-reset knobs
 * (core/password_reset). Optional: the mailer stays disabled while
 * DEDALO_SMTP_HOST is empty (dd_mailer::is_configured() gates on !empty(host)),
 * so empty defaults keep these features dormant. DEDALO_SMTP_PASS is SECRET.
 *
 * @return config_key[]
 */
return [
	// SMTP relay
	new config_key(path: 'mailer.smtp.host', const: 'DEDALO_SMTP_HOST', type: 'string', default: '', doc: 'SMTP server hostname. Empty = mailer disabled.'),
	new config_key(path: 'mailer.smtp.port', const: 'DEDALO_SMTP_PORT', type: 'int', default: 587, doc: 'SMTP port: 587 (STARTTLS) or 465 (SMTPS).'),
	new config_key(path: 'mailer.smtp.secure', const: 'DEDALO_SMTP_SECURE', type: 'string', default: 'tls', doc: "Transport security: 'tls' (STARTTLS) | 'ssl' (SMTPS) | 'none'."),
	new config_key(path: 'mailer.smtp.user', const: 'DEDALO_SMTP_USER', type: 'string', default: '', doc: 'SMTP auth username (mailbox login). Empty = no auth.'),
	new config_key(path: 'mailer.smtp.pass', const: 'DEDALO_SMTP_PASS', type: 'string', scope: config_scope::SECRET, doc: 'SMTP auth password (env-only; never compiled).'),
	new config_key(path: 'mailer.smtp.from', const: 'DEDALO_SMTP_FROM', type: 'string', default: '', doc: 'From address (a mailbox the relay owns). Falls back to SMTP_USER.'),
	new config_key(path: 'mailer.smtp.from_name', const: 'DEDALO_SMTP_FROM_NAME', type: 'string', default: 'Dédalo', doc: 'Optional From display name.'),
	new config_key(path: 'mailer.smtp.verify_peer', const: 'DEDALO_SMTP_VERIFY_PEER', type: 'bool', default: true, doc: 'TLS certificate verification. Keep true.'),

	// Password reset
	new config_key(path: 'mailer.pwreset.code_ttl', const: 'DEDALO_PWRESET_CODE_TTL', type: 'int', default: 600, doc: 'Seconds a recovery code stays valid.'),
	new config_key(path: 'mailer.pwreset.max_attempts', const: 'DEDALO_PWRESET_MAX_ATTEMPTS', type: 'int', default: 5, doc: 'Wrong-code guesses per issued code before it is voided.'),
];
