(() => {
  const els = {
    host: document.getElementById('ollama-host'),
    model: document.getElementById('ollama-model'),
    enabled: document.getElementById('ollama-enabled'),
    highlightColor: document.getElementById('highlight-color'),
    highlightStroke: document.getElementById('highlight-stroke'),
    badgeColor: document.getElementById('badge-color'),
    badgeTextColor: document.getElementById('badge-text-color'),
    accessibilityEnabled: document.getElementById('accessibility-enabled'),
    accessibilityPlatformNote: document.getElementById('accessibility-platform-note'),
    testBtn: document.getElementById('test-btn'),
    saveBtn: document.getElementById('save-btn'),
    statusMsg: document.getElementById('status-msg'),
    modelsBox: document.getElementById('models-box')
  };

  async function load() {
    const settings = await Api.getSettings();
    els.host.value = settings.ollama.host;
    els.model.value = settings.ollama.visionModel;
    els.enabled.checked = settings.ollama.enabled;
    els.highlightColor.value = settings.capture.highlightColor;
    els.highlightStroke.value = settings.capture.highlightStroke;
    els.badgeColor.value = settings.capture.badgeColor;
    els.badgeTextColor.value = settings.capture.badgeTextColor;
    els.accessibilityEnabled.checked = settings.accessibility.enabled;

    const status = await Api.captureStatus();
    if (!status.accessibilityAvailable) {
      els.accessibilityEnabled.disabled = true;
      els.accessibilityPlatformNote.textContent = `Not available on this server's OS (${status.platform}) yet — this only works on Windows for now.`;
    } else {
      els.accessibilityPlatformNote.textContent = 'Supported on this server (Windows UI Automation).';
    }
  }

  els.testBtn.addEventListener('click', async () => {
    els.testBtn.disabled = true;
    els.statusMsg.textContent = 'Testing…';
    els.statusMsg.className = 'text-sm text-gray-500';
    els.modelsBox.classList.add('hidden');
    try {
      const result = await Api.testOllama(els.host.value);
      if (result.ok) {
        els.statusMsg.textContent = '✓ Connected';
        els.statusMsg.className = 'text-sm text-green-600';
        if (result.models && result.models.length) {
          els.modelsBox.textContent = `Available models: ${result.models.join(', ')}`;
          els.modelsBox.classList.remove('hidden');
        }
      } else {
        els.statusMsg.textContent = `✗ ${result.error}`;
        els.statusMsg.className = 'text-sm text-red-600';
      }
    } catch (err) {
      els.statusMsg.textContent = `✗ ${err.message}`;
      els.statusMsg.className = 'text-sm text-red-600';
    } finally {
      els.testBtn.disabled = false;
    }
  });

  els.saveBtn.addEventListener('click', async () => {
    els.saveBtn.disabled = true;
    try {
      await Api.saveSettings({
        ollama: {
          host: els.host.value,
          visionModel: els.model.value,
          enabled: els.enabled.checked
        },
        capture: {
          highlightColor: els.highlightColor.value,
          highlightStroke: els.highlightStroke.value,
          badgeColor: els.badgeColor.value,
          badgeTextColor: els.badgeTextColor.value
        },
        accessibility: {
          enabled: els.accessibilityEnabled.checked
        }
      });
      els.statusMsg.textContent = '✓ Saved';
      els.statusMsg.className = 'text-sm text-green-600';
      setTimeout(() => { els.statusMsg.textContent = ''; }, 1500);
    } finally {
      els.saveBtn.disabled = false;
    }
  });

  load();
})();
