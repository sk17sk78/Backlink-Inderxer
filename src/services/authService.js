import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDatabase } from '../db/database.js';
import { ENV } from '../config/env.js';

export class AuthService {
  static register(name, email, password) {
    const db = getDatabase();
    const cleanEmail = email.trim().toLowerCase();

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
