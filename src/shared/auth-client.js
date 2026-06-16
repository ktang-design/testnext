// Shared auth client for protected pages.
// Turns the top-nav user menu into a dropdown with a "Sign out" action.
// (Page access itself is enforced server-side by the auth guard; this just
// gives the user a way to end their session.)
(function () {
  function injectStyles() {
    if (document.getElementById('sn-auth-styles')) return;
    const css = `
      .sn-usermenu-pop {
        position: absolute;
        min-width: 180px;
        padding: 4px;
        background: #fff;
        border: 1px solid #d7d8da;
        border-radius: 6px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.12);
        z-index: 1000;
      }
      .sn-usermenu-pop[hidden] { display: none; }
      .sn-usermenu-pop__item {
        display: flex; align-items: center; gap: 8px;
        width: 100%;
        padding: 8px 10px;
        background: none; border: 0; border-radius: 4px;
        font: 600 14px/21px "Noto Sans","Helvetica Neue",Arial,sans-serif;
        color: #3d3f42; text-align: left; cursor: pointer;
      }
      .sn-usermenu-pop__item:hover { background: #f5f5f5; }
      .sn-usermenu-pop__email {
        padding: 8px 10px 6px; margin: 0;
        font: 400 12px/16px "Noto Sans",Arial,sans-serif; color: #6e7277;
        border-bottom: 1px solid #ececee;
      }
    `;
    const style = document.createElement('style');
    style.id = 'sn-auth-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (_) {
      /* even if the request fails, send the user to login */
    }
    window.location.assign('/login/');
  }

  function buildMenu(email) {
    const pop = document.createElement('div');
    pop.className = 'sn-usermenu-pop';
    pop.hidden = true;
    pop.innerHTML =
      (email ? `<p class="sn-usermenu-pop__email">${email}</p>` : '') +
      '<button type="button" class="sn-usermenu-pop__item" data-action="logout">Sign out</button>';
    document.body.appendChild(pop);
    pop.querySelector('[data-action="logout"]').addEventListener('click', logout);
    return pop;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const trigger = document.querySelector('.usermenu');
    if (!trigger) return;
    injectStyles();

    // Confirm the session and grab the email for the menu header.
    let email = '';
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        email = (data.user && data.user.email) || '';
      }
    } catch (_) { /* offline / dev-without-server: still allow the menu */ }

    const pop = buildMenu(email);

    function place() {
      const r = trigger.getBoundingClientRect();
      pop.style.top = `${window.scrollY + r.bottom + 6}px`;
      pop.style.left = `${window.scrollX + r.right - pop.offsetWidth}px`;
    }
    function open() { pop.hidden = false; place(); trigger.setAttribute('aria-expanded', 'true'); }
    function close() { pop.hidden = true; trigger.setAttribute('aria-expanded', 'false'); }

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (pop.hidden) open(); else close();
    });
    document.addEventListener('click', (e) => {
      if (!pop.hidden && !pop.contains(e.target)) close();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  });
})();
