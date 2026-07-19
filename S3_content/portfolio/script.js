const introLoader = document.querySelector("[data-intro-loader]");
const introName = document.querySelector(".intro-name");
const heroName = document.querySelector("[data-hero-name]");

function alignIntroName() {
  if (!introName || !heroName) return;
  const rect = heroName.getBoundingClientRect();
  const styles = getComputedStyle(heroName);
  document.documentElement.style.setProperty("--intro-name-left", `${rect.left}px`);
  document.documentElement.style.setProperty("--intro-name-top", `${rect.top}px`);
  document.documentElement.style.setProperty("--intro-name-width", `${rect.width}px`);
  document.documentElement.style.setProperty("--intro-name-height", `${rect.height}px`);
  document.documentElement.style.setProperty("--intro-name-font-family", styles.fontFamily);
  document.documentElement.style.setProperty("--intro-name-font-size", styles.fontSize);
  document.documentElement.style.setProperty("--intro-name-font-weight", styles.fontWeight);
  document.documentElement.style.setProperty("--intro-name-line-height", styles.lineHeight);
  document.documentElement.style.setProperty("--intro-name-letter-spacing", styles.letterSpacing);
  document.documentElement.style.setProperty("--intro-name-text-align", styles.textAlign);
}

alignIntroName();
window.addEventListener("resize", alignIntroName);

function finishIntro() {
  document.body.classList.remove("intro-active");
  window.removeEventListener("resize", alignIntroName);
  introLoader?.remove();
}

introLoader?.addEventListener("animationend", (event) => {
  if (event.animationName !== "intro-fade") return;
  finishIntro();
});
window.setTimeout(finishIntro, 5700);

const revealTargets = document.querySelectorAll(".section-reveal");

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.15 }
);

revealTargets.forEach((target) => revealObserver.observe(target));

const gallery = document.querySelector("[data-gallery]");
const lightbox = document.querySelector("[data-lightbox]");
const lightboxImg = document.querySelector("[data-lightbox-img]");
const lightboxClose = document.querySelector("[data-lightbox-close]");

if (gallery) {
  fetch("manifest.txt")
    .then((response) => response.text())
    .then((text) => {
      const items = text
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [file, caption] = line.split("|");
          return { file, caption };
        });

      gallery.innerHTML = items
        .map(
          (item) => `
          <button class="gallery-item" type="button" data-src="images/${item.file}" aria-label="Open ${item.caption}">
            <img src="images/${item.file}" alt="${item.caption}" loading="lazy" />
            <span>${item.caption}</span>
          </button>
        `
        )
        .join("");
    });
}

document.addEventListener("click", (event) => {
  const item = event.target.closest("[data-src]");
  if (!item || !lightbox || !lightboxImg) return;
  lightboxImg.src = item.dataset.src;
  lightboxImg.alt = item.querySelector("img")?.alt || "Expanded illustration";
  lightbox.classList.add("open");
  lightbox.setAttribute("aria-hidden", "false");
});

function closeLightbox() {
  if (!lightbox || !lightboxImg) return;
  lightbox.classList.remove("open");
  lightbox.setAttribute("aria-hidden", "true");
  lightboxImg.src = "";
}

lightboxClose?.addEventListener("click", closeLightbox);
lightbox?.addEventListener("click", (event) => {
  if (event.target === lightbox) closeLightbox();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeLightbox();
});
