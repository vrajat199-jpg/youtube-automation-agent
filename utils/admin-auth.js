const crypto = require('crypto');

const COOKIE_NAME = 'yaa_admin_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const loginAttempts = new Map();

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function parseCookies(header = '') {
  const cookies = {};
  for (const part of String(header).split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name) cookies[name] = value;
  }
  return cookies;
}

class AdminAuth {
  constructor(env = process.env) {
    this.env = env;
    this.enabled = String(env.CLOUD_MODE || '').toLowerCase() === 'true';
  }

  validateConfiguration() {
    if (!this.enabled) return true;
    if (String(this.env.APP_ADMIN_PASSWORD || '').length < 16) {
      throw new Error('CLOUD_MODE requires APP_ADMIN_PASSWORD with at least 16 characters');
    }
    if (Buffer.byteLength(String(this.env.APP_SESSION_SECRET || ''), 'utf8') < 32) {
      throw new Error('CLOUD_MODE requires APP_SESSION_SECRET with at least 32 bytes');
    }
    if (!/^[a-f0-9]{64}$/i.test(String(this.env.TOKEN_ENCRYPTION_KEY || ''))) {
      throw new Error('CLOUD_MODE requires TOKEN_ENCRYPTION_KEY as 64 hexadecimal characters');
    }
    const required = ['YOUTUBE_OAUTH_CLIENT_ID', 'YOUTUBE_OAUTH_CLIENT_SECRET', 'YOUTUBE_OAUTH_REDIRECT_URI'];
    const missing = required.filter(key => !String(this.env[key] || '').trim());
    if (missing.length) throw new Error('CLOUD_MODE requires: ' + missing.join(', '));
    let redirect;
    try {
      redirect = new URL(this.env.YOUTUBE_OAUTH_REDIRECT_URI);
    } catch {
      throw new Error('YOUTUBE_OAUTH_REDIRECT_URI must be a valid HTTPS URL');
    }
    if (redirect.protocol !== 'https:') {
      throw new Error('YOUTUBE_OAUTH_REDIRECT_URI must use HTTPS in cloud mode');
    }
    return true;
  }

  sign(payload) {
    return crypto.createHmac('sha256', String(this.env.APP_SESSION_SECRET))
      .update(payload)
      .digest('base64url');
  }

  createSessionToken(now = Date.now()) {
    if (!this.enabled) throw new Error('Owner sessions are only enabled in cloud mode');
    const payload = Buffer.from(JSON.stringify({
      version: 1,
      expiresAt: now + SESSION_TTL_SECONDS * 1000
    })).toString('base64url');
    return payload + '.' + this.sign(payload);
  }

  verifySessionToken(token, now = Date.now()) {
    if (!this.enabled || typeof token !== 'string') return false;
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const expected = this.sign(parts[0]);
    if (!safeEqual(parts[1], expected)) return false;
    try {
      const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      return payload.version === 1 && Number.isFinite(payload.expiresAt) && payload.expiresAt > now;
    } catch {
      return false;
    }
  }

  cookieHeader(token) {
    const secure = this.enabled ? '; Secure' : '';
    return COOKIE_NAME + '=' + token + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + SESSION_TTL_SECONDS + secure;
  }

  clearCookieHeader() {
    const secure = this.enabled ? '; Secure' : '';
    return COOKIE_NAME + '=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' + secure;
  }

  isAuthenticated(req) {
    const token = parseCookies(req.headers?.cookie)[COOKIE_NAME];
    return this.verifySessionToken(token);
  }

  middleware() {
    return (req, res, next) => {
      if (!this.enabled) return next();
      const publicPaths = new Set(['/health', '/login', '/auth/login']);
      if (publicPaths.has(req.path)) return next();
      if (this.isAuthenticated(req)) {
        req.adminAuthenticated = true;
        return next();
      }
      if (req.method === 'GET' && !req.path.startsWith('/api/')) {
        return res.redirect('/login');
      }
      return res.status(401).json({ success: false, error: 'Owner sign-in required' });
    };
  }

  handleLogin(req, res) {
    if (!this.enabled) return res.status(404).send('Not found');
    const address = String(req.ip || req.socket?.remoteAddress || 'unknown');
    const now = Date.now();
    const existing = loginAttempts.get(address);
    if (existing && existing.resetAt > now && existing.count >= 8) {
      return res.status(429).send('Too many sign-in attempts. Try again in 15 minutes.');
    }
    if (!existing || existing.resetAt <= now) loginAttempts.set(address, { count: 0, resetAt: now + 15 * 60 * 1000 });

    const supplied = String(req.body?.password || '');
    const expectedHash = crypto.createHash('sha256').update(String(this.env.APP_ADMIN_PASSWORD)).digest();
    const suppliedHash = crypto.createHash('sha256').update(supplied).digest();
    if (!safeEqual(suppliedHash, expectedHash)) {
      const attempts = loginAttempts.get(address);
      attempts.count += 1;
      return res.status(401).send('Incorrect password. <a href="/login">Try again</a>.');
    }

    loginAttempts.delete(address);
    res.setHeader('Set-Cookie', this.cookieHeader(this.createSessionToken()));
    return res.redirect('/channels');
  }

  handleLogout(_req, res) {
    res.setHeader('Set-Cookie', this.clearCookieHeader());
    return res.redirect('/login');
  }
}

module.exports = { AdminAuth, COOKIE_NAME, SESSION_TTL_SECONDS };
