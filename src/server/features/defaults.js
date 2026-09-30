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
    configured: false,
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

// Research participant accounts start with Databases already set up and two
// sample databases, so usability-test participants aren't shown an empty page.
module.exports.RESEARCH_PARTICIPANT_DATABASES_DEFAULTS = {
  configured: true,
  entries: [
    {
      id: 'dbe_proquest_one_psychology',
      title: 'ProQuest One Psychology',
      url: 'https://about.proquest.com/en/products-services/proquest-one-psychology',
      urlAlias: '',
      description: 'ProQuest One Psychology provides scholarly and multimedia resources for psychology and counseling research, teaching, and learning. Content includes journals, ebooks, dissertations, therapy videos, counseling transcripts, research methods, tests and measures, and materials covering psychological conditions and therapeutic approaches.',
      image: null,
      terms: [
        { categoryId: 'cat_subject', term: 'Psychology' },
        { categoryId: 'cat_subject', term: 'Social Sciences' },
        { categoryId: 'cat_database_type', term: 'Research database' },
      ],
      featured: false,
    },
    {
      id: 'dbe_cinahl',
      title: 'CINAHL',
      url: 'https://about.ebsco.com/products/research-databases/cinahl-database',
      urlAlias: '',
      description: 'CINAHL provides comprehensive coverage of nursing and allied health literature, including journal articles, evidence-based resources, research reports, and clinical information. It supports research across nursing, rehabilitation, nutrition, health education, and other healthcare disciplines.',
      image: null,
      terms: [
        { categoryId: 'cat_subject', term: 'Nursing' },
        { categoryId: 'cat_subject', term: 'Health & Medicine' },
        { categoryId: 'cat_database_type', term: 'Research database' },
        { categoryId: 'cat_database_type', term: 'Index & abstracts' },
      ],
      featured: false,
    },
  ],
  categories: [
    { id: 'cat_subject', name: 'Subject', terms: ['Health & Medicine', 'Psychology', 'Nursing', 'Social Sciences', 'Health & Wellness'] },
    { id: 'cat_database_type', name: 'Database type', terms: ['Research database', 'Reference database', 'Index & abstracts'] },
  ],
  display: { azIndex: true, filters: true, sortOrder: 'title', groupBy: 'none', resultsPerPage: 25 },
  fieldLabels: module.exports.DATABASES_DEFAULTS.fieldLabels,
};
