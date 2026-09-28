// Website layer — Header menu (landing panel). Purely navigational: lists the
// Header group's sub-pages (Navigation menu / Search bar / Settings). Nothing
// here is edited or saved, so all this needs to do is boot the shared
// read-only preview that every website-layer page shows on the right.
(function () {
  window.WebsitePreview.create(document.querySelector('[data-website-preview]'));
})();
