/**
 * TraceMatrix — Grid & Matrix Visualizer (GridVis)
 * Full-featured Competitive Programming 2D Matrix & Grid Visualizer:
 * - Multi-target selection (Rect, Cell, Subarray, Row, Col, Diag, Anti-Diag) + Header click/drag
 * - Multi-color cell/region painting, Wall (#), Start (S), and Target (T) tools
 * - Universal CP parser (x y val, space-separated 2D matrix, compact .# char grid)
 * - 2D Prefix Sums, 2D Difference Array, 2D Kadane, Sliding Window, Undo/Redo
 * - Matrix Transforms (Transpose, Rotate, Flip) & Spiral / Ring overlays
 * - Grid Graph & DP Algorithms (4/8-Dir BFS, Dijkstra, Connected Components, DP MinSum / Ways)
 */

const MOD = 1000000007;

class GridVisualizer {
  constructor() {
    this.canvas = document.getElementById('grid-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.container = document.getElementById('grid-canvas-container');

    this.rows = 10;
    this.cols = 10;
    this.cellSize = 52;

    // Viewport transform
    this.panX = 40;
    this.panY = 40;
    this.zoom = 1.0;

    // Interaction state
    this.isDragging = false;
    this.isPanning = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    this.hoverCell = null;
    this.selectedCell = { row: 0, col: 0 };

    // Selection & Coloring state
    this.submatrix = null;
    this.selectedCells = null; // non-rectangular cell list (e.g. diag / antidiag)
    this.isSelectingSubmatrix = false;
    this.subStart = null;
    this.selectionMode = 'submatrix'; // 'submatrix' | 'cell' | 'subarray' | 'row' | 'col' | 'diag' | 'antidiag'
    this.gridTool = 'select'; // 'select' | 'wall' | 'start' | 'end'
    this.wallPaintValue = null;
    this.activeColor = '#38bdf8';
    this.autoPaint = false;
    this.hoverHeader = null;
    this.headerDrag = null;

    // CP Input, Visualization & Algorithm State
    this.inputMode = 'auto'; // 'auto' | 'coords' | 'matrix'
    this.dirMode = 4; // 4 | 8
    this.showHeatmap = false;
    this.showPrefixOverlay = false;
    this.showDiffOverlay = false;
    this.showSubscripts = false;
    this.show1DIndex = false;

    this.startCells = []; // [{ r, c }]
    this.endCell = null;  // { r, c } | null
    this.algoOverlay = null; // { type, values, path, colors, summary }
    this.windowPos = -1;

    // Undo / Redo History
    this.undoStack = [];
    this.redoStack = [];

    // Grid data & state restoration
    this.grid = [];
    const loaded = this.loadState();
    if (!loaded) {
      this.initGrid(this.rows, this.cols, 0);
    }

    this.initEventListeners();
    this.syncControlStatesUI();
    this.resizeCanvas();
    this.fitGrid();
  }

  // ==========================================
  // GRID INITIALIZATION & HISTORY (UNDO/REDO)
  // ==========================================

  createEmptyCell(val = 0, source = 'empty') {
    return { val, type: 'empty', source, color: null, isWall: val === '#' };
  }

  initGrid(rows, cols, defaultValue = 0) {
    this.rows = Math.max(1, Math.min(100, rows));
    this.cols = Math.max(1, Math.min(100, cols));
    this.grid = [];
    for (let r = 0; r < this.rows; r++) {
      const row = [];
      for (let c = 0; c < this.cols; c++) {
        row.push(this.createEmptyCell(defaultValue, 'empty'));
      }
      this.grid.push(row);
    }
    this.submatrix = null;
    this.selectedCells = null;
    this.startCells = [];
    this.endCell = null;
    this.algoOverlay = null;
    this.windowPos = -1;
    this.hideAlgoResult();
    this.updateDimBadge();
    this.updateSubmatrixStats();
  }

  captureSnapshot() {
    return JSON.stringify({
      rows: this.rows,
      cols: this.cols,
      grid: this.grid,
      startCells: this.startCells,
      endCell: this.endCell,
      submatrix: this.submatrix,
      selectedCells: this.selectedCells
    });
  }

  pushUndo() {
    const snap = this.captureSnapshot();
    if (this.undoStack.length > 0 && this.undoStack[this.undoStack.length - 1] === snap) {
      return;
    }
    this.undoStack.push(snap);
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
  }

  restoreSnapshot(snapStr) {
    const snap = JSON.parse(snapStr);
    this.rows = snap.rows;
    this.cols = snap.cols;
    this.grid = snap.grid;
    this.startCells = snap.startCells || [];
    this.endCell = snap.endCell || null;
    this.submatrix = snap.submatrix || null;
    this.selectedCells = snap.selectedCells || null;
    this.algoOverlay = null;
    this.hideAlgoResult();
    this.updateDimBadge();
    this.updateSubmatrixStats();
    this.render();
    this.saveState();
  }

  undo() {
    if (this.undoStack.length === 0) {
      window.App?.showToast('Nothing to undo', 'info');
      return;
    }
    this.redoStack.push(this.captureSnapshot());
    const prev = this.undoStack.pop();
    this.restoreSnapshot(prev);
    window.App?.showToast('Undid last grid change', 'info');
  }

  redo() {
    if (this.redoStack.length === 0) {
      window.App?.showToast('Nothing to redo', 'info');
      return;
    }
    this.undoStack.push(this.captureSnapshot());
    const next = this.redoStack.pop();
    this.restoreSnapshot(next);
    window.App?.showToast('Redid grid change', 'info');
  }

  updateDimBadge() {
    const badge = document.getElementById('grid-dim-text');
    if (badge) badge.textContent = `${this.rows} × ${this.cols}`;
    const rInput = document.getElementById('grid-rows');
    const cInput = document.getElementById('grid-cols');
    if (rInput) rInput.value = this.rows;
    if (cInput) cInput.value = this.cols;
  }

  resizeCanvas() {
    if (!this.container || !this.canvas) return;
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.resetTransform?.();
    this.ctx.scale(dpr, dpr);
    this.render();
  }

  fitGrid() {
    if (!this.container) return;
    const rect = this.container.getBoundingClientRect();
    const totalW = this.cols * this.cellSize;
    const totalH = this.rows * this.cellSize;
    const pad = 60;
    const scaleX = (rect.width - pad * 2) / totalW;
    const scaleY = (rect.height - pad * 2) / totalH;
    this.zoom = Math.max(0.2, Math.min(2.0, Math.min(scaleX, scaleY)));
    this.panX = Math.round((rect.width - totalW * this.zoom) / 2);
    this.panY = Math.round((rect.height - totalH * this.zoom) / 2);
    this.updateStatusPill();
    this.render();
  }

  resetView() {
    this.zoom = 1.0;
    const rect = this.container.getBoundingClientRect();
    const totalW = this.cols * this.cellSize;
    const totalH = this.rows * this.cellSize;
    this.panX = Math.round((rect.width - totalW) / 2);
    this.panY = Math.round((rect.height - totalH) / 2);
    this.updateStatusPill();
    this.render();
  }

  // ==========================================
  // EVENT LISTENERS
  // ==========================================

  initEventListeners() {
    window.addEventListener('resize', () => this.resizeCanvas());

    // Resize button
    document.getElementById('btn-resize-grid')?.addEventListener('click', () => {
      this.pushUndo();
      const r = parseInt(document.getElementById('grid-rows')?.value, 10) || 10;
      const c = parseInt(document.getElementById('grid-cols')?.value, 10) || 10;
      this.initGrid(r, c);
      this.fitGrid();
      this.saveState();
      window.App?.showToast(`Grid resized to ${this.rows} × ${this.cols}`, 'info');
    });

    // Preset sizes
    document.querySelectorAll('[data-grid-size]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.pushUndo();
        const [r, c] = btn.dataset.gridSize.split('x').map(Number);
        this.initGrid(r, c, 0);
        this.fitGrid();
        this.saveState();
        window.App?.showToast(`Grid set to ${r} × ${c}`, 'info');
      });
    });

    // Quick Actions (Undo, Redo, Clear, Random, Maze, Copy)
    document.getElementById('btn-grid-undo')?.addEventListener('click', () => this.undo());
    document.getElementById('btn-grid-redo')?.addEventListener('click', () => this.redo());
    document.getElementById('btn-grid-clear-vals')?.addEventListener('click', () => this.clearGrid());
    document.getElementById('btn-grid-random')?.addEventListener('click', () => this.fillRandom());
    document.getElementById('btn-grid-maze')?.addEventListener('click', () => this.generateMaze());
    document.getElementById('btn-grid-copy-io')?.addEventListener('click', () => this.copyGridIO());
    document.getElementById('btn-grid-copy-cpp')?.addEventListener('click', () => this.copyGridCpp());

    // Zoom & Esc Floating Buttons
    document.getElementById('grid-zoom-in')?.addEventListener('click', () => this.zoomAtCenter(1.2));
    document.getElementById('grid-zoom-out')?.addEventListener('click', () => this.zoomAtCenter(0.8));
    document.getElementById('grid-zoom-fit')?.addEventListener('click', () => this.fitGrid());
    document.getElementById('grid-zoom-reset')?.addEventListener('click', () => this.resetView());
    document.getElementById('grid-btn-esc')?.addEventListener('click', () => this.cancelAllActivities());
    document.getElementById('btn-grid-esc-cancel')?.addEventListener('click', () => this.cancelAllActivities());

    // Canvas Mouse Events
    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    window.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    this.canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
    this.canvas.addEventListener('dblclick', (e) => this.handleDoubleClick(e));

    // Overlay Toggles
    document.getElementById('toggle-prefix-overlay')?.addEventListener('change', (e) => {
      this.showPrefixOverlay = e.target.checked;
      if (this.showPrefixOverlay) {
        this.showDiffOverlay = false;
        const diffChk = document.getElementById('toggle-diff-overlay');
        if (diffChk) diffChk.checked = false;
      }
      this.render();
      this.saveState();
    });
    document.getElementById('toggle-diff-overlay')?.addEventListener('change', (e) => {
      this.showDiffOverlay = e.target.checked;
      if (this.showDiffOverlay) {
        this.showPrefixOverlay = false;
        const prefChk = document.getElementById('toggle-prefix-overlay');
        if (prefChk) prefChk.checked = false;
      }
      this.render();
      this.saveState();
    });
    document.getElementById('toggle-heatmap')?.addEventListener('change', (e) => {
      this.showHeatmap = e.target.checked;
      this.render();
      this.saveState();
    });
    document.getElementById('toggle-subscripts')?.addEventListener('change', (e) => {
      this.showSubscripts = e.target.checked;
      this.render();
      this.saveState();
    });
    document.getElementById('toggle-1d-index')?.addEventListener('change', (e) => {
      this.show1DIndex = e.target.checked;
      this.render();
      this.saveState();
    });

    // Input Mode Pills & Batch Input
    document.querySelectorAll('[data-input-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.inputMode = btn.dataset.inputMode;
        document.querySelectorAll('[data-input-mode]').forEach(b => b.classList.toggle('active', b === btn));
        const batchInput = document.getElementById('grid-batch-input');
        if (batchInput && batchInput.value.trim()) {
          this.parseBatchInput(batchInput.value, false);
        }
        this.saveState();
      });
    });

    const batchInput = document.getElementById('grid-batch-input');
    batchInput?.addEventListener('paste', () => {
      clearTimeout(this._batchTimer);
      setTimeout(() => {
        this.pushUndo();
        this.parseBatchInput(batchInput.value, true);
      }, 30);
    });
    batchInput?.addEventListener('input', () => {
      clearTimeout(this._batchTimer);
      this._batchTimer = setTimeout(() => {
        this.parseBatchInput(batchInput.value, false);
      }, 220);
    });
    batchInput?.addEventListener('change', () => {
      clearTimeout(this._batchTimer);
      this.parseBatchInput(batchInput.value, false);
    });

    // Canvas Interaction Tool Pills (Select / Wall # / Start S / End T)
    document.querySelectorAll('[data-grid-tool]').forEach(btn => {
      btn.addEventListener('click', () => this.setGridTool(btn.dataset.gridTool));
    });

    // Selection Mode Pills (Rect / Cell / Subarr / Row / Col / Diag / Anti)
    document.querySelectorAll('[data-sel-mode]').forEach(btn => {
      btn.addEventListener('click', () => this.setSelectionMode(btn.dataset.selMode));
    });

    // Quick Select Inputs & Button
    document.getElementById('btn-qs-select')?.addEventListener('click', () => this.applyQuickSelect());
    document.querySelectorAll('#grid-quick-select input').forEach(inp => {
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.applyQuickSelect();
        }
      });
    });

    // Color Palette Swatches & Picker
    document.querySelectorAll('.color-swatch[data-color]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setActiveColor(btn.dataset.color, btn);
        if (this.hasActiveSelection()) {
          this.applyColorToSelection(this.activeColor, false);
        }
      });
    });

    const customPicker = document.getElementById('grid-custom-color');
    customPicker?.addEventListener('input', (e) => {
      this.setActiveColor(e.target.value, null);
      if (this.hasActiveSelection()) {
        this.applyColorToSelection(this.activeColor, false);
      }
    });
    customPicker?.addEventListener('change', (e) => {
      this.setActiveColor(e.target.value, null);
      if (this.hasActiveSelection()) {
        this.applyColorToSelection(this.activeColor, false);
      }
      this.saveState();
    });

    document.getElementById('btn-apply-color')?.addEventListener('click', () => {
      this.applyColorToSelection(this.activeColor, true);
    });
    document.getElementById('btn-uncolor-selection')?.addEventListener('click', () => {
      this.applyColorToSelection(null, true);
    });
    document.getElementById('btn-clear-all-colors')?.addEventListener('click', () => {
      this.clearAllColors();
    });
    document.getElementById('toggle-auto-paint')?.addEventListener('change', (e) => {
      this.autoPaint = e.target.checked;
      this.saveState();
    });

    // Range Ops (Diff Add/Sub, 2D Kadane, KxK Window)
    document.getElementById('btn-range-add')?.addEventListener('click', () => {
      const delta = Number(document.getElementById('grid-range-delta')?.value) || 0;
      this.applyRangeDelta(delta);
    });
    document.getElementById('btn-range-sub')?.addEventListener('click', () => {
      const delta = Number(document.getElementById('grid-range-delta')?.value) || 0;
      this.applyRangeDelta(-delta);
    });
    document.getElementById('btn-kadane-2d')?.addEventListener('click', () => this.runKadane2D());
    document.getElementById('btn-win-prev')?.addEventListener('click', () => this.stepSlidingWindow(-1));
    document.getElementById('btn-win-next')?.addEventListener('click', () => this.stepSlidingWindow(1));

    // Transforms
    document.getElementById('btn-grid-transpose')?.addEventListener('click', () => this.transformMatrix('transpose'));
    document.getElementById('btn-grid-rot-cw')?.addEventListener('click', () => this.transformMatrix('rotCW'));
    document.getElementById('btn-grid-rot-ccw')?.addEventListener('click', () => this.transformMatrix('rotCCW'));
    document.getElementById('btn-grid-flip-h')?.addEventListener('click', () => this.transformMatrix('flipH'));
    document.getElementById('btn-grid-flip-v')?.addEventListener('click', () => this.transformMatrix('flipV'));

    // Direction Toggle & Algorithm Buttons
    document.querySelectorAll('[data-grid-dir]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.dirMode = parseInt(btn.dataset.gridDir, 10) || 4;
        document.querySelectorAll('[data-grid-dir]').forEach(b => b.classList.toggle('active', b === btn));
        this.saveState();
      });
    });

    document.getElementById('btn-overlay-spiral')?.addEventListener('click', () => this.runSpiralOverlay());
    document.getElementById('btn-overlay-rings')?.addEventListener('click', () => this.runRingLayersOverlay());
    document.getElementById('btn-grid-bfs')?.addEventListener('click', () => this.runBFS());
    document.getElementById('btn-grid-dijkstra')?.addEventListener('click', () => this.runDijkstra());
    document.getElementById('btn-grid-components')?.addEventListener('click', () => this.runComponents());
    document.getElementById('btn-grid-dp-min')?.addEventListener('click', () => this.runDPMinPath());
    document.getElementById('btn-grid-dp-ways')?.addEventListener('click', () => this.runDPWays());

    window.addEventListener('beforeunload', () => this.saveState());
  }

  // ==========================================
  // CANCEL ALL ACTIVITIES (ESC)
  // ==========================================

  cancelAllActivities() {
    const inlineActive = !!this.container?.querySelector('.cell-inline-input');
    this.removeInlineEditor();

    const hadActivity = !!(
      inlineActive ||
      this.isSelectingSubmatrix ||
      this.isPanning ||
      this.headerDrag ||
      this.submatrix ||
      this.selectedCells ||
      this.algoOverlay ||
      this.gridTool !== 'select' ||
      this.windowPos !== -1
    );

    this.isPanning = false;
    this.isSelectingSubmatrix = false;
    this.headerDrag = null;
    this.wallPaintValue = null;
    this.submatrix = null;
    this.selectedCells = null;
    this.algoOverlay = null;
    this.windowPos = -1;
    this.setGridTool('select', false);
    this.hideAlgoResult();
    this.updateSubmatrixStats();
    this.render();
    this.saveState();

    if (hadActivity) {
      window.App?.showToast('Cancelled active grid tools, selection & overlays', 'info');
    }
  }

  // ==========================================
  // ZOOM & COORDINATE TRANSFORMS
  // ==========================================

  zoomAtCenter(factor) {
    const rect = this.container.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const newZoom = Math.max(0.2, Math.min(4.5, this.zoom * factor));
    this.panX = cx - (cx - this.panX) * (newZoom / this.zoom);
    this.panY = cy - (cy - this.panY) * (newZoom / this.zoom);
    this.zoom = newZoom;
    this.removeInlineEditor();
    this.updateStatusPill();
    this.render();
  }

  handleWheel(e) {
    e.preventDefault();
    const rect = this.container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    const newZoom = Math.max(0.2, Math.min(4.5, this.zoom * factor));

    this.panX = mouseX - (mouseX - this.panX) * (newZoom / this.zoom);
    this.panY = mouseY - (mouseY - this.panY) * (newZoom / this.zoom);
    this.zoom = newZoom;

    this.removeInlineEditor();
    this.updateStatusPill();
    this.render();
  }

  screenToGrid(sx, sy) {
    const cs = this.cellSize * this.zoom;
    const col = Math.floor((sx - this.panX) / cs);
    const row = Math.floor((sy - this.panY) / cs);
    if (row >= 0 && row < this.rows && col >= 0 && col < this.cols) {
      return { row, col };
    }
    return null;
  }

  screenToHeader(sx, sy) {
    const cs = this.cellSize * this.zoom;
    const lx = sx - this.panX;
    const ly = sy - this.panY;
    const headerBand = Math.max(28, cs * 0.85);
    if (lx >= 0 && lx < this.cols * cs && ly >= -headerBand && ly < 0) {
      return { type: 'col', index: Math.floor(lx / cs) };
    }
    if (ly >= 0 && ly < this.rows * cs && lx >= -headerBand && lx < 0) {
      return { type: 'row', index: Math.floor(ly / cs) };
    }
    return null;
  }

  // ==========================================
  // SELECTION, TOOLS & MOUSE INTERACTIONS
  // ==========================================

  hasActiveSelection() {
    return !!(this.submatrix || (this.selectedCells && this.selectedCells.length > 0));
  }

  getSelectedCellCoords() {
    if (this.selectedCells && this.selectedCells.length > 0) {
      return this.selectedCells;
    }
    if (!this.submatrix) return [];
    const coords = [];
    for (let r = this.submatrix.r1; r <= this.submatrix.r2; r++) {
      for (let c = this.submatrix.c1; c <= this.submatrix.c2; c++) {
        coords.push({ r, c });
      }
    }
    return coords;
  }

  getDiagonalCells(row, col, isAnti) {
    const cells = [];
    const target = isAnti ? row + col : row - col;
    for (let r = 0; r < this.rows; r++) {
      const c = isAnti ? target - r : r - target;
      if (c >= 0 && c < this.cols) {
        cells.push({ r, c });
      }
    }
    return cells;
  }

  applyDragSelection(startCell, endCell) {
    if (this.selectionMode === 'diag' || this.selectionMode === 'antidiag') {
      this.submatrix = null;
      this.selectedCells = this.getDiagonalCells(
        endCell.row,
        endCell.col,
        this.selectionMode === 'antidiag'
      );
      return;
    }
    this.selectedCells = null;
    this.submatrix = this.buildSelectionFromDrag(startCell, endCell);
  }

  buildSelectionFromDrag(startCell, endCell) {
    switch (this.selectionMode) {
      case 'cell':
        return { r1: endCell.row, c1: endCell.col, r2: endCell.row, c2: endCell.col };
      case 'row':
        return {
          r1: Math.min(startCell.row, endCell.row),
          c1: 0,
          r2: Math.max(startCell.row, endCell.row),
          c2: this.cols - 1
        };
      case 'col':
        return {
          r1: 0,
          c1: Math.min(startCell.col, endCell.col),
          r2: this.rows - 1,
          c2: Math.max(startCell.col, endCell.col)
        };
      case 'subarray': {
        const dr = Math.abs(endCell.row - startCell.row);
        const dc = Math.abs(endCell.col - startCell.col);
        if (dc >= dr) {
          return {
            r1: startCell.row,
            c1: Math.min(startCell.col, endCell.col),
            r2: startCell.row,
            c2: Math.max(startCell.col, endCell.col)
          };
        }
        return {
          r1: Math.min(startCell.row, endCell.row),
          c1: startCell.col,
          r2: Math.max(startCell.row, endCell.row),
          c2: startCell.col
        };
      }
      case 'submatrix':
      default:
        return {
          r1: Math.min(startCell.row, endCell.row),
          c1: Math.min(startCell.col, endCell.col),
          r2: Math.max(startCell.row, endCell.row),
          c2: Math.max(startCell.col, endCell.col)
        };
    }
  }

  toggleStartCell(r, c) {
    const cell = this.grid[r][c];
    cell.isWall = false;
    if (cell.val === '#') cell.val = 0;

    const idx = this.startCells.findIndex(p => p.r === r && p.c === c);
    if (idx >= 0) {
      this.startCells.splice(idx, 1);
    } else {
      this.startCells.push({ r, c });
    }
    if (this.endCell && this.endCell.r === r && this.endCell.c === c) {
      this.endCell = null;
    }
  }

  toggleEndCell(r, c) {
    const cell = this.grid[r][c];
    cell.isWall = false;
    if (cell.val === '#') cell.val = 0;

    if (this.endCell && this.endCell.r === r && this.endCell.c === c) {
      this.endCell = null;
    } else {
      this.endCell = { r, c };
    }
    this.startCells = this.startCells.filter(p => !(p.r === r && p.c === c));
  }

  setCellWall(r, c, makeWall) {
    const cell = this.grid[r][c];
    cell.isWall = makeWall;
    cell.source = 'manual';
    if (makeWall) {
      cell.val = '#';
      this.startCells = this.startCells.filter(p => !(p.r === r && p.c === c));
      if (this.endCell && this.endCell.r === r && this.endCell.c === c) {
        this.endCell = null;
      }
    } else if (cell.val === '#') {
      cell.val = 0;
    }
  }

  handleMouseDown(e) {
    if (e.button === 1 || e.code === 'Space' || e.shiftKey) {
      this.isPanning = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.removeInlineEditor();
      return;
    }

    if (e.button !== 0) return;

    const rect = this.container.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const cell = this.screenToGrid(sx, sy);

    if (cell) {
      if (this.gridTool === 'wall') {
        this.pushUndo();
        const curWall = this.isCellWall(cell.row, cell.col);
        this.wallPaintValue = !curWall;
        this.setCellWall(cell.row, cell.col, this.wallPaintValue);
        this.isDragging = true;
        this.updateSubmatrixStats();
        this.render();
        return;
      }
      if (this.gridTool === 'start') {
        this.pushUndo();
        this.toggleStartCell(cell.row, cell.col);
        this.render();
        this.saveState();
        return;
      }
      if (this.gridTool === 'end') {
        this.pushUndo();
        this.toggleEndCell(cell.row, cell.col);
        this.render();
        this.saveState();
        return;
      }

      this.isSelectingSubmatrix = true;
      this.subStart = cell;
      this.selectedCell = cell;
      this.applyDragSelection(cell, cell);
      this.updateSubmatrixStats();
      this.render();
      return;
    }

    const hdr = this.screenToHeader(sx, sy);
    if (hdr) {
      this.selectedCells = null;
      this.headerDrag = { type: hdr.type, startIndex: hdr.index };
      if (hdr.type === 'row') {
        this.submatrix = { r1: hdr.index, c1: 0, r2: hdr.index, c2: this.cols - 1 };
      } else {
        this.submatrix = { r1: 0, c1: hdr.index, r2: this.rows - 1, c2: hdr.index };
      }
      this.updateSubmatrixStats();
      this.render();
      return;
    }

    this.isPanning = true;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
    this.removeInlineEditor();
  }

  handleMouseMove(e) {
    const rect = this.container.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (this.isPanning) {
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.panX += dx;
      this.panY += dy;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.render();
      return;
    }

    const cs = this.cellSize * this.zoom;

    if (this.headerDrag) {
      this.selectedCells = null;
      if (this.headerDrag.type === 'row') {
        const idx = Math.max(0, Math.min(this.rows - 1, Math.floor((sy - this.panY) / cs)));
        this.submatrix = {
          r1: Math.min(this.headerDrag.startIndex, idx),
          c1: 0,
          r2: Math.max(this.headerDrag.startIndex, idx),
          c2: this.cols - 1
        };
      } else {
        const idx = Math.max(0, Math.min(this.cols - 1, Math.floor((sx - this.panX) / cs)));
        this.submatrix = {
          r1: 0,
          c1: Math.min(this.headerDrag.startIndex, idx),
          r2: this.rows - 1,
          c2: Math.max(this.headerDrag.startIndex, idx)
        };
      }
      this.updateSubmatrixStats();
      this.render();
      return;
    }

    const cell = this.screenToGrid(sx, sy);
    this.hoverCell = cell;
    this.hoverHeader = !cell ? this.screenToHeader(sx, sy) : null;
    if (this.canvas) {
      this.canvas.style.cursor = this.hoverHeader ? 'pointer' : (this.gridTool !== 'select' ? 'crosshair' : 'default');
    }
    this.updateStatusPill();

    if (this.isDragging && this.gridTool === 'wall' && this.wallPaintValue !== null && cell) {
      this.setCellWall(cell.row, cell.col, this.wallPaintValue);
      this.updateSubmatrixStats();
      this.render();
      return;
    }

    if (this.isSelectingSubmatrix && this.subStart && cell) {
      this.applyDragSelection(this.subStart, cell);
      this.updateSubmatrixStats();
      this.render();
    } else {
      this.render();
    }
  }

  handleMouseUp() {
    if (this.isDragging && this.gridTool === 'wall') {
      this.saveState();
    }
    if (this.isSelectingSubmatrix || this.headerDrag) {
      if (this.autoPaint && this.hasActiveSelection()) {
        this.applyColorToSelection(this.activeColor, false);
      }
      this.saveState();
    }
    this.isDragging = false;
    this.wallPaintValue = null;
    this.isPanning = false;
    this.isSelectingSubmatrix = false;
    this.headerDrag = null;
  }

  handleDoubleClick(e) {
    if (this.gridTool !== 'select') return;
    const rect = this.container.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const cell = this.screenToGrid(sx, sy);
    if (!cell) return;

    this.editCellInline(cell.row, cell.col);
  }

  removeInlineEditor() {
    const existing = this.container?.querySelector('.cell-inline-input');
    if (existing) existing.remove();
  }

  editCellInline(row, col) {
    this.removeInlineEditor();

    const cell = this.grid[row][col];
    const cs = this.cellSize * this.zoom;
    const cellX = this.panX + col * cs;
    const cellY = this.panY + row * cs;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'cell-inline-input';
    input.value = cell.val !== undefined && cell.val !== null ? cell.val : '';
    input.style.left = `${Math.round(cellX)}px`;
    input.style.top = `${Math.round(cellY)}px`;
    input.style.width = `${Math.round(cs)}px`;
    input.style.height = `${Math.round(cs)}px`;
    input.style.fontSize = `${Math.round(Math.max(10, cs * 0.38))}px`;

    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      const valStr = input.value.trim();
      const num = Number(valStr);
      const finalVal = valStr === '' ? 0 : (!isNaN(num) && Number.isFinite(num) ? num : valStr);

      if (finalVal !== cell.val) {
        this.pushUndo();
      }
      cell.val = finalVal;
      cell.type = 'empty';
      cell.source = 'manual';
      cell.isWall = finalVal === '#';

      this.selectedCell = { row, col };
      this.updateSubmatrixStats();
      this.render();
      input.remove();
      this.saveState();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        committed = true;
        input.remove();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        commit();
        let nextCol = col + (e.shiftKey ? -1 : 1);
        let nextRow = row;
        if (nextCol >= this.cols) {
          nextCol = 0;
          nextRow = (nextRow + 1) % this.rows;
        } else if (nextCol < 0) {
          nextCol = this.cols - 1;
          nextRow = (nextRow - 1 + this.rows) % this.rows;
        }
        this.editCellInline(nextRow, nextCol);
      }
    });

    input.addEventListener('blur', () => commit());

    this.container.appendChild(input);
    input.focus();
    input.select();
  }

  // ==========================================
  // CLEAR, GENERATORS, EXPORT & INPUT PARSING
  // ==========================================

  clearGrid() {
    this.pushUndo();
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        this.grid[r][c].val = 0;
        this.grid[r][c].type = 'empty';
        this.grid[r][c].source = 'empty';
        this.grid[r][c].isWall = false;
      }
    }
    this.startCells = [];
    this.endCell = null;
    this.algoOverlay = null;
    this.submatrix = null;
    this.selectedCells = null;
    this.hideAlgoResult();
    this.updateSubmatrixStats();
    this.render();
    this.saveState();
    window.App?.showToast('All grid values reset to 0', 'info');
  }

  fillRandom() {
    this.pushUndo();
    const targets = this.hasActiveSelection()
      ? this.getSelectedCellCoords()
      : null;

    if (targets) {
      for (const { r, c } of targets) {
        this.grid[r][c].val = Math.floor(Math.random() * 10);
        this.grid[r][c].isWall = false;
        this.grid[r][c].source = 'manual';
      }
    } else {
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          this.grid[r][c].val = Math.floor(Math.random() * 10);
          this.grid[r][c].isWall = false;
          this.grid[r][c].source = 'manual';
        }
      }
    }
    this.algoOverlay = null;
    this.hideAlgoResult();
    this.updateSubmatrixStats();
    this.render();
    this.saveState();
    window.App?.showToast(targets ? 'Filled selection with random values (0–9)' : 'Filled grid with random values (0–9)', 'info');
  }

  generateMaze() {
    this.pushUndo();
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const wall = Math.random() < 0.28;
        this.grid[r][c].isWall = wall;
        this.grid[r][c].val = wall ? '#' : 0;
        this.grid[r][c].source = 'manual';
      }
    }
    this.grid[0][0].isWall = false;
    this.grid[0][0].val = 0;
    this.grid[this.rows - 1][this.cols - 1].isWall = false;
    this.grid[this.rows - 1][this.cols - 1].val = 0;
    this.startCells = [{ r: 0, c: 0 }];
    this.endCell = { r: this.rows - 1, c: this.cols - 1 };
    this.algoOverlay = null;
    this.hideAlgoResult();
    this.updateSubmatrixStats();
    this.render();
    this.saveState();
    window.App?.showToast('Generated random obstacle maze with S & T', 'info');
  }

  copyGridIO() {
    const lines = [`${this.rows} ${this.cols}`];
    for (let r = 0; r < this.rows; r++) {
      lines.push(this.grid[r].map(c => (c.isWall ? '#' : c.val)).join(' '));
    }
    navigator.clipboard?.writeText(lines.join('\n')).then(() => {
      window.App?.showToast('Copied R C & Grid input to clipboard', 'success');
    }).catch(() => {});
  }

  copyGridCpp() {
    const hasString = this.grid.some(row => row.some(c => typeof c.val === 'string'));
    let out;
    if (hasString) {
      const rowsStr = this.grid.map(row => `    "${row.map(c => (c.isWall ? '#' : String(c.val)[0] || '.')).join('')}"`).join(',\n');
      out = `vector<string> grid = {\n${rowsStr}\n};`;
    } else {
      const rowsStr = this.grid.map(row => `    {${row.map(c => c.val).join(', ')}}`).join(',\n');
      out = `vector<vector<long long>> grid = {\n${rowsStr}\n};`;
    }
    navigator.clipboard?.writeText(out).then(() => {
      window.App?.showToast('Copied C++ matrix to clipboard!', 'success');
    }).catch(() => {});
  }

  resetBatchCells() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c].source !== 'manual') {
          this.grid[r][c].val = 0;
          this.grid[r][c].type = 'empty';
          this.grid[r][c].source = 'empty';
          this.grid[r][c].isWall = false;
        }
      }
    }
  }

  parseTokenValue(valStr) {
    const trimmed = valStr.trim();
    if (trimmed === '') return 0;
    const num = Number(trimmed);
    return !isNaN(num) && Number.isFinite(num) ? num : trimmed;
  }

  applyCompactCharGrid(charRows, showToast = true) {
    const newR = Math.min(100, charRows.length);
    const newC = Math.min(100, Math.max(...charRows.map(s => s.length)));
    if (newR > this.rows || newC > this.cols || (newR !== this.rows || newC !== this.cols)) {
      this.resizeGridPreserving(Math.max(1, newR), Math.max(1, newC), false);
    }
    this.startCells = [];
    this.endCell = null;

    let count = 0;
    for (let r = 0; r < newR; r++) {
      const str = charRows[r];
      for (let c = 0; c < Math.min(newC, str.length); c++) {
        const ch = str[c];
        const cell = this.grid[r][c];
        cell.source = 'batch';
        cell.type = 'empty';
        if (ch === '#') {
          cell.val = '#';
          cell.isWall = true;
        } else if (ch >= '0' && ch <= '9') {
          cell.val = parseInt(ch, 10);
          cell.isWall = false;
        } else {
          cell.val = ch;
          cell.isWall = false;
          if (ch === 'S') this.startCells.push({ r, c });
          if (ch === 'E' || ch === 'T') this.endCell = { r, c };
        }
        count++;
      }
    }
    this.updateSubmatrixStats();
    this.render();
    this.saveState();
    if (showToast) {
      window.App?.showToast(`Loaded ${newR}×${newC} character grid (${count} cells)`, 'success');
    }
  }

  parseBatchInput(rawText, showToast = true) {
    this.resetBatchCells();

    if (!rawText || !rawText.trim()) {
      this.updateSubmatrixStats();
      this.render();
      this.saveState();
      return;
    }

    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) {
      this.updateSubmatrixStats();
      this.render();
      this.saveState();
      return;
    }

    const tokenizedLines = lines.map(l => l.split(/[\s,;]+/).filter(t => t.length > 0));
    const intRe = /^-?\d+$/;
    let startLine = 0;
    let headerDim = null;

    // Header check: "R C" (dimensions) or "N" (entry/row count)
    if (tokenizedLines[0].length === 1 && intRe.test(tokenizedLines[0][0])) {
      startLine = 1;
    } else if (
      tokenizedLines.length > 1 &&
      tokenizedLines[0].length === 2 &&
      intRe.test(tokenizedLines[0][0]) &&
      intRe.test(tokenizedLines[0][1])
    ) {
      const hR = parseInt(tokenizedLines[0][0], 10);
      const hC = parseInt(tokenizedLines[0][1], 10);
      const rest = tokenizedLines.slice(1);

      // Case A: "R C" followed by R compact char-grid rows of length C
      if (rest.length === hR && rest.every(t => t.length === 1 && t[0].length === hC)) {
        this.applyCompactCharGrid(rest.map(t => t[0]), showToast);
        return;
      }
      // Case B: "R C" followed by R rows of C space-separated tokens
      if (rest.length === hR && rest.every(t => t.length === hC)) {
        startLine = 1;
        headerDim = { r: hR, c: hC };
      } else if (rest.length === hC && rest.every(t => t.length === 3)) {
        // Case C: "N M" followed by M coordinate-value triplets
        startLine = 1;
      }
    }

    const dataRows = tokenizedLines.slice(startLine);
    if (dataRows.length === 0) {
      this.updateSubmatrixStats();
      this.render();
      this.saveState();
      return;
    }

    // Detect compact char/binary grid without spaces (e.g. ".#..#" or "S...E")
    const isSingleTokenRows = dataRows.every(t => t.length === 1 && t[0].length >= 2);
    const hasGridChars = dataRows.some(t => /[^0-9\-]/.test(t[0]));
    if (isSingleTokenRows && (hasGridChars || (this.inputMode === 'matrix') || dataRows.length >= 2)) {
      if (this.inputMode !== 'coords') {
        this.applyCompactCharGrid(dataRows.map(t => t[0]), showToast);
        return;
      }
    }

    const parsedEntries = [];
    const firstRowLen = dataRows[0].length;
    const isUniformMatrix =
      !!headerDim ||
      (this.inputMode === 'matrix' && dataRows.every(t => t.length === firstRowLen)) ||
      (this.inputMode === 'auto' && firstRowLen >= 4 && dataRows.every(t => t.length === firstRowLen));

    if (isUniformMatrix && this.inputMode !== 'coords') {
      for (let r = 0; r < dataRows.length; r++) {
        for (let c = 0; c < dataRows[r].length; c++) {
          const v = this.parseTokenValue(dataRows[r][c]);
          parsedEntries.push({ r, c, val: v });
        }
      }
      if (headerDim) {
        this.resizeGridPreserving(Math.min(100, headerDim.r), Math.min(100, headerDim.c), false);
      }
    } else {
      const isOneIdx = window.App?.isOneIndexed;
      let minR = Infinity, minC = Infinity;

      for (const tokens of dataRows) {
        if ((tokens.length === 2 || tokens.length === 3) && intRe.test(tokens[0]) && intRe.test(tokens[1])) {
          const rawR = parseInt(tokens[0], 10);
          const rawC = parseInt(tokens[1], 10);
          const finalVal = tokens.length === 3 ? this.parseTokenValue(tokens[2]) : 1;
          parsedEntries.push({ r: rawR, c: rawC, val: finalVal });
          minR = Math.min(minR, rawR);
          minC = Math.min(minC, rawC);
        }
      }

      if (parsedEntries.length === 0) {
        this.updateSubmatrixStats();
        this.render();
        this.saveState();
        if (showToast) {
          window.App?.showToast('No valid grid or "x y val" rows found in input', 'error');
        }
        return;
      }

      const shouldSubtract1 = isOneIdx && minR >= 1 && minC >= 1;
      if (shouldSubtract1) {
        for (const entry of parsedEntries) {
          entry.r -= 1;
          entry.c -= 1;
        }
      }
    }

    let targetMaxR = -1;
    let targetMaxC = -1;
    for (const entry of parsedEntries) {
      if (entry.r >= 0 && entry.c >= 0) {
        targetMaxR = Math.max(targetMaxR, entry.r);
        targetMaxC = Math.max(targetMaxC, entry.c);
      }
    }

    const neededRows = Math.min(100, Math.max(this.rows, targetMaxR + 1));
    const neededCols = Math.min(100, Math.max(this.cols, targetMaxC + 1));
    if (neededRows > this.rows || neededCols > this.cols) {
      this.resizeGridPreserving(neededRows, neededCols, true);
    }

    let updatedCount = 0;
    for (const entry of parsedEntries) {
      if (entry.r >= 0 && entry.r < this.rows && entry.c >= 0 && entry.c < this.cols) {
        const cell = this.grid[entry.r][entry.c];
        cell.val = entry.val;
        cell.type = 'empty';
        cell.source = 'batch';
        cell.isWall = entry.val === '#';
        if (entry.val === 'S') this.startCells.push({ r: entry.r, c: entry.c });
        if (entry.val === 'E' || entry.val === 'T') this.endCell = { r: entry.r, c: entry.c };
        updatedCount++;
      }
    }

    this.updateSubmatrixStats();
    this.render();
    this.saveState();
    if (showToast) {
      window.App?.showToast(`Updated ${updatedCount} cell${updatedCount !== 1 ? 's' : ''}`, 'success');
    }
  }

  resizeGridPreserving(newRows, newCols, preserve = true) {
    const oldGrid = this.grid;
    const oldRows = this.rows;
    const oldCols = this.cols;

    this.rows = newRows;
    this.cols = newCols;
    this.grid = [];

    for (let r = 0; r < newRows; r++) {
      const row = [];
      for (let c = 0; c < newCols; c++) {
        if (preserve && r < oldRows && c < oldCols) {
          row.push(oldGrid[r][c]);
        } else {
          row.push(this.createEmptyCell(0, 'empty'));
        }
      }
      this.grid.push(row);
    }

    this.updateDimBadge();
    this.fitGrid();
    this.saveState();
  }

  // ==========================================
  // SELECTION MODES & MULTI-COLOR PAINTING
  // ==========================================

  setGridTool(tool, shouldSave = true) {
    this.gridTool = tool || 'select';
    document.querySelectorAll('[data-grid-tool]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.gridTool === this.gridTool);
    });
    if (this.canvas) {
      this.canvas.style.cursor = this.gridTool !== 'select' ? 'crosshair' : 'default';
    }
    if (shouldSave) this.saveState();
  }

  setSelectionMode(mode) {
    this.selectionMode = mode || 'submatrix';
    document.querySelectorAll('[data-sel-mode]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.selMode === this.selectionMode);
    });
    this.updateQuickSelectUI();
    this.syncQuickSelectInputs();
    this.saveState();
  }

  setActiveColor(color, activeSwatchBtn = null) {
    this.activeColor = color;
    document.querySelectorAll('.color-swatch[data-color]').forEach(btn => {
      btn.classList.toggle('active', activeSwatchBtn ? btn === activeSwatchBtn : btn.dataset.color === color);
    });
    const picker = document.getElementById('grid-custom-color');
    if (picker && /^#[0-9a-fA-F]{6}$/.test(color)) {
      picker.value = color;
    }
    this.saveState();
  }

  updateQuickSelectUI() {
    const fR1 = document.querySelector('.qs-field[data-qs="r1"]');
    const fC1 = document.querySelector('.qs-field[data-qs="c1"]');
    const fR2 = document.querySelector('.qs-field[data-qs="r2"]');
    const fC2 = document.querySelector('.qs-field[data-qs="c2"]');
    const lR1 = document.getElementById('lbl-qs-r1');
    const lC1 = document.getElementById('lbl-qs-c1');
    const lR2 = document.getElementById('lbl-qs-r2');
    const lC2 = document.getElementById('lbl-qs-c2');
    if (!fR1 || !fC1 || !fR2 || !fC2) return;

    fR1.classList.remove('hidden');
    fC1.classList.remove('hidden');
    fR2.classList.remove('hidden');
    fC2.classList.remove('hidden');

    if (this.selectionMode === 'cell' || this.selectionMode === 'diag' || this.selectionMode === 'antidiag') {
      fR2.classList.add('hidden');
      fC2.classList.add('hidden');
      if (lR1) lR1.textContent = 'row';
      if (lC1) lC1.textContent = 'col';
    } else if (this.selectionMode === 'row') {
      fC1.classList.add('hidden');
      fC2.classList.add('hidden');
      if (lR1) lR1.textContent = 'r1';
      if (lR2) lR2.textContent = 'r2';
    } else if (this.selectionMode === 'col') {
      fR1.classList.add('hidden');
      fR2.classList.add('hidden');
      if (lC1) lC1.textContent = 'c1';
      if (lC2) lC2.textContent = 'c2';
    } else {
      if (lR1) lR1.textContent = 'r1';
      if (lC1) lC1.textContent = 'c1';
      if (lR2) lR2.textContent = 'r2';
      if (lC2) lC2.textContent = 'c2';
    }
  }

  syncQuickSelectInputs() {
    const inpR1 = document.getElementById('qs-r1');
    const inpC1 = document.getElementById('qs-c1');
    const inpR2 = document.getElementById('qs-r2');
    const inpC2 = document.getElementById('qs-c2');
    if (!inpR1 || !inpC1 || !inpR2 || !inpC2) return;

    const offset = window.App?.isOneIndexed ? 1 : 0;
    if (this.submatrix) {
      inpR1.value = this.submatrix.r1 + offset;
      inpC1.value = this.submatrix.c1 + offset;
      inpR2.value = this.submatrix.r2 + offset;
      inpC2.value = this.submatrix.c2 + offset;
    } else if (this.selectedCells && this.selectedCells.length > 0) {
      inpR1.value = this.selectedCells[0].r + offset;
      inpC1.value = this.selectedCells[0].c + offset;
    }
  }

  applyQuickSelect() {
    const inpR1 = document.getElementById('qs-r1');
    const inpC1 = document.getElementById('qs-c1');
    const inpR2 = document.getElementById('qs-r2');
    const inpC2 = document.getElementById('qs-c2');
    if (!inpR1 || !inpC1 || !inpR2 || !inpC2) return;

    const offset = window.App?.isOneIndexed ? 1 : 0;
    const clampR = (v) => Math.max(0, Math.min(this.rows - 1, v));
    const clampC = (v) => Math.max(0, Math.min(this.cols - 1, v));

    const r1Raw = (parseInt(inpR1.value, 10) || 0) - offset;
    const c1Raw = (parseInt(inpC1.value, 10) || 0) - offset;
    const r2Raw = (parseInt(inpR2.value, 10) || 0) - offset;
    const c2Raw = (parseInt(inpC2.value, 10) || 0) - offset;

    if (this.selectionMode === 'diag' || this.selectionMode === 'antidiag') {
      const r = clampR(r1Raw);
      const c = clampC(c1Raw);
      this.submatrix = null;
      this.selectedCells = this.getDiagonalCells(r, c, this.selectionMode === 'antidiag');
      this.selectedCell = { row: r, col: c };
    } else {
      this.selectedCells = null;
      let sel;
      if (this.selectionMode === 'cell') {
        const r = clampR(r1Raw), c = clampC(c1Raw);
        sel = { r1: r, c1: c, r2: r, c2: c };
      } else if (this.selectionMode === 'row') {
        const ra = clampR(r1Raw);
        const rb = clampR(inpR2.value === '' ? r1Raw : r2Raw);
        sel = { r1: Math.min(ra, rb), c1: 0, r2: Math.max(ra, rb), c2: this.cols - 1 };
      } else if (this.selectionMode === 'col') {
        const ca = clampC(c1Raw);
        const cb = clampC(inpC2.value === '' ? c1Raw : c2Raw);
        sel = { r1: 0, c1: Math.min(ca, cb), r2: this.rows - 1, c2: Math.max(ca, cb) };
      } else if (this.selectionMode === 'subarray') {
        const ra = clampR(r1Raw), ca = clampC(c1Raw);
        let rb = clampR(r2Raw), cb = clampC(c2Raw);
        if (ra !== rb && ca !== cb) {
          if (Math.abs(rb - ra) > Math.abs(cb - ca)) cb = ca;
          else rb = ra;
        }
        sel = { r1: Math.min(ra, rb), c1: Math.min(ca, cb), r2: Math.max(ra, rb), c2: Math.max(ca, cb) };
      } else {
        const ra = clampR(r1Raw), ca = clampC(c1Raw);
        const rb = clampR(r2Raw), cb = clampC(c2Raw);
        sel = { r1: Math.min(ra, rb), c1: Math.min(ca, cb), r2: Math.max(ra, rb), c2: Math.max(ca, cb) };
      }
      this.submatrix = sel;
      this.selectedCell = { row: sel.r1, col: sel.c1 };
    }

    this.updateSubmatrixStats();
    if (this.autoPaint && this.hasActiveSelection()) {
      this.applyColorToSelection(this.activeColor, false);
    } else {
      this.render();
      this.saveState();
    }
  }

  applyColorToSelection(color, showToast = true) {
    const coords = this.getSelectedCellCoords();
    if (coords.length === 0) {
      if (showToast) {
        window.App?.showToast('Select a cell, row, col, diag, subarray, or submatrix first', 'info');
      }
      return;
    }
    this.pushUndo();
    for (const { r, c } of coords) {
      if (this.grid[r] && this.grid[r][c]) {
        this.grid[r][c].color = color;
      }
    }
    this.render();
    this.saveState();
    if (showToast) {
      window.App?.showToast(color ? 'Colored selected cells' : 'Cleared color from selection', 'info');
    }
  }

  clearAllColors() {
    this.pushUndo();
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        this.grid[r][c].color = null;
      }
    }
    this.render();
    this.saveState();
    window.App?.showToast('Cleared all cell colors', 'info');
  }

  hexToRgba(hex, alpha = 1) {
    if (!hex || typeof hex !== 'string') return `rgba(56, 189, 248, ${alpha})`;
    const clean = hex.replace('#', '');
    if (clean.length === 3) {
      const r = parseInt(clean[0] + clean[0], 16);
      const g = parseInt(clean[1] + clean[1], 16);
      const b = parseInt(clean[2] + clean[2], 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    if (clean.length === 6) {
      const r = parseInt(clean.slice(0, 2), 16);
      const g = parseInt(clean.slice(2, 4), 16);
      const b = parseInt(clean.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return hex;
  }

  // ==========================================
  // PREFIX SUMS, DIFF ARRAY, KADANE & WINDOW
  // ==========================================

  getNumericVal(r, c) {
    const cell = this.grid[r]?.[c];
    if (!cell || cell.isWall) return 0;
    return typeof cell.val === 'number' && Number.isFinite(cell.val) ? cell.val : 0;
  }

  isCellWall(r, c) {
    const cell = this.grid[r]?.[c];
    return !!(cell && (cell.isWall || cell.val === '#'));
  }

  computePrefixSums() {
    const P = Array.from({ length: this.rows + 1 }, () => Array(this.cols + 1).fill(0));
    for (let i = 1; i <= this.rows; i++) {
      for (let j = 1; j <= this.cols; j++) {
        P[i][j] = this.getNumericVal(i - 1, j - 1) + P[i - 1][j] + P[i][j - 1] - P[i - 1][j - 1];
      }
    }
    return P;
  }

  computeDiffMatrix() {
    const D = Array.from({ length: this.rows }, () => Array(this.cols).fill(0));
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cur = this.getNumericVal(r, c);
        const top = r > 0 ? this.getNumericVal(r - 1, c) : 0;
        const left = c > 0 ? this.getNumericVal(r, c - 1) : 0;
        const diag = (r > 0 && c > 0) ? this.getNumericVal(r - 1, c - 1) : 0;
        D[r][c] = cur - top - left + diag;
      }
    }
    return D;
  }

  applyRangeDelta(delta) {
    const coords = this.getSelectedCellCoords();
    if (coords.length === 0) {
      window.App?.showToast('Select a region or cell first to apply range update', 'info');
      return;
    }
    this.pushUndo();
    for (const { r, c } of coords) {
      const cell = this.grid[r][c];
      if (!cell.isWall) {
        const cur = typeof cell.val === 'number' ? cell.val : 0;
        cell.val = cur + delta;
        cell.source = 'manual';
      }
    }
    this.updateSubmatrixStats();
    this.render();
    this.saveState();
    window.App?.showToast(`Applied ${delta >= 0 ? '+' : ''}${delta} to ${coords.length} cells`, 'success');
  }

  runKadane2D() {
    let bestSum = -Infinity;
    let bestRect = null;

    for (let r1 = 0; r1 < this.rows; r1++) {
      const colSum = Array(this.cols).fill(0);
      for (let r2 = r1; r2 < this.rows; r2++) {
        for (let c = 0; c < this.cols; c++) {
          colSum[c] += this.isCellWall(r2, c) ? -1e9 : this.getNumericVal(r2, c);
        }
        let curSum = 0;
        let curStart = 0;
        for (let c = 0; c < this.cols; c++) {
          if (curSum + colSum[c] < colSum[c]) {
            curSum = colSum[c];
            curStart = c;
          } else {
            curSum += colSum[c];
          }
          if (curSum > bestSum) {
            bestSum = curSum;
            bestRect = { r1, c1: curStart, r2, c2: c };
          }
        }
      }
    }

    if (bestRect) {
      this.selectedCells = null;
      this.submatrix = bestRect;
      this.updateSubmatrixStats();
      this.showAlgoResult(`<strong>2D Kadane Max Sum:</strong> ${bestSum}`);
      this.render();
      this.saveState();
    }
  }

  stepSlidingWindow(dir) {
    const k = Math.max(1, Math.min(Math.min(this.rows, this.cols), parseInt(document.getElementById('grid-window-k')?.value, 10) || 3));
    const maxR = this.rows - k + 1;
    const maxC = this.cols - k + 1;
    const total = maxR * maxC;
    if (total <= 0) return;

    if (this.windowPos < 0) {
      this.windowPos = dir > 0 ? 0 : total - 1;
    } else {
      this.windowPos = (this.windowPos + dir + total) % total;
    }

    const r1 = Math.floor(this.windowPos / maxC);
    const c1 = this.windowPos % maxC;
    this.selectedCells = null;
    this.submatrix = { r1, c1, r2: r1 + k - 1, c2: c1 + k - 1 };
    this.updateSubmatrixStats();
    this.render();
    this.saveState();
  }

  // ==========================================
  // STATS & AGGREGATES
  // ==========================================

  gcd(a, b) {
    a = Math.abs(Math.trunc(a));
    b = Math.abs(Math.trunc(b));
    while (b !== 0) {
      const t = a % b;
      a = b;
      b = t;
    }
    return a;
  }

  updateSubmatrixStats() {
    const rangeText = document.getElementById('sub-range-text');
    const areaText = document.getElementById('sub-area-text');
    const sumText = document.getElementById('sub-sum-text');
    const minMaxText = document.getElementById('sub-minmax-text');
    const avgXorText = document.getElementById('sub-avgxor-text');
    const gcdText = document.getElementById('sub-gcd-text');

    const coords = this.getSelectedCellCoords();
    if (coords.length === 0) {
      if (rangeText) rangeText.textContent = 'None selected';
      if (areaText) areaText.textContent = '0';
      if (sumText) sumText.textContent = '0';
      if (minMaxText) minMaxText.textContent = '-';
      if (avgXorText) avgXorText.textContent = '-';
      if (gcdText) gcdText.textContent = '-';
      return;
    }

    const isOneIdx = window.App?.isOneIndexed;
    const offset = isOneIdx ? 1 : 0;

    if (this.submatrix) {
      const { r1, c1, r2, c2 } = this.submatrix;
      const height = r2 - r1 + 1;
      const width = c2 - c1 + 1;
      if (rangeText) {
        rangeText.textContent = `[${r1 + offset},${c1 + offset}]x[${r2 + offset},${c2 + offset}]    (${height}×${width})`;
      }
    } else if (this.selectedCells && this.selectedCells.length > 0) {
      const first = this.selectedCells[0];
      const prefix = this.selectionMode === 'antidiag' ? 'Anti' : 'Diag';
      const val = this.selectionMode === 'antidiag' ? (first.r + first.c + offset * 2) : (first.r - first.c);
      if (rangeText) {
        rangeText.textContent = `${prefix}=${val}    (${this.selectedCells.length} cells)`;
      }
    }

    let sum = 0;
    let minVal = Infinity;
    let maxVal = -Infinity;
    let xorVal = 0;
    let gcdVal = 0;
    let numCount = 0;
    let allInts = true;

    for (const { r, c } of coords) {
      const cell = this.grid[r]?.[c];
      if (!cell || cell.isWall) continue;
      if (typeof cell.val === 'number' && Number.isFinite(cell.val)) {
        const v = cell.val;
        sum += v;
        minVal = Math.min(minVal, v);
        maxVal = Math.max(maxVal, v);
        if (Number.isInteger(v)) {
          xorVal ^= v;
          gcdVal = this.gcd(gcdVal, v);
        } else {
          allInts = false;
        }
        numCount++;
      }
    }

    if (areaText) areaText.textContent = `${coords.length}`;
    if (sumText) sumText.textContent = numCount > 0 ? (Number.isInteger(sum) ? sum : sum.toFixed(2)) : '0';
    if (minMaxText) minMaxText.textContent = numCount > 0 ? `${minVal} / ${maxVal}` : '-';
    if (avgXorText) {
      if (numCount > 0) {
        const avg = sum / numCount;
        const avgStr = Number.isInteger(avg) ? `${avg}` : parseFloat(avg.toFixed(3)).toString();
        avgXorText.textContent = allInts ? `${avgStr} / ${xorVal}` : `${avgStr} / -`;
      } else {
        avgXorText.textContent = '-';
      }
    }
    if (gcdText) gcdText.textContent = (numCount > 0 && allInts) ? `${gcdVal}` : '-';

    this.syncQuickSelectInputs();
  }

  updateStatusPill() {
    const statusCell = document.getElementById('grid-status-cell');
    const statusVal = document.getElementById('grid-status-val');
    const statusZoom = document.getElementById('grid-status-zoom');

    if (statusZoom) statusZoom.textContent = `Zoom: ${Math.round(this.zoom * 100)}%`;

    if (this.hoverCell) {
      const { row, col } = this.hoverCell;
      const cell = this.grid[row][col];
      const isOneIdx = window.App?.isOneIndexed;
      const rDisp = isOneIdx ? row + 1 : row;
      const cDisp = isOneIdx ? col + 1 : col;
      if (statusCell) statusCell.textContent = `Cell: (${rDisp}, ${cDisp}) [1D: ${row * this.cols + col}]`;
      if (statusVal) statusVal.textContent = `Val: ${cell.isWall ? '# (Wall)' : cell.val}`;
    } else {
      if (statusCell) statusCell.textContent = `Cell: -`;
      if (statusVal) statusVal.textContent = `Val: -`;
    }
  }

  // ==========================================
  // MATRIX TRANSFORMS
  // ==========================================

  transformMatrix(op) {
    this.pushUndo();
    const R = this.rows, C = this.cols;
    let newR = R, newC = C;
    if (op === 'transpose' || op === 'rotCW' || op === 'rotCCW') {
      newR = C;
      newC = R;
    }

    const mapCoord = (r, c) => {
      switch (op) {
        case 'transpose': return { r: c, c: r };
        case 'rotCW': return { r: c, c: R - 1 - r };
        case 'rotCCW': return { r: C - 1 - c, c: r };
        case 'flipH': return { r, c: C - 1 - c };
        case 'flipV': return { r: R - 1 - r, c };
        default: return { r, c };
      }
    };

    const nextGrid = Array.from({ length: newR }, () =>
      Array.from({ length: newC }, () => this.createEmptyCell(0, 'empty'))
    );
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        const { r: nr, c: nc } = mapCoord(r, c);
        nextGrid[nr][nc] = { ...this.grid[r][c] };
      }
    }

    this.startCells = this.startCells.map(p => mapCoord(p.r, p.c));
    if (this.endCell) this.endCell = mapCoord(this.endCell.r, this.endCell.c);

    this.rows = newR;
    this.cols = newC;
    this.grid = nextGrid;
    this.submatrix = null;
    this.selectedCells = null;
    this.algoOverlay = null;
    this.hideAlgoResult();
    this.updateDimBadge();
    this.updateSubmatrixStats();
    this.fitGrid();
    this.saveState();
    window.App?.showToast(`Applied matrix transform: ${op}`, 'info');
  }

  // ==========================================
  // CP ALGORITHMS & OVERLAYS
  // ==========================================

  showAlgoResult(html) {
    const box = document.getElementById('grid-algo-result');
    if (!box) return;
    box.innerHTML = html;
    box.classList.remove('hidden');
  }

  hideAlgoResult() {
    const box = document.getElementById('grid-algo-result');
    if (box) {
      box.classList.add('hidden');
      box.innerHTML = '';
    }
  }

  getNeighbors(r, c) {
    const dirs4 = [[-1, 0], [0, 1], [1, 0], [0, -1]];
    const dirs8 = [[-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1]];
    const dirs = this.dirMode === 8 ? dirs8 : dirs4;
    const res = [];
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
        res.push({ r: nr, c: nc });
      }
    }
    return res;
  }

  getEffectiveStartEnd() {
    const starts = this.startCells.length > 0 ? this.startCells : [{ r: 0, c: 0 }];
    const target = this.endCell || { r: this.rows - 1, c: this.cols - 1 };
    return { starts, target };
  }

  runBFS() {
    const { starts, target } = this.getEffectiveStartEnd();
    const dist = Array.from({ length: this.rows }, () => Array(this.cols).fill(null));
    const parent = Array.from({ length: this.rows }, () => Array(this.cols).fill(null));
    const queue = [];

    for (const s of starts) {
      if (!this.isCellWall(s.r, s.c) && dist[s.r][s.c] === null) {
        dist[s.r][s.c] = 0;
        queue.push(s);
      }
    }

    let head = 0;
    let reachable = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      reachable++;
      for (const nxt of this.getNeighbors(cur.r, cur.c)) {
        if (!this.isCellWall(nxt.r, nxt.c) && dist[nxt.r][nxt.c] === null) {
          dist[nxt.r][nxt.c] = dist[cur.r][cur.c] + 1;
          parent[nxt.r][nxt.c] = cur;
          queue.push(nxt);
        }
      }
    }

    const path = [];
    if (dist[target.r][target.c] !== null) {
      let cur = target;
      while (cur) {
        path.push(cur);
        cur = parent[cur.r][cur.c];
      }
      path.reverse();
    }

    this.algoOverlay = { type: 'bfs', values: dist, path };
    const tDist = dist[target.r][target.c];
    this.showAlgoResult(
      `<strong>${this.dirMode}-Dir BFS:</strong> ${tDist !== null ? `Dist = <span class="text-accent">${tDist}</span>` : 'Target Unreachable'} | Visited: ${reachable}`
    );
    this.render();
  }

  runDijkstra() {
    const { starts, target } = this.getEffectiveStartEnd();
    const dist = Array.from({ length: this.rows }, () => Array(this.cols).fill(Infinity));
    const parent = Array.from({ length: this.rows }, () => Array(this.cols).fill(null));
    const pq = [];

    for (const s of starts) {
      if (!this.isCellWall(s.r, s.c)) {
        const w0 = Math.max(0, this.getNumericVal(s.r, s.c));
        dist[s.r][s.c] = w0;
        pq.push({ r: s.r, c: s.c, d: w0 });
      }
    }

    while (pq.length > 0) {
      pq.sort((a, b) => a.d - b.d);
      const cur = pq.shift();
      if (cur.d > dist[cur.r][cur.c]) continue;
      for (const nxt of this.getNeighbors(cur.r, cur.c)) {
        if (this.isCellWall(nxt.r, nxt.c)) continue;
        const w = Math.max(0, this.getNumericVal(nxt.r, nxt.c));
        const nd = cur.d + w;
        if (nd < dist[nxt.r][nxt.c]) {
          dist[nxt.r][nxt.c] = nd;
          parent[nxt.r][nxt.c] = { r: cur.r, c: cur.c };
          pq.push({ r: nxt.r, c: nxt.c, d: nd });
        }
      }
    }

    const path = [];
    const displayDist = dist.map(row => row.map(v => (v === Infinity ? null : v)));
    if (dist[target.r][target.c] !== Infinity) {
      let cur = target;
      while (cur) {
        path.push(cur);
        cur = parent[cur.r][cur.c];
      }
      path.reverse();
    }

    this.algoOverlay = { type: 'dijkstra', values: displayDist, path };
    const tCost = dist[target.r][target.c];
    this.showAlgoResult(
      `<strong>${this.dirMode}-Dir Dijkstra:</strong> ${tCost !== Infinity ? `Min Cost = <span class="text-accent">${tCost}</span>` : 'Unreachable'}`
    );
    this.render();
  }

  runComponents() {
    const palette = ['#38bdf8', '#10b981', '#f59e0b', '#f43f5e', '#a855f7', '#ec4899', '#14b8a6', '#84cc16', '#f97316'];
    const compId = Array.from({ length: this.rows }, () => Array(this.cols).fill(null));
    const colors = Array.from({ length: this.rows }, () => Array(this.cols).fill(null));
    let count = 0;
    let maxSize = 0;

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.isCellWall(r, c) || compId[r][c] !== null) continue;
        count++;
        const colHex = palette[(count - 1) % palette.length];
        const q = [{ r, c }];
        compId[r][c] = `#${count}`;
        colors[r][c] = colHex;
        let head = 0;
        while (head < q.length) {
          const cur = q[head++];
          for (const nxt of this.getNeighbors(cur.r, cur.c)) {
            if (!this.isCellWall(nxt.r, nxt.c) && compId[nxt.r][nxt.c] === null) {
              compId[nxt.r][nxt.c] = `#${count}`;
              colors[nxt.r][nxt.c] = colHex;
              q.push(nxt);
            }
          }
        }
        maxSize = Math.max(maxSize, q.length);
      }
    }

    this.algoOverlay = { type: 'components', values: compId, colors, path: [] };
    this.showAlgoResult(`<strong>${this.dirMode}-Dir Components:</strong> <span class="text-accent">${count}</span> | Max Size: ${maxSize}`);
    this.render();
  }

  runDPMinPath() {
    const dp = Array.from({ length: this.rows }, () => Array(this.cols).fill(Infinity));
    const parent = Array.from({ length: this.rows }, () => Array(this.cols).fill(null));

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.isCellWall(r, c)) continue;
        const w = this.getNumericVal(r, c);
        if (r === 0 && c === 0) {
          dp[r][c] = w;
        } else {
          const fromTop = r > 0 ? dp[r - 1][c] : Infinity;
          const fromLeft = c > 0 ? dp[r][c - 1] : Infinity;
          if (fromTop <= fromLeft && fromTop !== Infinity) {
            dp[r][c] = fromTop + w;
            parent[r][c] = { r: r - 1, c };
          } else if (fromLeft !== Infinity) {
            dp[r][c] = fromLeft + w;
            parent[r][c] = { r, c: c - 1 };
          }
        }
      }
    }

    const path = [];
    const ans = dp[this.rows - 1][this.cols - 1];
    if (ans !== Infinity) {
      let cur = { r: this.rows - 1, c: this.cols - 1 };
      while (cur) {
        path.push(cur);
        cur = parent[cur.r][cur.c];
      }
      path.reverse();
    }

    const display = dp.map(row => row.map(v => (v === Infinity ? null : v)));
    this.algoOverlay = { type: 'dp-min', values: display, path };
    this.showAlgoResult(`<strong>DP Min Path Sum:</strong> ${ans !== Infinity ? `<span class="text-accent">${ans}</span>` : 'Blocked'}`);
    this.render();
  }

  runDPWays() {
    const dp = Array.from({ length: this.rows }, () => Array(this.cols).fill(0));
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.isCellWall(r, c)) {
          dp[r][c] = 0;
          continue;
        }
        if (r === 0 && c === 0) {
          dp[r][c] = 1;
        } else {
          const top = r > 0 ? dp[r - 1][c] : 0;
          const left = c > 0 ? dp[r][c - 1] : 0;
          dp[r][c] = (top + left) % MOD;
        }
      }
    }

    this.algoOverlay = { type: 'dp-ways', values: dp, path: [] };
    this.showAlgoResult(`<strong>DP Paths (mod 10⁹+7):</strong> <span class="text-accent">${dp[this.rows - 1][this.cols - 1]}</span>`);
    this.render();
  }

  runSpiralOverlay() {
    const vals = Array.from({ length: this.rows }, () => Array(this.cols).fill(null));
    const path = [];
    let top = 0, bottom = this.rows - 1, left = 0, right = this.cols - 1;
    let step = 1;

    while (top <= bottom && left <= right) {
      for (let c = left; c <= right; c++) { vals[top][c] = step++; path.push({ r: top, c }); }
      top++;
      for (let r = top; r <= bottom; r++) { vals[r][right] = step++; path.push({ r, c: right }); }
      right--;
      if (top <= bottom) {
        for (let c = right; c >= left; c--) { vals[bottom][c] = step++; path.push({ r: bottom, c }); }
        bottom--;
      }
      if (left <= right) {
        for (let r = bottom; r >= top; r--) { vals[r][left] = step++; path.push({ r, c: left }); }
        left++;
      }
    }

    this.algoOverlay = { type: 'spiral', values: vals, path };
    this.showAlgoResult(`<strong>Spiral Traversal:</strong> 1 → ${this.rows * this.cols}`);
    this.render();
  }

  runRingLayersOverlay() {
    const palette = ['#38bdf8', '#10b981', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6'];
    const vals = Array.from({ length: this.rows }, () => Array(this.cols).fill(0));
    const colors = Array.from({ length: this.rows }, () => Array(this.cols).fill(null));
    let maxLayer = 0;

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const layer = Math.min(r, c, this.rows - 1 - r, this.cols - 1 - c);
        vals[r][c] = `L${layer}`;
        colors[r][c] = palette[layer % palette.length];
        maxLayer = Math.max(maxLayer, layer);
      }
    }

    this.algoOverlay = { type: 'rings', values: vals, colors, path: [] };
    this.showAlgoResult(`<strong>Concentric Layers:</strong> ${maxLayer + 1} rings (L0–L${maxLayer})`);
    this.render();
  }

  // ==========================================
  // RENDERING (Clean Modern Obsidian Grid)
  // ==========================================

  render() {
    if (!this.ctx || !this.container) return;
    const rect = this.container.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    this.ctx.clearRect(0, 0, width, height);

    let minVal = Infinity, maxVal = -Infinity;
    if (this.showHeatmap) {
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          if (this.isCellWall(r, c)) continue;
          const v = this.grid[r][c].val;
          if (typeof v === 'number') {
            minVal = Math.min(minVal, v);
            maxVal = Math.max(maxVal, v);
          }
        }
      }
    }

    const P = this.showPrefixOverlay ? this.computePrefixSums() : null;
    const D = this.showDiffOverlay ? this.computeDiffMatrix() : null;
    const isOneIdx = window.App?.isOneIndexed;
    const cs = this.cellSize * this.zoom;

    const startSet = new Set(this.startCells.map(p => `${p.r},${p.c}`));
    const pathSet = new Set((this.algoOverlay?.path || []).map(p => `${p.r},${p.c}`));

    this.ctx.save();
    this.ctx.translate(this.panX, this.panY);

    // 1. Draw Clean Grid Cells
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = c * cs;
        const y = r * cs;
        const cell = this.grid[r][c];
        const isWall = this.isCellWall(r, c);
        const key = `${r},${c}`;
        const isStart = startSet.has(key);
        const isEnd = this.endCell && this.endCell.r === r && this.endCell.c === c;
        const isOnPath = pathSet.has(key);

        let fillColor = isWall ? '#0f172a' : '#161e2e';
        let textColor = isWall ? '#64748b' : '#f1f5f9';

        if (!isWall && this.showHeatmap && typeof cell.val === 'number' && maxVal > minVal) {
          const ratio = (cell.val - minVal) / (maxVal - minVal);
          fillColor = `rgba(56, 189, 248, ${0.15 + ratio * 0.75})`;
          textColor = ratio > 0.6 ? '#ffffff' : '#e0f2fe';
        }

        // Base cell fill
        this.ctx.fillStyle = fillColor;
        this.ctx.fillRect(x, y, cs, cs);

        // Wall subtle diagonal hatch
        if (isWall && cs >= 18) {
          this.ctx.strokeStyle = 'rgba(100, 116, 139, 0.25)';
          this.ctx.lineWidth = 1;
          this.ctx.beginPath();
          this.ctx.moveTo(x + 3, y + cs - 3);
          this.ctx.lineTo(x + cs - 3, y + 3);
          this.ctx.stroke();
        }

        // Custom user color OR algorithm component color
        const overlayColor = this.algoOverlay?.colors?.[r]?.[c];
        const effectiveColor = cell.color || overlayColor;
        if (effectiveColor) {
          this.ctx.fillStyle = this.hexToRgba(effectiveColor, 0.38);
          this.ctx.fillRect(x, y, cs, cs);
          this.ctx.strokeStyle = this.hexToRgba(effectiveColor, 0.85);
          this.ctx.lineWidth = Math.max(1, cs * 0.03);
          this.ctx.strokeRect(x + 0.5, y + 0.5, cs - 1, cs - 1);
          textColor = '#f8fafc';
        } else {
          this.ctx.strokeStyle = '#273549';
          this.ctx.lineWidth = 1;
          this.ctx.strokeRect(x, y, cs, cs);
        }

        // Algorithm shortest path cell tint
        if (isOnPath && this.algoOverlay?.type !== 'spiral') {
          this.ctx.fillStyle = 'rgba(16, 185, 129, 0.34)';
          this.ctx.fillRect(x, y, cs, cs);
        }

        // Start (S) / Target (T) badges
        if (isStart) {
          this.ctx.fillStyle = 'rgba(16, 185, 129, 0.28)';
          this.ctx.fillRect(x, y, cs, cs);
          this.ctx.strokeStyle = '#10b981';
          this.ctx.lineWidth = Math.max(1.5, cs * 0.04);
          this.ctx.strokeRect(x + 1, y + 1, cs - 2, cs - 2);
        } else if (isEnd) {
          this.ctx.fillStyle = 'rgba(244, 63, 94, 0.28)';
          this.ctx.fillRect(x, y, cs, cs);
          this.ctx.strokeStyle = '#f43f5e';
          this.ctx.lineWidth = Math.max(1.5, cs * 0.04);
          this.ctx.strokeRect(x + 1, y + 1, cs - 2, cs - 2);
        }

        // Determine primary displayed value
        let displayVal = cell.val;
        if (this.showPrefixOverlay) {
          displayVal = P[r + 1][c + 1];
        } else if (this.showDiffOverlay) {
          displayVal = D[r][c];
        } else if (this.algoOverlay?.values) {
          const av = this.algoOverlay.values[r][c];
          displayVal = av !== null && av !== undefined ? av : (isWall ? '#' : '∞');
        } else if (isWall) {
          displayVal = '#';
        }

        // Cell Center Value (scales continuously with zoom, auto-fits long strings)
        const textStr = String(displayVal);
        let fontSize = Math.max(8, cs * 0.38);
        this.ctx.font = `600 ${fontSize}px "JetBrains Mono", Menlo, monospace`;
        const maxTextWidth = cs * 0.84;
        const measuredWidth = this.ctx.measureText(textStr).width;
        if (measuredWidth > maxTextWidth && maxTextWidth > 0) {
          fontSize = Math.max(7, fontSize * (maxTextWidth / measuredWidth));
          this.ctx.font = `600 ${fontSize}px "JetBrains Mono", Menlo, monospace`;
        }
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillStyle = textColor;
        this.ctx.fillText(textStr, x + cs / 2, y + cs / 2);

        // Start / End corner tag
        if ((isStart || isEnd) && cs >= 24) {
          const tagSize = Math.max(8, cs * 0.19);
          const pad = Math.max(2, cs * 0.07);
          this.ctx.font = `700 ${tagSize}px "JetBrains Mono", Menlo, monospace`;
          this.ctx.fillStyle = isStart ? '#34d399' : '#fb7185';
          this.ctx.textAlign = 'left';
          this.ctx.textBaseline = 'top';
          this.ctx.fillText(isStart ? 'S' : 'T', x + pad, y + pad);
        } else if (this.show1DIndex && cs >= 30) {
          const idxSize = Math.max(7, cs * 0.16);
          const pad = Math.max(2, cs * 0.06);
          this.ctx.font = `500 ${idxSize}px "JetBrains Mono", Menlo, monospace`;
          this.ctx.fillStyle = 'rgba(56, 189, 248, 0.72)';
          this.ctx.textAlign = 'left';
          this.ctx.textBaseline = 'top';
          this.ctx.fillText(`${r * this.cols + c}`, x + pad, y + pad);
        }

        // Coordinate subscripts (bottom-right)
        if (this.showSubscripts && cs >= 36) {
          const rDisp = isOneIdx ? r + 1 : r;
          const cDisp = isOneIdx ? c + 1 : c;
          const subFontSize = Math.max(7, cs * 0.16);
          const pad = Math.max(2, cs * 0.06);
          this.ctx.font = `500 ${subFontSize}px "JetBrains Mono", Menlo, monospace`;
          this.ctx.fillStyle = 'rgba(148, 163, 184, 0.72)';
          this.ctx.textAlign = 'right';
          this.ctx.textBaseline = 'bottom';
          this.ctx.fillText(`${rDisp},${cDisp}`, x + cs - pad, y + cs - pad * 0.65);
        }
      }
    }

    // 2. Algorithm Path Line (BFS / Dijkstra / DP / Spiral)
    if (this.algoOverlay?.path && this.algoOverlay.path.length > 1) {
      const path = this.algoOverlay.path;
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.strokeStyle = this.algoOverlay.type === 'spiral' ? 'rgba(56, 189, 248, 0.55)' : '#10b981';
      this.ctx.lineWidth = Math.max(2, cs * 0.065);
      this.ctx.lineJoin = 'round';
      this.ctx.lineCap = 'round';
      for (let i = 0; i < path.length; i++) {
        const px = path[i].c * cs + cs / 2;
        const py = path[i].r * cs + cs / 2;
        if (i === 0) this.ctx.moveTo(px, py);
        else this.ctx.lineTo(px, py);
      }
      this.ctx.stroke();
      this.ctx.restore();
    }

    // 3. Selection Highlight (Submatrix OR Diagonal Selected Cells)
    if (this.submatrix) {
      const { r1, c1, r2, c2 } = this.submatrix;
      const sx = c1 * cs;
      const sy = r1 * cs;
      const sw = (c2 - c1 + 1) * cs;
      const sh = (r2 - r1 + 1) * cs;

      this.ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
      this.ctx.fillRect(sx, sy, sw, sh);

      this.ctx.strokeStyle = '#38bdf8';
      this.ctx.lineWidth = Math.max(2, cs * 0.045);
      this.ctx.strokeRect(sx, sy, sw, sh);
    } else if (this.selectedCells && this.selectedCells.length > 0) {
      for (const { r, c } of this.selectedCells) {
        const sx = c * cs;
        const sy = r * cs;
        this.ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
        this.ctx.fillRect(sx, sy, cs, cs);
        this.ctx.strokeStyle = '#38bdf8';
        this.ctx.lineWidth = Math.max(2, cs * 0.045);
        this.ctx.strokeRect(sx, sy, cs, cs);
      }
    }

    // 4. Hovered Cell border
    if (this.hoverCell) {
      const hx = this.hoverCell.col * cs;
      const hy = this.hoverCell.row * cs;
      this.ctx.strokeStyle = '#38bdf8';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(hx, hy, cs, cs);
    }

    // 5. Row & Col Headers
    this.renderHeaders(cs, isOneIdx);

    this.ctx.restore();
  }

  renderHeaders(cs, isOneIdx) {
    const headerFontSize = Math.max(9, cs * 0.28);
    const headerFont = `600 ${headerFontSize}px "JetBrains Mono", Menlo, monospace`;
    const headerGap = Math.max(6, cs * 0.16);
    this.ctx.font = headerFont;

    // Column Headers (Top)
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'bottom';
    for (let c = 0; c < this.cols; c++) {
      const isHoveredCol = (this.hoverCell && this.hoverCell.col === c) ||
        (this.hoverHeader && this.hoverHeader.type === 'col' && this.hoverHeader.index === c);
      this.ctx.fillStyle = isHoveredCol ? '#38bdf8' : '#94a3b8';
      const label = isOneIdx ? c + 1 : c;
      const x = c * cs + cs / 2;
      this.ctx.fillText(label, x, -headerGap);
    }

    // Row Headers (Left)
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'middle';
    for (let r = 0; r < this.rows; r++) {
      const isHoveredRow = (this.hoverCell && this.hoverCell.row === r) ||
        (this.hoverHeader && this.hoverHeader.type === 'row' && this.hoverHeader.index === r);
      this.ctx.fillStyle = isHoveredRow ? '#38bdf8' : '#94a3b8';
      const label = isOneIdx ? r + 1 : r;
      const y = r * cs + cs / 2;
      this.ctx.fillText(label, -headerGap * 1.15, y);
    }

    // Grid Outer Border
    this.ctx.strokeStyle = '#374151';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(0, 0, this.cols * cs, this.rows * cs);
  }

  // ==========================================
  // UI SYNC & PERSISTENCE (localStorage)
  // ==========================================

  syncControlStatesUI() {
    document.querySelectorAll('[data-sel-mode]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.selMode === this.selectionMode);
    });
    document.querySelectorAll('[data-grid-tool]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.gridTool === this.gridTool);
    });
    document.querySelectorAll('[data-input-mode]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.inputMode === this.inputMode);
    });
    document.querySelectorAll('[data-grid-dir]').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.gridDir, 10) === this.dirMode);
    });
    document.querySelectorAll('.color-swatch[data-color]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.color === this.activeColor);
    });
    const picker = document.getElementById('grid-custom-color');
    if (picker && /^#[0-9a-fA-F]{6}$/.test(this.activeColor)) picker.value = this.activeColor;

    const setChk = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.checked = !!val;
    };
    setChk('toggle-heatmap', this.showHeatmap);
    setChk('toggle-prefix-overlay', this.showPrefixOverlay);
    setChk('toggle-diff-overlay', this.showDiffOverlay);
    setChk('toggle-subscripts', this.showSubscripts);
    setChk('toggle-1d-index', this.show1DIndex);
    setChk('toggle-auto-paint', this.autoPaint);

    this.updateQuickSelectUI();
    this.syncQuickSelectInputs();
  }

  saveState() {
    try {
      const batchInput = document.getElementById('grid-batch-input');
      const state = {
        rows: this.rows,
        cols: this.cols,
        grid: this.grid,
        batchInputText: batchInput ? batchInput.value : '',
        showHeatmap: this.showHeatmap,
        showPrefixOverlay: this.showPrefixOverlay,
        showDiffOverlay: this.showDiffOverlay,
        showSubscripts: this.showSubscripts,
        show1DIndex: this.show1DIndex,
        submatrix: this.submatrix,
        selectedCells: this.selectedCells,
        selectedCell: this.selectedCell,
        selectionMode: this.selectionMode,
        gridTool: this.gridTool,
        inputMode: this.inputMode,
        dirMode: this.dirMode,
        activeColor: this.activeColor,
        autoPaint: this.autoPaint,
        startCells: this.startCells,
        endCell: this.endCell
      };
      localStorage.setItem('tracematrix_grid_state', JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to save grid state to localStorage', e);
    }
  }

  loadState() {
    try {
      const raw = localStorage.getItem('tracematrix_grid_state');
      if (!raw) return false;
      const state = JSON.parse(raw);
      if (!state || !Array.isArray(state.grid) || !state.rows || !state.cols) return false;

      this.rows = state.rows;
      this.cols = state.cols;
      this.grid = state.grid;

      if (state.batchInputText !== undefined) {
        const batchInput = document.getElementById('grid-batch-input');
        if (batchInput) batchInput.value = state.batchInputText;
      }

      if (typeof state.showHeatmap === 'boolean') this.showHeatmap = state.showHeatmap;
      if (typeof state.showPrefixOverlay === 'boolean') this.showPrefixOverlay = state.showPrefixOverlay;
      if (typeof state.showDiffOverlay === 'boolean') this.showDiffOverlay = state.showDiffOverlay;
      if (typeof state.showSubscripts === 'boolean') this.showSubscripts = state.showSubscripts;
      if (typeof state.show1DIndex === 'boolean') this.show1DIndex = state.show1DIndex;
      if (state.submatrix) this.submatrix = state.submatrix;
      if (Array.isArray(state.selectedCells)) this.selectedCells = state.selectedCells;
      if (state.selectedCell) this.selectedCell = state.selectedCell;
      if (state.selectionMode) {
        this.selectionMode = state.selectionMode === 'subarray' ? 'submatrix' : state.selectionMode;
      }
      if (state.gridTool) this.gridTool = state.gridTool;
      if (state.inputMode) {
        this.inputMode = state.inputMode === 'matrix' ? 'matrix' : 'auto';
      }
      if (state.dirMode === 4 || state.dirMode === 8) this.dirMode = state.dirMode;
      if (state.activeColor) this.activeColor = state.activeColor;
      if (typeof state.autoPaint === 'boolean') this.autoPaint = state.autoPaint;
      if (Array.isArray(state.startCells)) this.startCells = state.startCells;
      if (state.endCell) this.endCell = state.endCell;

      this.updateDimBadge();
      this.syncControlStatesUI();
      this.updateSubmatrixStats();
      return true;
    } catch (e) {
      console.warn('Failed to load grid state from localStorage', e);
      return false;
    }
  }
}

window.GridVisualizer = GridVisualizer;
