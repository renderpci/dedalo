/**
 * Installer SMTP probe — verifies the POSTED outbound-email settings
 * (connection + STARTTLS/SSL + authentication) before the installer persists them
 * as DEDALO_SMTP_* keys. Model: db_probe.ts. nodemailer's verify() runs the
 * SMTP handshake (EHLO, TLS upgrade, AUTH) and quits; no email is sent — unless
 * the caller names a TEST RECIPIENT (`sendTo`, the terminal installer's mail
 * probe, phase 2): then, after the handshake, ONE test message goes to it from
 * the address the engine would use (smtp_from, else smtp_user — mailer.ts),
 * proving the relay actually accepts mail from this install. The recipient is
 * cleaned and checked with the engine's own rules (mailer.ts cleanEmail /
 * isValidEmail).
 *
 * The runtime consumer of the persisted keys is core/mailer/mailer.ts; the
 * secure-mode mapping here matches it exactly, and TLS peer verification is
 * ALWAYS on (WC-023 D1 — never disableable; pin a private CA via
 * NODE_EXTRA_CA_CERTS). Never throws: the installer prints the probe report.
 */

import nodemailer from 'nodemailer';
import { cleanEmail, isValidEmail } from '../mailer/mailer.ts';

/** A PROBE ANSWER (see db_probe_plan.ts DbProbeResult): a refused relay is the outcome, not a throw. */
export interface MailerProbeResult {
	ok: boolean;
	msg: string;
}

/** Handshake timeout: long enough for a slow relay, short enough for an interactive install. */
const PROBE_TIMEOUT_MS = 10_000;

/** The From the engine sends with (mailer.ts: DEDALO_SMTP_FROM, else DEDALO_SMTP_USER). */
function fromAddress(o: Record<string, unknown>): string {
	const from = String(o.smtp_from ?? '').trim();
	return from !== '' ? from : String(o.smtp_user ?? '').trim();
}

/** The test recipient, cleaned and checked — or the refusal sentence. */
function testRecipient(sendTo: string): { to: string } | { refusal: string } {
	const to = cleanEmail(sendTo);
	return to !== '' && isValidEmail(to)
		? { to }
		: { refusal: 'test recipient is not a valid address' };
}

/** 'ssl' = implicit TLS (SMTPS); 'tls' = STARTTLS upgrade; 'none' = plain (mailer.ts's mapping). */
function secureMode(o: Record<string, unknown>) {
	const secure = String(o.smtp_secure ?? 'tls').toLowerCase();
	return {
		secure: secure === 'ssl',
		requireTLS: secure !== 'ssl' && secure !== 'none',
		ignoreTLS: secure === 'none',
	};
}

/** AUTH when a user is given (none for an open relay). */
function authOf(o: Record<string, unknown>) {
	const user = String(o.smtp_user ?? '');
	return user === '' ? {} : { auth: { user, pass: String(o.smtp_pass ?? '') } };
}

/** The nodemailer transport of the posted settings. */
function probeTransport(o: Record<string, unknown>, host: string) {
	return nodemailer.createTransport({
		host,
		port: Number(o.smtp_port ?? 587) || 587,
		...secureMode(o),
		...authOf(o),
		connectionTimeout: PROBE_TIMEOUT_MS,
		greetingTimeout: PROBE_TIMEOUT_MS,
	});
}

/** The test mail's recipient, or the refusal (null = no test mail asked). */
function testTarget(
	o: Record<string, unknown>,
	sendTo: string | undefined,
): { to: string; from: string } | { refusal: string } | null {
	if (sendTo === undefined) return null;
	const recipient = testRecipient(sendTo);
	if ('refusal' in recipient) return recipient;
	const from = fromAddress(o);
	return from === ''
		? { refusal: 'a test mail needs smtp_from or smtp_user (the From address)' }
		: { to: recipient.to, from };
}

/** Send the ONE test message (after the handshake passed). */
async function sendTestMail(
	transporter: ReturnType<typeof probeTransport>,
	o: Record<string, unknown>,
	target: { to: string; from: string },
): Promise<MailerProbeResult> {
	const fromName = String(o.smtp_from_name ?? '')
		.replace(/[\r\n]/g, '')
		.trim();
	await transporter.sendMail({
		from: fromName !== '' ? { name: fromName, address: target.from } : target.from,
		to: target.to,
		subject: 'Dédalo install test',
		text: 'This message was sent by the Dédalo installer to test the outgoing mail settings. No action is needed.',
	});
	return { ok: true, msg: `OK. SMTP verified and a test mail was sent to ${target.to}` };
}

/** The handshake, then (when asked) the test mail. Throws the transport's error. */
async function handshake(
	o: Record<string, unknown>,
	host: string,
	target: { to: string; from: string } | null,
): Promise<MailerProbeResult> {
	const transporter = probeTransport(o, host);
	await transporter.verify();
	return target === null
		? { ok: true, msg: 'OK. SMTP connection and authentication verified' }
		: sendTestMail(transporter, o, target);
}

/** The test target (null = none asked), or why the probe cannot start — no host, a bad target (ONE refusal exit). */
function preflight(
	o: Record<string, unknown>,
	host: string,
	sendTo: string | undefined,
): { refusal: string } | { target: { to: string; from: string } | null } {
	if (host === '') return { refusal: 'SMTP host is required' };
	const target = testTarget(o, sendTo);
	return target !== null && 'refusal' in target ? target : { target };
}

export async function testMailerConnection(
	o: Record<string, unknown>,
	sendTo?: string,
): Promise<MailerProbeResult> {
	const host = String(o.smtp_host ?? '').trim();
	const checked = preflight(o, host, sendTo);
	if ('refusal' in checked) return { ok: false, msg: checked.refusal };
	try {
		return await handshake(o, host, checked.target);
	} catch (error) {
		return transportFailure(error);
	}
}

/**
 * Surface the transport error verbatim — the operator needs the relay's reason
 * (wrong port, refused AUTH, TLS mismatch) to fix the form.
 */
function transportFailure(error: unknown): MailerProbeResult {
	const detail = (error as Error).message ?? String(error);
	return { ok: false, msg: `SMTP connection failed: ${detail}` };
}
