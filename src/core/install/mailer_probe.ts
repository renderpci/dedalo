/**
 * Install-wizard SMTP probe — verifies the POSTED outbound-email settings
 * (connection + STARTTLS/SSL + authentication) before the wizard persists them
 * as DEDALO_SMTP_* keys. Model: db_probe.ts. No email is sent — nodemailer's
 * verify() runs the SMTP handshake (EHLO, TLS upgrade, AUTH) and quits.
 *
 * The runtime consumer of the persisted keys is core/mailer/mailer.ts; the
 * secure-mode mapping here matches it exactly, and TLS peer verification is
 * ALWAYS on (WC-023 D1 — never disableable; pin a private CA via
 * NODE_EXTRA_CA_CERTS). Never throws: the wizard shows the probe report inline.
 */

import nodemailer from 'nodemailer';

/** A PROBE ANSWER (see db_probe_plan.ts DbProbeResult): a refused relay is the outcome, not a throw. */
export interface MailerProbeResult {
	ok: boolean;
	msg: string;
}

/** Handshake timeout: long enough for a slow relay, short enough for a wizard. */
const PROBE_TIMEOUT_MS = 10_000;

export async function testMailerConnection(o: Record<string, unknown>): Promise<MailerProbeResult> {
	const host = String(o.smtp_host ?? '').trim();
	if (host === '') {
		return { ok: false, msg: 'SMTP host is required' };
	}
	const secure = String(o.smtp_secure ?? 'tls').toLowerCase();
	const user = String(o.smtp_user ?? '');

	try {
		const transporter = nodemailer.createTransport({
			host,
			port: Number(o.smtp_port ?? 587) || 587,
			// 'ssl' = implicit TLS (SMTPS); 'tls' = STARTTLS upgrade; 'none' = plain.
			secure: secure === 'ssl',
			requireTLS: secure !== 'ssl' && secure !== 'none',
			ignoreTLS: secure === 'none',
			...(user !== '' ? { auth: { user, pass: String(o.smtp_pass ?? '') } } : {}),
			connectionTimeout: PROBE_TIMEOUT_MS,
			greetingTimeout: PROBE_TIMEOUT_MS,
		});
		await transporter.verify();
		return { ok: true, msg: 'OK. SMTP connection and authentication verified' };
	} catch (error) {
		// Surface the transport error verbatim — the operator needs the relay's
		// reason (wrong port, refused AUTH, TLS mismatch) to fix the form.
		const detail = (error as Error).message ?? String(error);
		return { ok: false, msg: `SMTP connection failed: ${detail}` };
	}
}
