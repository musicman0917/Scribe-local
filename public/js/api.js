/**
 * Thin fetch wrappers for the Scribe Local REST API.
 */
const Api = (() => {
  async function request(method, url, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    if (res.status === 204) return null;
    const contentType = res.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await res.json() : await res.text();
    if (!res.ok) {
      const message = (data && data.error) || `Request failed: ${res.status}`;
      throw new Error(message);
    }
    return data;
  }

  return {
    // Tutorials
    listTutorials: () => request('GET', '/api/tutorials'),
    createTutorial: (payload) => request('POST', '/api/tutorials', payload),
    getTutorial: (id) => request('GET', `/api/tutorials/${id}`),
    updateTutorial: (id, payload) => request('PATCH', `/api/tutorials/${id}`, payload),
    deleteTutorial: (id) => request('DELETE', `/api/tutorials/${id}`),

    // Steps
    updateStep: (tutorialId, stepId, payload) =>
      request('PATCH', `/api/tutorials/${tutorialId}/steps/${stepId}`, payload),
    deleteStep: (tutorialId, stepId) =>
      request('DELETE', `/api/tutorials/${tutorialId}/steps/${stepId}`),
    reorderSteps: (tutorialId, stepIds) =>
      request('POST', `/api/tutorials/${tutorialId}/steps/reorder`, { stepIds }),

    // Capture
    captureStatus: () => request('GET', '/api/capture/status'),
    startCapture: (tutorialId) => request('POST', `/api/capture/${tutorialId}/start`),
    stopCapture: (tutorialId) => request('POST', `/api/capture/${tutorialId}/stop`),
    manualShot: (tutorialId) => request('POST', `/api/capture/${tutorialId}/manual-shot`),
    manualStep: (tutorialId, payload) =>
      request('POST', `/api/capture/${tutorialId}/manual-step`, payload),

    // Ollama
    smartCrop: (tutorialId, stepId) =>
      request('POST', `/api/ollama/${tutorialId}/steps/${stepId}/smart-crop`),
    describeStep: (tutorialId, stepId, context) =>
      request('POST', `/api/ollama/${tutorialId}/steps/${stepId}/describe`, { context }),

    // Settings
    getSettings: () => request('GET', '/api/settings'),
    saveSettings: (payload) => request('PUT', '/api/settings', payload),
    testOllama: (host) => request('POST', '/api/settings/ollama/test', { host }),

    // Redaction
    applyRedactions: (tutorialId, stepId, rects) =>
      request('POST', `/api/redact/${tutorialId}/steps/${stepId}`, { rects }),

    // Export (direct downloads, not JSON)
    exportUrl: (tutorialId, format) => `/api/export/${tutorialId}/${format}`
  };
})();
