// Shared Page Builder pageactions bar (status text + Discard changes +
// Publish), used by every section that auto-saves a draft: Pages, Header,
// Footer, Typography, Navigation, Search, Branding. Auto-save itself is
// per-section (each page's own script debounces its own PUT), but Publish
// and Discard always act on every section together — see
// POST /api/website/publish-all / discard-all — since navigating between
// these pages is a full page reload, not a client-side route, so a global
// draft can't be tracked in memory alone.
//
// Usage: window.WebsiteSaveActions.init({
//   isLocalDirty: function () { ... },      // this page's own draft !== its own published
//   flushLocalSave: function () { ... },    // Promise — flush this page's pending debounced save before Publish
//   cancelLocalPending: function () { ... }, // clear this page's pending debounce before Discard (edits are thrown away, not saved)
//   onPublished: function (published) { ... }, // published = { pages, navigation, search, header, footer, typography, branding }
//   onDiscarded: function (draft) { ... },      // draft = same shape — re-apply this page's own slice to its controls
// }) -> { refresh: function (saveState) { ... } } // saveState: 'idle' | 'pending' | 'saved'
(function () {
  function toast(message) { if (window.Toast) window.Toast.show(message); }

  window.WebsiteSaveActions = {
    init: function (opts) {
      opts = opts || {};
      var discardBtn = document.querySelector('[data-action="discard"]');
      var publishBtn = document.querySelector('[data-action="publish"]');
      var publishLabel = publishBtn.querySelector('.btn__label');
      var statusEl = document.querySelector('[data-save-status]');

      var publishing = false;
      var discarding = false;
      var globalDirty = false; // from the last /publish-status fetch — other sections' pending drafts
      var localSaveState = 'idle'; // 'idle' | 'pending' | 'saved' — set by the caller via refresh()

      function isDirty() {
        return (typeof opts.isLocalDirty === 'function' && opts.isLocalDirty()) || globalDirty;
      }

      function render() {
        var dirty = isDirty();
        publishBtn.disabled = publishing || !dirty;
        publishBtn.classList.toggle('is-saving', publishing);
        publishLabel.textContent = publishing ? 'Publishing' : 'Publish';
        discardBtn.hidden = !dirty || discarding;
        if (localSaveState === 'pending') {
          statusEl.hidden = false;
          statusEl.textContent = 'Saving changes…';
        } else if (localSaveState === 'saved') {
          statusEl.hidden = false;
          statusEl.textContent = 'Changes saved!';
        } else {
          statusEl.hidden = true;
        }
      }

      function refresh(saveState) {
        if (saveState) localSaveState = saveState;
        render();
      }

      function publishNow() {
        if (publishing || !isDirty()) return;
        publishing = true;
        render();
        Promise.resolve(typeof opts.flushLocalSave === 'function' ? opts.flushLocalSave() : null)
          .then(function () { return fetch('/api/website/publish-all', { method: 'POST', credentials: 'include' }); })
          .then(function (res) {
            if (!res.ok) return res.json().catch(function () { return {}; }).then(function (d) { throw new Error(d.message || 'We could not publish your changes. Try again.'); });
            return res.json();
          })
          .then(function (data) {
            publishing = false;
            globalDirty = false;
            localSaveState = 'idle';
            if (typeof opts.onPublished === 'function') opts.onPublished(data && data.published);
            render();
            toast('Page Builder published successfully. Your changes are now live!');
          })
          .catch(function (err) {
            publishing = false;
            render();
            toast(err.message || 'We could not publish your changes. Try again.');
          });
      }

      function discardChanges() {
        if (discardBtn.hidden || publishing || discarding) return;
        // Cancel any pending debounced save — otherwise it could fire after
        // the discard and silently re-write the very edits just discarded.
        if (typeof opts.cancelLocalPending === 'function') opts.cancelLocalPending();
        discarding = true;
        render();
        fetch('/api/website/discard-all', { method: 'POST', credentials: 'include' })
          .then(function (res) {
            if (!res.ok) return res.json().catch(function () { return {}; }).then(function (d) { throw new Error(d.message || 'We could not discard your changes. Try again.'); });
            return res.json();
          })
          .then(function (data) {
            discarding = false;
            globalDirty = false;
            localSaveState = 'idle';
            if (typeof opts.onDiscarded === 'function') opts.onDiscarded(data && data.draft);
            render();
          })
          .catch(function (err) {
            discarding = false;
            render();
            toast(err.message || 'We could not discard your changes. Try again.');
          });
      }

      publishBtn.addEventListener('click', publishNow);
      discardBtn.addEventListener('click', discardChanges);

      // ---- Unpublished-changes guard for leaving the Page Builder ----------
      // Moving between Page Builder sections keeps the draft (it's saved
      // server-side), but Tools & Services / System Settings leave the
      // builder, so confirm first. Discard throws the draft away, then goes.
      var leaveModal = null;
      var pendingHref = null;
      var allowLeave = false;

      function buildLeaveModal() {
        var el = document.createElement('div');
        el.className = 'modal-overlay';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-labelledby', 'unsaved-title');
        el.hidden = true;
        el.innerHTML =
          '<div class="modal">' +
          '<div class="modal__header"><h2 class="modal__title" id="unsaved-title">Unpublished changes</h2>' +
          '<button type="button" class="modal__close" data-modal-close aria-label="Close dialog"><img src="/shared/close.svg" alt="" /></button></div>' +
          '<div class="modal__body"><p class="modal__text">You have unpublished changes that will be lost if you leave this page. Do you want to continue?</p></div>' +
          '<div class="modal__footer">' +
          '<button type="button" class="modal__btn modal__btn--discard" data-modal-discard>Discard changes</button>' +
          '<button type="button" class="modal__btn modal__btn--keep" data-modal-keep>Keep editing</button></div></div>';
        document.body.appendChild(el);
        el.querySelector('[data-modal-keep]').addEventListener('click', closeLeaveModal);
        el.querySelector('[data-modal-close]').addEventListener('click', closeLeaveModal);
        el.addEventListener('click', function (e) { if (e.target === el) closeLeaveModal(); });
        el.querySelector('[data-modal-discard]').addEventListener('click', confirmLeave);
        return el;
      }
      function openLeaveModal() {
        if (!leaveModal) leaveModal = buildLeaveModal();
        if (window.AppShell && window.AppShell.closeDrawer) window.AppShell.closeDrawer();
        leaveModal.hidden = false;
        document.body.classList.add('is-locked');
        leaveModal.querySelector('[data-modal-keep]').focus();
      }
      function closeLeaveModal() {
        if (leaveModal) leaveModal.hidden = true;
        document.body.classList.remove('is-locked');
        pendingHref = null;
      }
      function confirmLeave() {
        var href = pendingHref;
        if (!href || discarding) return;
        if (typeof opts.cancelLocalPending === 'function') opts.cancelLocalPending();
        discarding = true;
        fetch('/api/website/discard-all', { method: 'POST', credentials: 'include' })
          .then(function (res) { if (!res.ok) throw new Error(); })
          .then(function () {
            allowLeave = true;
            window.location.href = href;
          })
          .catch(function () {
            discarding = false;
            closeLeaveModal();
            toast('We could not discard your changes. Try again.');
          });
      }

      document.addEventListener('click', function (e) {
        if (!isDirty() || allowLeave || e.defaultPrevented) return;
        var link = e.target.closest && e.target.closest('a[href]');
        if (!link || link.target === '_blank') return;
        var url = new URL(link.href, location.href);
        if (url.origin !== location.origin) return;
        if (url.pathname === '/website' || url.pathname.indexOf('/website/') === 0) return; // stays in the Page Builder
        e.preventDefault();
        e.stopPropagation();
        pendingHref = url.href;
        openLeaveModal();
      }, true);
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && leaveModal && !leaveModal.hidden) closeLeaveModal();
      });

      fetch('/api/website/publish-status', { credentials: 'include' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          globalDirty = !!(data && data.dirty);
          render();
        })
        .catch(function () { render(); });

      return { refresh: refresh };
    },
  };
})();
