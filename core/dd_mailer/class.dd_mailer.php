<?php declare(strict_types=1);

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception as PHPMailerException;

/**
* CLASS DD_MAILER
* Thin, transport-agnostic SMTP mailer wrapper for Dédalo.
*
* This is the single place in the codebase that knows how email is sent. It
* relays through an EXISTING mailbox over SMTP (host/port/user/pass from config)
* using the vetted PHPMailer library — Dédalo deliberately does not run its own
* mail server. The rest of the code depends only on dd_mailer::send(), so the
* transport (SMTP today, an HTTP API tomorrow) can be swapped without touching
* callers such as password_reset.
*
* Configuration (defined in config; see config/sample.config.php "// mailer"):
*   DEDALO_SMTP_HOST        string   SMTP server hostname (required to enable mail)
*   DEDALO_SMTP_PORT        int      default 587
*   DEDALO_SMTP_SECURE      string   'tls' (STARTTLS) | 'ssl' (SMTPS) | 'none'
*   DEDALO_SMTP_USER        string   SMTP auth username (mailbox login)
*   DEDALO_SMTP_PASS        string   SMTP auth password
*   DEDALO_SMTP_FROM        string   envelope/header From address (mailbox owned by the relay)
*   DEDALO_SMTP_FROM_NAME   string   optional display name
*   DEDALO_SMTP_VERIFY_PEER bool     default true; never ship with verification off
*
* Security:
* - Recipient is sanitized with component_email::clean_email() (strips CR/LF and
*   header-injection payloads) and validated with is_valid_email().
* - The subject has CR/LF stripped before use.
* - TLS certificate verification is ON by default.
* - Never throws to the caller; returns a {result,msg,errors} object and logs
*   failures server-side. Email content (codes, etc.) is never logged here.
*
* @package Dédalo
* @subpackage Core
*/
final class dd_mailer {



	/**
	* SEND
	* Send a single email through the configured SMTP relay.
	*
	* @param object $options {
	*   to        : string   recipient address (required)
	*   subject   : string   message subject (required)
	*   body_text : string   plain-text body (required)
	*   body_html : ?string  optional HTML body
	*   to_name   : ?string  optional recipient display name
	*   reply_to  : ?string  optional Reply-To address
	* }
	* @return object { result:bool, msg:string, errors:array }
	*/
	public static function send(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Mail not sent';
			$response->errors	= [];

		// configuration guard
			if (!self::is_configured()) {
				$response->msg		= 'Error. Mailer is not configured (DEDALO_SMTP_HOST missing)';
				$response->errors[]	= 'mailer_not_configured';
				debug_log(__METHOD__." Mailer not configured (DEDALO_SMTP_HOST missing)", logger::ERROR);
				return $response;
			}

		// library guard
			if (!class_exists(PHPMailer::class)) {
				$response->msg		= 'Error. PHPMailer library is not available (run composer install)';
				$response->errors[]	= 'mailer_unavailable';
				debug_log(__METHOD__." PHPMailer class not found. Run 'composer require phpmailer/phpmailer'", logger::ERROR);
				return $response;
			}

		// recipient sanitization + validation
			$to = component_email::clean_email((string)($options->to ?? ''));
			if (empty($to) || !component_email::is_valid_email($to)) {
				$response->msg		= 'Error. Invalid recipient address';
				$response->errors[]	= 'invalid_recipient';
				return $response;
			}

		// subject: strip CR/LF to defeat header injection
			$subject = trim(str_replace(["\r", "\n"], '', (string)($options->subject ?? '')));

		// bodies
			$body_text	= (string)($options->body_text ?? '');
			$body_html	= isset($options->body_html) ? (string)$options->body_html : null;
			$to_name	= isset($options->to_name) ? trim(str_replace(["\r", "\n"], '', (string)$options->to_name)) : '';
			$reply_to	= isset($options->reply_to) ? component_email::clean_email((string)$options->reply_to) : null;

		try {
			$mail = new PHPMailer(true);
			$mail->isSMTP();
			$mail->Host			= DEDALO_SMTP_HOST;
			$mail->Port			= defined('DEDALO_SMTP_PORT') ? (int)DEDALO_SMTP_PORT : 587;
			$mail->CharSet		= 'UTF-8';

			// auth
				$smtp_user = defined('DEDALO_SMTP_USER') ? (string)DEDALO_SMTP_USER : '';
				$smtp_pass = defined('DEDALO_SMTP_PASS') ? (string)DEDALO_SMTP_PASS : '';
				if ($smtp_user!=='') {
					$mail->SMTPAuth	= true;
					$mail->Username	= $smtp_user;
					$mail->Password	= $smtp_pass;
				} else {
					$mail->SMTPAuth	= false;
				}

			// encryption
				$secure = defined('DEDALO_SMTP_SECURE') ? strtolower((string)DEDALO_SMTP_SECURE) : 'tls';
				switch ($secure) {
					case 'ssl':
						$mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
						break;
					case 'none':
						$mail->SMTPSecure	= '';
						$mail->SMTPAutoTLS	= false;
						break;
					case 'tls':
					default:
						$mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
						break;
				}

			// TLS certificate verification (ON by default)
				$verify_peer = !defined('DEDALO_SMTP_VERIFY_PEER') || DEDALO_SMTP_VERIFY_PEER===true;
				if ($verify_peer===false) {
					$mail->SMTPOptions = [
						'ssl' => [
							'verify_peer'		=> false,
							'verify_peer_name'	=> false,
							'allow_self_signed'	=> true
						]
					];
				}

			// from
				$from		= defined('DEDALO_SMTP_FROM') ? (string)DEDALO_SMTP_FROM : DEDALO_SMTP_USER;
				$from_name	= defined('DEDALO_SMTP_FROM_NAME') ? (string)DEDALO_SMTP_FROM_NAME : '';
				$mail->setFrom($from, $from_name);

			// recipient
				$mail->addAddress($to, $to_name);
				if (!empty($reply_to) && component_email::is_valid_email($reply_to)) {
					$mail->addReplyTo($reply_to);
				}

			// content
				$mail->Subject = $subject;
				if ($body_html!==null && $body_html!=='') {
					$mail->isHTML(true);
					$mail->Body		= $body_html;
					$mail->AltBody	= $body_text;
				} else {
					$mail->isHTML(false);
					$mail->Body		= $body_text;
				}

			$mail->send();

			$response->result	= true;
			$response->msg		= 'OK. Mail sent';

		} catch (PHPMailerException $e) {
			$response->errors[]	= 'send_failed';
			$response->msg		= 'Error. Mail send failed';
			debug_log(__METHOD__." PHPMailer error: ".$e->getMessage(), logger::ERROR);
		} catch (Throwable $e) {
			$response->errors[]	= 'send_failed';
			$response->msg		= 'Error. Mail send failed';
			debug_log(__METHOD__." Unexpected mailer error: ".$e->getMessage(), logger::ERROR);
		}

		return $response;
	}//end send



	/**
	* IS_CONFIGURED
	* True when the minimum SMTP configuration is present.
	*
	* @return bool
	*/
	public static function is_configured() : bool {

		return defined('DEDALO_SMTP_HOST') && !empty(DEDALO_SMTP_HOST);
	}//end is_configured



}//end class dd_mailer
