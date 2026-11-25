/**
 * TraceMatrix — Grid & Matrix Visualizer (GridVis)
 * 2D Array, Matrix weights, submatrix prefix sums, and in-cell editing.
 */

class GridVisualizer {
  constructor() {
    this.canvas = document.getElementById('grid-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.container = document.getElementById('grid-canvas-container');

    this.rows = 10;
    this.cols = 10;
    this.cellSize = 52; // clean square cell size

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

    // Submatrix selection
    this.submatrix = null;
    this.isSelectingSubmatrix = false;
    this.subStart = null;

    // Selection & Coloring state
    this.selectionMode = 'submatrix'; // 'submatrix' | 'cell' | 'subarray' | 'row' | 'col'
    this.activeColor = '#38bdf8';
    this.autoPaint = false;
    this.hoverHeader = null;
    this.headerDrag = null;

    // Visualization modes
    this.showHeatmap = false;
    this.showPrefixOverlay = false;
    this.showSubscripts = false;

    // Grid data & state restoration
    this.grid = [];
    const loaded = this.loadState();
    if (!loaded) {
      this.initGrid(this.rows, this.cols, 0);
    }

    this.initEventListeners();
    this.updateQuickSelectUI();
    this.resizeCanvas();
    this.fitGrid();
  }

  initGrid(rows, cols, defaultValue = 0) {
    this.rows = Math.max(1, Math.min(100, rows));
    this.cols = Math.max(1, Math.min(100, cols));
    this.grid = [];
    for (let r = 0; r < this.rows; r++) {
      const row = [];
      for (let c = 0; c < this.cols; c++) {
        row.push({
          val: defaultValue,
          type: 'empty',
          source: 'empty',
          color: null
        });
      }
      this.grid.push(row);
    }
    this.submatrix = null;
    this.updateDimBadge();
    this.updateSubmatrixStats();
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

  initEventListeners() {
    window.addEventListener('resize', () => this.resizeCanvas());

    // Resize button
    document.getElementById('btn-resize-grid')?.addEventListener('click', () => {
      const r = parseInt(document.getElementById('grid-rows')?.value) || 10;
      const c = parseInt(document.getElementById('grid-cols')?.value) || 10;
      this.initGrid(r, c);
      this.fitGrid();
      this.saveState();
      window.App?.showToast(`Grid resized to ${r} × ${c}`, 'info');
    });

    // Preset sizes
    document.querySelectorAll('[data-grid-size]').forEach(btn => {
      btn.addEventListener('click', () => {
        const [r, c] = btn.dataset.gridSize.split('x').map(Number);
        this.initGrid(r, c, 0);
        this.fitGrid();
        this.saveState();
        window.App?.showToast(`Grid set to ${r} × ${c}`, 'info');
      });
    });

    // Zoom Buttons
    document.getElementById('grid-zoom-in')?.addEventListener('click', () => this.zoomAtCenter(1.2));
    document.getElementById('grid-zoom-out')?.addEventListener('click', () => this.zoomAtCenter(0.8));
    document.getElementById('grid-zoom-fit')?.addEventListener('click', () => this.fitGrid());
    document.getElementById('grid-zoom-reset')?.addEventListener('click', () => this.resetView());

    // Canvas Mouse Events
    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    window.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    this.canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });

    // Double-click to edit cell value in place
    this.canvas.addEventListener('dblclick', (e) => this.handleDoubleClick(e));

    // Toggles
    document.getElementById('toggle-prefix-overlay')?.addEventListener('change', (e) => {
      this.showPrefixOverlay = e.target.checked;
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

    // Batch Paste & Input Controls (x y val)
    const batchInput = document.getElementById('grid-batch-input');
    batchInput?.addEventListener('paste', () => {
      clearTimeout(this._batchTimer);
      setTimeout(() => {
        this.parseBatchInput(batchInput.value, true);
      }, 30);
    });

    batchInput?.addEventListener('input', () => {
      clearTimeout(this._batchTimer);
      this._batchTimer = setTimeout(() => {
        this.parseBatchInput(batchInput.value, false);
      }, 200);
    });

    batchInput?.addEventListener('change', () => {
      clearTimeout(this._batchTimer);
      this.parseBatchInput(batchInput.value, false);
    });

    document.getElementById('btn-apply-batch-grid')?.addEventListener('click', () => {
      this.parseBatchInput(batchInput?.value, true);
    });

    document.getElementById('btn-clear-batch-text')?.addEventListener('click', () => {
      if (batchInput) batchInput.value = '';
      this.parseBatchInput('', false);
    });

    // Selection Mode Pills
    document.querySelectorAll('[data-sel-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setSelectionMode(btn.dataset.selMode);
      });
    });

    // Quick Select Inputs & Button
    document.getElementById('btn-qs-select')?.addEventListener('click', () => {
      this.applyQuickSelect();
    });
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
        if (this.submatrix) {
          this.applyColorToSelection(this.activeColor, false);
        }
      });
    });

    const customPicker = document.getElementById('grid-custom-color');
    customPicker?.addEventListener('input', (e) => {
      this.setActiveColor(e.target.value, null);
      if (this.submatrix) {
        this.applyColorToSelection(this.activeColor, false);
      }
    });
    customPicker?.addEventListener('change', (e) => {
      this.setActiveColor(e.target.value, null);
      if (this.submatrix) {
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

    window.addEventListener('beforeunload', () => {
      this.saveState();
    });
  }

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
      this.isSelectingSubmatrix = true;
      this.subStart = cell;
      this.selectedCell = cell;
      this.submatrix = this.buildSelectionFromDrag(cell, cell);
      this.updateSubmatrixStats();
      this.render();
      return;
    }

    const hdr = this.screenToHeader(sx, sy);
    if (hdr) {
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
      this.canvas.style.cursor = this.hoverHeader ? 'pointer' : 'default';
    }
    this.updateStatusPill();

    if (this.isSelectingSubmatrix && this.subStart && cell) {
      this.submatrix = this.buildSelectionFromDrag(this.subStart, cell);
      this.updateSubmatrixStats();
      this.render();
    } else {
      this.render();
    }
  }

  handleMouseUp(e) {
    if (this.isSelectingSubmatrix || this.headerDrag) {
      if (this.autoPaint && this.submatrix) {
        this.applyColorToSelection(this.activeColor, false);
      }
      this.saveState();
    }
    this.isPanning = false;
    this.isSelectingSubmatrix = false;
    this.headerDrag = null;
  }

  // Double-click to edit cell value in place
  handleDoubleClick(e) {
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
      cell.val = finalVal;
      cell.type = 'empty';
      cell.source = 'manual';

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

    input.addEventListener('blur', () => {
      commit();
    });

    this.container.appendChild(input);
    input.focus();
    input.select();
  }

  clearGrid() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        this.grid[r][c].val = 0;
        this.grid[r][c].type = 'empty';
        this.grid[r][c].source = 'empty';
        this.grid[r][c].color = null;
      }
    }
    this.submatrix = null;
    this.updateSubmatrixStats();
    this.render();
    this.saveState();
    window.App?.showToast('All grid cells reset to 0', 'info');
  }

  resetBatchCells() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c].source !== 'manual') {
          this.grid[r][c].val = 0;
          this.grid[r][c].type = 'empty';
          this.grid[r][c].source = 'empty';
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
    let startLine = 0;
    const intRe = /^-?\d+$/;

    // Skip leading single-number count N (e.g. number of entries)
    if (tokenizedLines[0].length === 1 && intRe.test(tokenizedLines[0][0])) {
      startLine = 1;
    } else if (
      tokenizedLines.length > 1 &&
      tokenizedLines[0].length === 2 &&
      intRe.test(tokenizedLines[0][0]) &&
      intRe.test(tokenizedLines[0][1]) &&
      tokenizedLines.length - 1 === parseInt(tokenizedLines[0][1], 10) &&
      tokenizedLines.slice(1).every(t => t.length === 3)
    ) {
      // Skip leading "N M" header followed by M coordinate-value lines
      startLine = 1;
    }

    const dataRows = tokenizedLines.slice(startLine);
    if (dataRows.length === 0) {
      this.updateSubmatrixStats();
      this.render();
      this.saveState();
      return;
    }

    const parsedEntries = [];
    const firstRowLen = dataRows[0].length;
    const isMatrixBlock = firstRowLen >= 4 && dataRows.every(t => t.length === firstRowLen);

    if (isMatrixBlock) {
      for (let r = 0; r < dataRows.length; r++) {
        for (let c = 0; c < dataRows[r].length; c++) {
          parsedEntries.push({ r, c, val: this.parseTokenValue(dataRows[r][c]), rawCoord: false });
        }
      }
    } else {
      const isOneIdx = window.App?.isOneIndexed;
      let minR = Infinity, minC = Infinity;

      for (const tokens of dataRows) {
        if ((tokens.length === 2 || tokens.length === 3) && intRe.test(tokens[0]) && intRe.test(tokens[1])) {
          const rawR = parseInt(tokens[0], 10);
          const rawC = parseInt(tokens[1], 10);
          const finalVal = tokens.length === 3 ? this.parseTokenValue(tokens[2]) : 1;
          parsedEntries.push({ r: rawR, c: rawC, val: finalVal, rawCoord: true });
          minR = Math.min(minR, rawR);
          minC = Math.min(minC, rawC);
        }
      }

      if (parsedEntries.length === 0) {
        this.updateSubmatrixStats();
        this.render();
        this.saveState();
        if (showToast) {
          window.App?.showToast('No valid "x y val" rows found in input', 'error');
        }
        return;
      }

      // If 1-indexed mode is toggled on and min coordinate >= 1, shift by -1
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

    // Auto-expand grid if coordinates exceed current bounds (up to 100 max)
    const neededRows = Math.min(100, Math.max(this.rows, targetMaxR + 1));
    const neededCols = Math.min(100, Math.max(this.cols, targetMaxC + 1));

    if (neededRows > this.rows || neededCols > this.cols) {
      this.resizeGridPreserving(neededRows, neededCols);
    }

    // Apply values to grid cells
    let updatedCount = 0;
    for (const entry of parsedEntries) {
      if (entry.r >= 0 && entry.r < this.rows && entry.c >= 0 && entry.c < this.cols) {
        this.grid[entry.r][entry.c].val = entry.val;
        this.grid[entry.r][entry.c].type = 'empty';
        this.grid[entry.r][entry.c].source = 'batch';
        updatedCount++;
      }
    }

    this.updateSubmatrixStats();
    this.render();
    this.saveState();
    if (showToast) {
      window.App?.showToast(`Added ${updatedCount} cell value${updatedCount !== 1 ? 's' : ''} to grid!`, 'success');
    }
  }

  resizeGridPreserving(newRows, newCols) {
    const oldGrid = this.grid;
    const oldRows = this.rows;
    const oldCols = this.cols;

    this.rows = newRows;
    this.cols = newCols;
    this.grid = [];

    for (let r = 0; r < newRows; r++) {
      const row = [];
      for (let c = 0; c < newCols; c++) {
        if (r < oldRows && c < oldCols) {
          row.push(oldGrid[r][c]);
        } else {
          row.push({ val: 0, type: 'empty', source: 'empty', color: null });
        }
      }
      this.grid.push(row);
    }

    this.updateDimBadge();
    this.fitGrid();
    this.saveState();
  }

  formatCoord(r, c) {
    const isOneIdx = window.App?.isOneIndexed;
    const rLabel = isOneIdx ? r + 1 : r;
    const cLabel = isOneIdx ? c + 1 : c;
    return `r:${rLabel}, c:${cLabel}`;
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
      if (statusVal) statusVal.textContent = `Val: ${cell.val}`;
    } else {
      if (statusCell) statusCell.textContent = `Cell: -`;
      if (statusVal) statusVal.textContent = `Val: -`;
    }
  }

  computePrefixSums() {
    const P = Array.from({ length: this.rows + 1 }, () => Array(this.cols + 1).fill(0));
    for (let i = 1; i <= this.rows; i++) {
      for (let j = 1; j <= this.cols; j++) {
        const v = typeof this.grid[i - 1][j - 1].val === 'number' ? this.grid[i - 1][j - 1].val : 0;
        P[i][j] = v + P[i - 1][j] + P[i][j - 1] - P[i - 1][j - 1];
      }
    }
    return P;
  }

  // ==========================================
  // SELECTION MODES & MULTI-COLOR PAINTING
  // ==========================================

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

    if (this.selectionMode === 'cell') {
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
    if (!inpR1 || !inpC1 || !inpR2 || !inpC2 || !this.submatrix) return;

    const offset = window.App?.isOneIndexed ? 1 : 0;
    inpR1.value = this.submatrix.r1 + offset;
    inpC1.value = this.submatrix.c1 + offset;
    inpR2.value = this.submatrix.r2 + offset;
    inpC2.value = this.submatrix.c2 + offset;
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

    let sel;
    if (this.selectionMode === 'cell') {
      const r = clampR(r1Raw);
      const c = clampC(c1Raw);
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
        // Keep subarray 1D: lock to row slice unless row span > col span
        if (Math.abs(rb - ra) > Math.abs(cb - ca)) {
          cb = ca;
        } else {
          rb = ra;
        }
      }
      sel = { r1: Math.min(ra, rb), c1: Math.min(ca, cb), r2: Math.max(ra, rb), c2: Math.max(ca, cb) };
    } else {
      const ra = clampR(r1Raw), ca = clampC(c1Raw);
      const rb = clampR(r2Raw), cb = clampC(c2Raw);
      sel = { r1: Math.min(ra, rb), c1: Math.min(ca, cb), r2: Math.max(ra, rb), c2: Math.max(ca, cb) };
    }

    this.submatrix = sel;
    this.selectedCell = { row: sel.r1, col: sel.c1 };
    this.updateSubmatrixStats();
    if (this.autoPaint) {
      this.applyColorToSelection(this.activeColor, false);
    } else {
      this.render();
      this.saveState();
    }
  }

  applyColorToSelection(color, showToast = true) {
    if (!this.submatrix) {
      if (showToast) {
        window.App?.showToast('Select a cell, row, col, subarray, or submatrix first', 'info');
      }
      return;
    }
    const { r1, c1, r2, c2 } = this.submatrix;
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        if (this.grid[r] && this.grid[r][c]) {
          this.grid[r][c].color = color;
        }
      }
    }
    this.render();
    this.saveState();
    if (showToast) {
      window.App?.showToast(color ? 'Colored selected cells' : 'Cleared color from selection', 'info');
    }
  }

  clearAllColors() {
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

  updateSubmatrixStats() {
    const rangeText = document.getElementById('sub-range-text');
    const areaText = document.getElementById('sub-area-text');
    const sumText = document.getElementById('sub-sum-text');
    const minText = document.getElementById('sub-min-text');
    const maxText = document.getElementById('sub-max-text');
    const avgText = document.getElementById('sub-avg-text');
    const breakdownEl = document.getElementById('formula-breakdown');

    if (!this.submatrix) {
      if (rangeText) rangeText.textContent = 'None selected';
      if (areaText) areaText.textContent = '0';
      if (sumText) sumText.textContent = '0';
      if (minText) minText.textContent = '-';
      if (maxText) maxText.textContent = '-';
      if (avgText) avgText.textContent = '-';
      if (breakdownEl) breakdownEl.innerHTML = '';
      return;
    }

    const { r1, c1, r2, c2 } = this.submatrix;
    const isOneIdx = window.App?.isOneIndexed;
    const r1Disp = isOneIdx ? r1 + 1 : r1;
    const c1Disp = isOneIdx ? c1 + 1 : c1;
    const r2Disp = isOneIdx ? r2 + 1 : r2;
    const c2Disp = isOneIdx ? c2 + 1 : c2;

    const height = r2 - r1 + 1;
    const width = c2 - c1 + 1;
    const totalCells = height * width;

    let sum = 0;
    let minVal = Infinity;
    let maxVal = -Infinity;
    let hasNumeric = false;

    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const v = this.grid[r][c].val;
        if (typeof v === 'number') {
          sum += v;
          minVal = Math.min(minVal, v);
          maxVal = Math.max(maxVal, v);
          hasNumeric = true;
        }
      }
    }

    if (rangeText) rangeText.textContent = `[${r1Disp},${c1Disp}]x[${r2Disp},${c2Disp}]    (${height}×${width})`;
    if (areaText) areaText.textContent = `${totalCells}`;
    if (sumText) sumText.textContent = hasNumeric ? (Number.isInteger(sum) ? sum : sum.toFixed(2)) : '0';
    if (minText) minText.textContent = hasNumeric ? `${minVal}` : '-';
    if (maxText) maxText.textContent = hasNumeric ? `${maxVal}` : '-';
    if (avgText) {
      if (hasNumeric) {
        const avg = sum / totalCells;
        avgText.textContent = Number.isInteger(avg) ? `${avg}` : parseFloat(avg.toFixed(4)).toString();
      } else {
        avgText.textContent = '-';
      }
    }

    if (breakdownEl) {
      const P = this.computePrefixSums();
      const R2 = r2 + 1;
      const C2 = c2 + 1;
      const R1 = r1; // top exclusion
      const C1 = c1; // left exclusion

      const pTotal = P[R2][C2];
      const pTop = P[R1][C2];
      const pLeft = P[R2][C1];
      const pDiag = P[R1][C1];
      const calcSum = pTotal - pTop - pLeft + pDiag;

      breakdownEl.innerHTML = `
        <div class="calc-row">= P[${r2Disp}][${c2Disp}] − P[${isOneIdx ? r1 : r1 - 1}][${c2Disp}] − P[${r2Disp}][${isOneIdx ? c1 : c1 - 1}] + P[${isOneIdx ? r1 : r1 - 1}][${isOneIdx ? c1 : c1 - 1}]</div>
        <div class="calc-row">= <strong>${pTotal}</strong> − <strong>${pTop}</strong> − <strong>${pLeft}</strong> + <strong>${pDiag}</strong> = <strong class="text-accent">${calcSum}</strong></div>
      `;
    }

    this.syncQuickSelectInputs();
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
          const v = this.grid[r][c].val;
          if (typeof v === 'number') {
            minVal = Math.min(minVal, v);
            maxVal = Math.max(maxVal, v);
          }
        }
      }
    }

    const P = this.showPrefixOverlay ? this.computePrefixSums() : null;
    const isOneIdx = window.App?.isOneIndexed;
    const cs = this.cellSize * this.zoom;

    this.ctx.save();
    this.ctx.translate(this.panX, this.panY);

    // 1. Draw Clean Grid Cells
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = c * cs;
        const y = r * cs;
        const cell = this.grid[r][c];

        let fillColor = '#161e2e'; // clean deep slate
        let textColor = '#f1f5f9'; // bright crisp text

        if (this.showHeatmap && typeof cell.val === 'number' && maxVal > minVal) {
          const ratio = (cell.val - minVal) / (maxVal - minVal);
          fillColor = `rgba(56, 189, 248, ${0.15 + ratio * 0.75})`;
          textColor = ratio > 0.6 ? '#ffffff' : '#e0f2fe';
        }

        // Cell rect base
        this.ctx.fillStyle = fillColor;
        this.ctx.fillRect(x, y, cs, cs);

        // Custom user color tint overlay (cells, subarrays, submatrices, rows, columns)
        if (cell.color) {
          this.ctx.fillStyle = this.hexToRgba(cell.color, 0.38);
          this.ctx.fillRect(x, y, cs, cs);
          this.ctx.strokeStyle = this.hexToRgba(cell.color, 0.85);
          this.ctx.lineWidth = Math.max(1, cs * 0.03);
          this.ctx.strokeRect(x + 0.5, y + 0.5, cs - 1, cs - 1);
          textColor = '#f8fafc';
        } else {
          // Crisp default border
          this.ctx.strokeStyle = '#273549';
          this.ctx.lineWidth = 1;
          this.ctx.strokeRect(x, y, cs, cs);
        }

        // Cell Center Value (scales continuously with zoom, auto-fits long strings)
        const textStr = String(this.showPrefixOverlay ? P[r + 1][c + 1] : cell.val);
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

        // Coordinate subscripts (also scale with zoom)
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

    // 2. Submatrix Highlight
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
    }

    // 3. Hovered Cell border
    if (this.hoverCell) {
      const hx = this.hoverCell.col * cs;
      const hy = this.hoverCell.row * cs;
      this.ctx.strokeStyle = '#38bdf8';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(hx, hy, cs, cs);
    }

    // 4. Row & Col Headers
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
  // PERSISTENCE (localStorage)
  // ==========================================
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
        showSubscripts: this.showSubscripts,
        submatrix: this.submatrix,
        selectedCell: this.selectedCell,
        selectionMode: this.selectionMode,
        activeColor: this.activeColor,
        autoPaint: this.autoPaint
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

      if (typeof state.showHeatmap === 'boolean') {
        this.showHeatmap = state.showHeatmap;
        const chk = document.getElementById('toggle-heatmap');
        if (chk) chk.checked = this.showHeatmap;
      }
      if (typeof state.showPrefixOverlay === 'boolean') {
        this.showPrefixOverlay = state.showPrefixOverlay;
        const chk = document.getElementById('toggle-prefix-overlay');
        if (chk) chk.checked = this.showPrefixOverlay;
      }
      if (typeof state.showSubscripts === 'boolean') {
        this.showSubscripts = state.showSubscripts;
        const chk = document.getElementById('toggle-subscripts');
        if (chk) chk.checked = this.showSubscripts;
      }
      if (state.submatrix) {
        this.submatrix = state.submatrix;
      }
      if (state.selectedCell) {
        this.selectedCell = state.selectedCell;
      }
      if (state.selectionMode) {
        this.selectionMode = state.selectionMode;
        document.querySelectorAll('[data-sel-mode]').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.selMode === this.selectionMode);
        });
      }
      if (state.activeColor) {
        this.activeColor = state.activeColor;
        document.querySelectorAll('.color-swatch[data-color]').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.color === this.activeColor);
        });
        const picker = document.getElementById('grid-custom-color');
        if (picker && /^#[0-9a-fA-F]{6}$/.test(this.activeColor)) {
          picker.value = this.activeColor;
        }
      }
      if (typeof state.autoPaint === 'boolean') {
        this.autoPaint = state.autoPaint;
        const chk = document.getElementById('toggle-auto-paint');
        if (chk) chk.checked = this.autoPaint;
      }

      this.updateDimBadge();
      this.updateQuickSelectUI();
      this.updateSubmatrixStats();
      return true;
    } catch (e) {
      console.warn('Failed to load grid state from localStorage', e);
      return false;
    }
  }
}

window.GridVisualizer = GridVisualizer;
