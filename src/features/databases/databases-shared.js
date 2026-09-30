// Features > Databases — shared auto-save/Publish/Discard wiring, used by all
// 3 pages (list, settings, entry form). Unlike Page Builder's multi-table
// cross-page bar, Databases' whole config (entries + categories + display +
// field labels) is ONE JSON blob/one row, so every page just GETs the full
// draft, mutates its own slice, and PUTs the whole thing back — Publish and
// Discard from any one page correctly apply to edits made on any other page
// for free. This mirrors Bento's (src/features/bento/bento.js) auto-save
// (2s debounce)/saveState/isDirty/publish/discard model exactly, factored out
// since 3 pages share the identical mechanics here (Bento only ever had one).
(function () {
  var ENDPOINT = '/api/features/databases';
  var AUTO_SAVE_DELAY = 2000; // ms of idle time after the last edit before auto-saving

  function toast(message) { if (window.Toast) window.Toast.show(message); }

  window.DatabasesResource = {
    ENDPOINT: ENDPOINT,

    // save(draft) -> Promise<draft> — a standalone PUT with no bar UI, for a
    // page (the entry form) that doesn't show its own Discard/Publish pair
    // per the Figma (just one primary submit button).
    save: function (draft) {
      return fetch(ENDPOINT, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(draft),
      }).then(function (res) {
        if (!res.ok) return res.json().catch(function () { return {}; }).then(function (d) { throw new Error(d.message || 'We could not save your changes. Try again.'); });
        return res.json();
      }).then(function (data) { return data && data.draft; });
    },

    // load() -> Promise<{ defaults, options, draft, published }> — the raw GET.
    load: function () {
      return fetch(ENDPOINT, { credentials: 'include' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; })
        .then(function (data) { return data || {}; });
    },

    // init(opts) wires the shared pageactions bar:
    //   opts.getDraft()        -> the page's current full draft object (mutated in place)
    //   opts.getPublished()    -> the page's current full published object
    //   opts.onAutoSaved(draft)     -> called with the server's echoed draft after a successful auto-save
    //   opts.onDiscarded(draft)     -> called with the reverted draft after Discard
    //   opts.onPublished(published) -> called with the published snapshot after Publish
    //   opts.canDiscard()      -> optional; false hides Discard even when dirty
    // Returns { markDirty(), refresh(), flushPendingSave() }.
    init: function (opts) {
      var discardBtn = document.querySelector('[data-action="discard"]');
      var publishBtn = document.querySelector('[data-action="publish"]');
      var publishLabel = publishBtn.querySelector('.btn__label');
      var statusEl = document.querySelector('[data-save-status]');

      var saving = false;
      var publishing = false;
      var saveState = 'idle'; // 'idle' | 'pending' | 'saved'
      var autoSaveTimer = null;

      function isDirty() {
        return JSON.stringify(opts.getDraft()) !== JSON.stringify(opts.getPublished());
      }

      function render() {
        var dirty = isDirty();
        publishBtn.disabled = publishing || !dirty;
        publishBtn.classList.toggle('is-saving', publishing);
        publishLabel.textContent = publishing ? 'Publishing' : 'Publish';
        discardBtn.hidden = !dirty || (opts.canDiscard ? !opts.canDiscard() : false);
        if (saveState === 'pending') {
          statusEl.hidden = false;
          statusEl.textContent = 'Saving changes…';
        } else if (saveState === 'saved') {
          statusEl.hidden = false;
          statusEl.textContent = 'Changes saved!';
        } else {
          statusEl.hidden = true;
        }
      }

      function scheduleAutoSave() {
        if (autoSaveTimer) clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(function () { autoSaveTimer = null; autoSave(); }, AUTO_SAVE_DELAY);
      }
      function flushPendingSave() {
        if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; return autoSave(); }
        return Promise.resolve();
      }
      function autoSave() {
        if (saving) return Promise.resolve();
        saving = true;
        return fetch(ENDPOINT, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(opts.getDraft()),
        }).then(function (res) {
          if (!res.ok) return res.json().catch(function () { return {}; }).then(function (d) { throw new Error(d.message || 'We could not save your changes. Try again.'); });
          return res.json();
        }).then(function (data) {
          saving = false;
          saveState = 'saved';
          if (opts.onAutoSaved) opts.onAutoSaved(data && data.draft);
          render();
        }).catch(function (err) {
          saving = false;
          saveState = 'idle';
          render();
          toast(err.message || 'We could not save your changes. Try again.');
        });
      }

      function markDirty() {
        saveState = 'pending';
        render();
        scheduleAutoSave();
      }

      function publishNow() {
        if (publishing || !isDirty()) return;
        publishing = true;
        render();
        flushPendingSave().then(function () {
          return fetch(ENDPOINT + '/publish', { method: 'POST', credentials: 'include' });
        }).then(function (res) {
          if (!res.ok) return res.json().catch(function () { return {}; }).then(function (d) { throw new Error(d.message || 'We could not publish your changes. Try again.'); });
          return res.json();
        }).then(function (data) {
          publishing = false;
          if (opts.onPublished) opts.onPublished(data && data.published);
          render();
          toast('Databases published successfully. Your changes are now live!');
        }).catch(function (err) {
          publishing = false;
          render();
          toast(err.message || 'We could not publish your changes. Try again.');
        });
      }

      function discardChanges() {
        if (discardBtn.hidden || publishing || saving) return;
        // Cancel any pending debounced save — otherwise it could fire after
        // the discard and silently re-write the very edits just discarded.
        if (autoSaveTimer) { clearTimeout(autoSaveTimer); autoSaveTimer = null; }
        fetch(ENDPOINT + '/discard', { method: 'POST', credentials: 'include' })
          .then(function (res) {
            if (!res.ok) return res.json().catch(function () { return {}; }).then(function (d) { throw new Error(d.message || 'We could not discard your changes. Try again.'); });
            return res.json();
          })
          .then(function (data) {
            saveState = 'idle';
            if (opts.onDiscarded) opts.onDiscarded(data && data.draft);
            render();
          })
          .catch(function (err) { toast(err.message || 'We could not discard your changes. Try again.'); });
      }

      publishBtn.addEventListener('click', publishNow);
      discardBtn.addEventListener('click', discardChanges);

      // Auto-save on a page-hide/unload so a rapid edit-then-leave within the
      // debounce window isn't silently lost; best-effort, doesn't block leaving.
      window.addEventListener('beforeunload', function () {
        if (autoSaveTimer) {
          clearTimeout(autoSaveTimer);
          autoSaveTimer = null;
          try {
            fetch(ENDPOINT, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              keepalive: true,
              body: JSON.stringify(opts.getDraft()),
            });
          } catch (_) { /* best effort */ }
        }
      });

      render();
      return { markDirty: markDirty, refresh: render, flushPendingSave: flushPendingSave };
    },
  };
})();
