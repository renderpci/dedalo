/**
 * The boot line for media protection that nobody configured — worded for the
 * server that prints it.
 *
 * Behind a web server (the production topology: unix socket only) the fail-closed
 * default changes what anonymous visitors can read, and on nginx ONLY AFTER A
 * RELOAD — so the line says so. A development server (`SERVER_TCP_PORT`) has no
 * web server in front of its media: the engine serves them to logged-in users
 * itself, and a line about reloading nginx there is noise that teaches people to
 * skip warnings (install campaign 3, C3-60).
 *
 * Pure. Gate: test/unit/test_tooling_socket_native.test.ts.
 */

export function unconfiguredMediaProtectionNotice(mode: string, devListener: boolean): string {
	if (devListener) {
		return (
			`[media_protection] no media access mode is configured (default '${mode}'). This development ` +
			'server has no web server in front of its media, so it shows them to logged-in users itself. ' +
			'An installation behind a web server sets DEDALO_MEDIA_ACCESS_MODE and includes the generated rules.'
		);
	}
	return (
		`[media_protection] no media access mode is configured, so the FAIL-CLOSED DEFAULT '${mode}' applies: ` +
		'logged-in users see everything; anonymous visitors see only media of PUBLISHED records in the ' +
		'public quality folders. Apache picks this up immediately; NGINX NEEDS A RELOAD ' +
		'(include both generated files, then `nginx -t && nginx -s reload`). Set ' +
		'DEDALO_MEDIA_ACCESS_MODE explicitly — including to `false` — to make the choice yours.'
	);
}
