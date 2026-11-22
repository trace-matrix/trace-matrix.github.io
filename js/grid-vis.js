/**
 * TraceMatrix — Grid & Matrix Visualizer (GridVis)
 * Fast 2D array, DP table, BFS/DFS pathfinding, and 2D prefix sums visualizer.
 */

class GridVisualizer {
  constructor() {
    this.canvas = document.getElementById('grid-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.container = document.getElementById('grid-canvas-container');

    this.rows = 10;
    this.cols = 10;
    this.cellSize = 48; // base cell size in px

    // Viewport transform
    this.panX = 40;
    this.panY = 40;
    this.zoom = 1.0;

    // Grid data: 2D array of Cell objects
    // Cell: { val: string|number, type: 'empty'|'wall'|'start'|'end', dist: null, inPath: false, visited: false }
    this.grid = [];
    this.initGrid(this.rows, this.cols);

    // Interaction state
    this.activeTool = 'inspect'; // 'inspect', 'submatrix', 'wall', 'start', 'end', 'edit'
    this.isDragging = false;
    this.isPanning = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    this.hoverCell = null;

    // Submatrix selection: { r1, c1, r2, c2 }
    this.submatrix = null;
    this.isSelectingSubmatrix = false;
    this.subStart = null;

    // Visualization modes
    this.showHeatmap = false;
    this.showPrefixOverlay = false;
    this.is8Directional = false;

    // Pathfinding state
    this.pathfindingResult = null;

    this.initEventListeners();
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
          dist: null,
          inPath: false,
          visited: false
        });
      }
      this.grid.push(row);
    }
    // Default start and end
    if (this.rows > 1 && this.cols > 1) {
      this.grid[0][0].type = 'start';
      this.grid[0][0].val = 'S';
      this.grid[this.rows - 1][this.cols - 1].type = 'end';
      this.grid[this.rows - 1][this.cols - 1].val = 'E';
    }
    this.submatrix = null;
    this.pathfindingResult = null;
    this.updateDimBadge();
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
    const scaleX = (rect.width - 80) / totalW;
    const scaleY = (rect.height - 80) / totalH;
    this.zoom = Math.max(0.2, Math.min(2.5, Math.min(scaleX, scaleY)));
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

    // Tools Buttons
    document.querySelectorAll('[data-grid-tool]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('[data-grid-tool]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeTool = btn.dataset.gridTool;
      });
    });

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

    // Toggles
    document.getElementById('toggle-prefix-overlay')?.addEventListener('change', (e) => {
      this.showPrefixOverlay = e.target.checked;
      this.render();
    });
    document.getElementById('toggle-heatmap')?.addEventListener('change', (e) => {
      this.showHeatmap = e.target.checked;
      this.render();
    });
    document.getElementById('grid-8dir')?.addEventListener('change', (e) => {
      this.is8Directional = e.target.checked;
    });

    // Transformations
    document.getElementById('btn-rot-cw')?.addEventListener('click', () => this.rotate90CW());
    document.getElementById('btn-rot-ccw')?.addEventListener('click', () => this.rotate90CCW());
    document.getElementById('btn-transpose')?.addEventListener('click', () => this.transpose());
    document.getElementById('btn-flip-h')?.addEventListener('click', () => this.flipHorizontal());
    document.getElementById('btn-flip-v')?.addEventListener('click', () => this.flipVertical());
    document.getElementById('btn-clear-grid')?.addEventListener('click', () => {
      this.initGrid(this.rows, this.cols);
      this.render();
      window.App?.showToast('Grid cleared', 'info');
    });

    // Pathfinding buttons
    document.getElementById('btn-run-pathfinding')?.addEventListener('click', () => this.runPathfinding());
    document.getElementById('btn-clear-path')?.addEventListener('click', () => this.clearPath());

    // Presets
    document.querySelectorAll('[data-preset]').forEach(btn => {
      btn.addEventListener('click', () => this.loadPreset(btn.dataset.preset));
    });

    // Raw I/O
    document.getElementById('btn-parse-grid-input')?.addEventListener('click', () => this.parseRawInput());
    document.getElementById('btn-copy-grid-code')?.addEventListener('click', () => this.copyCppVector());
  }

  zoomAtCenter(factor) {
    const rect = this.container.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const newZoom = Math.max(0.2, Math.min(4.0, this.zoom * factor));
    this.panX = cx - (cx - this.panX) * (newZoom / this.zoom);
    this.panY = cy - (cy - this.panY) * (newZoom / this.zoom);
    this.zoom = newZoom;
    this.updateStatusPill();
    this.render();
  }

  handleWheel(e) {
    e.preventDefault();
    const rect = this.container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    const newZoom = Math.max(0.2, Math.min(4.0, this.zoom * factor));

    this.panX = mouseX - (mouseX - this.panX) * (newZoom / this.zoom);
    this.panY = mouseY - (mouseY - this.panY) * (newZoom / this.zoom);
    this.zoom = newZoom;

    this.updateStatusPill();
    this.render();
  }

  screenToGrid(sx, sy) {
    const x = (sx - this.panX) / (this.cellSize * this.zoom);
    const y = (sy - this.panY) / (this.cellSize * this.zoom);
    const col = Math.floor(x);
    const row = Math.floor(y);
    if (row >= 0 && row < this.rows && col >= 0 && col < this.cols) {
      return { row, col };
    }
    return null;
  }

  handleMouseDown(e) {
    if (e.button === 1 || e.code === 'Space' || e.shiftKey) { // Middle click or Space+click: Pan
      this.isPanning = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      return;
    }

    if (e.button !== 0) return; // Left click only

    const rect = this.container.getBoundingClientRect();
    const cell = this.screenToGrid(e.clientX - rect.left, e.clientY - rect.top);

    if (this.activeTool === 'submatrix') {
      if (cell) {
        this.isSelectingSubmatrix = true;
        this.subStart = cell;
        this.submatrix = { r1: cell.row, c1: cell.col, r2: cell.row, c2: cell.col };
        this.updateSubmatrixStats();
        this.render();
      }
    } else if (cell) {
      this.isDragging = true;
      this.applyToolToCell(cell.row, cell.col);
      this.render();
    } else {
      // Clicked outside grid: start panning
      this.isPanning = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
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
    } else if (this.isDragging && cell && (this.activeTool === 'wall')) {
      this.applyToolToCell(cell.row, cell.col);
      this.render();
    } else {
      this.render();
    }
  }

  handleMouseUp(e) {
    this.isPanning = false;
    this.isDragging = false;
    this.isSelectingSubmatrix = false;
  }

  applyToolToCell(r, c) {
    const cell = this.grid[r][c];
    if (this.activeTool === 'inspect') {
      // Just inspect
      this.submatrix = { r1: r, c1: c, r2: r, c2: c };
      this.updateSubmatrixStats();
    } else if (this.activeTool === 'wall') {
      if (cell.type === 'wall') {
        cell.type = 'empty';
        cell.val = 0;
      } else {
        cell.type = 'wall';
        cell.val = '#';
      }
    } else if (this.activeTool === 'start') {
      // Clear previous start
      for (let i = 0; i < this.rows; i++) {
        for (let j = 0; j < this.cols; j++) {
          if (this.grid[i][j].type === 'start') {
            this.grid[i][j].type = 'empty';
            this.grid[i][j].val = 0;
          }
        }
      }
      cell.type = 'start';
      cell.val = 'S';
    } else if (this.activeTool === 'end') {
      // Clear previous end
      for (let i = 0; i < this.rows; i++) {
        for (let j = 0; j < this.cols; j++) {
          if (this.grid[i][j].type === 'end') {
            this.grid[i][j].type = 'empty';
            this.grid[i][j].val = 0;
          }
        }
      }
      cell.type = 'end';
      cell.val = 'E';
    } else if (this.activeTool === 'edit') {
      const current = cell.val;
      const promptVal = prompt(`Edit cell (${this.formatCoord(r, c)}) value:`, current);
      if (promptVal !== null) {
        const num = Number(promptVal);
        cell.val = !isNaN(num) && promptVal.trim() !== '' ? num : promptVal;
        if (cell.type === 'wall' && cell.val !== '#') cell.type = 'empty';
        this.updateSubmatrixStats();
      }
    }
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
      if (statusVal) statusVal.textContent = `Val: ${cell.val}${cell.dist !== null ? ` | dist: ${cell.dist}` : ''}`;
    } else {
      if (statusCell) statusCell.textContent = `Cell: -`;
      if (statusVal) statusVal.textContent = `Val: -`;
    }
  }

  computePrefixSums() {
    // 2D Prefix Sum array: (rows + 1) x (cols + 1) using 1-based indexing
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

    // 2D Prefix Sum Formula Breakdown
    if (breakdownEl) {
      const P = this.computePrefixSums();
      const R2 = r2 + 1;
      const C2 = c2 + 1;
      const R1 = r1 + 1;
      const C1 = c1 + 1;

      const pA = P[R2][C2];
      const pB = P[R1 - 1][C2];
      const pC = P[R2][C1 - 1];
      const pD = P[R1 - 1][C1 - 1];
      const calculatedSum = pA - pB - pC + pD;

      breakdownEl.innerHTML = `
        <div style="color:var(--text-muted); font-size:11px;">Prefix coordinates:</div>
        <div>P[${R2}][${C2}] = <strong>${pA}</strong> (Full rectangle from origin)</div>
        <div>- P[${R1 - 1}][${C2}] = <strong>-${pB}</strong> (Subtract top rectangle)</div>
        <div>- P[${R2}][${C1 - 1}] = <strong>-${pC}</strong> (Subtract left rectangle)</div>
        <div>+ P[${R1 - 1}][${C1 - 1}] = <strong>+${pD}</strong> (Add back double-subtracted top-left)</div>
        <div style="margin-top:4px; font-weight:700; color:var(--accent); border-top:1px dashed var(--border); padding-top:4px;">
          Result = ${pA} - ${pB} - ${pC} + ${pD} = <strong>${calculatedSum}</strong>
        </div>
      `;
    }
  }

  // Pathfinding (BFS / DFS / Multi-source BFS)
  runPathfinding() {
    const algo = document.getElementById('grid-algo-select')?.value || 'bfs';
    let start = null;
    let end = null;
    const starts = [];

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        this.grid[r][c].dist = null;
        this.grid[r][c].inPath = false;
        this.grid[r][c].visited = false;
        if (this.grid[r][c].type === 'start') {
          start = { r, c };
          starts.push({ r, c });
        }
        if (this.grid[r][c].type === 'end') end = { r, c };
      }
    }

    if (algo === 'multibfs') {
      if (starts.length === 0) {
        window.App?.showToast('Add at least one Start (S) cell for multi-source BFS', 'error');
        return;
      }
      this.runMultiSourceBFS(starts);
      return;
    }

    if (!start || !end) {
      window.App?.showToast('Please set both Start (S) and Target (E) cells!', 'error');
      return;
    }

    if (algo === 'bfs') {
      this.runBFS(start, end);
    } else if (algo === 'dfs') {
      this.runDFS(start, end);
    }
  }

  runBFS(start, end) {
    const queue = [[start.r, start.c]];
    const parent = Array.from({ length: this.rows }, () => Array(this.cols).fill(null));
    this.grid[start.r][start.c].dist = 0;
    this.grid[start.r][start.c].visited = true;

    const dr = this.is8Directional ? [-1, -1, -1, 0, 0, 1, 1, 1] : [-1, 0, 1, 0];
    const dc = this.is8Directional ? [-1, 0, 1, -1, 1, -1, 0, 1] : [0, 1, 0, -1];

    let found = false;
    let visitedCount = 0;

    while (queue.length > 0) {
      const [r, c] = queue.shift();
      visitedCount++;

      if (r === end.r && c === end.c) {
        found = true;
        break;
      }

      for (let i = 0; i < dr.length; i++) {
        const nr = r + dr[i];
        const nc = c + dc[i];
        if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
          if (!this.grid[nr][nc].visited && this.grid[nr][nc].type !== 'wall') {
            this.grid[nr][nc].visited = true;
            this.grid[nr][nc].dist = this.grid[r][c].dist + 1;
            parent[nr][nc] = [r, c];
            queue.push([nr, nc]);
          }
        }
      }
    }

    // Trace shortest path back
    let pathLen = 0;
    if (found) {
      let curr = [end.r, end.c];
      while (curr) {
        this.grid[curr[0]][curr[1]].inPath = true;
        pathLen++;
        curr = parent[curr[0]][curr[1]];
      }
      pathLen -= 1; // edges count
    }

    this.showPathStats(found, pathLen, visitedCount);
    this.render();
  }

  runDFS(start, end) {
    const stack = [[start.r, start.c]];
    const parent = Array.from({ length: this.rows }, () => Array(this.cols).fill(null));
    this.grid[start.r][start.c].visited = true;
    this.grid[start.r][start.c].dist = 0;

    const dr = this.is8Directional ? [-1, -1, -1, 0, 0, 1, 1, 1] : [-1, 0, 1, 0];
    const dc = this.is8Directional ? [-1, 0, 1, -1, 1, -1, 0, 1] : [0, 1, 0, -1];

    let found = false;
    let visitedCount = 0;

    while (stack.length > 0) {
      const [r, c] = stack.pop();
      visitedCount++;

      if (r === end.r && c === end.c) {
        found = true;
        break;
      }

      for (let i = 0; i < dr.length; i++) {
        const nr = r + dr[i];
        const nc = c + dc[i];
        if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
          if (!this.grid[nr][nc].visited && this.grid[nr][nc].type !== 'wall') {
            this.grid[nr][nc].visited = true;
            this.grid[nr][nc].dist = this.grid[r][c].dist + 1;
            parent[nr][nc] = [r, c];
            stack.push([nr, nc]);
          }
        }
      }
    }

    let pathLen = 0;
    if (found) {
      let curr = [end.r, end.c];
      while (curr) {
        this.grid[curr[0]][curr[1]].inPath = true;
        pathLen++;
        curr = parent[curr[0]][curr[1]];
      }
      pathLen -= 1;
    }

    this.showPathStats(found, pathLen, visitedCount);
    this.render();
  }

  runMultiSourceBFS(starts) {
    const queue = [];
    for (const s of starts) {
      this.grid[s.r][s.c].dist = 0;
      this.grid[s.r][s.c].visited = true;
      queue.push([s.r, s.c]);
    }

    const dr = this.is8Directional ? [-1, -1, -1, 0, 0, 1, 1, 1] : [-1, 0, 1, 0];
    const dc = this.is8Directional ? [-1, 0, 1, -1, 1, -1, 0, 1] : [0, 1, 0, -1];
    let visited = 0;

    while (queue.length > 0) {
      const [r, c] = queue.shift();
      visited++;
      for (let i = 0; i < dr.length; i++) {
        const nr = r + dr[i];
        const nc = c + dc[i];
        if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
          if (!this.grid[nr][nc].visited && this.grid[nr][nc].type !== 'wall') {
            this.grid[nr][nc].visited = true;
            this.grid[nr][nc].dist = this.grid[r][c].dist + 1;
            queue.push([nr, nc]);
          }
        }
      }
    }

    this.showPathStats(true, 'Multi-field', visited);
    this.render();
  }

  showPathStats(found, len, visited) {
    const statsBox = document.getElementById('pathfinding-stats');
    if (!statsBox) return;
    statsBox.classList.remove('hidden');
    const statusEl = document.getElementById('stat-path-status');
    const lenEl = document.getElementById('stat-path-len');
    const visitedEl = document.getElementById('stat-visited-count');

    if (statusEl) {
      statusEl.textContent = found ? 'Path Found!' : 'No Path';
      statusEl.style.color = found ? 'var(--color-success)' : 'var(--color-danger)';
    }
    if (lenEl) lenEl.textContent = `${len} steps`;
    if (visitedEl) visitedEl.textContent = `${visited} cells visited`;
  }

  clearPath() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        this.grid[r][c].dist = null;
        this.grid[r][c].inPath = false;
        this.grid[r][c].visited = false;
      }
    }
    const statsBox = document.getElementById('pathfinding-stats');
    if (statsBox) statsBox.classList.add('hidden');
    this.render();
  }

  // Matrix Transformations
  rotate90CW() {
    const newR = this.cols;
    const newC = this.rows;
    const newGrid = [];
    for (let r = 0; r < newR; r++) {
      const row = [];
      for (let c = 0; c < newC; c++) {
        row.push(this.grid[this.rows - 1 - c][r]);
      }
      newGrid.push(row);
    }
    this.rows = newR;
    this.cols = newC;
    this.grid = newGrid;
    this.submatrix = null;
    this.updateDimBadge();
    this.render();
    window.App?.showToast('Rotated 90° Clockwise', 'info');
  }

  rotate90CCW() {
    const newR = this.cols;
    const newC = this.rows;
    const newGrid = [];
    for (let r = 0; r < newR; r++) {
      const row = [];
      for (let c = 0; c < newC; c++) {
        row.push(this.grid[c][this.cols - 1 - r]);
      }
      newGrid.push(row);
    }
    this.rows = newR;
    this.cols = newC;
    this.grid = newGrid;
    this.submatrix = null;
    this.updateDimBadge();
    this.render();
    window.App?.showToast('Rotated 90° Counter-Clockwise', 'info');
  }

  transpose() {
    const newR = this.cols;
    const newC = this.rows;
    const newGrid = [];
    for (let r = 0; r < newR; r++) {
      const row = [];
      for (let c = 0; c < newC; c++) {
        row.push(this.grid[c][r]);
      }
      newGrid.push(row);
    }
    this.rows = newR;
    this.cols = newC;
    this.grid = newGrid;
    this.submatrix = null;
    this.updateDimBadge();
    this.render();
    window.App?.showToast('Transposed Matrix (Rows ⇄ Cols)', 'info');
  }

  flipHorizontal() {
    for (let r = 0; r < this.rows; r++) {
      this.grid[r].reverse();
    }
    this.submatrix = null;
    this.render();
    window.App?.showToast('Flipped Horizontally', 'info');
  }

  flipVertical() {
    this.grid.reverse();
    this.submatrix = null;
    this.render();
    window.App?.showToast('Flipped Vertically', 'info');
  }

  // Presets
  loadPreset(type) {
    if (type === 'maze') {
      this.initGrid(12, 16, '.');
      // Draw interesting maze walls
      for (let r = 2; r < 10; r++) this.grid[r][3] = { val: '#', type: 'wall', dist: null, inPath: false, visited: false };
      for (let c = 3; c < 12; c++) this.grid[9][c] = { val: '#', type: 'wall', dist: null, inPath: false, visited: false };
      for (let r = 3; r < 9; r++) this.grid[r][7] = { val: '#', type: 'wall', dist: null, inPath: false, visited: false };
      for (let c = 7; c < 15; c++) this.grid[3][c] = { val: '#', type: 'wall', dist: null, inPath: false, visited: false };
      for (let r = 4; r < 11; r++) this.grid[r][11] = { val: '#', type: 'wall', dist: null, inPath: false, visited: false };
      this.grid[0][0] = { val: 'S', type: 'start', dist: null, inPath: false, visited: false };
      this.grid[11][15] = { val: 'E', type: 'end', dist: null, inPath: false, visited: false };
      window.App?.showToast('Maze preset loaded', 'info');
    } else if (type === 'dp') {
      // DP Table for LCS of "ALGORITHM" and "LOGIC"
      const s1 = "ALGORITHM";
      const s2 = "LOGIC";
      const R = s1.length + 1;
      const C = s2.length + 1;
      this.initGrid(R, C, 0);
      const dp = Array.from({ length: R }, () => Array(C).fill(0));
      for (let i = 1; i < R; i++) {
        for (let j = 1; j < C; j++) {
          if (s1[i - 1] === s2[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
          else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
      for (let i = 0; i < R; i++) {
        for (let j = 0; j < C; j++) {
          this.grid[i][j].val = dp[i][j];
          this.grid[i][j].type = 'empty';
        }
      }
      this.showHeatmap = true;
      const heatCheck = document.getElementById('toggle-heatmap');
      if (heatCheck) heatCheck.checked = true;
      window.App?.showToast('DP (LCS) matrix loaded with heatmap', 'info');
    } else if (type === 'spiral') {
      const N = 8;
      this.initGrid(N, N, 0);
      let val = 1;
      let top = 0, bottom = N - 1, left = 0, right = N - 1;
      while (top <= bottom && left <= right) {
        for (let c = left; c <= right; c++) this.grid[top][c].val = val++;
        top++;
        for (let r = top; r <= bottom; r++) this.grid[r][right].val = val++;
        right--;
        if (top <= bottom) {
          for (let c = right; c >= left; c--) this.grid[bottom][c].val = val++;
          bottom--;
        }
        if (left <= right) {
          for (let r = bottom; r >= top; r--) this.grid[r][left].val = val++;
          left++;
        }
      }
      window.App?.showToast('8×8 Spiral matrix loaded', 'info');
    } else if (type === 'random') {
      this.initGrid(10, 10, 0);
      for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 10; c++) {
          this.grid[r][c].val = Math.floor(Math.random() * 99) + 1;
        }
      }
      window.App?.showToast('Random matrix loaded', 'info');
    }
    this.fitGrid();
  }

  // Parse Raw CP Input
  parseRawInput() {
    const raw = document.getElementById('grid-raw-input')?.value.trim();
    if (!raw) {
      window.App?.showToast('Input area is empty!', 'error');
      return;
    }

    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return;

    let startLine = 0;
    let targetR = lines.length;
    let targetC = null;

    // Check if line 1 has "R C"
    const firstTokens = lines[0].split(/\s+/);
    if (firstTokens.length === 2 && !isNaN(firstTokens[0]) && !isNaN(firstTokens[1])) {
      targetR = parseInt(firstTokens[0]);
      targetC = parseInt(firstTokens[1]);
      startLine = 1;
    }

    const matrixData = [];
    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      let tokens;
      if (line.includes(' ') || line.includes('\t') || line.includes(',')) {
        tokens = line.split(/[\s,]+/).filter(t => t.length > 0);
      } else {
        tokens = line.split('');
      }
      matrixData.push(tokens);
    }

    if (matrixData.length === 0) return;
    const finalR = targetR && startLine > 0 ? targetR : matrixData.length;
    const finalC = targetC && startLine > 0 ? targetC : matrixData[0].length;

    this.initGrid(finalR, finalC);

    for (let r = 0; r < Math.min(finalR, matrixData.length); r++) {
      for (let c = 0; c < Math.min(finalC, matrixData[r].length); c++) {
        const item = matrixData[r][c];
        const num = Number(item);
        if (!isNaN(num) && item !== '') {
          this.grid[r][c].val = num;
          this.grid[r][c].type = 'empty';
        } else if (item === '#' || item === '1' && matrixData[r].every(x => x === '0' || x === '1')) {
          this.grid[r][c].val = '#';
          this.grid[r][c].type = 'wall';
        } else if (item === 'S' || item === 's') {
          this.grid[r][c].val = 'S';
          this.grid[r][c].type = 'start';
        } else if (item === 'E' || item === 'e') {
          this.grid[r][c].val = 'E';
          this.grid[r][c].type = 'end';
        } else {
          this.grid[r][c].val = item;
          this.grid[r][c].type = 'empty';
        }
      }
    }

    this.fitGrid();
    window.App?.showToast(`Loaded ${finalR} × ${finalC} matrix from CP input`, 'success');
  }

  copyCppVector() {
    let out = `vector<vector<int>> grid = {\n`;
    for (let r = 0; r < this.rows; r++) {
      out += `    {`;
      out += this.grid[r].map(c => typeof c.val === 'number' ? c.val : `"${c.val}"`).join(', ');
      out += `}${r < this.rows - 1 ? ',' : ''}\n`;
    }
    out += `};`;
    navigator.clipboard.writeText(out).then(() => {
      window.App?.showToast('Copied C++ 2D vector to clipboard!', 'success');
    });
  }

  // Canvas Rendering
  render() {
    if (!this.ctx || !this.container) return;
    const rect = this.container.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    this.ctx.clearRect(0, 0, width, height);

    // Background Grid Dots/Gridlines
    this.renderBackgroundGrid(width, height);

    // Compute min/max for heatmap if active
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

    // 1. Render Cells
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = c * cs;
        const y = r * cs;
        const cell = this.grid[r][c];

        // Background Color
        let fillColor = 'var(--bg-surface)';
        if (cell.type === 'wall') {
          fillColor = '#1f2937'; // dark wall
        } else if (cell.type === 'start') {
          fillColor = '#059669'; // Emerald start
        } else if (cell.type === 'end') {
          fillColor = '#dc2626'; // Red target
        } else if (cell.inPath) {
          fillColor = '#fbbf24'; // Golden shortest path
        } else if (cell.visited) {
          fillColor = 'rgba(56, 189, 248, 0.25)'; // visited cyan
        } else if (this.showHeatmap && typeof cell.val === 'number' && maxVal > minVal) {
          const ratio = (cell.val - minVal) / (maxVal - minVal);
          fillColor = `rgba(59, 130, 246, ${0.15 + ratio * 0.75})`;
        }

        // Draw Cell Background
        this.ctx.fillStyle = fillColor;
        this.ctx.fillRect(x, y, cs, cs);

        // Draw Cell Border
        this.ctx.strokeStyle = 'rgba(100, 116, 139, 0.25)';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x, y, cs, cs);

        // Cell Text Value
        const fontSize = Math.max(9, Math.min(18, cs * 0.36));
        this.ctx.font = `600 ${fontSize}px var(--font-mono)`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        if (cell.type === 'wall') {
          this.ctx.fillStyle = '#9ca3af';
          this.ctx.fillText('#', x + cs / 2, y + cs / 2);
        } else if (cell.type === 'start') {
          this.ctx.fillStyle = '#ffffff';
          this.ctx.fillText('S', x + cs / 2, y + cs / 2);
        } else if (cell.type === 'end') {
          this.ctx.fillStyle = '#ffffff';
          this.ctx.fillText('E', x + cs / 2, y + cs / 2);
        } else if (cell.inPath) {
          this.ctx.fillStyle = '#000000';
          this.ctx.fillText(cell.dist !== null ? cell.dist : cell.val, x + cs / 2, y + cs / 2);
        } else {
          this.ctx.fillStyle = 'var(--text-main)';
          const text = this.showPrefixOverlay ? P[r + 1][c + 1] : cell.val;
          this.ctx.fillText(text, x + cs / 2, y + cs / 2);
        }

        // Cell coordinate subscript (if zoom is large enough)
        if (cs >= 40) {
          const rDisp = isOneIdx ? r + 1 : r;
          const cDisp = isOneIdx ? c + 1 : c;
          this.ctx.font = `400 ${Math.max(8, fontSize * 0.55)}px var(--font-mono)`;
          this.ctx.fillStyle = cell.type === 'wall' || cell.type === 'start' || cell.type === 'end' ? 'rgba(255,255,255,0.7)' : 'rgba(148, 163, 184, 0.7)';
          this.ctx.textAlign = 'right';
          this.ctx.textBaseline = 'bottom';
          this.ctx.fillText(`${rDisp},${cDisp}`, x + cs - 3, y + cs - 2);
        }
      }
    }

    // 2. Render Submatrix Highlight
    if (this.submatrix) {
      const { r1, c1, r2, c2 } = this.submatrix;
      const sx = c1 * cs;
      const sy = r1 * cs;
      const sw = (c2 - c1 + 1) * cs;
      const sh = (r2 - r1 + 1) * cs;

      // Glow fill
      this.ctx.fillStyle = 'rgba(37, 99, 235, 0.2)';
      this.ctx.fillRect(sx, sy, sw, sh);

      // Border with dash
      this.ctx.strokeStyle = 'var(--accent)';
      this.ctx.lineWidth = 2.5;
      this.ctx.strokeRect(sx, sy, sw, sh);
    }

    // 3. Render Hovered Cell border
    if (this.hoverCell) {
      const hx = this.hoverCell.col * cs;
      const hy = this.hoverCell.row * cs;
      this.ctx.strokeStyle = 'var(--accent)';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(hx, hy, cs, cs);
    }

    // 4. Render Row & Col Headers
    this.renderHeaders(cs, isOneIdx);

    this.ctx.restore();
  }

  renderHeaders(cs, isOneIdx) {
    const headerFont = `600 ${Math.max(9, Math.min(13, cs * 0.3))}px var(--font-mono)`;
    this.ctx.font = headerFont;
    this.ctx.fillStyle = 'var(--text-muted)';

    // Column Headers (Top)
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'bottom';
    for (let c = 0; c < this.cols; c++) {
      const label = isOneIdx ? c + 1 : c;
      const x = c * cs + cs / 2;
      this.ctx.fillText(label, x, -6);
    }

    // Row Headers (Left)
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'middle';
    for (let r = 0; r < this.rows; r++) {
      const label = isOneIdx ? r + 1 : r;
      const y = r * cs + cs / 2;
      this.ctx.fillText(label, -8, y);
    }
  }

  renderBackgroundGrid(width, height) {
    const gridSize = 24 * this.zoom;
    if (gridSize < 8) return;

    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(100, 116, 139, 0.08)';
    this.ctx.lineWidth = 1;

    const startX = this.panX % gridSize;
    const startY = this.panY % gridSize;

    this.ctx.beginPath();
    for (let x = startX; x < width; x += gridSize) {
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, height);
    }
    for (let y = startY; y < height; y += gridSize) {
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(width, y);
    }
    this.ctx.stroke();
    this.ctx.restore();
  }
}

window.GridVisualizer = GridVisualizer;
