'use strict';
// Stand-in "published pages" output and a starter navigation tree.
// (The full Pages builder is a separate Website layer; until it exists these
// seed rows give the navigation builder something real to link to — including
// one unpublished page so the disabled/tooltip state is demonstrable.)

// Stable ids so the starter navigation below can reference these pages.
const DEMO_PAGES = [
  { id: 'page-home', title: 'Homepage', slug: '/', status: 'published' },
  { id: 'page-about', title: 'About us', slug: '/about', status: 'published' },
  { id: 'page-resources', title: 'Resources', slug: '/resources', status: 'published' },
  { id: 'page-video', title: 'Video lessons', slug: '/resources/video-lessons', status: 'published' },
  { id: 'page-worksheets', title: 'Worksheets', slug: '/resources/worksheets', status: 'draft' },
  { id: 'page-locations', title: 'Locations', slug: '/locations', status: 'published' },
  { id: 'page-pricing', title: 'Pricing', slug: '/pricing', status: 'published' },
  { id: 'page-contact', title: 'Contact', slug: '/contact', status: 'published' },
];

const LABEL_MAX = 120;
const URL_MAX = 2048;
const MAX_ITEMS = 200; // total nodes, bounds the payload
const MAX_DEPTH = 2; // parent + one level of subpages

// Header configuration. `nav: 'aligned'` renders as "Inline" when the logo is
// left, or "Center" when the logo is centered (the second toggle option tracks
// the logo). Colours carry a 0–100 opacity.
const HEADER_DEFAULTS = {
  logo: 'left',
  nav: 'left',
  background: { color: '#FFFFFF', opacity: 100 },
  links: { color: '#3D3F42', opacity: 100 },
};

// Footer: which standard elements show, plus an ordered list of custom links.
const FOOTER_DEFAULTS = {
  showLogo: false,
  showNavigation: false,
  links: [],
};

module.exports = { DEMO_PAGES, LABEL_MAX, URL_MAX, MAX_ITEMS, MAX_DEPTH, HEADER_DEFAULTS, FOOTER_DEFAULTS };
