import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

// 1. Load environment variables from .env
dotenv.config();

// 2. Read required configuration (with fallback for alternative variable names)
const gmailUser = (process.env.GMAIL_SMTP_USER || '').trim();
const gmailPass = (process.env.GMAIL_SMTP_PASS || process.env.GMAIL_SMTP_APP_PASSWORD || '').replace(/\s+/g, '');
const emailMode = (process.env.EMAIL_MODE || '').trim();
const emailTestTo = (process.env.EMAIL_TEST_TO || process.env.EMAIL_ALLOWED_RECIPIENT || '').trim();

/**
 * Strips sensitive values like passwords or tokens from error messages.
 * @param {unknown} error - Error object or string.
 * @param {string} secret - Secret string to redact.
 * @returns {string} Sanitized error message.
 */
function sanitizeError(error, secret) {
  let message = error instanceof Error ? error.message : String(error);
  if (secret && typeof secret === 'string' && secret.length > 0) {
    message = message.split(secret).join('***REDACTED***');
  }
  return message;
}

async function runSmtpTest() {
  if (!gmailUser || !gmailPass) {
    console.error('GMAIL SMTP AUTH FAILED');
    console.error('Reason: GMAIL_SMTP_USER or GMAIL_SMTP_PASS is not defined in .env');
    process.exitCode = 1;
    return;
  }

  // 3. Create nodemailer transport with specified config
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: gmailUser,
      pass: gmailPass,
    },
  });

  try {
    // 4. Run transporter.verify() (single attempt)
    await transporter.verify();

    // 5. If verification succeeds, print success message
    console.log('GMAIL SMTP AUTH SUCCESS');

    // 6. Send test email strictly if EMAIL_MODE === 'self_only' and EMAIL_TEST_TO exists
    if (emailMode === 'self_only' && emailTestTo.length > 0) {
      const sendResult = await transporter.sendMail({
        from: gmailUser,
        to: emailTestTo,
        subject: 'Donatur Helper SMTP test',
        text: 'Ini adalah email uji lokal dari Donatur Helper. Abaikan pesan ini.',
      });

      console.log(`Self-test email sent to ${emailTestTo} (Message ID: ${sendResult.messageId})`);
    }
  } catch (error) {
    // 7. If verification/send fails, print safe summary only without secrets
    console.error('GMAIL SMTP AUTH FAILED');
    console.error(`Reason: ${sanitizeError(error, gmailPass)}`);
    process.exitCode = 1;
  }
}

runSmtpTest();
