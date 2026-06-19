'use strict';
// Stand-in "published pages" output and a starter navigation tree.
// (The full Pages builder is a separate Website layer; until it exists these
// seed rows give the navigation builder something real to link to — including
// one unpublished page so the disabled/tooltip state is demonstrable.)

// Stable ids so the starter navigation below can reference these pages.
const DEMO_PAGES = [
  { id: 'page-home', title: 'Home', slug: '/', status: 'published' },
  { id: 'page-about', title: 'About us', slug: '/about', status: 'published' },
  { id: 'page-resources', title: 'Resources', slug: '/resources', status: 'published' },
  { id: 'page-video', title: 'Video lessons', slug: '/resources/video-lessons', status: 'published' },
  { id: 'page-worksheets', title: 'Worksheets', slug: '/resources/worksheets', status: 'draft' },
  { id: 'page-locations', title: 'Locations', slug: '/locations', status: 'published' },
  { id: 'page-pricing', title: 'Pricing', slug: '/pricing', status: 'published' },
  { id: 'page-contact', title: 'Contact', slug: '/contact', status: 'published' },
];

// Mirrors the populated design: About us, Resources › (Video lessons,
// Worksheets), Locations. Worksheets links to the unpublished page above.
const DEFAULT_NAV = [
  { id: 'nav-about', type: 'page', pageId: 'page-about', url: null, label: 'About us', children: [] },
  {
    id: 'nav-resources', type: 'page', pageId: 'page-resources', url: null, label: 'Resources',
    children: [
      { id: 'nav-video', type: 'page', pageId: 'page-video', url: null, label: 'Video lessons', children: [] },
      { id: 'nav-worksheets', type: 'page', pageId: 'page-worksheets', url: null, label: 'Worksheets', children: [] },
    ],
  },
  { id: 'nav-locations', type: 'page', pageId: 'page-locations', url: null, label: 'Locations', children: [] },
];

const LABEL_MAX = 120;
const URL_MAX = 2048;
const MAX_ITEMS = 200; // total nodes, bounds the payload
const MAX_DEPTH = 2; // parent + one level of subpages

module.exports = { DEMO_PAGES, DEFAULT_NAV, LABEL_MAX, URL_MAX, MAX_ITEMS, MAX_DEPTH };
