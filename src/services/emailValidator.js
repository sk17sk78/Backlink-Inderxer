import dns from 'node:dns/promises';

// List of popular disposable and temp mail domains
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'tempmail.com', '10minutemail.com', 'guerrillamail.com',
  'sharklasers.com', 'yopmail.com', 'trashmail.com', 'dispostable.com',
  'fakeinbox.com', 'getairmail.com', 'throwawaymail.com', 'generator.email',
  'emailondeck.com', 'temp-mail.org', 'crazymailing.com', 'fakemailgenerator.com',
  'mytemp.email', 'tempail.com', 'mohmal.com', 'maildrop.cc', 'nada.ltd'
]);

// Common domain typos for Gmail
const TYPO_MAP = {
  'gmai.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'hotmial.com': 'hotmail.com',
  'yaho.com': 'yahoo.com'
};

export class EmailValidator {
  /**
   * Performs deep verification on an email address.
   * Returns { isValid: boolean, error?: string, suggestion?: string, domain?: string }
   */
  static async verifyEmail(rawEmail) {
    if (!rawEmail || typeof rawEmail !== 'string') {
      return { isValid: false, error: 'Email address is required.' };
    }

    const email = rawEmail.trim().toLowerCase();

    // 1. Basic Format Regex
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    if (!emailRegex.test(email)) {
      return { isValid: false, error: 'Invalid email formatting. Please enter a valid address.' };
    }

    const parts = email.split('@');
    if (parts.length !== 2) {
      return { isValid: false, error: 'Malformed email address.' };
    }

    const [username, domain] = parts;

    // 2. Check for common typos (e.g. gmai.com)
    if (TYPO_MAP[domain]) {
      return {
        isValid: false,
        error: `Did you mean @${TYPO_MAP[domain]}? Please check your email spelling.`
      };
    }

    // 3. Block Disposable & Temp Mail
    if (DISPOSABLE_DOMAINS.has(domain)) {
      return {
        isValid: false,
        error: 'Disposable and temporary email providers are not permitted. Please use a real Gmail or business email.'
      };
    }

    // 4. Gmail Specific Validation
    if (domain === 'gmail.com' || domain === 'googlemail.com') {
      // Clean periods for length check (Google treats dot-variants the same)
      const cleanUsername = username.replace(/\./g, '');

      if (cleanUsername.length < 6) {
        return {
          isValid: false,
          error: 'Gmail usernames must be at least 6 characters long (excluding @gmail.com).'
        };
      }

      if (cleanUsername.length > 30) {
        return {
          isValid: false,
          error: 'Gmail usernames cannot exceed 30 characters.'
        };
      }

      // Check for valid characters: only letters, numbers, and periods
      if (!/^[a-z0-9.]+$/.test(username)) {
        return {
          isValid: false,
          error: 'Gmail usernames can only contain letters (a-z), numbers (0-9), and periods (.).'
        };
      }

      // Check consecutive periods or starting/ending with period
      if (username.startsWith('.') || username.endsWith('.') || username.includes('..')) {
        return {
          isValid: false,
          error: 'Gmail addresses cannot start or end with a period, or have consecutive periods.'
        };
      }
    }

    // 5. Live DNS MX Record Verification (Confirms real mail servers exist)
    try {
      const mxRecords = await dns.resolveMx(domain);
      if (!mxRecords || mxRecords.length === 0) {
        return {
          isValid: false,
          error: `The domain "${domain}" has no active mail exchange (MX) servers. This email cannot receive messages.`
        };
      }
    } catch (err) {
      if (err.code === 'ENOTFOUND' || err.code === 'ENODATA' || err.code === 'ESERVFAIL') {
        return {
          isValid: false,
          error: `Domain "${domain}" does not exist or has no active mail server. Please enter a valid, active email address.`
        };
      }
      // If network timeout, allow through with caution
    }

    return {
      isValid: true,
      cleanEmail: email,
      domain
    };
  }
}
