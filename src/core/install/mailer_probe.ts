/**
 * Install-wizard SMTP probe — verifies the POSTED outbound-email settings
 * (connection + STARTTLS/SSL + authentication) before the wizard persists them
 * as DEDALO_SMTP_* keys. Model: db_probe.ts. No email is sent — nodemailer's
 * verify() runs the SMTP handshake (EHLO, TLS upgrade, AUTH) and quits.
 *
 * The runtime consumer of the persisted keys is core/mailer/mailer.ts; the
 * secure-mode mapping here matches it exactly, and TLS peer verification is
 * ALWAYS on (WC-023 D1 — never disableable; pin a private CA via
 * NODE_EXTRA_CA_CERTS). Never throws: the wizard shows {result,msg} inline.
 */

import nodemailer from 'nodemailer';

export interface MailerProbeResult {
	result: boolean;
	msg: string;
}

/** Handshake timeout: long enough for a slow relay, short enough for a wizard. */
const PROBE_TIMEOUT_MS = 10_000;

export async function testMailerConnection(o: Record<string, unknown>): Promise<MailerProbeResult> {
	const host = String(o.smtp_host ?? '').trim();
	if (host === '') {
		return { result: false, msg: 'SMTP host is required' };
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
		return { result: true, msg: 'OK. SMTP connection and authentication verified' };
	} catch (error) {
		// Surface the transport error verbatim — the operator needs the relay's
		// reason (wrong port, refused AUTH, TLS mismatch) to fix the form.
		const detail = (error as Error).message ?? String(error);
		return { result: false, msg: `SMTP connection failed: ${detail}` };
	}
}
