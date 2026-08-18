(() => {
  const listEl = document.getElementById('tutorial-list');
  const emptyEl = document.getElementById('empty-state');
  const newBtn = document.getElementById('new-tutorial-btn');
  const dialog = document.getElementById('new-tutorial-dialog');
  const form = document.getElementById('new-tutorial-form');
  const cancelBtn = document.getElementById('nt-cancel');

  function formatDate(iso) {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  }

  function tutorialCard(t) {
    const div = document.createElement('div');
    div.className = 'card p-5 flex flex-col gap-2 hover:shadow-md transition-shadow';
    div.innerHTML = `
      <div class="flex items-start justify-between gap-2">
        <h3 class="font-semibold text-gray-900 line-clamp-1">${escapeHtml(t.title)}</h3>
        <span class="text-xs shrink-0 bg-brand-100 text-brand-800 rounded-full px-2 py-0.5">${t.stepCount} step${t.stepCount === 1 ? '' : 's'}</span>
      </div>
      <p class="text-sm text-gray-500 line-clamp-2 min-h-[2.5rem]">${escapeHtml(t.description || 'No description')}</p>
      <div class="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
        <span class="text-xs text-gray-400">Updated ${formatDate(t.updatedAt)}</span>
        <div class="flex gap-2">
          <button data-action="delete" class="btn-ghost !px-2 !py-1 text-red-500 hover:bg-red-50">Delete</button>
          <a href="/editor.html?id=${t.id}" class="btn-secondary !px-3 !py-1.5">Open</a>
        </div>
      </div>
    `;
    div.querySelector('[data-action="delete"]').addEventListener('click', async (e) => {
      e.preventDefault();
      if (!confirm(`Delete "${t.title}"? This cannot be undone.`)) return;
      await Api.deleteTutorial(t.id);
      load();
    });
    return div;
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  async function load() {
    const tutorials = await Api.listTutorials();
    listEl.innerHTML = '';
    if (tutorials.length === 0) {
      emptyEl.classList.remove('hidden');
    } else {
      emptyEl.classList.add('hidden');
      tutorials.forEach((t) => listEl.appendChild(tutorialCard(t)));
    }
  }

  newBtn.addEventListener('click', () => {
    form.reset();
    dialog.showModal();
  });
  cancelBtn.addEventListener('click', () => dialog.close());

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const tutorial = await Api.createTutorial({
      title: formData.get('title'),
      description: formData.get('description')
    });
    window.location.href = `/editor.html?id=${tutorial.id}`;
  });

  load();
})();
