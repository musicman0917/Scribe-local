(() => {
  const params = new URLSearchParams(window.location.search);
  const tutorialId = params.get('id');
  if (!tutorialId) {
    document.body.innerHTML = '<p class="p-8 text-center text-gray-500">Missing tutorial id. <a class="underline" href="/">Go back</a>.</p>';
    return;
  }

  const els = {
    title: document.getElementById('tutorial-title'),
    description: document.getElementById('tutorial-description'),
    saveIndicator: document.getElementById('save-indicator'),
    stepsList: document.getElementById('steps-list'),
    emptySteps: document.getElementById('empty-steps'),
    stepCount: document.getElementById('step-count'),
    hookStatus: document.getElementById('hook-status'),
    toggleCaptureBtn: document.getElementById('toggle-capture-btn'),
    toggleCaptureLabel: document.getElementById('toggle-capture-label'),
    manualCaptureBtn: document.getElementById('manual-capture-btn'),
    exportBtn: document.getElementById('export-btn'),
    exportMenu: document.getElementById('export-menu')
  };

  let tutorial = null;
  let capturing = false;
  let draggingStepId = null;

  // ---------- utilities ----------
  function escapeHtml(str = '') {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function flashSaved() {
    els.saveIndicator.textContent = 'Saved';
    setTimeout(() => { els.saveIndicator.textContent = ''; }, 1200);
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  // ---------- header: title/description autosave ----------
  const saveTutorialMeta = debounce(async () => {
    await Api.updateTutorial(tutorialId, {
      title: els.title.value,
      description: els.description.value
    });
    flashSaved();
  }, 500);

  els.title.addEventListener('input', saveTutorialMeta);
  els.description.addEventListener('input', saveTutorialMeta);

  // ---------- export menu ----------
  els.exportBtn.addEventListener('click', () => els.exportMenu.classList.toggle('hidden'));
  document.addEventListener('click', (e) => {
    if (!els.exportBtn.contains(e.target) && !els.exportMenu.contains(e.target)) {
      els.exportMenu.classList.add('hidden');
    }
  });
  document.querySelectorAll('.export-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = Api.exportUrl(tutorialId, item.dataset.format);
      els.exportMenu.classList.add('hidden');
    });
  });

  // ---------- capture status / controls ----------
  async function refreshHookStatus() {
    const status = await Api.captureStatus();
    if (status.hookAvailable) {
      els.hookStatus.textContent = 'Global click capture available — Start Capturing will auto-record every click.';
      els.hookStatus.className = 'text-xs rounded-lg px-3 py-2 mb-3 border border-green-200 bg-green-50 text-green-700';
    } else {
      els.hookStatus.textContent = 'Global click capture unavailable on this system. Use Manual Capture below.';
      els.hookStatus.className = 'text-xs rounded-lg px-3 py-2 mb-3 border border-amber-200 bg-amber-50 text-amber-700';
    }
    return status;
  }

  els.toggleCaptureBtn.addEventListener('click', async () => {
    if (!capturing) {
      await Api.startCapture(tutorialId);
      capturing = true;
      els.toggleCaptureLabel.textContent = 'Stop Capturing';
      els.toggleCaptureBtn.classList.remove('btn-primary');
      els.toggleCaptureBtn.classList.add('btn-danger');
    } else {
      await Api.stopCapture(tutorialId);
      capturing = false;
      els.toggleCaptureLabel.textContent = 'Start Capturing';
      els.toggleCaptureBtn.classList.remove('btn-danger');
      els.toggleCaptureBtn.classList.add('btn-primary');
    }
  });

  // ---------- manual capture flow ----------
  const mcDialog = document.getElementById('manual-capture-dialog');
  const mcImg = document.getElementById('manual-capture-img');
  const mcMarker = document.getElementById('manual-capture-marker');
  const mcConfirm = document.getElementById('manual-capture-confirm');
  let mcState = null; // { filename, x, y }

  els.manualCaptureBtn.addEventListener('click', async () => {
    els.manualCaptureBtn.disabled = true;
    els.manualCaptureBtn.textContent = 'Capturing…';
    try {
      const { filename, imageUrl } = await Api.manualShot(tutorialId);
      mcState = { filename, x: null, y: null };
      mcImg.src = `${imageUrl}?t=${Date.now()}`;
      mcMarker.classList.add('hidden');
      mcConfirm.disabled = true;
      mcDialog.showModal();
    } catch (err) {
      alert(err.message);
    } finally {
      els.manualCaptureBtn.disabled = false;
      els.manualCaptureBtn.textContent = 'Capture Step Now (Manual)';
    }
  });

  document.getElementById('manual-capture-imgwrap').addEventListener('click', (e) => {
    const rect = mcImg.getBoundingClientRect();
    const displayX = e.clientX - rect.left;
    const displayY = e.clientY - rect.top;
    const scaleX = mcImg.naturalWidth / rect.width;
    const scaleY = mcImg.naturalHeight / rect.height;
    mcState.x = Math.round(displayX * scaleX);
    mcState.y = Math.round(displayY * scaleY);
    mcMarker.style.left = `${displayX}px`;
    mcMarker.style.top = `${displayY}px`;
    mcMarker.classList.remove('hidden');
    mcConfirm.disabled = false;
  });

  document.getElementById('manual-capture-cancel').addEventListener('click', () => mcDialog.close());
  document.getElementById('manual-capture-close').addEventListener('click', () => mcDialog.close());

  mcConfirm.addEventListener('click', async () => {
    if (!mcState || mcState.x === null) return;
    mcConfirm.disabled = true;
    try {
      await Api.manualStep(tutorialId, mcState);
      mcDialog.close();
    } catch (err) {
      alert(err.message);
      mcConfirm.disabled = false;
    }
  });

  // ---------- redaction flow ----------
  const redactDialog = document.getElementById('redact-dialog');
  const redactImg = document.getElementById('redact-img');
  const redactCanvas = document.getElementById('redact-canvas');
  let redactTool = null;
  let redactStepId = null;

  function openRedactDialog(step) {
    redactStepId = step.id;
    redactImg.src = `${step.annotatedImageUrl}?t=${Date.now()}`;
    redactDialog.showModal();
    redactImg.onload = () => {
      if (redactTool) redactTool.destroy();
      redactTool = new RedactTool(redactImg, redactCanvas);
      redactTool.getMode = () => document.querySelector('input[name="redact-mode"]:checked').value;
      redactTool.resize();
    };
  }

  window.addEventListener('resize', () => { if (redactTool && !redactDialog.open === false) redactTool.resize(); });

  document.getElementById('redact-close').addEventListener('click', () => redactDialog.close());
  document.getElementById('redact-cancel').addEventListener('click', () => redactDialog.close());
  document.getElementById('redact-undo').addEventListener('click', () => redactTool && redactTool.undoLast());
  document.getElementById('redact-clear').addEventListener('click', () => redactTool && redactTool.reset());

  document.getElementById('redact-apply').addEventListener('click', async () => {
    if (!redactTool) return;
    const rects = redactTool.rects.map((r) => ({
      x: Math.round(r.x), y: Math.round(r.y),
      width: Math.round(r.width), height: Math.round(r.height),
      mode: r.mode
    }));
    const btn = document.getElementById('redact-apply');
    btn.disabled = true;
    btn.textContent = 'Applying…';
    try {
      const updated = await Api.applyRedactions(tutorialId, redactStepId, rects);
      applyStepUpdate(updated);
      redactDialog.close();
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Apply Redaction';
    }
  });

  // ---------- steps rendering ----------
  function stepCard(step) {
    const li = document.createElement('li');
    li.className = 'card p-4 flex gap-4 items-start';
    li.draggable = true;
    li.dataset.stepId = step.id;

    const imgUrl = step.croppedImageUrl || step.annotatedImageUrl || step.rawImageUrl;

    li.innerHTML = `
      <div class="flex flex-col items-center gap-2 pt-1 cursor-grab text-gray-300" title="Drag to reorder">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M7 4a1 1 0 11-2 0 1 1 0 012 0zM7 10a1 1 0 11-2 0 1 1 0 012 0zM7 16a1 1 0 11-2 0 1 1 0 012 0zM15 4a1 1 0 11-2 0 1 1 0 012 0zM15 10a1 1 0 11-2 0 1 1 0 012 0zM15 16a1 1 0 11-2 0 1 1 0 012 0z"/></svg>
        <span class="h-6 w-6 rounded-full bg-gray-900 text-white text-xs font-bold flex items-center justify-center step-order">${step.order}</span>
      </div>
      <div class="w-56 shrink-0">
        <img src="${imgUrl}?t=${Date.parse(step.createdAt) || 0}" class="step-thumb rounded-lg border border-gray-200 w-full object-contain bg-gray-100 cursor-zoom-in" />
        <div class="flex gap-1.5 mt-2 flex-wrap">
          <button class="btn-ghost !text-xs !px-2 !py-1 smart-crop-btn">Smart Crop</button>
          <button class="btn-ghost !text-xs !px-2 !py-1 describe-btn">Auto-Describe</button>
          <button class="btn-ghost !text-xs !px-2 !py-1 redact-btn">Redact</button>
        </div>
      </div>
      <div class="flex-1 min-w-0">
        <input class="step-title font-medium w-full border-none focus:ring-0 focus:outline-none focus:bg-gray-50 rounded px-1 -mx-1 mb-1" value="${escapeHtml(step.title)}" />
        <textarea rows="3" class="step-desc input text-sm" placeholder="Describe this step...">${escapeHtml(step.description || '')}</textarea>
      </div>
      <button class="btn-ghost !px-2 text-red-400 hover:text-red-600 hover:bg-red-50 delete-btn" title="Delete step">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v8a1 1 0 11-2 0V8zm4 0a1 1 0 112 0v8a1 1 0 11-2 0V8z" clip-rule="evenodd"/></svg>
      </button>
    `;

    const saveStepField = debounce(async () => {
      await Api.updateStep(tutorialId, step.id, {
        title: li.querySelector('.step-title').value,
        description: li.querySelector('.step-desc').value
      });
      flashSaved();
    }, 500);
    li.querySelector('.step-title').addEventListener('input', saveStepField);
    li.querySelector('.step-desc').addEventListener('input', saveStepField);

    li.querySelector('.step-thumb').addEventListener('click', () => openRedactDialog(latestStep(step.id)));
    li.querySelector('.redact-btn').addEventListener('click', () => openRedactDialog(latestStep(step.id)));

    li.querySelector('.smart-crop-btn').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Cropping…';
      try {
        const updated = await Api.smartCrop(tutorialId, step.id);
        applyStepUpdate(updated);
      } catch (err) {
        alert(err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Smart Crop';
      }
    });

    li.querySelector('.describe-btn').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Thinking…';
      try {
        const updated = await Api.describeStep(tutorialId, step.id);
        applyStepUpdate(updated);
      } catch (err) {
        alert(err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Auto-Describe';
      }
    });

    li.querySelector('.delete-btn').addEventListener('click', async () => {
      if (!confirm('Delete this step?')) return;
      await Api.deleteStep(tutorialId, step.id);
      li.remove();
      tutorial.steps = tutorial.steps.filter((s) => s.id !== step.id);
      renumber();
      updateEmptyState();
    });

    // Drag & drop reordering
    li.addEventListener('dragstart', () => {
      draggingStepId = step.id;
      li.classList.add('opacity-50');
    });
    li.addEventListener('dragend', () => {
      draggingStepId = null;
      li.classList.remove('opacity-50');
      persistOrder();
    });
    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      const dragging = els.stepsList.querySelector(`[data-step-id="${draggingStepId}"]`);
      if (!dragging || dragging === li) return;
      const rect = li.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      els.stepsList.insertBefore(dragging, before ? li : li.nextSibling);
    });

    return li;
  }

  function latestStep(stepId) {
    return tutorial.steps.find((s) => s.id === stepId);
  }

  function renumber() {
    [...els.stepsList.children].forEach((li, idx) => {
      li.querySelector('.step-order').textContent = idx + 1;
    });
    els.stepCount.textContent = `${tutorial.steps.length} step${tutorial.steps.length === 1 ? '' : 's'}`;
  }

  async function persistOrder() {
    const ids = [...els.stepsList.children].map((li) => li.dataset.stepId);
    renumber();
    await Api.reorderSteps(tutorialId, ids);
  }

  function updateEmptyState() {
    els.emptySteps.classList.toggle('hidden', tutorial.steps.length > 0);
  }

  function findLi(stepId) {
    return els.stepsList.querySelector(`[data-step-id="${stepId}"]`);
  }

  function applyStepUpdate(updatedStep) {
    const idx = tutorial.steps.findIndex((s) => s.id === updatedStep.id);
    if (idx === -1) return;
    tutorial.steps[idx] = { ...tutorial.steps[idx], ...updatedStep };
    const li = findLi(updatedStep.id);
    if (!li) return;
    const img = li.querySelector('.step-thumb');
    const imgUrl = updatedStep.croppedImageUrl || updatedStep.annotatedImageUrl || updatedStep.rawImageUrl || img.src;
    img.src = `${imgUrl.split('?')[0]}?t=${Date.now()}`;
    li.querySelector('.step-title').value = updatedStep.title ?? li.querySelector('.step-title').value;
    li.querySelector('.step-desc').value = updatedStep.description ?? li.querySelector('.step-desc').value;
  }

  function addStepToTimeline(step) {
    tutorial.steps.push(step);
    els.stepsList.appendChild(stepCard(step));
    renumber();
    updateEmptyState();
  }

  // ---------- socket.io live updates ----------
  const socket = io();
  socket.on('connect', () => socket.emit('join-tutorial', tutorialId));
  socket.on('step-captured', (step) => addStepToTimeline(step));
  socket.on('capture-warning', (e) => console.warn('[capture]', e.message));
  socket.on('capture-error', (e) => alert(`Capture error: ${e.message}`));

  // ---------- init ----------
  async function init() {
    tutorial = await Api.getTutorial(tutorialId);
    els.title.value = tutorial.title;
    els.description.value = tutorial.description || '';
    els.stepCount.textContent = `${tutorial.steps.length} step${tutorial.steps.length === 1 ? '' : 's'}`;

    [...tutorial.steps].sort((a, b) => a.order - b.order).forEach((step) => {
      els.stepsList.appendChild(stepCard(step));
    });
    updateEmptyState();
    await refreshHookStatus();
  }

  init();
})();
