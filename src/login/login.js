// Login page behaviour: client validation, submit, and error-state handling.
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('login-form');
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  const submit = document.getElementById('submit');
  const formError = document.getElementById('form-error');

  // Where to go after a successful login (?next=…), defaulting to Site details.
  // Only allow same-origin relative paths to avoid open-redirects.
  function safeNext() {
    const raw = new URLSearchParams(location.search).get('next');
    if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
    return '/site-details/';
  }

  function showFieldError(field, errorEl, message) {
    field.classList.add('field--invalid');
    errorEl.textContent = message;
    errorEl.hidden = false;
  }
  function clearFieldError(field, errorEl) {
    field.classList.remove('field--invalid');
    errorEl.hidden = true;
  }
  function showFormError(message) {
    formError.textContent = message;
    formError.hidden = false;
  }
  function clearFormError() {
    formError.hidden = true;
  }

  [email, password].forEach((input) => {
    input.addEventListener('input', () => {
      clearFieldError(input.closest('.field'), document.getElementById(`${input.id}-error`));
      clearFormError();
    });
  });

  function setLoading(loading) {
    submit.disabled = loading;
    submit.classList.toggle('is-loading', loading);
    submit.querySelector('.auth-submit__label').textContent = loading ? 'Signing in…' : 'Sign in';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFormError();

    // Client-side required-field validation.
    let valid = true;
    if (!email.value.trim()) {
      showFieldError(email.closest('.field'), document.getElementById('email-error'), 'Enter your email address.');
      valid = false;
    }
    if (!password.value) {
      showFieldError(password.closest('.field'), document.getElementById('password-error'), 'Enter your password.');
      valid = false;
    }
    if (!valid) return;

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.value.trim(), password: password.value }),
      });

      if (res.ok) {
        window.location.assign(safeNext());
        return;
      }

      // Map server error codes to user-facing messages.
      let data = {};
      try { data = await res.json(); } catch (_) { /* non-JSON */ }
      switch (data.error) {
        case 'INVALID_CREDENTIALS':
          showFormError('Invalid email or password.');
          break;
        case 'ACCOUNT_LOCKED': {
          const mins = data.retryAfterMs ? Math.ceil(data.retryAfterMs / 60000) : 15;
          showFormError(`Too many attempts. Your account is locked for about ${mins} minute${mins === 1 ? '' : 's'}.`);
          break;
        }
        case 'TOO_MANY_REQUESTS':
          showFormError('Too many attempts. Please wait a moment and try again.');
          break;
        case 'MISSING_FIELDS':
          showFormError('Email and password are required.');
          break;
        default:
          showFormError('Something went wrong. Please try again.');
      }
    } catch (err) {
      // Network failure / server unreachable.
      showFormError('Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  });
});
