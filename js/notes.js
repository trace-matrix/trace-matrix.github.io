/**
 * TraceMatrix — Canvas Notes Manager (CanvasNotesManager)
 * Classical, draggable, resizable Notes textboxes pinned onto any canvas
 * (Matrix & Grid, Points & Geometry, Chess & Boards) with localStorage persistence.
 */

class CanvasNotesManager {
  constructor() {
    this.storageKey = 'tracematrix_canvas_notes';
    this.notes = [];
    this.nextId = 1;
    this.zCounter = 35;
    this.dragState = null;

    this.containers = {
      grid: document.getElementById('grid-canvas-container'),
      point: document.getElementById('point-canvas-container'),
      chess: document.getElementById('chess-canvas-container')
    };

    this.loadState();
    this.initEventListeners();
    this.renderAll();
  }

  initEventListeners() {
    document.getElementById('btn-grid-add-note')?.addEventListener('click', () => this.addNote('grid'));
    document.getElementById('btn-point-add-note')?.addEventListener('click', () => this.addNote('point'));
    document.getElementById('btn-chess-add-note')?.addEventListener('click', () => this.addNote('chess'));

    window.addEventListener('mousemove', (e) => this.handleDragMove(e));
    window.addEventListener('mouseup', () => this.handleDragEnd());
    window.addEventListener('beforeunload', () => this.saveState());
  }

  addNote(tab = 'grid') {
    const container = this.containers[tab];
    if (!container) return null;

    const existingInTab = this.notes.filter(n => n.tab === tab);
    const rect = container.getBoundingClientRect();
    const width = 280;
    const height = 196;
    const maxX = Math.max(16, (rect.width || 800) - width - 16);
    const maxY = Math.max(16, (rect.height || 600) - height - 16);
    const x = Math.min(maxX, 52 + ((existingInTab.length * 28) % 168));
    const y = Math.min(maxY, 20 + ((existingInTab.length * 28) % 112));

    const note = {
      id: this.nextId++,
      tab,
      title: existingInTab.length === 0 ? 'Notes' : `Note ${existingInTab.length + 1}`,
      text: '',
      x,
      y,
      width,
      height,
      collapsed: false
    };

    this.notes.push(note);
    const el = this.mountNoteElement(note, container);
    this.bringToFront(el);
    this.updateCountBadges();
    this.saveState();

    const textarea = el?.querySelector('.canvas-note-textarea');
    textarea?.focus();
    window.App?.showToast(`Opened ${note.title} on canvas`, 'info');
    return note;
  }

  bringToFront(el) {
    if (!el) return;
    this.zCounter += 1;
    el.style.zIndex = String(this.zCounter);
  }

  clampNotePosition(note, container) {
    const rect = container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const maxX = Math.max(8, rect.width - Math.min(note.width || 280, rect.width - 16));
    const maxY = Math.max(8, rect.height - 44);
    note.x = Math.max(8, Math.min(maxX, note.x));
    note.y = Math.max(8, Math.min(maxY, note.y));
  }

  mountNoteElement(note, container) {
    const card = document.createElement('div');
    card.className = `canvas-note-card${note.collapsed ? ' collapsed' : ''}`;
    card.dataset.noteId = String(note.id);
    card.style.left = `${Math.round(note.x)}px`;
    card.style.top = `${Math.round(note.y)}px`;
    card.style.width = `${Math.round(note.width || 280)}px`;
    if (!note.collapsed) {
      card.style.height = `${Math.round(note.height || 196)}px`;
    }
    card.style.zIndex = String(++this.zCounter);

    // Header Bar
    const header = document.createElement('div');
    header.className = 'canvas-note-header';
    header.title = 'Drag to move note';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'canvas-note-title-wrap';

    const icon = document.createElement('span');
    icon.className = 'canvas-note-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '✎';

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'canvas-note-title';
    titleInput.value = note.title || 'Notes';
    titleInput.readOnly = true;
    titleInput.title = 'Drag header to move • Double-click title to rename';
    titleInput.setAttribute('aria-label', 'Note title');
    titleInput.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      titleInput.readOnly = false;
      titleInput.focus();
      titleInput.select();
    });
    titleInput.addEventListener('input', () => {
      note.title = titleInput.value;
      this.saveState();
    });
    titleInput.addEventListener('blur', () => {
      titleInput.readOnly = true;
      if (!titleInput.value.trim()) {
        titleInput.value = 'Notes';
        note.title = 'Notes';
        this.saveState();
      }
    });
    titleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        titleInput.readOnly = true;
        textarea.focus();
      }
    });

    titleWrap.appendChild(icon);
    titleWrap.appendChild(titleInput);

    const actions = document.createElement('div');
    actions.className = 'canvas-note-actions';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'canvas-note-btn';
    copyBtn.title = 'Copy note text';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard?.writeText(note.text || '').then(() => {
        window.App?.showToast(`Copied "${note.title || 'Notes'}"`, 'success');
      });
    });

    const collapseBtn = document.createElement('button');
    collapseBtn.type = 'button';
    collapseBtn.className = 'canvas-note-btn canvas-note-icon-btn';
    collapseBtn.title = note.collapsed ? 'Expand note' : 'Minimize note';
    collapseBtn.textContent = note.collapsed ? '+' : '−';
    collapseBtn.addEventListener('click', () => {
      note.collapsed = !note.collapsed;
      card.classList.toggle('collapsed', note.collapsed);
      if (note.collapsed) {
        card.style.height = 'auto';
        collapseBtn.textContent = '+';
        collapseBtn.title = 'Expand note';
      } else {
        card.style.height = `${Math.round(note.height || 196)}px`;
        collapseBtn.textContent = '−';
        collapseBtn.title = 'Minimize note';
      }
      this.saveState();
    });

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'canvas-note-btn canvas-note-icon-btn canvas-note-close-btn';
    closeBtn.title = 'Delete note';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => this.deleteNote(note.id));

    actions.appendChild(copyBtn);
    actions.appendChild(collapseBtn);
    actions.appendChild(closeBtn);

    header.appendChild(titleWrap);
    header.appendChild(actions);

    // Body Textarea
    const body = document.createElement('div');
    body.className = 'canvas-note-body';

    const textarea = document.createElement('textarea');
    textarea.className = 'canvas-note-textarea';
    textarea.spellcheck = false;
    textarea.placeholder = 'Write problem notes, constraints, formulas, or edge cases...';
    textarea.value = note.text || '';

    const footer = document.createElement('div');
    footer.className = 'canvas-note-footer';

    const metaSpan = document.createElement('span');
    metaSpan.className = 'canvas-note-meta';
    const updateMeta = () => {
      const txt = textarea.value || '';
      const lines = txt ? txt.split(/\r?\n/).length : 0;
      metaSpan.textContent = `${lines} line${lines !== 1 ? 's' : ''} · ${txt.length} chars`;
    };
    updateMeta();

    const clearNoteBtn = document.createElement('button');
    clearNoteBtn.type = 'button';
    clearNoteBtn.className = 'canvas-note-clear-btn';
    clearNoteBtn.textContent = 'Clear';
    clearNoteBtn.title = 'Clear note text';
    clearNoteBtn.addEventListener('click', () => {
      if (!textarea.value) return;
      textarea.value = '';
      note.text = '';
      updateMeta();
      this.saveState();
      textarea.focus();
    });

    footer.appendChild(metaSpan);
    footer.appendChild(clearNoteBtn);

    textarea.addEventListener('input', () => {
      note.text = textarea.value;
      updateMeta();
      this.saveState();
    });

    body.appendChild(textarea);

    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(footer);

    // Isolate canvas pointer/wheel/dblclick events from note card
    ['mousedown', 'dblclick', 'wheel', 'contextmenu'].forEach(evtName => {
      card.addEventListener(evtName, (e) => {
        e.stopPropagation();
      });
    });

    card.addEventListener('mousedown', () => this.bringToFront(card));

    // Drag via header (excluding buttons and active title editing)
    header.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('button')) return;
      if (e.target === titleInput && !titleInput.readOnly) return;
      e.preventDefault();
      this.bringToFront(card);
      this.dragState = {
        note,
        card,
        container,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startX: note.x,
        startY: note.y
      };
      card.classList.add('dragging');
    });

    // Save resized dimensions after user drags resize corner
    card.addEventListener('mouseup', () => {
      if (!note.collapsed) {
        const w = card.offsetWidth;
        const h = card.offsetHeight;
        if (w >= 180 && h >= 100 && (w !== note.width || h !== note.height)) {
          note.width = w;
          note.height = h;
          this.saveState();
        }
      }
    });

    container.appendChild(card);
    return card;
  }

  handleDragMove(e) {
    if (!this.dragState) return;
    const { note, card, container, startMouseX, startMouseY, startX, startY } = this.dragState;
    note.x = startX + (e.clientX - startMouseX);
    note.y = startY + (e.clientY - startMouseY);
    this.clampNotePosition(note, container);
    card.style.left = `${Math.round(note.x)}px`;
    card.style.top = `${Math.round(note.y)}px`;
  }

  handleDragEnd() {
    if (!this.dragState) return;
    this.dragState.card.classList.remove('dragging');
    this.dragState = null;
    this.saveState();
  }

  deleteNote(id) {
    const idx = this.notes.findIndex(n => n.id === id);
    if (idx === -1) return;
    const [removed] = this.notes.splice(idx, 1);
    const container = this.containers[removed.tab];
    container?.querySelector(`.canvas-note-card[data-note-id="${id}"]`)?.remove();
    this.updateCountBadges();
    this.saveState();
  }

  updateCountBadges() {
    ['grid', 'point', 'chess'].forEach(tab => {
      const badge = document.querySelector(`[data-note-badge="${tab}"]`);
      if (!badge) return;
      const count = this.notes.filter(n => n.tab === tab).length;
      badge.textContent = String(count);
      badge.classList.toggle('hidden', count === 0);
    });
  }

  renderAll() {
    Object.values(this.containers).forEach(c => {
      c?.querySelectorAll('.canvas-note-card').forEach(el => el.remove());
    });
    for (const note of this.notes) {
      const container = this.containers[note.tab];
      if (container) {
        this.mountNoteElement(note, container);
      }
    }
    this.updateCountBadges();
  }

  saveState() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify({
        nextId: this.nextId,
        notes: this.notes
      }));
    } catch (e) {
      console.warn('Failed to save canvas notes', e);
    }
  }

  loadState() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.notes)) return false;
      this.notes = parsed.notes.filter(n => n && this.containers[n.tab]);
      this.nextId = Math.max(parsed.nextId || 1, ...this.notes.map(n => (n.id || 0) + 1));
      return true;
    } catch (e) {
      console.warn('Failed to load canvas notes', e);
      return false;
    }
  }
}

window.CanvasNotesManager = CanvasNotesManager;
