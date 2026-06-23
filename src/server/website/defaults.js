'use strict';
// Every new site/account starts with a single page — the Homepage — which is
// the starred homepage and pinned to the top of the Pages list. Users add more
// pages from there.
const DEFAULT_PAGES = [
  { id: 'page-home', title: 'Homepage', slug: '/', status: 'published', isHomepage: true, description: '' },
];

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 160;
const MAX_PAGES = 100;

// Page content builder (sections + elements) limits.
const SECTION_TITLE_MAX = 120;
const ELEMENT_TITLE_MAX = 120;
const ELEMENT_BODY_MAX = 20000;
const MAX_SECTIONS = 50;
const MAX_ELEMENTS = 100; // per section

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

// Search: the search bar that appears below the navigation. Each configured
// search becomes an option in the bar's dropdown. A search has a name (the
// dropdown label), an optional display label, a URL with a SEARCH_TERM token
// (replaced with the user's query), whether to urlencode that term, and the
// search button label. `type` is 'eds' (EBSCO Discovery Service) or 'custom'.
const SEARCH_NAME_MAX = 120;
const SEARCH_LABEL_MAX = 120;
const SEARCH_BUTTON_MAX = 60;
const MAX_SEARCHES = 20;
const SEARCH_DEFAULTS = {
  background: { color: '#255096', opacity: 100 },
  backgroundImage: null,
  searches: [],
};

module.exports = {
  DEFAULT_PAGES, LABEL_MAX, URL_MAX, MAX_ITEMS, MAX_DEPTH,
  TITLE_MAX, DESCRIPTION_MAX, MAX_PAGES,
  SECTION_TITLE_MAX, ELEMENT_TITLE_MAX, ELEMENT_BODY_MAX, MAX_SECTIONS, MAX_ELEMENTS,
  HEADER_DEFAULTS, FOOTER_DEFAULTS, TYPOGRAPHY_DEFAULTS, TYPOGRAPHY_OPTIONS,
  WEBSITE_BRANDING_DEFAULTS, WEBSITE_BRANDING_COLORS,
  SEARCH_DEFAULTS, SEARCH_NAME_MAX, SEARCH_LABEL_MAX, SEARCH_BUTTON_MAX, MAX_SEARCHES,
};
