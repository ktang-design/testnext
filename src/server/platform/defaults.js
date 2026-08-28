'use strict';
// Factory defaults + option lists for the Platform settings pages.

module.exports = {
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
  GA4_RE: /^G-[A-Z0-9]{10}$/i,
  GA4_MAX: 12,

  // EBSCO Discovery Service (Platform > Integrations). The endpoint URL is
  // fixed/read-only; authType ships with a sensible default. The API password
  // is stored per-user and round-trips as-is — the input masks it (type=
  // password); a production build should keep the secret write-only.
  EDS_ENDPOINT: 'https://eds-api.ebscohost.com/edsapi/rest',
  EDS_DEFAULTS: {
    apiUsername: '',
    apiPassword: '',
    customerId: '',
    groupId: '',
    profile: '',
    opid: '',
    authType: 'cookie,url,ip,sso,uid',
  },
  EDS_MAX: 100,
};
