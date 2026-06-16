// Navigation component — expand/collapse behaviour for parent groups.
// The open/closed visuals (chevron up/down, sub-item visibility) come from
// the .is-open class and the [hidden] attribute; this just toggles them.
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-toggle]').forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const groupId = toggle.dataset.toggle;
      const open = toggle.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
      document
        .querySelectorAll(`[data-group="${groupId}"]`)
        .forEach((item) => { item.hidden = !open; });
    });
  });
});
