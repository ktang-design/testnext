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
