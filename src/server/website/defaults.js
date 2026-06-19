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

// Typography: font family + heading/body size & weight. Each select's value is
// 'default' or one of the explicit option values below.
const TYPOGRAPHY_DEFAULTS = {
  fontFamily: 'Inter',
  headingSize: 'default',
  headingWeight: 'default',
  bodySize: 'default',
  bodyWeight: 'default',
};
const TYPOGRAPHY_OPTIONS = {
  headingSize: ['default', '20', '28', '32', '36', '40'],
  headingWeight: ['default', '400', '500', '600', '700'],
  bodySize: ['default', '14', '18', '20'],
  bodyWeight: ['default', '400', '500', '600', '700'],
};

// Website branding: a logo override plus the brand colour palette applied
// across the site. Each colour carries a 0–100 opacity.
const WEBSITE_BRANDING_DEFAULTS = {
  logo: null,
  primary: { color: '#255096', opacity: 100 },
  secondary: { color: '#3D3F42', opacity: 100 },
  heading: { color: '#3D3F42', opacity: 100 },
  body: { color: '#55585D', opacity: 100 },
  link: { color: '#255096', opacity: 100 },
};
const WEBSITE_BRANDING_COLORS = ['primary', 'secondary', 'heading', 'body', 'link'];

module.exports = {
  DEMO_PAGES, LABEL_MAX, URL_MAX, MAX_ITEMS, MAX_DEPTH,
  HEADER_DEFAULTS, FOOTER_DEFAULTS, TYPOGRAPHY_DEFAULTS, TYPOGRAPHY_OPTIONS,
  WEBSITE_BRANDING_DEFAULTS, WEBSITE_BRANDING_COLORS,
};
