// CS 506 · Week 3 Starter · Lightbox
// A small image-overlay feature, ~40 lines of vanilla JavaScript.
// Four concepts on display: DOM, events, state, security.

// ── DOM refs (cached once at load time) ─────────────────────────────────
const lb       = document.querySelector('.lightbox');
const lbImg    = lb.querySelector('.lightbox__img');
const lbCap    = lb.querySelector('.lightbox__caption');
const thumbs   = document.querySelectorAll('.gallery__thumb');

// ── State ───────────────────────────────────────────────────────────────
const state = {
  isOpen: false,
  index: 0,
  images: Array.from(thumbs).map((thumb) => {
    const captionNode = thumb.closest('.photo')?.querySelector('p');
    return {
      src: thumb.getAttribute('src'),
      caption: captionNode ? captionNode.textContent : thumb.getAttribute('alt') || 'Portfolio image',
      alt: thumb.getAttribute('alt') || 'Portfolio image',
    };
  }),
};

// ── Mutators ────────────────────────────────────────────────────────────
function openLightbox(i) {
  state.isOpen = true;
  state.index = i;
  render();
}

function closeLightbox() {
  state.isOpen = false;
  render();
}

// ── Render (state → DOM) ────────────────────────────────────────────────
function render() {
  if (state.isOpen) {
    const { src, caption, alt } = state.images[state.index];
    lbImg.setAttribute('src', src);
    lbImg.setAttribute('alt', alt);
    lbCap.textContent = caption;
    lb.classList.add('open');
    lb.setAttribute('aria-hidden', 'false');
  } else {
    lb.classList.remove('open');
    lb.setAttribute('aria-hidden', 'true');
  }
}

// ── Event listeners ─────────────────────────────────────────────────────
thumbs.forEach((thumb, i) => {
  thumb.addEventListener('click', () => openLightbox(i));
});

lb.addEventListener('click', (e) => {
  if (e.target === lb) closeLightbox();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.isOpen) closeLightbox();
});
