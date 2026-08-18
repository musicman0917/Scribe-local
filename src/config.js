const fs = require('fs');
const path = require('path');

const CONFIG_DIR = path.join(__dirname, '..', 'config');
const SETTINGS_PATH = path.join(CONFIG_DIR, 'settings.json');
const EXAMPLE_PATH = path.join(CONFIG_DIR, 'settings.example.json');

const DEFAULTS = {
  ollama: {
    host: 'http://localhost:11434',
    visionModel: 'llava',
    enabled: true,
    timeoutMs: 60000
  },
  capture: {
    highlightColor: 'rgba(255, 214, 0, 0.35)',
    highlightStroke: 'rgba(255, 179, 0, 0.9)',
    badgeColor: '#111827',
    badgeTextColor: '#ffffff'
  },
  accessibility: {
    enabled: true
  }
};

function ensureConfigFile() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!fs.existsSync(SETTINGS_PATH)) {
    const seed = fs.existsSync(EXAMPLE_PATH)
      ? JSON.parse(fs.readFileSync(EXAMPLE_PATH, 'utf-8'))
      : DEFAULTS;
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(seed, null, 2));
  }
}

function getSettings() {
  ensureConfigFile();
  const raw = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
  return {
    ollama: { ...DEFAULTS.ollama, ...(raw.ollama || {}) },
    capture: { ...DEFAULTS.capture, ...(raw.capture || {}) },
    accessibility: { ...DEFAULTS.accessibility, ...(raw.accessibility || {}) }
  };
}

function saveSettings(partial) {
  const current = getSettings();
  const next = {
    ollama: { ...current.ollama, ...(partial.ollama || {}) },
    capture: { ...current.capture, ...(partial.capture || {}) },
    accessibility: { ...current.accessibility, ...(partial.accessibility || {}) }
  };
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(next, null, 2));
  return next;
}

module.exports = { getSettings, saveSettings, DEFAULTS, SETTINGS_PATH };
