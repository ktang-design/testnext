'use strict';
// Factory defaults for Site details. These are the "Reset to default" target —
// the same for every account. (Apostrophe is U+2019 to match the UI copy.)

module.exports = {
  FACTORY_DEFAULTS: {
    name: 'StacksNext',
    description: 'The world’s most powerful and accessible library website builder.',
  },
  NAME_MAX: 100,
  DESCRIPTION_MAX: 300,

  // Factory defaults for the Branding page.
  BRANDING_DEFAULTS: {
    primaryColor: '#255096',
    secondaryColor: '#3D3F42',
    logo: null, // data URL or null
    showSiteName: false,
    decorative: false,
    altText: 'Logo',
    favicon: null, // data URL or null
  },
  ALT_TEXT_MAX: 125,
};
