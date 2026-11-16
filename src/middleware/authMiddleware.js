import { AuthService } from '../services/authService.js';

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please provide a Bearer token.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = AuthService.verifyToken(token);
    const user = AuthService.getUserById(decoded.sub);
    if (!user) {
      return res.status(401).json({ error: 'User account not found.' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired or invalid token.' });
  }
}

export function requireActiveTrial(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  if (req.user.role === 'admin') {
    return next();
  }

  if (!req.user.isTrialActive) {
    return res.status(403).json({ 
      error: 'Your 30-day free trial has expired. Please contact support or upgrade.',
      code: 'TRIAL_EXPIRED'
    });
  }

  next();
}
