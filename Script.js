const themeButton = document.querySelector('.theme-toggle');
const themeColor = document.querySelector('meta[name="theme-color"]');

function updateThemeControls() {
  const isDark = document.documentElement.dataset.theme === 'dark';
  themeButton.setAttribute('aria-pressed', String(isDark));
  themeButton.title = isDark ? '切换到浅色' : '切换到深色';
  themeColor.content = isDark ? '#151513' : '#f4f0e8';
}

updateThemeControls();

themeButton.addEventListener('click', () => {
  const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = nextTheme;
  localStorage.setItem('theme', nextTheme);
  updateThemeControls();
});

document.getElementById('year').textContent = new Date().getFullYear();

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));

const navigationLinks = [...document.querySelectorAll('.nav a')];
const sections = navigationLinks
  .map((link) => document.querySelector(link.getAttribute('href')))
  .filter(Boolean);

const sectionObserver = new IntersectionObserver((entries) => {
  const visibleSection = entries
    .filter((entry) => entry.isIntersecting)
    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

  if (!visibleSection) return;
  navigationLinks.forEach((link) => {
    const isActive = link.getAttribute('href') === `#${visibleSection.target.id}`;
    link.classList.toggle('active', isActive);
    if (isActive) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  });
}, { rootMargin: '-35% 0px -55%', threshold: [0, 0.2, 0.6] });

sections.forEach((section) => sectionObserver.observe(section));
