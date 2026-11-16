import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDatabase } from '../db/database.js';
import { ENV } from '../config/env.js';
import { EmailValidator } from './emailValidator.js';

export class AuthService {
  /**
   * Sends or generates a 6-digit verification code after strict DNS MX & Gmail validation.
   */
  static async sendVerificationOtp(email) {
    const db = getDatabase();
    
    // Strict validation (Format, Gmail rules, Disposable check, DNS MX check)
    const valResult = await EmailValidator.verifyEmail(email);
    if (!valResult.isValid) {
      throw new Error(valResult.error);
    }

    const cleanEmail = valResult.cleanEmail;

    // Check if account already exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (existing) {
      throw new Error('An account with this email address already exists. Please sign in instead.');
    }

    // Generate 6-digit random code
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + (10 * 60 * 1000); // 10 minutes

    // Upsert verification record
    db.prepare(`
      INSERT INTO email_verifications (email, otp_code, expires_at, verified_at)
      VALUES (?, ?, ?, NULL)
      ON CONFLICT(email) DO UPDATE SET 
        otp_code = excluded.otp_code,
        expires_at = excluded.expires_at,
        verified_at = NULL
    `).run(cleanEmail, otpCode, expiresAt);

    console.log(`[Email Verification] Code for ${cleanEmail}: ${otpCode}`);

    return {
      success: true,
      email: cleanEmail,
      message: `Verification code generated for ${cleanEmail}. Check your email.`,
      debugOtp: otpCode
    };
  }

  /**
   * Registers a new user after verifying email & OTP code.
   */
  static async registerWithVerification(name, email, password, otpCode) {
    const db = getDatabase();
    
    // Verify email structure & DNS
    const valResult = await EmailValidator.verifyEmail(email);
    if (!valResult.isValid) {
      throw new Error(valResult.error);
    }
    const cleanEmail = valResult.cleanEmail;

    // Verify OTP
    const verif = db.prepare('SELECT * FROM email_verifications WHERE email = ?').get(cleanEmail);
    if (!verif) {
      throw new Error('Please request a verification code for this email first.');
    }

    if (Date.now() > verif.expires_at) {
      throw new Error('Verification code has expired. Please request a new code.');
    }

    if (verif.otp_code !== otpCode.trim()) {
      throw new Error('Invalid 6-digit verification code. Please check and try again.');
    }

    // Mark verified
    db.prepare('UPDATE email_verifications SET verified_at = ? WHERE email = ?').run(Date.now(), cleanEmail);

    return this.register(name, cleanEmail, password, true);
  }

  static async register(name, email, password, skipValidation = false) {
    const db = getDatabase();

    let cleanEmail = email.trim().toLowerCase();

    if (!skipValidation) {
      const valResult = await EmailValidator.verifyEmail(cleanEmail);
      if (!valResult.isValid) {
        throw new Error(valResult.error);
      }
      cleanEmail = valResult.cleanEmail;
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (existing) {
      throw new Error('An account with this email already exists.');
    }

    const salt = bcrypt.genSaltSync(10);
    const password_hash = bcrypt.hashSync(password, salt);
    const now = Date.now();
    const trial_ends_at = now + (ENV.TRIAL_DAYS * 24 * 60 * 60 * 1000);

    const result = db.prepare(`
      INSERT INTO users (name, email, password_hash, role, trial_ends_at, created_at)
      VALUES (?, ?, ?, 'user', ?, ?)
    `).run(name.trim(), cleanEmail, password_hash, trial_ends_at, now);

    const userId = Number(result.lastInsertRowid);
    const token = this.generateToken(userId, cleanEmail, 'user');

    return {
      user: {
        id: userId,
        name: name.trim(),
        email: cleanEmail,
        role: 'user',
        trialEndsAt: trial_ends_at,
        isTrialActive: true,
        trialDaysRemaining: ENV.TRIAL_DAYS
      },
      token
    };
  }

  /**
   * Provides or creates an instant guest session for direct access without forced login.
   */
  static getOrCreateGuestSession() {
    const db = getDatabase();
    let guestUser = db.prepare('SELECT * FROM users WHERE email = ?').get('guest@omniindexer.local');

    const now = Date.now();
    const trial_ends_at = now + (ENV.TRIAL_DAYS * 24 * 60 * 60 * 1000);

    if (!guestUser) {
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync('GuestPass123!', salt);
      const res = db.prepare(`
        INSERT INTO users (name, email, password_hash, role, trial_ends_at, created_at)
        VALUES ('Instant Trial User', 'guest@omniindexer.local', ?, 'user', ?, ?)
      `).run(hash, trial_ends_at, now);

      guestUser = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(res.lastInsertRowid));
    }

    const token = this.generateToken(guestUser.id, guestUser.email, guestUser.role);

    return {
      user: {
        id: guestUser.id,
        name: guestUser.name,
        email: guestUser.email,
        role: guestUser.role,
        trialEndsAt: guestUser.trial_ends_at,
        isTrialActive: true,
        trialDaysRemaining: Math.max(0, Math.ceil((guestUser.trial_ends_at - now) / (1000 * 60 * 60 * 24)))
      },
      token
    };
  }

  static login(email, password) {
    const db = getDatabase();
    const cleanEmail = email.trim().toLowerCase();

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);
    if (!user) {
      throw new Error('Invalid email or password.');
    }

    const isValid = bcrypt.compareSync(password, user.password_hash);
    if (!isValid) {
      throw new Error('Invalid email or password.');
    }

    const now = Date.now();
    const isTrialActive = user.trial_ends_at > now;
    const daysRemaining = isTrialActive 
      ? Math.max(0, Math.ceil((user.trial_ends_at - now) / (1000 * 60 * 60 * 24)))
      : 0;

    const token = this.generateToken(user.id, user.email, user.role);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        trialEndsAt: user.trial_ends_at,
        isTrialActive,
        trialDaysRemaining: daysRemaining
      },
      token
    };
  }

  static getUserById(id) {
    const db = getDatabase();
    const user = db.prepare('SELECT id, name, email, role, trial_ends_at, created_at FROM users WHERE id = ?').get(id);
    if (!user) return null;

    const now = Date.now();
    const isTrialActive = user.trial_ends_at > now;
    const daysRemaining = isTrialActive 
      ? Math.max(0, Math.ceil((user.trial_ends_at - now) / (1000 * 60 * 60 * 24)))
      : 0;

    return {
      ...user,
      isTrialActive,
      trialDaysRemaining: daysRemaining
    };
  }

  static generateToken(userId, email, role) {
    return jwt.sign(
      { sub: userId, email, role },
      ENV.JWT_SECRET,
      { expiresIn: '30d' }
    );
  }

  static verifyToken(token) {
    return jwt.verify(token, ENV.JWT_SECRET);
  }
}
