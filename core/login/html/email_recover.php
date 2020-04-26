<?php
// config include
	include( dirname(dirname(dirname(__FILE__))) . '/config/config4.php');
	if (!defined(MAILER_CONFIG)) {
		throw new Exception("Error Processing Request. Dédalo config 'MAILER_CONFIG' not defined! ", 1);
		return false;
	}

$mailer_config = (object)MAILER_CONFIG;

// Import PHPMailer classes into the global namespace
// These must be at the top of your script, not inside a function
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

// Load Composer's autoloader
	require DEDALO_ROOT . '/vendor/autoload.php';

// Instantiation and passing `true` enables exceptions
	$mail = new PHPMailer(true);

try {
   
	// example
		/*
		//Server settings
		$mail->SMTPDebug = 2;                                       // Enable verbose debug output
		$mail->isSMTP();                                            // Set mailer to use SMTP
		$mail->Host       = 'smtp1.example.com;smtp2.example.com';  // Specify main and backup SMTP servers
		$mail->SMTPAuth   = true;                                   // Enable SMTP authentication
		$mail->Username   = 'user@example.com';                     // SMTP username
		$mail->Password   = 'secret';                               // SMTP password
		$mail->SMTPSecure = 'tls';                                  // Enable TLS encryption, `ssl` also accepted
		$mail->Port       = 587;                                    // TCP port to connect to

		//Recipients
		$mail->setFrom('from@example.com', 'Mailer');
		$mail->addAddress('joe@example.net', 'Joe User');     // Add a recipient
		$mail->addAddress('ellen@example.com');               // Name is optional
		$mail->addReplyTo('info@example.com', 'Information');
		$mail->addCC('cc@example.com');
		$mail->addBCC('bcc@example.com');

		// Attachments
		$mail->addAttachment('/var/tmp/file.tar.gz');         // Add attachments
		$mail->addAttachment('/tmp/image.jpg', 'new.jpg');    // Optional name

		// Content
		$mail->isHTML(true);                                  // Set email format to HTML
		$mail->Subject = 'Here is the subject';
		$mail->Body    = 'This is the HTML message body <b>in bold!</b>';
		$mail->AltBody = 'This is the body in plain text for non-HTML mail clients';

		$mail->send();
		echo 'Message has been sent';*/

	// test
		$mail->SMTPDebug = 2;								// Enable verbose debug output
		$mail->isSMTP();                                    // Set mailer to use SMTP
		$mail->Host       = $mailer_config->host;           // Specify main and backup SMTP servers
		$mail->SMTPAuth   = $mailer_config->smtp_auth;      // Enable SMTP authentication
		$mail->Username   = $mailer_config->username;       // SMTP username
		$mail->Password   = $mailer_config->password;       // SMTP password
		$mail->SMTPSecure = $mailer_config->smtp_secure;    // Enable TLS encryption, `ssl` also accepted
		$mail->Port       = $mailer_config->port;           // TCP port to connect to

		//Recipients
		$mail->setFrom($mailer_config->from, 'Mailer');
		$mail->addAddress('info@example.com', 'Info 1');     // Add a recipient
		#$mail->addAddress('info@example.com', 'Info 2');               // Name is optional
		#$mail->addReplyTo('info@example.com', 'Information');
		#$mail->addCC('cc@example.com');
		#$mail->addBCC('bcc@example.com');


		// Content
		$mail->isHTML(true);                                  // Set email format to HTML
		$mail->Subject = 'Here is the subject 2';
		$mail->Body    = 'This is the HTML message body <b>in bold!</b>';
		$mail->AltBody = 'This is the body in plain text for non-HTML mail clients';

		$mail->send();
		echo 'Message has been sent';



} catch (Exception $e) {
	echo "Message could not be sent. Mailer Error: {$mail->ErrorInfo}";
}