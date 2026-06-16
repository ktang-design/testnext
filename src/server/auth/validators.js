'use strict';
// Input validation for registration. Returns { valid, code, message }.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email) {
  if (!email || !EMAIL_RE.test(String(email).trim())) {
    return { valid: false, code: 'INVALID_EMAIL', message: 'Enter a valid email address.' };
  }
  return { valid: true };
}

// Policy: at least 8 chars, with at least one letter and one number.
function validatePassword(password) {
  const p = String(password || '');
  if (p.length < 8) {
    return { valid: false, code: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters.' };
  }
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) {
    return { valid: false, code: 'WEAK_PASSWORD', message: 'Password must include at least one letter and one number.' };
  }
  return { valid: true };
}

function validateName(name) {
  if (!name || !String(name).trim()) {
    return { valid: false, code: 'MISSING_FIELDS', message: 'Enter your name.' };
  }
  return { valid: true };
}

module.exports = { validateEmail, validatePassword, validateName, EMAIL_RE };
