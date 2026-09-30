'use strict';
// Factory defaults + option lists for the Features > Bento and
// Features > Databases pages.

module.exports = {
  // A fresh account has no blocks. Whether a search integration is configured
  // is derived from the EBSCO Discovery Service settings (not stored here).
  BENTO_DEFAULTS: {
    blocks: [],
  },

  BENTO_MAX: { name: 120, blocks: 50 },

  // Option lists for the "Create EDS bento block" modal. In production these are
  // returned by the customer's configured EDS instance; until EDS is wired up we
  // ship a representative static set. '' = the "All options" placeholder.
  BENTO_OPTIONS: {
    sourceType: ['Catalog', 'Articles', 'Databases', 'eBooks', 'Journals'],
    contentProvider: ['EBSCO', 'JSTOR', 'ProQuest', 'Gale', 'ScienceDirect'],
    subjects: ['Business', 'Health Sciences', 'Education', 'Engineering', 'Humanities'],
  },

  // A fresh account has no entries/categories and the 4 fixed fields keep
  // their factory labels/order.
  DATABASES_DEFAULTS: {
    entries: [],
    categories: [],
    display: { azIndex: false, filters: false, sortOrder: 'title', groupBy: 'none', resultsPerPage: 25 },
    fieldLabels: [
      { key: 'title', label: 'Title' },
      { key: 'url', label: 'URL' },
      { key: 'description', label: 'Description' },
      { key: 'image', label: 'Image' },
    ],
  },

  DATABASES_OPTIONS: {
    sortOrder: ['title', 'dateAdded'],
    groupBy: ['none', 'category'],
    resultsPerPage: [10, 25, 50, 100],
  },

  DATABASES_MAX: {
    title: 120, url: 2048, urlAlias: 120, description: 2000,
    categoryName: 60, term: 60, fieldLabel: 60,
    entries: 200, categories: 3, termsPerCategory: 20,
  },
};
