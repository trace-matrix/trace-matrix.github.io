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

    // Grid data
    this.grid = [];
    this.initGrid(this.rows, this.cols, 0);

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

    // Visualization modes
    this.showHeatmap = false;
    this.showPrefixOverlay = false;
    this.showSubscripts = false;

    this.initEventListeners();
    this.resizeCanvas();
    this.fitGrid();
    this.updateSidebarInputs(0, 0);
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
          type: 'empty'
        });
      }
      this.grid.push(row);
    }
    this.submatrix = null;
    this.updateDimBadge();
    this.updateSidebarInputs(0, 0);
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
      window.App?.showToast(`Grid resized to ${r} × ${c}`, 'info');
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
    });
    document.getElementById('toggle-heatmap')?.addEventListener('change', (e) => {
      this.showHeatmap = e.target.checked;
      this.render();
    });
    document.getElementById('toggle-subscripts')?.addEventListener('change', (e) => {
      this.showSubscripts = e.target.checked;
      this.render();
    });

    // Cell Weight Sidebar Controls
    document.getElementById('btn-set-cell-weight')?.addEventListener('click', () => this.setCellWeightFromSidebar());

    const commitOnEnter = (el) => {
      el?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.setCellWeightFromSidebar();
        }
      });
    };
    commitOnEnter(document.getElementById('cell-input-row'));
    commitOnEnter(document.getElementById('cell-input-col'));
    commitOnEnter(document.getElementById('cell-input-weight'));

    // Clear Grid
    document.getElementById('btn-clear-grid')?.addEventListener('click', () => {
      this.clearGrid();
    });

    // Fill All
    document.getElementById('btn-fill-grid-weight')?.addEventListener('click', () => {
      const weightVal = parseFloat(document.getElementById('cell-input-weight')?.value);
      const w = !isNaN(weightVal) ? weightVal : 0;
      this.fillAllWeights(w);
    });

    // Randomize
    document.getElementById('btn-random-weights')?.addEventListener('click', () => {
      this.randomizeWeights();
    });

    // Batch Paste Controls (x y val)
    const batchInput = document.getElementById('grid-batch-input');
    batchInput?.addEventListener('paste', (e) => {
      const clipboardText = e.clipboardData ? e.clipboardData.getData('text') : null;
      if (clipboardText) {
        setTimeout(() => {
          this.parseBatchInput(clipboardText);
        }, 30);
      }
    });

    document.getElementById('btn-apply-batch-grid')?.addEventListener('click', () => {
      this.parseBatchInput(batchInput?.value);
    });

    document.getElementById('btn-clear-batch-text')?.addEventListener('click', () => {
      if (batchInput) batchInput.value = '';
    });
  }

  zoomAtCenter(factor) {
    const rect = this.container.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const newZoom = Math.max(0.2, Math.min(3.5, this.zoom * factor));
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
    const newZoom = Math.max(0.2, Math.min(3.5, this.zoom * factor));

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
      this.submatrix = { r1: cell.row, c1: cell.col, r2: cell.row, c2: cell.col };
      this.updateSidebarInputs(cell.row, cell.col);
      this.updateSubmatrixStats();
      this.render();
    } else {
      this.isPanning = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.removeInlineEditor();
    }
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

    const cell = this.screenToGrid(sx, sy);
    this.hoverCell = cell;
    this.updateStatusPill();

    if (this.isSelectingSubmatrix && this.subStart && cell) {
      const r1 = Math.min(this.subStart.row, cell.row);
      const r2 = Math.max(this.subStart.row, cell.row);
      const c1 = Math.min(this.subStart.col, cell.col);
      const c2 = Math.max(this.subStart.col, cell.col);
      this.submatrix = { r1, c1, r2, c2 };
      this.updateSubmatrixStats();
      this.render();
    } else {
      this.render();
    }
  }

  handleMouseUp(e) {
    this.isPanning = false;
    this.isSelectingSubmatrix = false;
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

    const commit = () => {
      const valStr = input.value.trim();
      const num = Number(valStr);
      const finalVal = !isNaN(num) && valStr !== '' ? num : valStr;
      cell.val = finalVal;
      cell.type = 'empty';

      this.selectedCell = { row, col };
      this.updateSidebarInputs(row, col);
      this.updateSubmatrixStats();
      this.render();
      input.remove();
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

  setCellWeightFromSidebar() {
    const isOneIdx = window.App?.isOneIndexed;
    const rInput = document.getElementById('cell-input-row');
    const cInput = document.getElementById('cell-input-col');
    const wInput = document.getElementById('cell-input-weight');

    let r = parseInt(rInput?.value);
    let c = parseInt(cInput?.value);
    if (isNaN(r) || isNaN(c)) return;

    if (isOneIdx) {
      r -= 1;
      c -= 1;
    }

    if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) {
      window.App?.showToast(`Coordinates out of bounds! Rows: 0..${this.rows - 1}, Cols: 0..${this.cols - 1}`, 'error');
      return;
    }

    const valStr = wInput?.value.trim() ?? '0';
    const num = Number(valStr);
    const finalVal = !isNaN(num) && valStr !== '' ? num : valStr;

    this.grid[r][c].val = finalVal;
    this.grid[r][c].type = 'empty';
    this.selectedCell = { row: r, col: c };
    this.submatrix = { r1: r, c1: c, r2: r, c2: c };

    this.updateSubmatrixStats();
    this.render();
    window.App?.showToast(`Cell (${this.formatCoord(r, c)}) weight set to ${finalVal}`, 'success');
  }

  updateSidebarInputs(row, col) {
    if (row === undefined || col === undefined) {
      row = this.selectedCell?.row || 0;
      col = this.selectedCell?.col || 0;
    }
    const isOneIdx = window.App?.isOneIndexed;
    const rDisp = isOneIdx ? row + 1 : row;
    const cDisp = isOneIdx ? col + 1 : col;

    const rInput = document.getElementById('cell-input-row');
    const cInput = document.getElementById('cell-input-col');
    const wInput = document.getElementById('cell-input-weight');

    if (rInput) rInput.value = rDisp;
    if (cInput) cInput.value = cDisp;
    if (wInput && this.grid[row] && this.grid[row][col]) {
      wInput.value = this.grid[row][col].val;
    }
  }

  clearGrid() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        this.grid[r][c].val = 0;
        this.grid[r][c].type = 'empty';
      }
    }
    this.submatrix = null;
    this.updateSidebarInputs(0, 0);
    this.updateSubmatrixStats();
    this.render();
    window.App?.showToast('All grid cells reset to 0', 'info');
  }

  fillAllWeights(weight) {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        this.grid[r][c].val = weight;
        this.grid[r][c].type = 'empty';
      }
    }
    this.updateSidebarInputs();
    this.updateSubmatrixStats();
    this.render();
    window.App?.showToast(`Filled all cells with weight ${weight}`, 'info');
  }

  randomizeWeights() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        this.grid[r][c].val = Math.floor(Math.random() * 99) + 1;
        this.grid[r][c].type = 'empty';
      }
    }
    this.updateSidebarInputs();
    this.updateSubmatrixStats();
    this.render();
    window.App?.showToast('Grid populated with random weights (1–99)', 'info');
  }

  parseBatchInput(rawText) {
    if (!rawText || !rawText.trim()) return;

    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return;

    const parsedEntries = [];
    let startLine = 0;

    // Check if first line is just an entry count N
    const firstTokens = lines[0].split(/[\s,]+/).filter(t => t.length > 0);
    if (firstTokens.length === 1 && !isNaN(Number(firstTokens[0]))) {
      startLine = 1;
    }

    const isOneIdx = window.App?.isOneIndexed;
    let minR = Infinity, minC = Infinity;
    let maxR = -Infinity, maxC = -Infinity;

    for (let i = startLine; i < lines.length; i++) {
      const tokens = lines[i].split(/[\s,]+/).filter(t => t.length > 0);
      if (tokens.length >= 2) {
        const rawR = parseInt(tokens[0]);
        const rawC = parseInt(tokens[1]);
        if (isNaN(rawR) || isNaN(rawC)) continue;

        const valStr = tokens.length >= 3 ? tokens.slice(2).join(' ') : '1';
        const num = Number(valStr);
        const finalVal = !isNaN(num) && valStr.trim() !== '' ? num : valStr;

        parsedEntries.push({ r: rawR, c: rawC, val: finalVal });
        minR = Math.min(minR, rawR);
        minC = Math.min(minC, rawC);
        maxR = Math.max(maxR, rawR);
        maxC = Math.max(maxC, rawC);
      }
    }

    if (parsedEntries.length === 0) {
      window.App?.showToast('No valid "x y val" rows found in input', 'error');
      return;
    }

    // If 1-indexed mode is toggled on and min coordinate >= 1, shift by -1
    const shouldSubtract1 = isOneIdx && minR >= 1 && minC >= 1;
    let targetMaxR = -1;
    let targetMaxC = -1;

    for (const entry of parsedEntries) {
      if (shouldSubtract1) {
        entry.r -= 1;
        entry.c -= 1;
      }
      targetMaxR = Math.max(targetMaxR, entry.r);
      targetMaxC = Math.max(targetMaxC, entry.c);
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
        updatedCount++;
      }
    }

    this.updateSubmatrixStats();
    this.render();
    window.App?.showToast(`Added ${updatedCount} cell value${updatedCount !== 1 ? 's' : ''} to grid!`, 'success');
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
          row.push({ val: 0, type: 'empty' });
        }
      }
      this.grid.push(row);
    }

    this.updateDimBadge();
    this.fitGrid();
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

  updateSubmatrixStats() {
    if (!this.submatrix) return;
    const { r1, c1, r2, c2 } = this.submatrix;
    const isOneIdx = window.App?.isOneIndexed;
    const r1Disp = isOneIdx ? r1 + 1 : r1;
    const c1Disp = isOneIdx ? c1 + 1 : c1;
    const r2Disp = isOneIdx ? r2 + 1 : r2;
    const c2Disp = isOneIdx ? c2 + 1 : c2;

    const rangeText = document.getElementById('sub-range-text');
    const areaText = document.getElementById('sub-area-text');
    const sumText = document.getElementById('sub-sum-text');
    const minmaxText = document.getElementById('sub-minmax-text');
    const breakdownEl = document.getElementById('formula-breakdown');

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

    if (rangeText) rangeText.textContent = `[${r1Disp},${c1Disp}] .. [${r2Disp},${c2Disp}] (${height}×${width})`;
    if (areaText) areaText.textContent = `${totalCells} cell${totalCells > 1 ? 's' : ''}`;
    if (sumText) sumText.textContent = hasNumeric ? sum.toLocaleString() : 'N/A';
    if (minmaxText) {
      if (hasNumeric) {
        const avg = (sum / totalCells).toFixed(2);
        minmaxText.textContent = `${minVal} / ${maxVal} / ${avg}`;
      } else {
        minmaxText.textContent = '- / - / -';
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

        // Cell rect
        this.ctx.fillStyle = fillColor;
        this.ctx.fillRect(x, y, cs, cs);

        // Crisp border
        this.ctx.strokeStyle = '#273549';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x, y, cs, cs);

        // Cell Center Value
        const fontSize = Math.max(10, Math.min(20, cs * 0.36));
        this.ctx.font = `600 ${fontSize}px "JetBrains Mono", Menlo, monospace`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillStyle = textColor;

        const text = this.showPrefixOverlay ? P[r + 1][c + 1] : cell.val;
        this.ctx.fillText(text, x + cs / 2, y + cs / 2);

        // Coordinate subscripts
        if (this.showSubscripts && cs >= 42) {
          const rDisp = isOneIdx ? r + 1 : r;
          const cDisp = isOneIdx ? c + 1 : c;
          this.ctx.font = `500 ${Math.max(8, fontSize * 0.52)}px "JetBrains Mono", Menlo, monospace`;
          this.ctx.fillStyle = 'rgba(148, 163, 184, 0.65)';
          this.ctx.textAlign = 'right';
          this.ctx.textBaseline = 'bottom';
          this.ctx.fillText(`${rDisp},${cDisp}`, x + cs - 3, y + cs - 2);
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

      this.ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
      this.ctx.fillRect(sx, sy, sw, sh);

      this.ctx.strokeStyle = '#38bdf8';
      this.ctx.lineWidth = 2.5;
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
    const headerFont = `600 ${Math.max(10, Math.min(13, cs * 0.28))}px "JetBrains Mono", Menlo, monospace`;
    this.ctx.font = headerFont;

    // Column Headers (Top)
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'bottom';
    for (let c = 0; c < this.cols; c++) {
      const isHoveredCol = this.hoverCell && this.hoverCell.col === c;
      this.ctx.fillStyle = isHoveredCol ? '#38bdf8' : '#94a3b8';
      const label = isOneIdx ? c + 1 : c;
      const x = c * cs + cs / 2;
      this.ctx.fillText(label, x, -8);
    }

    // Row Headers (Left)
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'middle';
    for (let r = 0; r < this.rows; r++) {
      const isHoveredRow = this.hoverCell && this.hoverCell.row === r;
      this.ctx.fillStyle = isHoveredRow ? '#38bdf8' : '#94a3b8';
      const label = isOneIdx ? r + 1 : r;
      const y = r * cs + cs / 2;
      this.ctx.fillText(label, -10, y);
    }

    // Grid Outer Border
    this.ctx.strokeStyle = '#374151';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(0, 0, this.cols * cs, this.rows * cs);
  }
}

window.GridVisualizer = GridVisualizer;
