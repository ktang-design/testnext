'use strict';
// Factory defaults + option lists for the Platform settings pages.

module.exports = {
  COMMUNICATION_DEFAULTS: {
    systemEmail: '',
    phone: '',
    businessAddress: '',
  },
  // Reasonable upper bounds so a bad client can't store huge blobs.
  COMMUNICATION_MAX: { systemEmail: 254, phone: 40, businessAddress: 300 },

  LANGUAGE_DEFAULTS: {
    timezone: 'America/New_York',
    timeFormat: '12h', // '12h' | '24h'
    // Default language is configured at account setup and shown read-only.
    defaultLanguage: 'English',
  },
  // Allowed option values (validated server-side).
  TIMEZONES: [
    'Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles', 'America/Denver',
    'America/Chicago', 'America/New_York', 'UTC', 'Europe/London', 'Europe/Paris',
    'Europe/Berlin', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney',
  ],
  TIME_FORMATS: ['12h', '24h'],

  ANALYTICS_DEFAULTS: {
    ga4MeasurementId: '',
  },
  // GA4 IDs look like G-XXXXXXXXXX (letters/digits after G-).
  GA4_RE: /^G-[A-Z0-9]{4,20}$/i,
  GA4_MAX: 24,
};
