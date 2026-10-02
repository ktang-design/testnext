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

// An image block: a Cards element with a single card that has just an image.
const imageElement = (id, file, column) => ({
  id,
  type: 'cards',
  title: file,
  displayTitle: false,
  column,
  cardLayout: 'image-first',
  radius: 'small',
  imageMode: 'full',
  imageSize: '4:3',
  imageFit: 'cover',
  style: style(),
  cards: [{ id: `${id}-card`, image: imageDataUrl(file), imageName: file, title: '', description: '', href: '' }],
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
            imageDataUrl('kids.jpg'), 'kids.jpg'),
          card('card-teens', 'Teens',
            'A space of their own for ages 12 to 18, with graphic novels, homework help, gaming nights, and a maker lab for creative projects.',
            imageDataUrl('teens.jpg'), 'teens.jpg'),
          card('card-adults', 'Adults',
            'Bestsellers, research help, career resources, and classes, plus quiet reading corners for an afternoon with a good book.',
            imageDataUrl('adults.jpg'), 'adults.jpg'),
        ],
      },
    ]),
    section('sec-card', 'Get a library card', [
      imageElement('el-library-card', 'library-card.jpg', 0),
      richtext(
        'el-connect',
        'Get a library card',
        '<h2>Get a library card</h2>' +
        '<p>Cards are free for residents and students. Bring a photo ID to any service desk to sign up, ' +
        'then borrow books, stream movies, and use our research databases from home.</p>',
        1
      ),
    ], { columns: 2 }),
    section('sec-hours', 'Hours and location', [
      richtext(
        'el-hours',
        'Hours',
        '<h2>Hours</h2>' +
        '<ul><li>Monday to Thursday: 9 a.m. to 8 p.m.</li><li>Friday: 9 a.m. to 5 p.m.</li>' +
        '<li>Saturday: 10 a.m. to 4 p.m.</li><li>Sunday: 12 p.m. to 4 p.m.</li></ul>',
        0
      ),
      imageElement('el-hours-location', 'hours-location.jpg', 1),
    ], { columns: 2 }),
  ],
};

module.exports = { SAMPLE_HOMEPAGE_CONTENT };
