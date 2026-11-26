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
    this.resizeState = null;

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
    const width = 340;
    const height = 280;
    const maxX = Math.max(16, (rect.width || 800) - width - 16);
    const maxY = Math.max(16, (rect.height || 600) - height - 16);
    const x = Math.min(maxX, 52 + ((existingInTab.length * 28) % 168));
    const y = Math.min(maxY, 20 + ((existingInTab.length * 28) % 112));

    const note = {
      id: this.nextId++,
      tab,
      title: existingInTab.length === 0 ? 'Note' : `Note ${existingInTab.length + 1}`,
      text: '',
      fontSize: 18,
      x,
      y,
      width,
      height
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
    if (!note.fontSize || Number.isNaN(note.fontSize)) note.fontSize = 18;

    const card = document.createElement('div');
    card.className = 'canvas-note-card';
    card.dataset.noteId = String(note.id);
    card.style.left = `${Math.round(note.x)}px`;
    card.style.top = `${Math.round(note.y)}px`;
    card.style.width = `${Math.round(note.width || 340)}px`;
    card.style.height = `${Math.round(note.height || 280)}px`;
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
    icon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>`;

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'canvas-note-title';
    titleInput.value = note.title || 'Note';
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
        titleInput.value = 'Note';
        note.title = 'Note';
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

    // Font Size Stepper Pill: [ −  18  + ]
    const sizePill = document.createElement('div');
    sizePill.className = 'canvas-note-size-pill';
    sizePill.title = 'Adjust text size';

    const decBtn = document.createElement('button');
    decBtn.type = 'button';
    decBtn.className = 'canvas-note-step-btn';
    decBtn.setAttribute('aria-label', 'Decrease font size');
    decBtn.textContent = '−';

    const sizeVal = document.createElement('span');
    sizeVal.className = 'canvas-note-size-val';
    sizeVal.textContent = String(note.fontSize);

    const incBtn = document.createElement('button');
    incBtn.type = 'button';
    incBtn.className = 'canvas-note-step-btn';
    incBtn.setAttribute('aria-label', 'Increase font size');
    incBtn.textContent = '+';

    const applyFontSize = (nextSize) => {
      note.fontSize = Math.max(10, Math.min(44, nextSize));
      sizeVal.textContent = String(note.fontSize);
      textarea.style.fontSize = `${note.fontSize}px`;
      this.saveState();
    };

    decBtn.addEventListener('click', () => applyFontSize(note.fontSize - 1));
    incBtn.addEventListener('click', () => applyFontSize(note.fontSize + 1));

    sizePill.appendChild(decBtn);
    sizePill.appendChild(sizeVal);
    sizePill.appendChild(incBtn);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'canvas-note-close-btn';
    closeBtn.title = 'Delete note';
    closeBtn.setAttribute('aria-label', 'Delete note');
    closeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    closeBtn.addEventListener('click', () => this.deleteNote(note.id));

    actions.appendChild(sizePill);
    actions.appendChild(closeBtn);

    header.appendChild(titleWrap);
    header.appendChild(actions);

    // Body Textarea
    const body = document.createElement('div');
    body.className = 'canvas-note-body';

    const textarea = document.createElement('textarea');
    textarea.className = 'canvas-note-textarea';
    textarea.spellcheck = false;
    textarea.placeholder = 'Write notes...';
    textarea.value = note.text || '';
    textarea.style.fontSize = `${note.fontSize}px`;

    textarea.addEventListener('input', () => {
      note.text = textarea.value;
      this.saveState();
    });

    body.appendChild(textarea);

    const resizeGrip = document.createElement('div');
    resizeGrip.className = 'canvas-note-resize-grip';
    resizeGrip.title = 'Drag to resize note';
    resizeGrip.setAttribute('aria-hidden', 'true');
    resizeGrip.innerHTML = `<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="11" y1="3" x2="3" y2="11"/><line x1="11" y1="7" x2="7" y2="11"/></svg>`;
    resizeGrip.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      this.bringToFront(card);
      this.resizeState = {
        note,
        card,
        container,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startWidth: card.offsetWidth || note.width || 340,
        startHeight: card.offsetHeight || note.height || 280
      };
      card.classList.add('resizing');
    });

    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(resizeGrip);

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

    container.appendChild(card);
    return card;
  }

  handleDragMove(e) {
    if (this.dragState) {
      const { note, card, container, startMouseX, startMouseY, startX, startY } = this.dragState;
      note.x = startX + (e.clientX - startMouseX);
      note.y = startY + (e.clientY - startMouseY);
      this.clampNotePosition(note, container);
      card.style.left = `${Math.round(note.x)}px`;
      card.style.top = `${Math.round(note.y)}px`;
    }
    if (this.resizeState) {
      const { note, card, container, startMouseX, startMouseY, startWidth, startHeight } = this.resizeState;
      const rect = container.getBoundingClientRect();
      const maxW = Math.min(640, (rect.width || 800) - 24);
      const maxH = Math.min(560, (rect.height || 600) - 24);
      note.width = Math.max(220, Math.min(maxW, Math.round(startWidth + (e.clientX - startMouseX))));
      note.height = Math.max(140, Math.min(maxH, Math.round(startHeight + (e.clientY - startMouseY))));
      card.style.width = `${note.width}px`;
      card.style.height = `${note.height}px`;
    }
  }

  handleDragEnd() {
    let changed = false;
    if (this.dragState) {
      this.dragState.card.classList.remove('dragging');
      this.dragState = null;
      changed = true;
    }
    if (this.resizeState) {
      this.resizeState.card.classList.remove('resizing');
      this.resizeState = null;
      changed = true;
    }
    if (changed) {
      this.saveState();
    }
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
