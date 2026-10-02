'use strict';
// Starter Homepage content for Guest access and brand-new accounts: a believable
// library homepage (welcome text, a Cards element of events and new books, and
// visiting information) so the Page Builder canvas never opens empty. Card images
// use the one bundled placeholder; the shape matches normalizeContent() in
// routes/pages.js.

const fs = require('fs');
const path = require('path');

const PLACEHOLDER = '/website/assets/card-placeholder.jpg';

// Bookshelf illustration behind the opening section (website/assets), inlined as
// a data URL because section background images are stored that way.
function imageDataUrl(file) {
  try {
    const bytes = fs.readFileSync(path.join(__dirname, '..', '..', 'website', 'assets', file));
    const mime = file.endsWith('.svg') ? 'image/svg+xml' : 'image/jpeg';
    return `data:${mime};base64,${bytes.toString('base64')}`;
  } catch (_) { return null; } // no image if the file is missing
}
const libraryBackground = imageDataUrl('library-background.svg');

const style = () => ({
  heading: { color: '#3D3F42', opacity: 100 },
  text: { color: '#55585D', opacity: 100 },
  link: { color: '#255096', opacity: 100 },
  background: { color: '#FFFFFF', opacity: 0 },
  borderWidth: '1',
  borderSides: { top: true, right: true, bottom: true, left: true },
  borderColor: { color: '#FFFFFF', opacity: 0 },
});

const card = (id, title, description, image = PLACEHOLDER, imageName = 'card-placeholder.jpg') => ({
  id, image, imageName, title, description: `<p>${description}</p>`, href: '',
});

const richtext = (id, title, body, column = 0, textStyle) => ({
  id, type: 'richtext', title, displayTitle: false, column, body, style: textStyle || style(),
});

// Light heading + text for the dark library background.
const lightStyle = () => ({
  ...style(),
  heading: { color: '#FFFFFF', opacity: 100 },
  text: { color: '#FFFFFF', opacity: 100 },
  link: { color: '#FFFFFF', opacity: 100 },
});

const section = (id, title, elements, opts = {}) => ({
  id,
  title,
  displayTitle: false,
  columns: opts.columns || 1,
  background: opts.background || { color: '#FFFFFF', opacity: 100 },
  backgroundImage: opts.backgroundImage || null,
  elements,
});

const SAMPLE_HOMEPAGE_CONTENT = {
  sections: [
    section('sec-welcome', 'Welcome', [
      richtext(
        'el-welcome',
        'Welcome',
        '<h1>Stratum Library</h1>' +
        '<p class="rt-p1">Your local public library for books, learning, community programs,<br>quiet spaces, and discovering something new.</p>',
        0,
        lightStyle()
      ),
    ], { background: { color: '#2B1D13', opacity: 100 }, backgroundImage: libraryBackground }),
    section('sec-browse', 'Find your next read', [
      {
        id: 'el-browse',
        type: 'cards',
        title: 'Something for every reader',
        displayTitle: false,
        column: 0,
        cardLayout: 'image-first',
        radius: 'small',
        imageMode: 'full',
        imageSize: '16:9',
        imageFit: 'cover',
        style: style(),
        cards: [
          card('card-kids', 'Kids',
            'Storytimes, picture books, and hands-on activities that help children from babies to age 11 fall in love with reading. Visit the Children’s Room to find a new favorite.',
            imageDataUrl('card-kids.jpg'), 'kids.jpg'),
          card('card-teens', 'Teens',
            'A space of their own for ages 12 to 18, with graphic novels, homework help, gaming nights, and a maker lab for creative projects.',
            imageDataUrl('card-teens.jpg'), 'teens.jpg'),
          card('card-adults', 'Adults',
            'Bestsellers, research help, career resources, and classes, plus quiet reading corners for an afternoon with a good book.',
            imageDataUrl('card-adults.jpg'), 'adults.jpg'),
        ],
      },
    ]),
    section('sec-featured', 'Featured this month', [
      {
        id: 'el-featured',
        type: 'cards',
        title: 'Events and new arrivals',
        displayTitle: true,
        column: 0,
        cardLayout: 'image-first',
        radius: 'small',
        imageMode: 'full',
        imageSize: '16:9',
        imageFit: 'cover',
        style: style(),
        cards: [
          card('card-author', 'Author talk: Our shared stories',
            'Join local author Maria Alvarez on Thursday at 6 p.m. in the Reading Room for a conversation and book signing.'),
          card('card-fiction', 'Staff picks: new fiction',
            'Browse the newest novels and short story collections chosen by our librarians, then place a hold online or pick one up at the front desk.'),
          card('card-storytime', 'Family storytime',
            'Every Saturday at 10 a.m. Songs, stories, and simple crafts for children ages 3 to 7 and their caregivers.'),
          card('card-research', 'Research help, one on one',
            'Book a 30-minute session with a librarian to get started with databases, citations, and your next project.'),
        ],
      },
    ], { background: { color: '#F5F5F5', opacity: 100 } }),
    section('sec-visit', 'Visit us', [
      richtext(
        'el-hours',
        'Hours',
        '<h3>Hours</h3>' +
        '<ul><li>Monday to Thursday: 9 a.m. to 8 p.m.</li><li>Friday: 9 a.m. to 5 p.m.</li>' +
        '<li>Saturday: 10 a.m. to 4 p.m.</li><li>Sunday: 12 p.m. to 4 p.m.</li></ul>',
        0
      ),
      richtext(
        'el-connect',
        'Connect',
        '<h3>Get a library card</h3>' +
        '<p>Cards are free for residents and students. Bring a photo ID to any service desk to sign up, ' +
        'then borrow books, stream movies, and use our research databases from home.</p>',
        1
      ),
    ], { columns: 2 }),
  ],
};

module.exports = { SAMPLE_HOMEPAGE_CONTENT };
