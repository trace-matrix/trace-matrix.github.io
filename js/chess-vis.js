/**
 * TraceMatrix — Chess & Board Visualizer (ChessVisualizer)
 * Multi-board infinite canvas for N x M Chessboards with Obstacles (#),
 * Multi-Piece Shortest-Path BFS, Live Attack & Safe-Square Coverage,
 * obstacle-aware N-Queens, Max Non-Attacking Rooks (bipartite matching),
 * Knight's Tour, Distance Overlays, Symmetry Transforms, and Undo/Redo.
 */

const MOVABLE_PIECES = new Set(['N', 'Q', 'R', 'B', 'K', 'P']);
const KNIGHT_DIRS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING_DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const PAWN_ATTACK_DIRS = [[-1, -1], [-1, 1]];
const PAWN_MOVE_DIRS = [[-1, 0]];

class ChessVisualizer {
  constructor() {
    this.canvas = document.getElementById('chess-canvas');
    this.ctx = this.canvas?.getContext('2d') || null;
    this.container = document.getElementById('chess-canvas-container');

    this.squareSize = 56;

    // Viewport transform
    this.panX = 40;
    this.panY = 60;
    this.zoom = 1.0;

    // Multi-board collection on the same canvas
    this.nextBoardNum = 1;
    this.boards = [];
    this.activeBoardIndex = 0;

    // Undo / Redo stacks
    this.undoStack = [];
    this.redoStack = [];
    this.maxHistory = 40;

    // Active tool / piece / overlay
    this.activePiece = 'N';
    this.activeOverlay = 'none'; // 'none' | 'attack' | 'manhattan' | 'chebyshev' | 'bipartite'
    this.inputMode = 'auto'; // 'auto' | 'board'
    this._batchTimer = null;

    // Interaction state
    this.hoverInfo = null; // { boardIdx, r, c } or null
    this.isPanning = false;
    this.isDraggingBoard = false;
    this.dragBoardIndex = -1;
    this.dragStartBoardX = 0;
    this.dragStartBoardY = 0;
    this.isPainting = false;
    this.paintErase = false;
    this.lastPaintedKey = null;
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    this.needsInitialFit = false;

    // N-Queens auto-play timer (operates on active board)
    this.nqueensTimer = null;

    const loaded = this.loadState();
    if (!loaded) {
      this.boards = [this.createBoardEntry(8, 8, 0, 0, 'Board 1')];
      this.activeBoardIndex = 0;
      this.syncBoardSelector();
    }

    this.initEventListeners();
    this.resizeCanvas();
    this.fitBoard();
  }

  // ==========================================
  // ACTIVE BOARD ACCESSORS (SINGLE & MULTI)
  // ==========================================

  get activeBoard() {
    if (!this.boards.length) {
      this.boards = [this.createBoardEntry(8, 8, 0, 0, 'Board 1')];
      this.activeBoardIndex = 0;
    }
    if (this.activeBoardIndex < 0 || this.activeBoardIndex >= this.boards.length) {
      this.activeBoardIndex = 0;
    }
    return this.boards[this.activeBoardIndex];
  }

  get rows() { return this.activeBoard.rows; }
  set rows(v) { this.activeBoard.rows = v; }
  get cols() { return this.activeBoard.cols; }
  set cols(v) { this.activeBoard.cols = v; }
  get board() { return this.activeBoard.board; }
  set board(v) { this.activeBoard.board = v; }
  get selectedSquare() { return this.activeBoard.selectedSquare; }
  set selectedSquare(v) { this.activeBoard.selectedSquare = v; }
  get bfsPieceType() { return this.activeBoard.bfsPieceType; }
  set bfsPieceType(v) { this.activeBoard.bfsPieceType = v; }
  get knightStart() { return this.activeBoard.knightStart; }
  set knightStart(v) { this.activeBoard.knightStart = v; }
  get bfsStarts() { return this.activeBoard.bfsStarts; }
  set bfsStarts(v) { this.activeBoard.bfsStarts = v; }
  get knightDistances() { return this.activeBoard.knightDistances; }
  set knightDistances(v) { this.activeBoard.knightDistances = v; }
  get knightParents() { return this.activeBoard.knightParents; }
  set knightParents(v) { this.activeBoard.knightParents = v; }
  get knightTarget() { return this.activeBoard.knightTarget; }
  set knightTarget(v) { this.activeBoard.knightTarget = v; }
  get knightPath() { return this.activeBoard.knightPath; }
  set knightPath(v) { this.activeBoard.knightPath = v; }
  get bfsReachableCount() { return this.activeBoard.bfsReachableCount; }
  set bfsReachableCount(v) { this.activeBoard.bfsReachableCount = v; }
  get bfsTraversableCount() { return this.activeBoard.bfsTraversableCount; }
  set bfsTraversableCount(v) { this.activeBoard.bfsTraversableCount = v; }
  get nqueensSolutions() { return this.activeBoard.nqueensSolutions; }
  set nqueensSolutions(v) { this.activeBoard.nqueensSolutions = v; }
  get nqueensIndex() { return this.activeBoard.nqueensIndex; }
  set nqueensIndex(v) { this.activeBoard.nqueensIndex = v; }
  get knightsTourMoves() { return this.activeBoard.knightsTourMoves; }
  set knightsTourMoves(v) { this.activeBoard.knightsTourMoves = v; }
  get attackStats() { return this.activeBoard.attackStats; }
  set attackStats(v) { this.activeBoard.attackStats = v; }

  get hoverSquare() {
    if (this.hoverInfo && this.hoverInfo.boardIdx === this.activeBoardIndex) {
      return { r: this.hoverInfo.r, c: this.hoverInfo.c };
    }
    return null;
  }

  set hoverSquare(sq) {
    this.hoverInfo = sq ? { boardIdx: this.activeBoardIndex, r: sq.r, c: sq.c } : null;
  }

  createBoardEntry(rows = 8, cols = 8, offsetX = 0, offsetY = 0, name = null, kind = 'chess') {
    const num = this.nextBoardNum++;
    const r = Math.max(1, Math.min(30, rows));
    const c = Math.max(1, Math.min(30, cols));
    const resolvedKind = kind === 'grid' ? 'grid' : 'chess';
    return {
      id: num,
      kind: resolvedKind,
      name: name || (resolvedKind === 'grid' ? `Grid ${num}` : `Board ${num}`),
      rows: r,
      cols: c,
      offsetX,
      offsetY,
      board: Array.from({ length: r }, () =>
        Array.from({ length: c }, () => ({ piece: null, color: 'w', val: 0 }))
      ),
      selectedSquare: null,
      bfsPieceType: null,
      knightStart: null,
      bfsStarts: [],
      knightDistances: null,
      knightParents: null,
      knightTarget: null,
      knightPath: null,
      bfsReachableCount: null,
      bfsTraversableCount: null,
      nqueensSolutions: [],
      nqueensIndex: 0,
      knightsTourMoves: null,
      attackStats: null,
      inputText: ''
    };
  }

  // ==========================================
  // UNDO / REDO & MULTI-BOARD MANAGEMENT
  // ==========================================

  cloneCells(cells) {
    return cells.map(row => row.map(cell => ({
      piece: cell.piece,
      color: cell.color || 'w',
      val: cell.val !== undefined ? cell.val : 0
    })));
  }

  cloneBoard(board = this.board) {
    return this.cloneCells(board);
  }

  snapshotAllBoards() {
    return {
      nextBoardNum: this.nextBoardNum,
      activeBoardIndex: this.activeBoardIndex,
      boards: this.boards.map(b => ({
        id: b.id,
        kind: b.kind || 'chess',
        name: b.name,
        rows: b.rows,
        cols: b.cols,
        offsetX: b.offsetX,
        offsetY: b.offsetY,
        inputText: b.inputText || '',
        board: this.cloneCells(b.board)
      }))
    };
  }

  pushUndo() {
    this.undoStack.push(this.snapshotAllBoards());
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  undo() {
    if (this.undoStack.length === 0) {
      window.App?.showToast('Nothing to undo', 'info');
      return;
    }
    this.redoStack.push(this.snapshotAllBoards());
    const prev = this.undoStack.pop();
    this.restoreSnapshot(prev);
    window.App?.showToast('Undid board change', 'info');
  }

  redo() {
    if (this.redoStack.length === 0) {
      window.App?.showToast('Nothing to redo', 'info');
      return;
    }
    this.undoStack.push(this.snapshotAllBoards());
    const next = this.redoStack.pop();
    this.restoreSnapshot(next);
    window.App?.showToast('Redid board change', 'info');
  }

  restoreSnapshot(snap) {
    this.nextBoardNum = snap.nextBoardNum || this.nextBoardNum;
    this.boards = snap.boards.map(sb => ({
      ...this.createBoardEntry(sb.rows, sb.cols, sb.offsetX || 0, sb.offsetY || 0, sb.name, sb.kind || 'chess'),
      id: sb.id,
      kind: sb.kind || 'chess',
      name: sb.name,
      inputText: sb.inputText || '',
      board: this.cloneCells(sb.board)
    }));
    // Restore nextBoardNum cleanly after createBoardEntry increments
    this.nextBoardNum = Math.max(
      snap.nextBoardNum || 1,
      ...this.boards.map(b => (b.id || 0) + 1)
    );
    this.activeBoardIndex = Math.max(0, Math.min(this.boards.length - 1, snap.activeBoardIndex || 0));
    this.stopNQueensTimer();
    this.syncBoardSelector();
    this.syncInputFromBoard();
    this.render();
    this.saveState();
  }

  addBoard(cloneActive = false, kind = 'chess') {
    this.pushUndo();
    const ref = this.activeBoard;
    const rows = cloneActive ? ref.rows : (parseInt(document.getElementById('chess-rows')?.value) || 8);
    const cols = cloneActive ? ref.cols : (parseInt(document.getElementById('chess-cols')?.value) || 8);
    const targetKind = cloneActive ? (ref.kind || 'chess') : (kind === 'grid' ? 'grid' : 'chess');

    // Place cleanly to the right of rightmost existing board
    let maxRight = 0;
    for (const b of this.boards) {
      maxRight = Math.max(maxRight, b.offsetX + b.cols * this.squareSize);
    }
    const offsetX = maxRight + 96;
    const offsetY = ref.offsetY || 0;

    const entry = this.createBoardEntry(rows, cols, offsetX, offsetY, null, targetKind);
    if (cloneActive) {
      entry.board = this.cloneCells(ref.board);
      entry.name = `${ref.name} Copy`;
      entry.inputText = ref.inputText || '';
    }

    this.boards.push(entry);
    this.setActiveBoard(this.boards.length - 1, false);
    this.syncInputFromBoard();
    this.fitBoard();
    this.saveState();
    window.App?.showToast(
      cloneActive ? `Cloned ${ref.name} onto canvas` : `Added ${entry.name} (${entry.rows}×${entry.cols}) on canvas`,
      'success'
    );
  }

  removeActiveBoard() {
    if (this.boards.length <= 1) {
      window.App?.showToast('At least one chessboard must remain (use Clear to reset squares)', 'info');
      return;
    }
    this.pushUndo();
    const removedName = this.activeBoard.name;
    this.stopNQueensTimer();
    this.boards.splice(this.activeBoardIndex, 1);
    this.activeBoardIndex = Math.max(0, Math.min(this.boards.length - 1, this.activeBoardIndex));
    this.hoverInfo = null;
    this.syncBoardSelector();
    this.fitBoard();
    this.saveState();
    window.App?.showToast(`Removed ${removedName}`, 'info');
  }

  setActiveBoard(idx, shouldRender = true) {
    if (idx < 0 || idx >= this.boards.length) return;
    if (this.activeBoardIndex !== idx) {
      this.stopNQueensTimer();
    }
    this.activeBoardIndex = idx;
    this.syncBoardSelector();
    this.syncInputFromBoard();
    if (shouldRender) {
      this.render();
      this.saveState();
    }
  }

  syncBoardSelector() {
    this.syncDimensionInputs();
    const tabsBar = document.getElementById('chess-boards-tabs');
    if (tabsBar) {
      tabsBar.innerHTML = '';
      this.boards.forEach((b, i) => {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = `board-tab-pill${i === this.activeBoardIndex ? ' active' : ''}`;
        pill.dataset.boardIdx = String(i);
        pill.textContent = b.name;
        pill.title = `${b.name} (${b.rows} × ${b.cols})`;
        tabsBar.appendChild(pill);
      });

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'board-add-pill';
      addBtn.id = 'btn-chess-add-board';
      addBtn.title = 'Add Another Chessboard on Canvas';
      addBtn.textContent = '+ Chess';
      tabsBar.appendChild(addBtn);

      const addGridBtn = document.createElement('button');
      addGridBtn.type = 'button';
      addGridBtn.className = 'board-add-pill';
      addGridBtn.id = 'btn-chess-add-grid';
      addGridBtn.title = 'Add a Grid on Canvas';
      addGridBtn.textContent = '+ Grid';
      tabsBar.appendChild(addGridBtn);
    }

    const delBtn = document.getElementById('btn-chess-del-board');
    if (delBtn) {
      delBtn.disabled = this.boards.length <= 1;
    }

    const browser = document.getElementById('nqueens-browser');
    const counter = document.getElementById('nqueens-solution-counter');
    if (browser) {
      if (this.nqueensSolutions?.length > 0) {
        browser.classList.remove('hidden');
        if (counter) counter.textContent = `${this.nqueensIndex + 1} / ${this.nqueensSolutions.length}`;
      } else {
        browser.classList.add('hidden');
      }
    }
  }

  syncDimensionInputs() {
    const b = this.activeBoard;
    const badge = document.getElementById('chess-dim-badge');
    if (badge) {
      badge.textContent = this.boards.length > 1 ? `B${this.activeBoardIndex + 1} · ${b.rows} × ${b.cols}` : `${b.rows} × ${b.cols}`;
    }
    const rInput = document.getElementById('chess-rows');
    const cInput = document.getElementById('chess-cols');
    if (rInput) rInput.value = b.rows;
    if (cInput) cInput.value = b.cols;
  }

  stopNQueensTimer() {
    if (this.nqueensTimer) {
      clearInterval(this.nqueensTimer);
      this.nqueensTimer = null;
      const playBtn = document.getElementById('btn-nq-play');
      if (playBtn) playBtn.textContent = 'Auto';
    }
  }

  clearSolverOverlays(stopTimer = true, boardObj = this.activeBoard) {
    if (stopTimer) this.stopNQueensTimer();
    boardObj.bfsPieceType = null;
    boardObj.knightStart = null;
    boardObj.bfsStarts = [];
    boardObj.knightDistances = null;
    boardObj.knightParents = null;
    boardObj.knightTarget = null;
    boardObj.knightPath = null;
    boardObj.bfsReachableCount = null;
    boardObj.bfsTraversableCount = null;
    boardObj.knightsTourMoves = null;
    boardObj.nqueensSolutions = [];
    if (boardObj === this.activeBoard) {
      const browser = document.getElementById('nqueens-browser');
      if (browser) browser.classList.add('hidden');
    }
  }

  initBoard(rows, cols) {
    const b = this.activeBoard;
    b.rows = Math.max(1, Math.min(30, rows));
    b.cols = Math.max(1, Math.min(30, cols));
    b.board = Array.from({ length: b.rows }, () =>
      Array.from({ length: b.cols }, () => ({ piece: null, color: 'w' }))
    );
    b.selectedSquare = null;
    this.clearSolverOverlays(true, b);
    b.inputText = '';
    this.syncBoardSelector();
    this.syncInputFromBoard();
  }

  resizeBoardPreserving(rows, cols) {
    const b = this.activeBoard;
    const oldRows = b.rows;
    const oldCols = b.cols;
    const oldBoard = b.board;
    const newRows = Math.max(1, Math.min(30, rows));
    const newCols = Math.max(1, Math.min(30, cols));

    b.rows = newRows;
    b.cols = newCols;
    b.board = Array.from({ length: newRows }, (_, r) =>
      Array.from({ length: newCols }, (_, c) =>
        r < oldRows && c < oldCols && oldBoard[r]?.[c]
          ? { ...oldBoard[r][c] }
          : { piece: null, color: 'w', val: '0' }
      )
    );
    if (b.selectedSquare && (b.selectedSquare.r >= newRows || b.selectedSquare.c >= newCols)) {
      b.selectedSquare = null;
    }
    this.clearSolverOverlays(true, b);
    this.syncBoardSelector();
    this.syncInputFromBoard();
    this.updateInspector();
  }

  // ==========================================
  // VIEWPORT & CANVAS SIZING
  // ==========================================

  resizeCanvas() {
    if (!this.container || !this.canvas) return;
    const rect = this.container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      this.needsInitialFit = true;
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.resetTransform?.();
    this.ctx.scale(dpr, dpr);
    if (this.needsInitialFit) {
      this.needsInitialFit = false;
      this.fitBoard();
      return;
    }
    this.render();
  }

  getAllBoardsBounds() {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const b of this.boards) {
      minX = Math.min(minX, b.offsetX);
      minY = Math.min(minY, b.offsetY - 52); // Include board title pill & file labels
      maxX = Math.max(maxX, b.offsetX + b.cols * this.squareSize);
      maxY = Math.max(maxY, b.offsetY + b.rows * this.squareSize);
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }

  fitBoard() {
    if (!this.container) return;
    const rect = this.container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      this.needsInitialFit = true;
      return;
    }
    this.needsInitialFit = false;

    const bounds = this.getAllBoardsBounds();
    const padX = 56;
    const padY = 48;
    const scaleX = (rect.width - padX * 2) / Math.max(1, bounds.width);
    const scaleY = (rect.height - padY * 2) / Math.max(1, bounds.height);
    this.zoom = Math.max(0.22, Math.min(1.65, Math.min(scaleX, scaleY) || 1.0));
    const centerWorldX = bounds.minX + bounds.width / 2;
    const centerWorldY = bounds.minY + bounds.height / 2;
    this.panX = Math.round(rect.width / 2 - centerWorldX * this.zoom);
    this.panY = Math.round(rect.height / 2 - centerWorldY * this.zoom);
    this.updateStatusPill();
    this.render();
  }

  resetView() {
    if (!this.container) return;
    this.zoom = 1.0;
    const rect = this.container.getBoundingClientRect();
    const b = this.activeBoard;
    const centerWorldX = b.offsetX + (b.cols * this.squareSize) / 2;
    const centerWorldY = b.offsetY + (b.rows * this.squareSize) / 2;
    this.panX = Math.round(rect.width / 2 - centerWorldX);
    this.panY = Math.round(rect.height / 2 - centerWorldY);
    this.updateStatusPill();
    this.render();
  }

  zoomBy(factor) {
    if (!this.container) return;
    const rect = this.container.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const newZoom = Math.max(0.2, Math.min(3.0, this.zoom * factor));
    this.panX = cx - (cx - this.panX) * (newZoom / this.zoom);
    this.panY = cy - (cy - this.panY) * (newZoom / this.zoom);
    this.zoom = newZoom;
    this.updateStatusPill();
    this.render();
  }

  // ==========================================
  // EVENT LISTENERS
  // ==========================================

  initEventListeners() {
    window.addEventListener('resize', () => this.resizeCanvas());

    document.querySelectorAll('[data-piece]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-piece]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activePiece = btn.dataset.piece;
        this.saveState();
      });
    });

    document.getElementById('btn-resize-chess')?.addEventListener('click', () => {
      const r = parseInt(document.getElementById('chess-rows')?.value) || 8;
      const c = parseInt(document.getElementById('chess-cols')?.value) || 8;
      this.pushUndo();
      this.resizeBoardPreserving(r, c);
      this.fitBoard();
      this.saveState();
      window.App?.showToast(`${this.activeBoard.name} resized to ${this.rows} × ${this.cols}`, 'info');
    });

    document.querySelectorAll('[data-chess-size]').forEach(btn => {
      btn.addEventListener('click', () => {
        const [r, c] = btn.dataset.chessSize.split('x').map(Number);
        this.pushUndo();
        this.resizeBoardPreserving(r, c);
        this.fitBoard();
        this.saveState();
        window.App?.showToast(`${this.activeBoard.name} set to ${this.rows} × ${this.cols}`, 'info');
      });
    });

    // Multi-board controls (delegated on pill bar)
    document.getElementById('chess-boards-tabs')?.addEventListener('click', (e) => {
      const addChessBtn = e.target.closest('#btn-chess-add-board');
      if (addChessBtn) {
        this.addBoard(false, 'chess');
        return;
      }
      const addGridBtn = e.target.closest('#btn-chess-add-grid');
      if (addGridBtn) {
        this.addBoard(false, 'grid');
        return;
      }
      const tabBtn = e.target.closest('[data-board-idx]');
      if (tabBtn) {
        const idx = parseInt(tabBtn.dataset.boardIdx, 10);
        if (!Number.isNaN(idx)) {
          this.setActiveBoard(idx, true);
        }
      }
    });
    document.getElementById('btn-chess-dup-board')?.addEventListener('click', () => this.addBoard(true));
    document.getElementById('btn-chess-del-board')?.addEventListener('click', () => this.removeActiveBoard());

    // Undo / Redo / Random Walls / Clear
    document.getElementById('btn-chess-undo')?.addEventListener('click', () => this.undo());
    document.getElementById('btn-chess-redo')?.addEventListener('click', () => this.redo());
    document.getElementById('btn-chess-rand-walls')?.addEventListener('click', () => this.generateRandomWalls());
    document.getElementById('btn-clear-chess')?.addEventListener('click', () => {
      this.pushUndo();
      this.initBoard(this.rows, this.cols);
      this.render();
      this.saveState();
      window.App?.showToast(`Cleared ${this.activeBoard.name}`, 'info');
    });

    // Symmetry & Export
    document.getElementById('btn-chess-rotate')?.addEventListener('click', () => this.rotateBoard90());
    document.getElementById('btn-chess-flip')?.addEventListener('click', () => this.flipBoardH());
    document.getElementById('btn-copy-chess-coords')?.addEventListener('click', () => this.copyPieceCoords());

    // Batch Chessboard Input Textbox Listeners (Two-Way Sync)
    document.querySelectorAll('[data-chess-input-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.inputMode = btn.dataset.chessInputMode === 'board' ? 'board' : 'auto';
        document.querySelectorAll('[data-chess-input-mode]').forEach(b => {
          b.classList.toggle('active', b === btn);
        });
        this.syncInputFromBoard();
        this.saveState();
      });
    });

    document.getElementById('btn-chess-copy-io')?.addEventListener('click', () => this.copyPieceCoords());

    const chessInput = document.getElementById('chess-batch-input');
    chessInput?.addEventListener('paste', () => {
      clearTimeout(this._batchTimer);
      setTimeout(() => {
        this.parseBatchInput(chessInput.value, true);
      }, 10);
    });
    chessInput?.addEventListener('input', () => {
      clearTimeout(this._batchTimer);
      this._batchTimer = setTimeout(() => {
        this.parseBatchInput(chessInput.value, false);
      }, 180);
    });
    chessInput?.addEventListener('change', () => {
      clearTimeout(this._batchTimer);
      this.parseBatchInput(chessInput.value, false);
    });

    // Zoom & Esc Controls
    document.getElementById('chess-zoom-in')?.addEventListener('click', () => this.zoomBy(1.2));
    document.getElementById('chess-zoom-out')?.addEventListener('click', () => this.zoomBy(0.8));
    document.getElementById('chess-zoom-fit')?.addEventListener('click', () => this.fitBoard());
    document.getElementById('chess-zoom-reset')?.addEventListener('click', () => this.resetView());
    document.getElementById('chess-btn-esc')?.addEventListener('click', () => this.cancelAllActivities());
    document.getElementById('chess-btn-esc-side')?.addEventListener('click', () => this.cancelAllActivities());

    // Algorithms & Solvers
    document.getElementById('btn-knight-bfs')?.addEventListener('click', () => this.triggerKnightBFS());
    document.getElementById('btn-attack-map')?.addEventListener('click', () => this.toggleAttackOverlay());
    document.getElementById('btn-nqueens-solve')?.addEventListener('click', () => this.solveNQueens());
    document.getElementById('btn-nrooks-solve')?.addEventListener('click', () => this.solveNRooks());
    document.getElementById('btn-knights-tour')?.addEventListener('click', () => this.solveKnightsTour());

    // N-Queens Solution Navigation
    document.getElementById('btn-nq-prev')?.addEventListener('click', () => this.navNQueens(-1));
    document.getElementById('btn-nq-next')?.addEventListener('click', () => this.navNQueens(1));
    document.getElementById('btn-nq-play')?.addEventListener('click', () => this.toggleNQueensPlay());

    // Overlay Select
    document.getElementById('chess-overlay-select')?.addEventListener('change', (e) => {
      this.activeOverlay = e.target.value;
      this.syncOverlayButtons();
      this.render();
      this.saveState();
    });

    // Canvas Events
    if (this.canvas) {
      this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
      this.canvas.addEventListener('dblclick', (e) => this.handleDoubleClick(e));
      this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      this.canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
    }
    window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    window.addEventListener('mouseup', () => this.handleMouseUp());
    window.addEventListener('beforeunload', () => this.saveState());
  }

  handleWheel(e) {
    e.preventDefault();
    const rect = this.container.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    const newZoom = Math.max(0.2, Math.min(3.0, this.zoom * factor));

    this.panX = mx - (mx - this.panX) * (newZoom / this.zoom);
    this.panY = my - (my - this.panY) * (newZoom / this.zoom);
    this.zoom = newZoom;

    this.updateStatusPill();
    this.render();
  }

  getHeaderPillRect(b) {
    const sz = this.squareSize * this.zoom;
    const headerFontSize = Math.max(10, Math.min(13, sz * 0.26));
    const label = `${b.name} (${b.rows}×${b.cols})`;
    let textW = label.length * 6.5;
    if (this.ctx) {
      this.ctx.save();
      this.ctx.font = '600 11px "JetBrains Mono", Menlo, monospace';
      textW = this.ctx.measureText(label).width;
      this.ctx.restore();
    }
    const pillW = Math.max(96, textW + 20);
    const pillH = 22;
    const pillY = -(6 + headerFontSize + 10 + pillH);
    return { label, pillW, pillH, pillY };
  }

  /**
   * Maps screen pixel coordinates to either a board's draggable title handle or a specific square.
   */
  hitTestCanvas(sx, sy) {
    const worldX = (sx - this.panX) / this.zoom;
    const worldY = (sy - this.panY) / this.zoom;

    for (let bi = this.boards.length - 1; bi >= 0; bi--) {
      const b = this.boards[bi];
      const lx = worldX - b.offsetX;
      const ly = worldY - b.offsetY;
      const boardW = b.cols * this.squareSize;
      const boardH = b.rows * this.squareSize;

      // Board title pill drag bar (above file labels)
      const { pillW, pillH, pillY } = this.getHeaderPillRect(b);
      if (lx >= -2 / this.zoom && lx <= pillW / this.zoom && ly >= pillY / this.zoom && ly <= (pillY + pillH) / this.zoom) {
        return { type: 'header', boardIdx: bi };
      }

      // Square inside board
      if (lx >= 0 && lx < boardW && ly >= 0 && ly < boardH) {
        const c = Math.floor(lx / this.squareSize);
        const r = Math.floor(ly / this.squareSize);
        if (r >= 0 && r < b.rows && c >= 0 && c < b.cols) {
          return { type: 'square', boardIdx: bi, r, c };
        }
      }
    }
    return null;
  }

  screenToSquare(sx, sy) {
    const hit = this.hitTestCanvas(sx, sy);
    if (hit && hit.type === 'square') {
      return { r: hit.r, c: hit.c, boardIdx: hit.boardIdx };
    }
    return null;
  }

  applyCellStroke(r, c, tool, boardObj = this.activeBoard) {
    const cur = boardObj.board[r]?.[c]?.piece;
    const target = tool === 'erase' ? null : tool;
    if (cur === target) return false;
    boardObj.board[r][c].piece = target;
    return true;
  }

  handleMouseDown(e) {
    if (e.button === 1 || e.code === 'Space' || e.shiftKey) {
      this.isPanning = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      return;
    }

    const rect = this.container.getBoundingClientRect();
    const hit = this.hitTestCanvas(e.clientX - rect.left, e.clientY - rect.top);

    if (!hit) {
      if (e.button === 0) {
        this.isPanning = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
      }
      return;
    }

    // Activate whichever board was clicked
    this.setActiveBoard(hit.boardIdx, false);
    const b = this.activeBoard;

    // Header drag to reposition board cleanly on canvas
    if (hit.type === 'header' && e.button === 0) {
      this.pushUndo();
      this.isDraggingBoard = true;
      this.dragBoardIndex = hit.boardIdx;
      this.dragStartBoardX = b.offsetX;
      this.dragStartBoardY = b.offsetY;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.render();
      return;
    }

    if (hit.type !== 'square') return;
    b.selectedSquare = { r: hit.r, c: hit.c };

    // Right-click erases piece/wall (supports drag-erase)
    if (e.button === 2) {
      this.pushUndo();
      this.isPainting = true;
      this.paintErase = true;
      this.lastPaintedKey = `${hit.boardIdx}:${hit.r},${hit.c}`;
      this.applyCellStroke(hit.r, hit.c, 'erase', b);
      this.clearSolverOverlays(true, b);
      this.syncInputFromBoard();
      this.render();
      this.saveState();
      return;
    }

    if (e.button !== 0) return;

    // In active BFS mode, clicking a square traces shortest path on that board
    if (b.knightDistances && b.bfsStarts.length > 0 && this.activePiece !== '#' && this.activePiece !== 'erase') {
      this.traceKnightPath(hit.r, hit.c);
      this.render();
      return;
    }

    if (this.activePiece === 'select') {
      this.render();
      return;
    }

    this.pushUndo();
    if (this.activePiece === '#' || this.activePiece === 'erase') {
      this.isPainting = true;
      this.paintErase = this.activePiece === 'erase';
      this.lastPaintedKey = `${hit.boardIdx}:${hit.r},${hit.c}`;
      this.applyCellStroke(hit.r, hit.c, this.activePiece, b);
    } else {
      const cur = b.board[hit.r][hit.c].piece;
      b.board[hit.r][hit.c].piece = cur === this.activePiece ? null : this.activePiece;
    }

    this.clearSolverOverlays(true, b);
    this.syncInputFromBoard();
    this.render();
    this.saveState();
  }

  handleMouseMove(e) {
    if (!this.container) return;
    const rect = this.container.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (this.isDraggingBoard && this.dragBoardIndex >= 0 && this.boards[this.dragBoardIndex]) {
      const dx = (e.clientX - this.lastMouseX) / this.zoom;
      const dy = (e.clientY - this.lastMouseY) / this.zoom;
      this.boards[this.dragBoardIndex].offsetX += dx;
      this.boards[this.dragBoardIndex].offsetY += dy;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.render();
      return;
    }

    if (this.isPanning) {
      this.panX += e.clientX - this.lastMouseX;
      this.panY += e.clientY - this.lastMouseY;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.render();
      return;
    }

    const hit = this.hitTestCanvas(sx, sy);
    this.hoverInfo = hit && hit.type === 'square' ? { boardIdx: hit.boardIdx, r: hit.r, c: hit.c } : null;
    if (this.canvas) {
      this.canvas.style.cursor = hit?.type === 'header' ? 'grab' : 'default';
    }

    if (this.isPainting && hit && hit.type === 'square' && hit.boardIdx === this.activeBoardIndex) {
      const key = `${hit.boardIdx}:${hit.r},${hit.c}`;
      if (key !== this.lastPaintedKey) {
        this.lastPaintedKey = key;
        const tool = this.paintErase ? 'erase' : '#';
        if (this.applyCellStroke(hit.r, hit.c, tool, this.activeBoard)) {
          this.clearSolverOverlays(true, this.activeBoard);
        }
      }
    }

    this.updateStatusPill();
    this.render();
  }

  handleMouseUp() {
    if (this.isDraggingBoard) {
      this.isDraggingBoard = false;
      this.dragBoardIndex = -1;
      this.saveState();
    }
    if (this.isPainting) {
      this.isPainting = false;
      this.paintErase = false;
      this.lastPaintedKey = null;
      this.syncInputFromBoard();
      this.saveState();
    }
    this.isPanning = false;
  }

  handleDoubleClick(e) {
    if (!this.container) return;
    const rect = this.container.getBoundingClientRect();
    const hit = this.hitTestCanvas(e.clientX - rect.left, e.clientY - rect.top);
    if (!hit || hit.type !== 'square') return;
    const b = this.boards[hit.boardIdx];
    if (!b || b.kind !== 'grid') return;
    this.setActiveBoard(hit.boardIdx, false);
    this.editCellInline(hit.r, hit.c, b);
  }

  removeInlineEditor() {
    const existing = this.container?.querySelector('.cell-inline-input');
    if (existing) existing.remove();
  }

  editCellInline(r, c, b = this.activeBoard) {
    this.removeInlineEditor();
    const cell = b.board[r]?.[c];
    if (!cell) return;
    const sz = this.squareSize * this.zoom;
    const cellX = this.panX + b.offsetX * this.zoom + c * sz;
    const cellY = this.panY + b.offsetY * this.zoom + r * sz;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'cell-inline-input';
    input.value = cell.piece === '#' ? '#' : (cell.piece || (cell.val !== undefined ? cell.val : 0));
    input.style.left = `${Math.round(cellX)}px`;
    input.style.top = `${Math.round(cellY)}px`;
    input.style.width = `${Math.round(sz)}px`;
    input.style.height = `${Math.round(sz)}px`;
    input.style.fontSize = `${Math.round(Math.max(10, sz * 0.36))}px`;

    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      const raw = input.value.trim();
      this.pushUndo();
      if (raw === '#') {
        cell.piece = '#';
        cell.val = '#';
      } else if (MOVABLE_PIECES.has(raw.toUpperCase())) {
        cell.piece = raw.toUpperCase();
      } else {
        cell.piece = null;
        cell.val = raw === '' ? '0' : raw;
      }
      this.clearSolverOverlays(true, b);
      this.syncInputFromBoard();
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
      }
    });
    input.addEventListener('blur', commit);
    this.container.appendChild(input);
    input.focus();
    input.select();
  }

  // ==========================================
  // NOTATION, STATUS & INSPECTOR
  // ==========================================

  getSquareNotation(r, c, boardObj = this.activeBoard) {
    const isOneIdx = window.App?.isOneIndexed;
    const isRev = !!window.App?.isReversedIndex;
    if (boardObj.kind !== 'grid' && boardObj.rows <= 26 && boardObj.cols <= 26 && !isOneIdx) {
      const file = String.fromCharCode(97 + (isRev ? (boardObj.cols - 1 - c) : c));
      const rank = isRev ? (r + 1) : (boardObj.rows - r);
      return `${file}${rank}`;
    }
    const rDisp = window.App ? window.App.getDisplayRow(r, boardObj.rows) : (isOneIdx ? r + 1 : r);
    const cDisp = window.App ? window.App.getDisplayCol(c, boardObj.cols) : (isOneIdx ? c + 1 : c);
    return `(${rDisp},${cDisp})`;
  }

  getPieceName(p) {
    switch (p) {
      case 'N': return 'Knight (♞)';
      case 'Q': return 'Queen (♛)';
      case 'R': return 'Rook (♜)';
      case 'B': return 'Bishop (♝)';
      case 'K': return 'King (♚)';
      case 'P': return 'Pawn (♟)';
      case '#': return 'Wall (#)';
      default: return p;
    }
  }

  updateStatusPill() {
    const statusSq = document.getElementById('chess-status-square');
    const statusInfo = document.getElementById('chess-status-info');
    const statusZoom = document.getElementById('chess-status-zoom');

    if (statusZoom) statusZoom.textContent = `Zoom: ${Math.round(this.zoom * 100)}%`;

    if (!this.hoverInfo || !this.boards[this.hoverInfo.boardIdx]) {
      if (statusSq) statusSq.textContent = this.boards.length > 1 ? `${this.activeBoard.name} | Square: -` : 'Square: -';
      if (statusInfo) statusInfo.textContent = 'Piece: None';
      return;
    }

    const { boardIdx, r, c } = this.hoverInfo;
    const b = this.boards[boardIdx];
    const notation = this.getSquareNotation(r, c, b);
    const piece = b.board[r]?.[c]?.piece || null;
    const isLight = (r + c) % 2 === 0;
    const prefix = this.boards.length > 1 ? `${b.name} · ` : '';

    if (statusSq) statusSq.textContent = `${prefix}${notation} [${isLight ? 'Light' : 'Dark'}]`;
    if (statusInfo) {
      const parts = [piece ? this.getPieceName(piece) : 'Empty'];
      const atkCount = b.attackStats?.counts?.[r]?.[c] || 0;
      if (atkCount > 0 && piece !== '#') {
        parts.push(`Attacked ×${atkCount}`);
      }
      if (b.knightDistances) {
        const d = b.knightDistances[r][c];
        parts.push(`${b.bfsPieceType || 'N'} Moves: ${d !== Infinity ? d : '∞'}`);
      }
      statusInfo.textContent = parts.join(' | ');
    }
  }

  updateInspector() {
    const b = this.activeBoard;
    const stats = b.attackStats;
    const countsEl = document.getElementById('chess-stat-counts');
    const attackEl = document.getElementById('chess-stat-attack');
    const bfsEl = document.getElementById('chess-stat-bfs');
    const pathEl = document.getElementById('chess-stat-path');

    if (countsEl && stats) countsEl.textContent = `${stats.pieceCount} / ${stats.wallCount}`;
    if (attackEl && stats) attackEl.textContent = `${stats.attackedSquares} / ${stats.safeSquares}`;

    if (bfsEl) {
      bfsEl.textContent =
        b.knightDistances && b.bfsReachableCount !== null
          ? `${b.bfsReachableCount} / ${b.bfsTraversableCount}`
          : '-';
    }

    if (pathEl) {
      if (b.knightPath && b.knightPath.length >= 1) {
        const moves = b.knightPath.length - 1;
        const start = b.knightPath[0];
        const end = b.knightPath[b.knightPath.length - 1];
        pathEl.textContent = `${moves} (${this.getSquareNotation(start[0], start[1], b)}→${this.getSquareNotation(end[0], end[1], b)})`;
      } else {
        pathEl.textContent = '-';
      }
    }
  }

  // ==========================================
  // ATTACK & REACHABILITY ENGINE
  // ==========================================

  /**
   * Computes which squares are attacked by all placed pieces on a board.
   * Walls (#) stop sliding rays and are excluded from attacked/safe counts.
   */
  computeAttackMap(boardObj = this.activeBoard) {
    const rows = boardObj.rows;
    const cols = boardObj.cols;
    const cells = boardObj.board;
    const counts = Array.from({ length: rows }, () => Array(cols).fill(0));
    let pieceCount = 0;
    let wallCount = 0;

    const addRayAttacks = (sr, sc, dirs) => {
      for (const [dr, dc] of dirs) {
        let nr = sr + dr;
        let nc = sc + dc;
        while (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          const target = cells[nr][nc].piece;
          if (target === '#') break;
          counts[nr][nc]++;
          if (target) break;
          nr += dr;
          nc += dc;
        }
      }
    };

    const addStepAttacks = (sr, sc, dirs) => {
      for (const [dr, dc] of dirs) {
        const nr = sr + dr;
        const nc = sc + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && cells[nr][nc].piece !== '#') {
          counts[nr][nc]++;
        }
      }
    };

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const p = cells[r][c].piece;
        if (p === '#') {
          wallCount++;
          continue;
        }
        if (!MOVABLE_PIECES.has(p)) continue;
        pieceCount++;

        if (p === 'N') addStepAttacks(r, c, KNIGHT_DIRS);
        else if (p === 'K') addStepAttacks(r, c, KING_DIRS);
        else if (p === 'P') addStepAttacks(r, c, PAWN_ATTACK_DIRS);
        else if (p === 'R') addRayAttacks(r, c, ROOK_DIRS);
        else if (p === 'B') addRayAttacks(r, c, BISHOP_DIRS);
        else if (p === 'Q') addRayAttacks(r, c, KING_DIRS);
      }
    }

    let attackedSquares = 0;
    let safeSquares = 0;
    const conflicts = new Set();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const p = cells[r][c].piece;
        if (p === '#') continue;
        if (p && counts[r][c] > 0) conflicts.add(`${r},${c}`);
        if (counts[r][c] > 0) attackedSquares++;
        else if (!p) safeSquares++;
      }
    }

    boardObj.attackStats = { counts, attackedSquares, safeSquares, conflicts, pieceCount, wallCount };
    return boardObj.attackStats;
  }

  toggleAttackOverlay() {
    this.activeOverlay = this.activeOverlay === 'attack' ? 'none' : 'attack';
    const sel = document.getElementById('chess-overlay-select');
    if (sel) sel.value = this.activeOverlay;
    this.syncOverlayButtons();
    this.render();
    this.saveState();
    const s = this.attackStats;
    if (this.activeOverlay === 'attack' && s) {
      window.App?.showToast(
        `${this.activeBoard.name}: ${s.attackedSquares} attacked, ${s.safeSquares} safe${s.conflicts.size ? ` (${s.conflicts.size} conflicts!)` : ''}`,
        s.conflicts.size > 0 ? 'info' : 'success'
      );
    }
  }

  syncOverlayButtons() {
    const atkBtn = document.getElementById('btn-attack-map');
    if (atkBtn) atkBtn.classList.toggle('active', this.activeOverlay === 'attack');
  }

  // ==========================================
  // GENERALIZED PIECE SHORTEST-PATH BFS
  // ==========================================

  findFirstNonWallSquare(boardObj = this.activeBoard) {
    for (let r = 0; r < boardObj.rows; r++) {
      for (let c = 0; c < boardObj.cols; c++) {
        if (boardObj.board[r][c].piece !== '#') return { r, c };
      }
    }
    return null;
  }

  resolveBFSSources() {
    const b = this.activeBoard;

    if (b.selectedSquare) {
      const selPiece = b.board[b.selectedSquare.r]?.[b.selectedSquare.c]?.piece;
      if (MOVABLE_PIECES.has(selPiece)) {
        return { pieceType: selPiece, starts: [{ ...b.selectedSquare }] };
      }
    }

    if (MOVABLE_PIECES.has(this.activePiece)) {
      const matching = [];
      for (let r = 0; r < b.rows; r++) {
        for (let c = 0; c < b.cols; c++) {
          if (b.board[r][c].piece === this.activePiece) matching.push({ r, c });
        }
      }
      if (matching.length > 0) return { pieceType: this.activePiece, starts: matching };
    }

    let firstPiece = null;
    for (let r = 0; r < b.rows && !firstPiece; r++) {
      for (let c = 0; c < b.cols && !firstPiece; c++) {
        if (MOVABLE_PIECES.has(b.board[r][c].piece)) firstPiece = b.board[r][c].piece;
      }
    }
    if (firstPiece) {
      const starts = [];
      for (let r = 0; r < b.rows; r++) {
        for (let c = 0; c < b.cols; c++) {
          if (b.board[r][c].piece === firstPiece) starts.push({ r, c });
        }
      }
      return { pieceType: firstPiece, starts };
    }

    const chosen = MOVABLE_PIECES.has(this.activePiece) ? this.activePiece : 'N';
    const startSq =
      b.selectedSquare && b.board[b.selectedSquare.r]?.[b.selectedSquare.c]?.piece !== '#'
        ? { ...b.selectedSquare }
        : this.findFirstNonWallSquare(b);

    if (!startSq) return null;
    this.pushUndo();
    b.board[startSq.r][startSq.c].piece = chosen;
    this.saveState();
    return { pieceType: chosen, starts: [startSq] };
  }

  triggerKnightBFS() {
    const resolved = this.resolveBFSSources();
    if (!resolved) {
      window.App?.showToast('No non-wall square available for BFS', 'error');
      return;
    }

    const b = this.activeBoard;
    b.bfsPieceType = resolved.pieceType;
    b.bfsStarts = resolved.starts;
    b.knightStart = resolved.starts[0];
    b.knightPath = null;
    b.knightTarget = null;
    b.knightsTourMoves = null;

    this.computePieceBFS(resolved.starts, resolved.pieceType, b);
    this.render();

    const originLabel =
      resolved.starts.length === 1
        ? this.getSquareNotation(resolved.starts[0].r, resolved.starts[0].c, b)
        : `${resolved.starts.length} sources`;
    window.App?.showToast(
      `${b.name} ${this.getPieceName(resolved.pieceType)} BFS (${originLabel}): ${b.bfsReachableCount}/${b.bfsTraversableCount} reachable. Click square for path!`,
      'success'
    );
  }

  computePieceBFS(starts, pieceType = 'N', boardObj = this.activeBoard) {
    const rows = boardObj.rows;
    const cols = boardObj.cols;
    const cells = boardObj.board;
    const dist = Array.from({ length: rows }, () => Array(cols).fill(Infinity));
    const parents = Array.from({ length: rows }, () => Array(cols).fill(null));
    const queue = [];

    for (const s of starts) {
      if (cells[s.r]?.[s.c]?.piece === '#') continue;
      dist[s.r][s.c] = 0;
      queue.push([s.r, s.c]);
    }

    const isSliding = pieceType === 'R' || pieceType === 'B' || pieceType === 'Q';
    const dirs =
      pieceType === 'N'
        ? KNIGHT_DIRS
        : pieceType === 'K'
          ? KING_DIRS
          : pieceType === 'P'
            ? PAWN_MOVE_DIRS
            : pieceType === 'R'
              ? ROOK_DIRS
              : pieceType === 'B'
                ? BISHOP_DIRS
                : KING_DIRS;

    let head = 0;
    while (head < queue.length) {
      const [r, c] = queue[head++];
      const nextDist = dist[r][c] + 1;

      if (!isSliding) {
        for (const [dr, dc] of dirs) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          if (cells[nr][nc].piece === '#') continue;
          if (dist[nr][nc] === Infinity) {
            dist[nr][nc] = nextDist;
            parents[nr][nc] = [r, c];
            queue.push([nr, nc]);
          }
        }
      } else {
        for (const [dr, dc] of dirs) {
          let nr = r + dr;
          let nc = c + dc;
          while (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            const cellPiece = cells[nr][nc].piece;
            if (cellPiece === '#') break;
            if (cellPiece && dist[nr][nc] !== 0) break;
            if (dist[nr][nc] === Infinity) {
              dist[nr][nc] = nextDist;
              parents[nr][nc] = [r, c];
              queue.push([nr, nc]);
            }
            nr += dr;
            nc += dc;
          }
        }
      }
    }

    let reachable = 0;
    let traversable = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (cells[r][c].piece === '#') continue;
        traversable++;
        if (dist[r][c] !== Infinity) reachable++;
      }
    }

    boardObj.knightDistances = dist;
    boardObj.knightParents = parents;
    boardObj.bfsReachableCount = reachable;
    boardObj.bfsTraversableCount = traversable;
    return dist;
  }

  computeKnightBFS(sr, sc) {
    const b = this.activeBoard;
    b.bfsPieceType = 'N';
    b.knightStart = { r: sr, c: sc };
    b.bfsStarts = [{ r: sr, c: sc }];
    return this.computePieceBFS(b.bfsStarts, 'N', b);
  }

  traceKnightPath(tr, tc) {
    const b = this.activeBoard;
    if (!b.knightParents || !b.knightDistances) return;
    if (b.board[tr]?.[tc]?.piece === '#') {
      window.App?.showToast('Blocked wall (#) is unreachable!', 'error');
      return;
    }
    if (b.knightDistances[tr][tc] === Infinity) {
      window.App?.showToast(`Square ${this.getSquareNotation(tr, tc, b)} is unreachable!`, 'error');
      return;
    }

    const path = [];
    let curr = [tr, tc];
    while (curr) {
      path.push(curr);
      curr = b.knightParents[curr[0]][curr[1]];
    }
    path.reverse();
    b.knightTarget = { r: tr, c: tc };
    b.knightPath = path;
    const moves = path.length - 1;
    window.App?.showToast(`${this.getPieceName(b.bfsPieceType || 'N')} shortest path: ${moves} move${moves !== 1 ? 's' : ''}`, 'info');
  }

  // ==========================================
  // N-QUEENS & N-ROOKS (WITH WALL SUPPORT)
  // ==========================================

  solveNQueens() {
    const b = this.activeBoard;
    if (b.rows !== b.cols) {
      this.pushUndo();
      window.App?.showToast('N-Queens requires a square board (N × N). Setting active board to 8×8', 'info');
      this.initBoard(8, 8);
      this.fitBoard();
    }

    const N = b.rows;
    if (N > 14) {
      window.App?.showToast('N-Queens solver limited to N ≤ 14 for instant responsiveness', 'error');
      return;
    }

    const solutions = [];
    const cols = new Set();
    const diag1 = new Set();
    const diag2 = new Set();
    const currentPlacement = Array(N).fill(-1);

    const backtrack = (row) => {
      if (row === N) {
        solutions.push([...currentPlacement]);
        return;
      }
      for (let col = 0; col < N; col++) {
        if (b.board[row][col].piece === '#') continue;
        if (!cols.has(col) && !diag1.has(row - col) && !diag2.has(row + col)) {
          cols.add(col);
          diag1.add(row - col);
          diag2.add(row + col);
          currentPlacement[row] = col;
          backtrack(row + 1);
          cols.delete(col);
          diag1.delete(row - col);
          diag2.delete(row + col);
          currentPlacement[row] = -1;
        }
      }
    };

    backtrack(0);

    this.clearSolverOverlays(true, b);
    b.nqueensSolutions = solutions;
    b.nqueensIndex = 0;

    const browser = document.getElementById('nqueens-browser');
    const counter = document.getElementById('nqueens-solution-counter');
    if (browser) browser.classList.remove('hidden');

    if (solutions.length > 0) {
      this.pushUndo();
      if (counter) counter.textContent = `1 / ${solutions.length}`;
      this.applyNQueensSolution(0);
      window.App?.showToast(`${b.name}: found ${solutions.length} solution${solutions.length !== 1 ? 's' : ''} for ${N}-Queens!`, 'success');
    } else {
      if (counter) counter.textContent = '0 solutions';
      window.App?.showToast(`No valid ${N}-Queens placement avoids the current walls (#).`, 'info');
    }
    this.render();
  }

  applyNQueensSolution(idx) {
    const b = this.activeBoard;
    if (!b.nqueensSolutions || b.nqueensSolutions.length === 0) return;
    b.nqueensIndex = (idx + b.nqueensSolutions.length) % b.nqueensSolutions.length;
    const sol = b.nqueensSolutions[b.nqueensIndex];

    for (let r = 0; r < b.rows; r++) {
      for (let c = 0; c < b.cols; c++) {
        if (b.board[r][c].piece !== '#') b.board[r][c].piece = null;
      }
    }
    for (let r = 0; r < b.rows; r++) {
      b.board[r][sol[r]].piece = 'Q';
    }

    const counter = document.getElementById('nqueens-solution-counter');
    if (counter) counter.textContent = `${b.nqueensIndex + 1} / ${b.nqueensSolutions.length}`;
    this.syncInputFromBoard();
    this.render();
    this.saveState();
  }

  navNQueens(dir) {
    this.applyNQueensSolution(this.nqueensIndex + dir);
  }

  toggleNQueensPlay() {
    const playBtn = document.getElementById('btn-nq-play');
    if (this.nqueensTimer) {
      this.stopNQueensTimer();
    } else {
      if (playBtn) playBtn.textContent = 'Pause';
      this.nqueensTimer = setInterval(() => this.navNQueens(1), 700);
    }
  }

  /**
   * Places the maximum number of mutually non-attacking Rooks on the active N x M board
   * respecting '#' walls via Row-Segment x Col-Segment Bipartite Matching (Kuhn's algorithm).
   */
  solveNRooks() {
    this.pushUndo();
    const b = this.activeBoard;
    this.clearSolverOverlays(true, b);

    const rows = b.rows;
    const cols = b.cols;
    const rowSeg = Array.from({ length: rows }, () => Array(cols).fill(-1));
    const colSeg = Array.from({ length: rows }, () => Array(cols).fill(-1));
    let numRowSegs = 0;
    let numColSegs = 0;

    for (let r = 0; r < rows; r++) {
      let inSeg = false;
      for (let c = 0; c < cols; c++) {
        if (b.board[r][c].piece === '#') {
          inSeg = false;
        } else {
          if (!inSeg) {
            numRowSegs++;
            inSeg = true;
          }
          rowSeg[r][c] = numRowSegs - 1;
        }
      }
    }

    for (let c = 0; c < cols; c++) {
      let inSeg = false;
      for (let r = 0; r < rows; r++) {
        if (b.board[r][c].piece === '#') {
          inSeg = false;
        } else {
          if (!inSeg) {
            numColSegs++;
            inSeg = true;
          }
          colSeg[r][c] = numColSegs - 1;
        }
      }
    }

    const adj = Array.from({ length: numRowSegs }, () => []);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (b.board[r][c].piece !== '#') {
          adj[rowSeg[r][c]].push({ cs: colSeg[r][c], r, c });
          b.board[r][c].piece = null;
        }
      }
    }

    const matchCol = Array(numColSegs).fill(null);
    const dfs = (u, visited) => {
      for (const edge of adj[u]) {
        if (visited[edge.cs]) continue;
        visited[edge.cs] = true;
        if (!matchCol[edge.cs] || dfs(matchCol[edge.cs].rs, visited)) {
          matchCol[edge.cs] = { rs: u, r: edge.r, c: edge.c };
          return true;
        }
      }
      return false;
    };

    for (let u = 0; u < numRowSegs; u++) {
      dfs(u, Array(numColSegs).fill(false));
    }

    let placed = 0;
    for (const m of matchCol) {
      if (m) {
        b.board[m.r][m.c].piece = 'R';
        placed++;
      }
    }

    this.syncInputFromBoard();
    this.render();
    this.saveState();
    window.App?.showToast(`${b.name}: placed ${placed} max non-attacking Rook${placed !== 1 ? 's' : ''}`, 'success');
  }

  // ==========================================
  // KNIGHT'S TOUR (WARNSDORFF + WALL SUPPORT)
  // ==========================================

  solveKnightsTour() {
    const b = this.activeBoard;
    this.clearSolverOverlays(true, b);
    const N = b.rows;
    const M = b.cols;
    const visited = Array.from({ length: N }, () => Array(M).fill(0));
    let traversable = 0;

    for (let r = 0; r < N; r++) {
      for (let c = 0; c < M; c++) {
        if (b.board[r][c].piece === '#') visited[r][c] = -1;
        else traversable++;
      }
    }

    if (traversable === 0) {
      window.App?.showToast('No traversable squares for Knight\'s Tour!', 'error');
      return;
    }

    let start = null;
    if (b.selectedSquare && visited[b.selectedSquare.r]?.[b.selectedSquare.c] === 0) {
      start = b.selectedSquare;
    } else {
      for (let r = 0; r < N && !start; r++) {
        for (let c = 0; c < M && !start; c++) {
          if (b.board[r][c].piece === 'N') start = { r, c };
        }
      }
      if (!start) start = this.findFirstNonWallSquare(b);
    }

    const getDegree = (r, c) => {
      let count = 0;
      for (const [dr, dc] of KNIGHT_DIRS) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < N && nc >= 0 && nc < M && visited[nr][nc] === 0) count++;
      }
      return count;
    };

    let curR = start.r;
    let curC = start.c;
    visited[curR][curC] = 1;
    const moves = [[curR, curC]];

    for (let step = 2; step <= traversable; step++) {
      let minDeg = Infinity;
      let nextR = -1;
      let nextC = -1;

      for (const [dr, dc] of KNIGHT_DIRS) {
        const nr = curR + dr;
        const nc = curC + dc;
        if (nr >= 0 && nr < N && nc >= 0 && nc < M && visited[nr][nc] === 0) {
          const deg = getDegree(nr, nc);
          if (deg < minDeg) {
            minDeg = deg;
            nextR = nr;
            nextC = nc;
          }
        }
      }

      if (nextR === -1) break;
      visited[nextR][nextC] = step;
      moves.push([nextR, nextC]);
      curR = nextR;
      curC = nextC;
    }

    b.knightsTourMoves = moves;
    const reached = moves.length;
    let isClosed = false;
    if (reached === traversable && reached > 1) {
      const [sr, sc] = moves[0];
      const [er, ec] = moves[reached - 1];
      isClosed = KNIGHT_DIRS.some(([dr, dc]) => er + dr === sr && ec + dc === sc);
    }

    const tourType = reached === traversable ? (isClosed ? 'Closed Tour!' : 'Open Tour') : 'Partial';
    window.App?.showToast(
      `${b.name} Knight's Tour (${tourType}): ${reached} / ${traversable} squares`,
      reached === traversable ? 'success' : 'info'
    );
    this.render();
  }

  // ==========================================
  // BOARD TRANSFORMS, OBSTACLES & EXPORT
  // ==========================================

  generateRandomWalls() {
    this.pushUndo();
    const b = this.activeBoard;
    this.clearSolverOverlays(true, b);
    let placed = 0;
    for (let r = 0; r < b.rows; r++) {
      for (let c = 0; c < b.cols; c++) {
        if (b.board[r][c].piece === '#') b.board[r][c].piece = null;
        if (!b.board[r][c].piece && Math.random() < 0.2) {
          b.board[r][c].piece = '#';
          placed++;
        }
      }
    }
    this.syncInputFromBoard();
    this.render();
    this.saveState();
    window.App?.showToast(`${b.name}: generated ${placed} wall obstacle${placed !== 1 ? 's' : ''} (#)`, 'info');
  }

  rotateBoard90() {
    this.pushUndo();
    const b = this.activeBoard;
    this.clearSolverOverlays(true, b);
    const newRows = b.cols;
    const newCols = b.rows;
    b.board = Array.from({ length: newRows }, (_, nr) =>
      Array.from({ length: newCols }, (_, nc) => ({
        piece: b.board[b.rows - 1 - nc][nr].piece,
        color: b.board[b.rows - 1 - nc][nr].color || 'w',
        val: b.board[b.rows - 1 - nc][nr].val !== undefined ? b.board[b.rows - 1 - nc][nr].val : '0'
      }))
    );
    b.rows = newRows;
    b.cols = newCols;
    b.selectedSquare = null;
    this.syncBoardSelector();
    this.syncInputFromBoard();
    this.fitBoard();
    this.saveState();
    window.App?.showToast(`Rotated ${b.name} 90° clockwise`, 'info');
  }

  flipBoardH() {
    this.pushUndo();
    const b = this.activeBoard;
    this.clearSolverOverlays(true, b);
    for (let r = 0; r < b.rows; r++) b.board[r].reverse();
    b.selectedSquare = null;
    this.syncInputFromBoard();
    this.render();
    this.saveState();
    window.App?.showToast(`Flipped ${b.name} horizontally`, 'info');
  }

  syncInputFromBoard() {
    const chessInput = document.getElementById('chess-batch-input');
    const b = this.activeBoard;
    if (!b) return;

    const existingText = chessInput ? chessInput.value : (b.inputText || '');
    const existingLines = existingText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const existingTokens = existingLines.map(l => l.split(/[\s,;]+/).filter(t => t.length > 0));
    const firstLen = existingTokens[0]?.length || 0;
    const looksLikeBoard = existingLines.length > 0 && (
      existingTokens.every(t => t.length === 1 && t[0].length >= 2) ||
      (firstLen >= 4 && existingTokens.every(t => t.length === firstLen)) ||
      (existingTokens.length >= 2 && firstLen === 2 && /^-?\d+$/.test(existingTokens[0][0]) && /^-?\d+$/.test(existingTokens[0][1]) && existingTokens.slice(1).every(t => t.length >= 2 || (t.length === 1 && t[0].length >= 2)))
    );

    let nonEmptyCount = 0;
    for (let r = 0; r < b.rows; r++) {
      for (let c = 0; c < b.cols; c++) {
        const cell = b.board[r]?.[c];
        if (!cell) continue;
        if (b.kind === 'grid') {
          const vs = String(cell.val ?? '0');
          if (cell.piece === '#' || (vs !== '0' && vs !== '')) nonEmptyCount++;
        } else if (cell.piece) {
          nonEmptyCount++;
        }
      }
    }

    const useBoardFormat = this.inputMode === 'board' || looksLikeBoard;
    let text = '';

    if (useBoardFormat && nonEmptyCount > 0) {
      const lines = [];
      for (let r = 0; r < b.rows; r++) {
        if (b.kind === 'grid') {
          lines.push(b.board[r].map(cell => (cell.piece === '#' ? '#' : String(cell.val ?? '0'))).join(' '));
        } else {
          lines.push(b.board[r].map(cell => cell.piece || '.').join(''));
        }
      }
      text = lines.join('\n');
    } else if (nonEmptyCount > 0) {
      const lines = [];
      for (let r = 0; r < b.rows; r++) {
        for (let c = 0; c < b.cols; c++) {
          const cell = b.board[r]?.[c];
          if (!cell) continue;
          const rDisp = window.App ? window.App.getDisplayRow(r, b.rows) : r;
          const cDisp = window.App ? window.App.getDisplayCol(c, b.cols) : c;
          if (b.kind === 'grid') {
            const vs = String(cell.val ?? '0');
            if (cell.piece === '#' || (vs !== '0' && vs !== '')) {
              lines.push(`${rDisp} ${cDisp} ${cell.piece === '#' ? '#' : vs}`);
            }
          } else if (cell.piece) {
            lines.push(`${rDisp} ${cDisp} ${cell.piece}`);
          }
        }
      }
      text = lines.join('\n');
    }

    b.inputText = text;
    if (chessInput && chessInput.value !== text) {
      chessInput.value = text;
    }
  }

  applyBoardToken(cell, rawToken, isGridKind) {
    const tok = String(rawToken ?? '').trim();
    if (isGridKind) {
      if (tok === '#') {
        cell.piece = '#';
        cell.val = '#';
      } else {
        cell.piece = null;
        cell.val = tok === '' ? '0' : tok;
      }
      return;
    }
    if (tok === '#' || tok === '*') {
      cell.piece = '#';
      cell.val = '#';
    } else if (MOVABLE_PIECES.has(tok.toUpperCase())) {
      cell.piece = tok.toUpperCase();
    } else {
      cell.piece = null;
      cell.val = '0';
    }
  }

  parseFenBoard(fenRankField, showToast = true) {
    const fenRows = fenRankField.split('/');
    const parsedRows = [];
    let maxCols = 0;
    for (const rankStr of fenRows) {
      if (!rankStr || !/^[pnbrqkPNBRQK1-9]+$/.test(rankStr)) return false;
      const rowTokens = [];
      let i = 0;
      while (i < rankStr.length) {
        const ch = rankStr[i];
        if (ch >= '1' && ch <= '9') {
          let numStr = ch;
          while (i + 1 < rankStr.length && rankStr[i + 1] >= '0' && rankStr[i + 1] <= '9') {
            numStr += rankStr[++i];
          }
          const emptyCount = Math.min(30, parseInt(numStr, 10));
          for (let k = 0; k < emptyCount; k++) rowTokens.push('.');
        } else {
          rowTokens.push(ch.toUpperCase());
        }
        i++;
      }
      maxCols = Math.max(maxCols, rowTokens.length);
      parsedRows.push(rowTokens);
    }
    const newR = Math.max(1, Math.min(30, parsedRows.length));
    const newC = Math.max(1, Math.min(30, maxCols));
    const b = this.activeBoard;
    b.rows = newR;
    b.cols = newC;
    b.board = Array.from({ length: newR }, (_, r) =>
      Array.from({ length: newC }, (_, c) => {
        const cell = { piece: null, color: 'w', val: '0' };
        this.applyBoardToken(cell, parsedRows[r]?.[c] || '.', false);
        return cell;
      })
    );
    b.selectedSquare = null;
    this.clearSolverOverlays(true, b);
    this.syncBoardSelector();
    this.fitBoard();
    this.saveState();
    if (showToast) {
      window.App?.showToast(`Loaded ${newR}×${newC} FEN position onto ${b.name}`, 'success');
    }
    return true;
  }

  parseBatchInput(rawText, showToast = true) {
    const b = this.activeBoard;
    b.inputText = rawText || '';
    this.clearSolverOverlays(true, b);

    const resetSquares = (targetRows = b.rows, targetCols = b.cols) => {
      b.rows = Math.max(1, Math.min(30, targetRows));
      b.cols = Math.max(1, Math.min(30, targetCols));
      b.board = Array.from({ length: b.rows }, () =>
        Array.from({ length: b.cols }, () => ({ piece: null, color: 'w', val: '0' }))
      );
      b.selectedSquare = null;
    };

    if (!rawText || !rawText.trim()) {
      resetSquares();
      this.render();
      this.saveState();
      return;
    }

    // FEN detection (e.g. rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1)
    const firstNonEmptyLine = rawText.split(/\r?\n/).map(l => l.trim()).find(Boolean) || '';
    const firstLineParts = firstNonEmptyLine.split(/\s+/);
    if (firstLineParts[0].includes('/') && rawText.trim().split(/\r?\n/).filter(l => l.trim()).length === 1) {
      if (this.parseFenBoard(firstLineParts[0], showToast)) return;
    }

    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('//'));
    if (lines.length === 0) {
      resetSquares();
      this.render();
      this.saveState();
      return;
    }

    const tokenizedLines = lines.map(l => l.split(/[\s,;]+/).filter(t => t.length > 0));
    const intRe = /^-?\d+$/;
    let startLine = 0;
    let headerDim = null;

    if (
      this.inputMode !== 'board' &&
      tokenizedLines.length > 1 &&
      tokenizedLines[0].length === 1 &&
      intRe.test(tokenizedLines[0][0])
    ) {
      const nCount = parseInt(tokenizedLines[0][0], 10);
      if (nCount > 0 && tokenizedLines.length - 1 === nCount) {
        startLine = 1;
      }
    } else if (
      tokenizedLines.length > 1 &&
      tokenizedLines[0].length === 2 &&
      intRe.test(tokenizedLines[0][0]) &&
      intRe.test(tokenizedLines[0][1])
    ) {
      const hR = parseInt(tokenizedLines[0][0], 10);
      const hC = parseInt(tokenizedLines[0][1], 10);
      const rest = tokenizedLines.slice(1);
      if (hR > 0 && hC > 0 && rest.length === hR && rest.every(t => t.length === 1 && t[0].length === hC)) {
        startLine = 1;
        headerDim = { r: hR, c: hC };
      } else if (hR > 0 && hC > 0 && rest.length === hR && rest.every(t => t.length === hC)) {
        startLine = 1;
        headerDim = { r: hR, c: hC };
      } else if (hC > 0 && rest.length === hC) {
        startLine = 1;
      }
    }

    const dataRows = tokenizedLines.slice(startLine);
    if (dataRows.length === 0) {
      resetSquares();
      this.render();
      this.saveState();
      return;
    }

    const isGridKind = b.kind === 'grid';
    const isSingleCharGrid = dataRows.every(t => t.length === 1 && t[0].length >= 2);
    if (isSingleCharGrid) {
      const newR = Math.min(30, headerDim ? headerDim.r : dataRows.length);
      const newC = Math.min(30, headerDim ? headerDim.c : Math.max(...dataRows.map(t => t[0].length)));
      const prevRows = b.rows;
      const prevCols = b.cols;
      resetSquares(newR, newC);
      for (let r = 0; r < newR; r++) {
        const str = dataRows[r]?.[0] || '';
        for (let c = 0; c < Math.min(newC, str.length); c++) {
          this.applyBoardToken(b.board[r][c], str[c], isGridKind);
        }
      }
      this.syncBoardSelector();
      if (newR !== prevRows || newC !== prevCols) this.fitBoard();
      else this.render();
      this.saveState();
      if (showToast) {
        window.App?.showToast(`Loaded ${newR}×${newC} board onto ${b.name}`, 'success');
      }
      return;
    }

    const firstRowLen = dataRows[0].length;
    const algRe = /^([a-z])(\d+)$/i;
    const isCoordLine = (t) => {
      if ((t.length === 2 || t.length === 3) && intRe.test(t[0]) && intRe.test(t[1])) return true;
      if (t.length === 1 && algRe.test(t[0])) return true;
      if (t.length === 2 && (algRe.test(t[0]) || algRe.test(t[1]))) return true;
      return false;
    };
    const looksLikeCoords = dataRows.every(isCoordLine);
    const isUniformMatrix =
      !!headerDim ||
      (this.inputMode === 'board' && dataRows.every(t => t.length === firstRowLen)) ||
      (dataRows.every(t => t.length === firstRowLen) && (firstRowLen >= 4 || (firstRowLen >= 2 && !looksLikeCoords)));

    if (isUniformMatrix) {
      const newR = Math.min(30, headerDim ? headerDim.r : dataRows.length);
      const newC = Math.min(30, headerDim ? headerDim.c : firstRowLen);
      const prevRows = b.rows;
      const prevCols = b.cols;
      resetSquares(newR, newC);
      for (let r = 0; r < newR; r++) {
        for (let c = 0; c < Math.min(newC, dataRows[r]?.length || 0); c++) {
          this.applyBoardToken(b.board[r][c], dataRows[r][c], isGridKind);
        }
      }
      this.syncBoardSelector();
      if (newR !== prevRows || newC !== prevCols) this.fitBoard();
      else this.render();
      this.saveState();
      if (showToast) {
        window.App?.showToast(`Loaded ${newR}×${newC} board onto ${b.name}`, 'success');
      }
      return;
    }

    // Sparse coordinate lines: "r c P", "r c", "d5 N", "N d5", "d5"
    const defaultPiece = (this.activePiece === '#' || MOVABLE_PIECES.has(this.activePiece)) ? this.activePiece : 'N';
    const numericEntries = [];
    const algEntries = [];
    let minR = Infinity;
    let minC = Infinity;

    for (const tokens of dataRows) {
      if ((tokens.length === 2 || tokens.length === 3) && intRe.test(tokens[0]) && intRe.test(tokens[1])) {
        const rawR = parseInt(tokens[0], 10);
        const rawC = parseInt(tokens[1], 10);
        const val = tokens.length === 3 ? tokens[2] : (isGridKind ? '1' : defaultPiece);
        numericEntries.push({ r: rawR, c: rawC, val });
        minR = Math.min(minR, rawR);
        minC = Math.min(minC, rawC);
      } else {
        const m0 = tokens[0].match(algRe);
        const m1 = tokens[1]?.match(algRe);
        if (m0) {
          const col = m0[1].toLowerCase().charCodeAt(0) - 97;
          const rank = parseInt(m0[2], 10);
          const val = tokens[1] || defaultPiece;
          algEntries.push({ col, rank, val });
        } else if (m1) {
          const col = m1[1].toLowerCase().charCodeAt(0) - 97;
          const rank = parseInt(m1[2], 10);
          const val = tokens[0];
          algEntries.push({ col, rank, val });
        }
      }
    }

    if (numericEntries.length === 0 && algEntries.length === 0) {
      resetSquares();
      this.render();
      this.saveState();
      if (showToast) {
        window.App?.showToast('No valid board rows or "r c piece" / "d5 N" entries found', 'error');
      }
      return;
    }

    const isOneIdx = !!window.App?.isOneIndexed;
    const isRev = !!window.App?.isReversedIndex;
    const shouldSub1 = isOneIdx && minR >= 1 && minC >= 1;
    let neededR = b.rows;
    let neededC = b.cols;

    const resolvedEntries = [];
    for (const e of numericEntries) {
      const r0 = shouldSub1 ? e.r - 1 : e.r;
      const c0 = shouldSub1 ? e.c - 1 : e.c;
      if (r0 >= 0 && c0 >= 0) {
        neededR = Math.max(neededR, r0 + 1);
        neededC = Math.max(neededC, c0 + 1);
        resolvedEntries.push({ type: 'idx', r0, c0, val: e.val });
      }
    }
    for (const a of algEntries) {
      if (a.col >= 0 && a.rank >= 1) {
        neededR = Math.max(neededR, a.rank);
        neededC = Math.max(neededC, a.col + 1);
        resolvedEntries.push({ type: 'alg', col: a.col, rank: a.rank, val: a.val });
      }
    }

    const finalR = Math.min(30, neededR);
    const finalC = Math.min(30, neededC);
    const sizeChanged = finalR !== b.rows || finalC !== b.cols;
    resetSquares(finalR, finalC);

    let updated = 0;
    for (const item of resolvedEntries) {
      let rr, cc;
      if (item.type === 'idx') {
        rr = isRev ? (finalR - 1 - item.r0) : item.r0;
        cc = isRev ? (finalC - 1 - item.c0) : item.c0;
      } else {
        cc = isRev ? (finalC - 1 - item.col) : item.col;
        rr = isRev ? (item.rank - 1) : (finalR - item.rank);
      }
      if (rr >= 0 && rr < finalR && cc >= 0 && cc < finalC) {
        this.applyBoardToken(b.board[rr][cc], item.val, isGridKind);
        updated++;
      }
    }

    this.syncBoardSelector();
    if (sizeChanged) this.fitBoard();
    else this.render();
    this.saveState();
    if (showToast) {
      window.App?.showToast(`Updated ${updated} square${updated !== 1 ? 's' : ''} on ${b.name}`, 'success');
    }
  }

  copyPieceCoords() {
    const sections = this.boards.map((b, idx) => {
      let out = this.boards.length > 1 ? `# ${b.name}\n${b.rows} ${b.cols}\n` : `${b.rows} ${b.cols}\n`;
      const pieces = [];
      for (let r = 0; r < b.rows; r++) {
        let rowStr = '';
        for (let c = 0; c < b.cols; c++) {
          const p = b.board[r][c].piece;
          rowStr += p || '.';
          if (p && p !== '#') {
            pieces.push(`${p} at ${this.getSquareNotation(r, c, b)} (r:${r}, c:${c})`);
          }
        }
        out += `${rowStr}\n`;
      }
      if (pieces.length > 0) out += `# Pieces:\n${pieces.join('\n')}\n`;
      return out.trimEnd();
    });

    navigator.clipboard?.writeText(sections.join('\n\n')).then(() => {
      window.App?.showToast(
        this.boards.length > 1
          ? `Copied ${this.boards.length} chessboards to clipboard!`
          : `Copied ${this.rows}×${this.cols} board matrix & pieces!`,
        'success'
      );
    });
  }

  // ==========================================
  // RENDERING (Multi-Board Infinite Canvas)
  // ==========================================

  render() {
    if (!this.ctx || !this.container) return;
    const rect = this.container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    for (const b of this.boards) {
      this.computeAttackMap(b);
    }
    this.syncDimensionInputs();
    this.updateInspector();
    this.updateStatusPill();

    this.ctx.clearRect(0, 0, rect.width, rect.height);
    const sz = this.squareSize * this.zoom;
    const isOneIdx = window.App?.isOneIndexed;

    this.ctx.save();
    this.ctx.translate(this.panX, this.panY);

    for (let bi = 0; bi < this.boards.length; bi++) {
      this.renderSingleBoard(this.boards[bi], bi, sz, isOneIdx);
    }

    this.ctx.restore();
  }

  renderSingleBoard(b, boardIdx, sz, isOneIdx) {
    const isActive = boardIdx === this.activeBoardIndex;
    const atkCounts = b.attackStats?.counts;
    const conflicts = b.attackStats?.conflicts;
    const boardW = b.cols * sz;
    const boardH = b.rows * sz;

    this.ctx.save();
    this.ctx.translate(b.offsetX * this.zoom, b.offsetY * this.zoom);

    // 0. Draggable Board Header Tab
    this.renderBoardHeaderPill(b, isActive, boardW);

    // 1. Draw Squares, Walls (#), Overlays, Pieces & BFS Distances
    for (let r = 0; r < b.rows; r++) {
      for (let c = 0; c < b.cols; c++) {
        const x = c * sz;
        const y = r * sz;
        const isLight = (r + c) % 2 === 0;
        const piece = b.board[r][c].piece;

        if (piece === '#') {
          this.ctx.fillStyle = '#1e293b';
          this.ctx.fillRect(x, y, sz, sz);
          this.ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
          this.ctx.lineWidth = 1;
          this.ctx.strokeRect(x, y, sz, sz);

          this.ctx.save();
          this.ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
          this.ctx.lineWidth = 1.5;
          this.ctx.beginPath();
          this.ctx.moveTo(x + sz * 0.2, y + sz * 0.8);
          this.ctx.lineTo(x + sz * 0.8, y + sz * 0.2);
          this.ctx.stroke();
          if (sz >= 24) {
            this.ctx.fillStyle = 'rgba(148, 163, 184, 0.72)';
            this.ctx.font = `700 ${Math.max(10, sz * 0.34)}px "JetBrains Mono", Menlo, monospace`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('#', x + sz / 2, y + sz / 2);
          }
          this.ctx.restore();
          continue;
        }

        let sqColor = b.kind === 'grid' ? '#141414' : (isLight ? '#eeeed2' : '#769656');

        if (b.knightDistances) {
          const d = b.knightDistances[r][c];
          if (d === 0) sqColor = '#10b981';
          else if (d !== Infinity) {
            const alpha = Math.max(0.22, 0.78 - d * 0.08);
            sqColor = `rgba(21, 93, 252, ${alpha})`;
          }
        } else if (this.activeOverlay === 'manhattan' && b.selectedSquare) {
          const d = Math.abs(r - b.selectedSquare.r) + Math.abs(c - b.selectedSquare.c);
          sqColor = `rgba(99, 102, 241, ${0.15 + (d % 4) * 0.2})`;
        } else if (this.activeOverlay === 'chebyshev' && b.selectedSquare) {
          const d = Math.max(Math.abs(r - b.selectedSquare.r), Math.abs(c - b.selectedSquare.c));
          sqColor = `rgba(245, 158, 11, ${0.15 + (d % 3) * 0.25})`;
        } else if (this.activeOverlay === 'bipartite') {
          sqColor = isLight ? '#93c5fd' : '#fca5a5';
        }

        this.ctx.fillStyle = sqColor;
        this.ctx.fillRect(x, y, sz, sz);

        if (!b.knightDistances && this.activeOverlay === 'attack' && atkCounts) {
          const atk = atkCounts[r][c];
          if (atk > 0) {
            const alpha = Math.min(0.62, 0.22 + (atk - 1) * 0.14);
            this.ctx.fillStyle = `rgba(244, 63, 94, ${alpha})`;
            this.ctx.fillRect(x, y, sz, sz);
          } else if (!piece) {
            this.ctx.fillStyle = 'rgba(16, 185, 129, 0.22)';
            this.ctx.fillRect(x, y, sz, sz);
          }
        }

        this.ctx.strokeStyle = b.kind === 'grid' ? '#262626' : 'rgba(0, 0, 0, 0.08)';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x, y, sz, sz);

        if (conflicts?.has(`${r},${c}`) && (this.activeOverlay === 'attack' || b.nqueensSolutions.length > 0)) {
          this.ctx.save();
          this.ctx.strokeStyle = '#ef4444';
          this.ctx.lineWidth = 2.5;
          this.ctx.strokeRect(x + 2, y + 2, sz - 4, sz - 4);
          this.ctx.restore();
        }

        if (!b.knightDistances && this.activeOverlay === 'attack' && atkCounts) {
          const atk = atkCounts[r][c];
          if (atk >= 2 && sz >= 28) {
            this.ctx.fillStyle = 'rgba(159, 18, 57, 0.9)';
            this.ctx.font = `700 ${Math.max(8, Math.min(11, sz * 0.22))}px "JetBrains Mono", Menlo, monospace`;
            this.ctx.textAlign = 'right';
            this.ctx.textBaseline = 'top';
            this.ctx.fillText(`×${atk}`, x + sz - 4, y + 3);
          } else if (atk === 0 && !piece && sz >= 22) {
            this.ctx.fillStyle = 'rgba(5, 150, 105, 0.65)';
            this.ctx.beginPath();
            this.ctx.arc(x + sz / 2, y + sz / 2, Math.max(2.5, sz * 0.08), 0, Math.PI * 2);
            this.ctx.fill();
          }
        }

        if (piece && !b.knightDistances) {
          this.renderPieceGlyph(piece, x + sz / 2, y + sz / 2, sz, b.kind === 'grid');
        } else if (b.kind === 'grid' && !piece && !b.knightDistances) {
          const val = b.board[r][c].val !== undefined ? b.board[r][c].val : 0;
          const valStr = String(val);
          let vFont = Math.max(9, sz * 0.36);
          this.ctx.font = `600 ${vFont}px "JetBrains Mono", Menlo, monospace`;
          const maxW = sz * 0.84;
          const mw = this.ctx.measureText(valStr).width;
          if (mw > maxW && maxW > 0) {
            vFont = Math.max(7, vFont * (maxW / mw));
            this.ctx.font = `600 ${vFont}px "JetBrains Mono", Menlo, monospace`;
          }
          this.ctx.fillStyle = '#e5e7eb';
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';
          this.ctx.fillText(valStr, x + sz / 2, y + sz / 2);
        }

        if (b.knightDistances) {
          const d = b.knightDistances[r][c];
          const distFontSize = Math.max(11, Math.min(22, sz * 0.36));
          this.ctx.font = `700 ${distFontSize}px "JetBrains Mono", Menlo, monospace`;
          this.ctx.fillStyle = d === 0 ? '#ffffff' : (b.kind === 'grid' ? '#f5f5f5' : '#0f172a');
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';
          this.ctx.fillText(d !== Infinity ? d : '∞', x + sz / 2, y + sz / 2);
        } else if ((this.activeOverlay === 'manhattan' || this.activeOverlay === 'chebyshev') && b.selectedSquare && !piece && sz >= 24) {
          const d =
            this.activeOverlay === 'manhattan'
              ? Math.abs(r - b.selectedSquare.r) + Math.abs(c - b.selectedSquare.c)
              : Math.max(Math.abs(r - b.selectedSquare.r), Math.abs(c - b.selectedSquare.c));
          this.ctx.font = `600 ${Math.max(9, Math.min(14, sz * 0.26))}px "JetBrains Mono", Menlo, monospace`;
          this.ctx.fillStyle = '#0f172a';
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';
          this.ctx.fillText(d, x + sz / 2, y + sz / 2);
        }
      }
    }

    // 2. Knight's Tour Lines & Step Pills
    if (b.knightsTourMoves && b.knightsTourMoves.length > 1) {
      this.ctx.save();
      this.ctx.strokeStyle = '#ef4444';
      this.ctx.lineWidth = 2.5;
      this.ctx.beginPath();
      const first = b.knightsTourMoves[0];
      this.ctx.moveTo(first[1] * sz + sz / 2, first[0] * sz + sz / 2);
      for (let i = 1; i < b.knightsTourMoves.length; i++) {
        const m = b.knightsTourMoves[i];
        this.ctx.lineTo(m[1] * sz + sz / 2, m[0] * sz + sz / 2);
      }
      this.ctx.stroke();

      for (let i = 0; i < b.knightsTourMoves.length; i++) {
        const m = b.knightsTourMoves[i];
        const cx = m[1] * sz + sz / 2;
        const cy = m[0] * sz + sz / 2;
        this.ctx.fillStyle = i === 0 ? '#10b981' : i === b.knightsTourMoves.length - 1 ? '#ef4444' : '#1e293b';
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, Math.max(7, sz * 0.22), 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = `700 ${Math.max(8, sz * 0.2)}px "JetBrains Mono", Menlo, monospace`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(i + 1, cx, cy);
      }
      this.ctx.restore();
    }

    // 3. BFS Shortest Path Trace
    if (b.knightPath && b.knightPath.length > 1) {
      this.ctx.save();
      this.ctx.strokeStyle = '#2563eb';
      this.ctx.lineWidth = 3.5;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      this.ctx.beginPath();
      const first = b.knightPath[0];
      this.ctx.moveTo(first[1] * sz + sz / 2, first[0] * sz + sz / 2);
      for (let i = 1; i < b.knightPath.length; i++) {
        const p = b.knightPath[i];
        this.ctx.lineTo(p[1] * sz + sz / 2, p[0] * sz + sz / 2);
      }
      this.ctx.stroke();
      this.ctx.restore();
    }

    // 4. Selected & Hovered Square Highlights
    if (b.selectedSquare) {
      this.ctx.strokeStyle = '#f59e0b';
      this.ctx.lineWidth = 2.5;
      this.ctx.strokeRect(
        b.selectedSquare.c * sz + 1.5,
        b.selectedSquare.r * sz + 1.5,
        sz - 3,
        sz - 3
      );
    }

    if (this.hoverInfo && this.hoverInfo.boardIdx === boardIdx) {
      this.ctx.strokeStyle = '#3b82f6';
      this.ctx.lineWidth = 2.5;
      this.ctx.strokeRect(this.hoverInfo.c * sz, this.hoverInfo.r * sz, sz, sz);
    }

    // 5. Headers & Active Board Frame
    this.renderBoardHeaders(b, sz, isOneIdx, isActive, boardW, boardH);

    this.ctx.restore();
  }

  isDarkTheme() {
    return true;
  }

  renderBoardHeaderPill(b, isActive, boardW) {
    this.ctx.save();
    const { label, pillW, pillH, pillY } = this.getHeaderPillRect(b);
    this.ctx.font = '600 11px "JetBrains Mono", Menlo, monospace';

    this.ctx.fillStyle = isActive ? '#155dfc' : '#0a0a0a';
    this.ctx.strokeStyle = isActive ? '#3b82f6' : '#262626';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.roundRect?.(0, pillY, pillW, pillH, 6);
    if (!this.ctx.roundRect) {
      this.ctx.rect(0, pillY, pillW, pillH);
    }
    this.ctx.fill();
    this.ctx.stroke();

    this.ctx.fillStyle = isActive ? '#ffffff' : '#a1a1aa';
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(label, 10, pillY + pillH / 2);
    this.ctx.restore();
  }

  renderPieceGlyph(p, cx, cy, sz, onDarkGrid = false) {
    const glyphs = {
      N: '♞',
      Q: '♛',
      R: '♜',
      B: '♝',
      K: '♚',
      P: '♟'
    };
    const symbol = glyphs[p] || p;
    const pieceFontSize = Math.max(16, sz * 0.65);
    this.ctx.font = `${pieceFontSize}px "JetBrains Mono", sans-serif`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillStyle = onDarkGrid ? '#f5f5f5' : '#18181b';
    this.ctx.shadowColor = onDarkGrid ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.8)';
    this.ctx.shadowBlur = 3;
    this.ctx.fillText(symbol, cx, cy);
    this.ctx.shadowBlur = 0;
  }

  renderBoardHeaders(b, sz, isOneIdx, isActive, boardW, boardH) {
    const headerFontSize = Math.max(10, Math.min(13, sz * 0.26));
    this.ctx.font = `600 ${headerFontSize}px "JetBrains Mono", Menlo, monospace`;
    this.ctx.fillStyle = isActive ? '#d4d4d8' : '#71717a';

    const isRev = !!window.App?.isReversedIndex;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'bottom';
    for (let c = 0; c < b.cols; c++) {
      let label = window.App ? window.App.getDisplayCol(c, b.cols) : (isOneIdx ? c + 1 : c);
      if (b.kind !== 'grid' && b.rows <= 26 && b.cols <= 26 && !isOneIdx) {
        label = String.fromCharCode(97 + (isRev ? (b.cols - 1 - c) : c));
      }
      this.ctx.fillText(label, c * sz + sz / 2, -6);
    }

    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'middle';
    for (let r = 0; r < b.rows; r++) {
      let label = window.App ? window.App.getDisplayRow(r, b.rows) : (isOneIdx ? r + 1 : r);
      if (b.kind !== 'grid' && b.rows <= 26 && b.cols <= 26 && !isOneIdx) {
        label = isRev ? (r + 1) : (b.rows - r);
      }
      this.ctx.fillText(label, -9, r * sz + sz / 2);
    }

    this.ctx.strokeStyle = isActive && this.boards.length > 1 ? '#155dfc' : '#262626';
    this.ctx.lineWidth = isActive && this.boards.length > 1 ? 2.5 : 2;
    this.ctx.strokeRect(0, 0, boardW, boardH);
  }

  cancelAllActivities() {
    const hadActivity =
      this.boards.some(
        b =>
          b.knightStart ||
          b.knightDistances ||
          b.knightTarget ||
          b.knightPath ||
          b.knightsTourMoves ||
          b.nqueensSolutions?.length ||
          b.selectedSquare
      ) ||
      this.nqueensTimer ||
      this.activeOverlay !== 'none' ||
      this.isPanning ||
      this.isPainting ||
      this.isDraggingBoard;

    this.stopNQueensTimer();
    for (const b of this.boards) {
      this.clearSolverOverlays(false, b);
      b.selectedSquare = null;
    }
    this.isPanning = false;
    this.isPainting = false;
    this.isDraggingBoard = false;
    this.dragBoardIndex = -1;
    this.activeOverlay = 'none';
    const sel = document.getElementById('chess-overlay-select');
    if (sel) sel.value = 'none';
    this.syncOverlayButtons();
    this.render();
    this.saveState();
    if (hadActivity) {
      window.App?.showToast('Cancelled active chess overlays & paths', 'info');
    }
  }

  // ==========================================
  // PERSISTENCE (localStorage)
  // ==========================================

  saveState() {
    try {
      const state = {
        nextBoardNum: this.nextBoardNum,
        activeBoardIndex: this.activeBoardIndex,
        activePiece: this.activePiece,
        activeOverlay: this.activeOverlay,
        inputMode: this.inputMode,
        boards: this.boards.map(b => ({
          id: b.id,
          kind: b.kind || 'chess',
          name: b.name,
          rows: b.rows,
          cols: b.cols,
          offsetX: b.offsetX,
          offsetY: b.offsetY,
          inputText: b.inputText || '',
          board: b.board
        }))
      };
      localStorage.setItem('tracematrix_chess_state', JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to save chess state to localStorage', e);
    }
  }

  loadState() {
    try {
      const raw = localStorage.getItem('tracematrix_chess_state');
      if (!raw) return false;
      const state = JSON.parse(raw);
      if (!state) return false;

      if (Array.isArray(state.boards) && state.boards.length > 0) {
        this.boards = state.boards.map((sb, idx) => {
          const entry = this.createBoardEntry(
            sb.rows || 8,
            sb.cols || 8,
            sb.offsetX || 0,
            sb.offsetY || 0,
            sb.name || `Board ${idx + 1}`,
            sb.kind || 'chess'
          );
          if (sb.id) entry.id = sb.id;
          if (typeof sb.inputText === 'string') entry.inputText = sb.inputText;
          if (Array.isArray(sb.board)) entry.board = sb.board;
          return entry;
        });
        this.nextBoardNum = Math.max(
          state.nextBoardNum || 1,
          ...this.boards.map(b => (b.id || 0) + 1)
        );
        this.activeBoardIndex = Math.max(0, Math.min(this.boards.length - 1, state.activeBoardIndex || 0));
      } else if (Array.isArray(state.board) && state.rows && state.cols) {
        // Migrate legacy single-board save cleanly
        const entry = this.createBoardEntry(state.rows, state.cols, 0, 0, 'Board 1');
        entry.board = state.board;
        this.boards = [entry];
        this.activeBoardIndex = 0;
      } else {
        return false;
      }

      if (state.inputMode) {
        this.inputMode = state.inputMode === 'board' ? 'board' : 'auto';
        document.querySelectorAll('[data-chess-input-mode]').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.chessInputMode === this.inputMode);
        });
      }

      if (state.activePiece) {
        this.activePiece = state.activePiece;
        document.querySelectorAll('[data-piece]').forEach(b => {
          b.classList.toggle('active', b.dataset.piece === this.activePiece);
        });
      }

      if (state.activeOverlay) {
        this.activeOverlay = state.activeOverlay;
        const sel = document.getElementById('chess-overlay-select');
        if (sel) sel.value = this.activeOverlay;
        this.syncOverlayButtons();
      }

      this.syncBoardSelector();
      this.syncInputFromBoard();
      return true;
    } catch (e) {
      console.warn('Failed to load chess state from localStorage', e);
      return false;
    }
  }
}

window.ChessVisualizer = ChessVisualizer;
