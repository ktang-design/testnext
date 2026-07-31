'use strict';
// Factory defaults + option lists for the Features > Bento page.

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
};
