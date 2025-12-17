const THEME_STORAGE_KEY = 'color-theme';
const LIGHT_STYLESHEET = '/bootstrap/light.css';
const DARK_STYLESHEET = '/bootstrap/dark.css';
const root = document.documentElement;
let stylesheetRef = document.querySelector('#custom-css');
let currentTheme = 'light';

function getStylesheet () {
  if (stylesheetRef && document.contains(stylesheetRef)) {
    return stylesheetRef;
  }
  stylesheetRef = document.querySelector('#custom-css');
  return stylesheetRef;
}

function normalizeTheme (theme) {
  return theme === 'dark' ? 'dark' : 'light';
}

function syncBodyClass (theme) {
  const body = document.body;
  if (!body) { return; }
  body.classList.toggle('dark', theme === 'dark');
  body.classList.toggle('light', theme === 'light');
}

function setThemeOnDocument (theme) {
  const normalized = normalizeTheme(theme);
  const stylesheet = getStylesheet();
  if (stylesheet) {
    const href = normalized === 'dark' ? DARK_STYLESHEET : LIGHT_STYLESHEET;
    stylesheet.setAttribute('href', href);
  }

  root.classList.toggle('dark', normalized === 'dark');
  root.classList.toggle('light', normalized === 'light');
  root.dataset.theme = normalized;
  syncBodyClass(normalized);
  currentTheme = normalized;
  return normalized;
}

function getStoredTheme () {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return (stored === 'dark' || stored === 'light') ? stored : null;
  } catch (error) {
    return null;
  }
}

function systemPreferredTheme () {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'light';
}

function resolvePreferredTheme () {
  return getStoredTheme() || systemPreferredTheme();
}

function applyTheme (theme, { persist = false } = {}) {
  const normalized = setThemeOnDocument(theme);
  if (persist) {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, normalized);
    } catch (error) {
      // Ignore storage errors (e.g., privacy mode)
    }
  }
  return normalized;
}

function setTheme (theme) {
  return applyTheme(theme, { persist: true });
}

function resetTheme () {
  try {
    window.localStorage.removeItem(THEME_STORAGE_KEY);
  } catch (error) {
    // Ignore storage errors
  }
  return applyTheme(resolvePreferredTheme());
}

function getTheme () {
  return currentTheme;
}

applyTheme(resolvePreferredTheme());

const prefersDarkMedia = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
if (prefersDarkMedia) {
  const handler = (event) => {
    if (getStoredTheme()) { return; }
    setThemeOnDocument(event.matches ? 'dark' : 'light');
  };

  if (typeof prefersDarkMedia.addEventListener === 'function') {
    prefersDarkMedia.addEventListener('change', handler);
  } else if (typeof prefersDarkMedia.addListener === 'function') {
    prefersDarkMedia.addListener(handler);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  syncBodyClass(currentTheme);
});

window.__setColorTheme = setTheme;
window.__resetColorTheme = resetTheme;
window.__getColorTheme = getTheme;
