// Sign-up page behaviour: client validation, submit, and error-state handling.
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('signup-form');
  const name = document.getElementById('name');
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  const submit = document.getElementById('submit');
  const formError = document.getElementById('form-error');

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function safeNext() {
    const raw = new URLSearchParams(location.search).get('next');
    if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
    return '/site-details/';
  }

  function fieldError(input, message) {
    input.closest('.field').classList.add('field--invalid');
    const el = document.getElementById(`${input.id}-error`);
    if (el) { el.textContent = message; el.hidden = false; }
  }
  function clearFieldError(input) {
    input.closest('.field').classList.remove('field--invalid');
    const el = document.getElementById(`${input.id}-error`);
    if (el) el.hidden = true;
  }
  function showFormError(message) { formError.textContent = message; formError.hidden = false; }
  function clearFormError() { formError.hidden = true; }

  [name, email, password].forEach((input) => {
    input.addEventListener('input', () => { clearFieldError(input); clearFormError(); });
  });

  function setLoading(loading) {
    submit.disabled = loading;
    submit.classList.toggle('is-loading', loading);
    submit.querySelector('.auth-submit__label').textContent = loading ? 'Creating account…' : 'Create account';
  }

  // Client-side mirror of the server's rules (server remains the source of truth).
  function validate() {
    let ok = true;
    if (!name.value.trim()) { fieldError(name, 'Enter your name.'); ok = false; }
    if (!EMAIL_RE.test(email.value.trim())) { fieldError(email, 'Enter a valid email address.'); ok = false; }
    const p = password.value;
    if (p.length < 8 || !/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) {
      fieldError(password, 'At least 8 characters, including a letter and a number.');
      ok = false;
    }
    return ok;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFormError();
    if (!validate()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.value.trim(),
          email: email.value.trim(),
          password: password.value,
        }),
      });

      if (res.ok) {
        window.location.assign(safeNext());
        return;
      }

      let data = {};
      try { data = await res.json(); } catch (_) { /* non-JSON */ }
      switch (data.error) {
        case 'EMAIL_TAKEN':
          fieldError(email, 'An account with that email already exists.');
          showFormError('That email is already registered. Try signing in instead.');
          break;
        case 'INVALID_EMAIL':
          fieldError(email, data.message || 'Enter a valid email address.');
          break;
        case 'WEAK_PASSWORD':
          fieldError(password, data.message || 'Password does not meet the requirements.');
          break;
        case 'TOO_MANY_REQUESTS':
          showFormError('Too many attempts. Please wait a moment and try again.');
          break;
        case 'MISSING_FIELDS':
          showFormError('Name, email, and password are required.');
          break;
        default:
          showFormError('Something went wrong. Please try again.');
      }
    } catch (err) {
      showFormError('Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  });
});
