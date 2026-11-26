// Outgoing email. Until Resend is connected, emails are printed to the server log instead
// (look for "[mail]"), so sign-up codes and password resets can be tested locally.
//
// To send real email later: set RESEND_API_KEY and MAIL_FROM in .env and fill in `deliver` below
// (POST https://api.resend.com/emails with { from, to, subject, text, html }).

const PROVIDER = process.env.RESEND_API_KEY ? 'resend' : 'log';

async function deliver({ to, subject, text }) {
  if (PROVIDER === 'resend') {
    // TODO(resend): send through Resend. Until then this falls through to the log so nothing is lost.
  }
  console.log(`[mail] to ${to} · ${subject}\n${text.replace(/^/gm, '    ')}`);
}

const CODE_EMAILS = {
  'email-verification': {
    subject: 'Your Forkfly verification code',
    lead: 'Use this code to confirm your email address and finish creating your Forkfly account.',
  },
  'forget-password': {
    subject: 'Reset your Forkfly password',
    lead: 'Use this code to choose a new password. If you didn’t ask to reset it, you can ignore this email.',
  },
  'sign-in': {
    subject: 'Your Forkfly sign-in code',
    lead: 'Use this code to sign in to Forkfly.',
  },
};

// Called by Better Auth's email OTP plugin. Errors are logged, never shown to the person,
// so the response can't reveal whether an address has an account.
export async function sendCodeEmail({ email, otp, type }) {
  const t = CODE_EMAILS[type] ?? CODE_EMAILS['sign-in'];
  try {
    await deliver({ to: email, subject: t.subject, text: `${t.lead}\n\n${otp}\n\nThe code expires in 10 minutes.` });
  } catch (err) {
    console.error('[mail] could not send', type, 'email:', err.message);
  }
}
