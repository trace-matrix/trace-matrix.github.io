/**
 * TraceMatrix — Chess & Board Visualizer (ChessVisualizer)
 * Tournament-grade N x M Chessboard with Obstacles (#), Multi-Piece Shortest-Path BFS,
 * Live Attack & Safe-Square Coverage, N-Queens (obstacle-aware), Max Non-Attacking Rooks
 * (bipartite matching), Knight's Tour, Distance Overlays, Symmetry Transforms, and Undo/Redo.
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

    this.rows = 8;
    this.cols = 8;
    this.squareSize = 56;

    // Viewport transform
    this.panX = 40;
    this.panY = 40;
    this.zoom = 1.0;

    // Board state: 2D array of { piece: 'N'|'Q'|'R'|'B'|'K'|'P'|'#'|null, color: 'w'|'b' }
    this.board = [];

    // Undo / Redo stacks
    this.undoStack = [];
    this.redoStack = [];
    this.maxHistory = 40;

    // Active tool / piece / overlay
    this.activePiece = 'N';
    this.activeOverlay = 'none'; // 'none' | 'attack' | 'manhattan' | 'chebyshev' | 'bipartite'

    // Interaction state
    this.hoverSquare = null;
    this.selectedSquare = null;
    this.isPanning = false;
    this.isPainting = false;
    this.paintErase = false;
    this.lastPaintedKey = null;
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    this.needsInitialFit = false;

    // Shortest-Path BFS state (supports N, K, R, B, Q, P; single or multi-source)
    this.bfsPieceType = null;
    this.knightStart = null;
    this.bfsStarts = [];
    this.knightDistances = null;
    this.knightParents = null;
    this.knightTarget = null;
    this.knightPath = null;
    this.bfsReachableCount = null;
    this.bfsTraversableCount = null;

    // N-Queens solver state
    this.nqueensSolutions = [];
    this.nqueensIndex = 0;
    this.nqueensTimer = null;

    // Knight's Tour state
    this.knightsTourMoves = null;

    // Cached attack coverage (recomputed whenever board renders)
    this.attackStats = null;

    const loaded = this.loadState();
    if (!loaded) {
      this.initBoard(this.rows, this.cols);
    }

    this.initEventListeners();
    this.resizeCanvas();
    this.fitBoard();
  }

  // ==========================================
  // BOARD INITIALIZATION & UNDO/REDO
  // ==========================================

  cloneBoard(board = this.board) {
    return board.map(row => row.map(cell => ({ piece: cell.piece, color: cell.color || 'w' })));
  }

  pushUndo() {
    this.undoStack.push({
      rows: this.rows,
      cols: this.cols,
      board: this.cloneBoard(this.board)
    });
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
    this.redoStack.push({
      rows: this.rows,
      cols: this.cols,
      board: this.cloneBoard(this.board)
    });
    const prev = this.undoStack.pop();
    this.restoreSnapshot(prev);
    window.App?.showToast('Undid board change', 'info');
  }

  redo() {
    if (this.redoStack.length === 0) {
      window.App?.showToast('Nothing to redo', 'info');
      return;
    }
    this.undoStack.push({
      rows: this.rows,
      cols: this.cols,
      board: this.cloneBoard(this.board)
    });
    const next = this.redoStack.pop();
    this.restoreSnapshot(next);
    window.App?.showToast('Redid board change', 'info');
  }

  restoreSnapshot(snap) {
    this.rows = snap.rows;
    this.cols = snap.cols;
    this.board = this.cloneBoard(snap.board);
    this.clearSolverOverlays(false);
    this.syncDimensionInputs();
    this.render();
    this.saveState();
  }

  syncDimensionInputs() {
    const badge = document.getElementById('chess-dim-badge');
    if (badge) badge.textContent = `${this.rows} × ${this.cols}`;
    const rInput = document.getElementById('chess-rows');
    const cInput = document.getElementById('chess-cols');
    if (rInput) rInput.value = this.rows;
    if (cInput) cInput.value = this.cols;
  }

  clearSolverOverlays(stopTimer = true) {
    if (stopTimer && this.nqueensTimer) {
      clearInterval(this.nqueensTimer);
      this.nqueensTimer = null;
      const playBtn = document.getElementById('btn-nq-play');
      if (playBtn) playBtn.textContent = 'Auto';
    }
    this.bfsPieceType = null;
    this.knightStart = null;
    this.bfsStarts = [];
    this.knightDistances = null;
    this.knightParents = null;
    this.knightTarget = null;
    this.knightPath = null;
    this.bfsReachableCount = null;
    this.bfsTraversableCount = null;
    this.knightsTourMoves = null;
    this.nqueensSolutions = [];
    const browser = document.getElementById('nqueens-browser');
    if (browser) browser.classList.add('hidden');
  }

  initBoard(rows, cols) {
    this.rows = Math.max(1, Math.min(30, rows));
    this.cols = Math.max(1, Math.min(30, cols));
    this.board = Array.from({ length: this.rows }, () =>
      Array.from({ length: this.cols }, () => ({ piece: null, color: 'w' }))
    );
    this.selectedSquare = null;
    this.clearSolverOverlays();
    this.syncDimensionInputs();
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

  fitBoard() {
    if (!this.container) return;
    const rect = this.container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      this.needsInitialFit = true;
      return;
    }
    this.needsInitialFit = false;
    const totalW = this.cols * this.squareSize;
    const totalH = this.rows * this.squareSize;
    const pad = 60;
    const scaleX = (rect.width - pad * 2) / totalW;
    const scaleY = (rect.height - pad * 2) / totalH;
    this.zoom = Math.max(0.25, Math.min(1.8, Math.min(scaleX, scaleY) || 1.0));
    this.panX = Math.round((rect.width - totalW * this.zoom) / 2);
    this.panY = Math.round((rect.height - totalH * this.zoom) / 2);
    this.updateStatusPill();
    this.render();
  }

  resetView() {
    if (!this.container) return;
    this.zoom = 1.0;
    const rect = this.container.getBoundingClientRect();
    const totalW = this.cols * this.squareSize;
    const totalH = this.rows * this.squareSize;
    this.panX = Math.round((rect.width - totalW) / 2);
    this.panY = Math.round((rect.height - totalH) / 2);
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
      this.initBoard(r, c);
      this.fitBoard();
      this.saveState();
      window.App?.showToast(`Chessboard set to ${this.rows} × ${this.cols}`, 'info');
    });

    document.querySelectorAll('[data-chess-size]').forEach(btn => {
      btn.addEventListener('click', () => {
        const [r, c] = btn.dataset.chessSize.split('x').map(Number);
        this.pushUndo();
        this.initBoard(r, c);
        this.fitBoard();
        this.saveState();
        window.App?.showToast(`Chessboard set to ${r} × ${c}`, 'info');
      });
    });

    // Undo / Redo / Random Walls / Clear
    document.getElementById('btn-chess-undo')?.addEventListener('click', () => this.undo());
    document.getElementById('btn-chess-redo')?.addEventListener('click', () => this.redo());
    document.getElementById('btn-chess-rand-walls')?.addEventListener('click', () => this.generateRandomWalls());
    document.getElementById('btn-clear-chess')?.addEventListener('click', () => {
      this.pushUndo();
      this.initBoard(this.rows, this.cols);
      this.render();
      this.saveState();
      window.App?.showToast('Cleared board', 'info');
    });

    // Symmetry & Export
    document.getElementById('btn-chess-rotate')?.addEventListener('click', () => this.rotateBoard90());
    document.getElementById('btn-chess-flip')?.addEventListener('click', () => this.flipBoardH());
    document.getElementById('btn-copy-chess-coords')?.addEventListener('click', () => this.copyPieceCoords());

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

  screenToSquare(sx, sy) {
    const sz = this.squareSize * this.zoom;
    const col = Math.floor((sx - this.panX) / sz);
    const row = Math.floor((sy - this.panY) / sz);
    if (row >= 0 && row < this.rows && col >= 0 && col < this.cols) {
      return { r: row, c: col };
    }
    return null;
  }

  applyCellStroke(r, c, tool) {
    const cur = this.board[r][c].piece;
    const target = tool === 'erase' ? null : tool;
    if (cur === target) return false;
    this.board[r][c].piece = target;
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
    const sq = this.screenToSquare(e.clientX - rect.left, e.clientY - rect.top);

    if (!sq) {
      if (e.button === 0) {
        this.isPanning = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
      }
      return;
    }

    this.selectedSquare = sq;

    // Right-click always erases cell (with drag support)
    if (e.button === 2) {
      this.pushUndo();
      this.isPainting = true;
      this.paintErase = true;
      this.lastPaintedKey = `${sq.r},${sq.c}`;
      this.applyCellStroke(sq.r, sq.c, 'erase');
      this.render();
      this.saveState();
      return;
    }

    if (e.button !== 0) return;

    // In active BFS mode, clicking a square traces shortest path to it
    if (this.knightDistances && this.bfsStarts.length > 0 && this.activePiece !== '#' && this.activePiece !== 'erase') {
      this.traceKnightPath(sq.r, sq.c);
      this.render();
      return;
    }

    // Select / Inspect mode never mutates the board
    if (this.activePiece === 'select') {
      this.render();
      return;
    }

    this.pushUndo();
    if (this.activePiece === '#' || this.activePiece === 'erase') {
      this.isPainting = true;
      this.paintErase = this.activePiece === 'erase';
      this.lastPaintedKey = `${sq.r},${sq.c}`;
      this.applyCellStroke(sq.r, sq.c, this.activePiece);
    } else {
      const cur = this.board[sq.r][sq.c].piece;
      this.board[sq.r][sq.c].piece = cur === this.activePiece ? null : this.activePiece;
    }

    // Clear stale solver paths on manual board edit (keep activeOverlay such as attack map live)
    this.clearSolverOverlays();
    this.render();
    this.saveState();
  }

  handleMouseMove(e) {
    if (!this.container) return;
    const rect = this.container.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (this.isPanning) {
      this.panX += e.clientX - this.lastMouseX;
      this.panY += e.clientY - this.lastMouseY;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.render();
      return;
    }

    const sq = this.screenToSquare(sx, sy);
    this.hoverSquare = sq;

    if (this.isPainting && sq) {
      const key = `${sq.r},${sq.c}`;
      if (key !== this.lastPaintedKey) {
        this.lastPaintedKey = key;
        const tool = this.paintErase ? 'erase' : '#';
        if (this.applyCellStroke(sq.r, sq.c, tool)) {
          this.clearSolverOverlays();
        }
      }
    }

    this.updateStatusPill();
    this.render();
  }

  handleMouseUp() {
    if (this.isPainting) {
      this.isPainting = false;
      this.paintErase = false;
      this.lastPaintedKey = null;
      this.saveState();
    }
    this.isPanning = false;
  }

  // ==========================================
  // NOTATION, STATUS & INSPECTOR
  // ==========================================

  getSquareNotation(r, c) {
    const isOneIdx = window.App?.isOneIndexed;
    if (this.rows <= 26 && this.cols <= 26 && !isOneIdx) {
      const file = String.fromCharCode(97 + c);
      const rank = this.rows - r;
      return `${file}${rank}`;
    }
    const rDisp = isOneIdx ? r + 1 : r;
    const cDisp = isOneIdx ? c + 1 : c;
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

    if (!this.hoverSquare) {
      if (statusSq) statusSq.textContent = 'Square: -';
      if (statusInfo) statusInfo.textContent = 'Piece: None';
      return;
    }

    const { r, c } = this.hoverSquare;
    const notation = this.getSquareNotation(r, c);
    const piece = this.board[r]?.[c]?.piece || null;
    const isLight = (r + c) % 2 === 0;

    if (statusSq) statusSq.textContent = `Square: ${notation} [${isLight ? 'Light' : 'Dark'}]`;
    if (statusInfo) {
      const parts = [piece ? this.getPieceName(piece) : 'Empty'];
      const atkCount = this.attackStats?.counts?.[r]?.[c] || 0;
      if (atkCount > 0 && piece !== '#') {
        parts.push(`Attacked ×${atkCount}`);
      }
      if (this.knightDistances) {
        const d = this.knightDistances[r][c];
        parts.push(`${this.bfsPieceType || 'N'} Moves: ${d !== Infinity ? d : '∞'}`);
      }
      statusInfo.textContent = parts.join(' | ');
    }
  }

  updateInspector() {
    const stats = this.attackStats;
    const countsEl = document.getElementById('chess-stat-counts');
    const attackEl = document.getElementById('chess-stat-attack');
    const bfsEl = document.getElementById('chess-stat-bfs');
    const pathEl = document.getElementById('chess-stat-path');

    if (countsEl && stats) {
      countsEl.textContent = `${stats.pieceCount} / ${stats.wallCount}`;
    }
    if (attackEl && stats) {
      attackEl.textContent = `${stats.attackedSquares} / ${stats.safeSquares}`;
    }
    if (bfsEl) {
      if (this.knightDistances && this.bfsReachableCount !== null) {
        bfsEl.textContent = `${this.bfsReachableCount} / ${this.bfsTraversableCount}`;
      } else {
        bfsEl.textContent = '-';
      }
    }
    if (pathEl) {
      if (this.knightPath && this.knightPath.length >= 1) {
        const moves = this.knightPath.length - 1;
        const start = this.knightPath[0];
        const end = this.knightPath[this.knightPath.length - 1];
        pathEl.textContent = `${moves} (${this.getSquareNotation(start[0], start[1])}→${this.getSquareNotation(end[0], end[1])})`;
      } else {
        pathEl.textContent = '-';
      }
    }
  }

  // ==========================================
  // ATTACK & REACHABILITY ENGINE
  // ==========================================

  /**
   * Computes which squares are attacked by all placed pieces on the board.
   * Walls (#) stop sliding rays and are excluded from attacked/safe counts.
   * Any placed piece on a ray receives an attack increment and blocks the ray past it.
   */
  computeAttackMap() {
    const counts = Array.from({ length: this.rows }, () => Array(this.cols).fill(0));
    let pieceCount = 0;
    let wallCount = 0;

    const addRayAttacks = (sr, sc, dirs) => {
      for (const [dr, dc] of dirs) {
        let nr = sr + dr;
        let nc = sc + dc;
        while (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
          const target = this.board[nr][nc].piece;
          if (target === '#') break;
          counts[nr][nc]++;
          if (target) break; // Piece absorbs ray and blocks cells behind it
          nr += dr;
          nc += dc;
        }
      }
    };

    const addStepAttacks = (sr, sc, dirs) => {
      for (const [dr, dc] of dirs) {
        const nr = sr + dr;
        const nc = sc + dc;
        if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
          if (this.board[nr][nc].piece !== '#') {
            counts[nr][nc]++;
          }
        }
      }
    };

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const p = this.board[r][c].piece;
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

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const p = this.board[r][c].piece;
        if (p === '#') continue;
        if (p && counts[r][c] > 0) {
          conflicts.add(`${r},${c}`);
        }
        if (counts[r][c] > 0 && !p) {
          attackedSquares++;
        } else if (p && counts[r][c] > 0) {
          attackedSquares++;
        } else if (!p && counts[r][c] === 0) {
          safeSquares++;
        }
      }
    }

    this.attackStats = { counts, attackedSquares, safeSquares, conflicts, pieceCount, wallCount };
    return this.attackStats;
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
        `Attack Map: ${s.attackedSquares} attacked, ${s.safeSquares} safe squares${s.conflicts.size ? ` (${s.conflicts.size} conflicts!)` : ''}`,
        s.conflicts.size > 0 ? 'info' : 'success'
      );
    }
  }

  syncOverlayButtons() {
    const atkBtn = document.getElementById('btn-attack-map');
    if (atkBtn) {
      atkBtn.classList.toggle('active', this.activeOverlay === 'attack');
    }
  }

  // ==========================================
  // GENERALIZED PIECE SHORTEST-PATH BFS
  // ==========================================

  findFirstNonWallSquare() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.board[r][c].piece !== '#') return { r, c };
      }
    }
    return null;
  }

  resolveBFSSources() {
    // Priority 1: currently selected square has a movable piece
    if (this.selectedSquare) {
      const selPiece = this.board[this.selectedSquare.r]?.[this.selectedSquare.c]?.piece;
      if (MOVABLE_PIECES.has(selPiece)) {
        return { pieceType: selPiece, starts: [{ ...this.selectedSquare }] };
      }
    }

    // Priority 2: all placed pieces matching activePiece tool (if it is a chess piece)
    if (MOVABLE_PIECES.has(this.activePiece)) {
      const matching = [];
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          if (this.board[r][c].piece === this.activePiece) {
            matching.push({ r, c });
          }
        }
      }
      if (matching.length > 0) {
        return { pieceType: this.activePiece, starts: matching };
      }
    }

    // Priority 3: first piece type found anywhere on the board (multi-source for that type)
    let firstPiece = null;
    for (let r = 0; r < this.rows && !firstPiece; r++) {
      for (let c = 0; c < this.cols && !firstPiece; c++) {
        if (MOVABLE_PIECES.has(this.board[r][c].piece)) {
          firstPiece = this.board[r][c].piece;
        }
      }
    }
    if (firstPiece) {
      const starts = [];
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          if (this.board[r][c].piece === firstPiece) starts.push({ r, c });
        }
      }
      return { pieceType: firstPiece, starts };
    }

    // Priority 4: empty board — place active piece (or Knight) at first non-wall square
    const chosen = MOVABLE_PIECES.has(this.activePiece) ? this.activePiece : 'N';
    const startSq =
      this.selectedSquare && this.board[this.selectedSquare.r]?.[this.selectedSquare.c]?.piece !== '#'
        ? { ...this.selectedSquare }
        : this.findFirstNonWallSquare();

    if (!startSq) return null;
    this.pushUndo();
    this.board[startSq.r][startSq.c].piece = chosen;
    this.saveState();
    return { pieceType: chosen, starts: [startSq] };
  }

  triggerKnightBFS() {
    const resolved = this.resolveBFSSources();
    if (!resolved) {
      window.App?.showToast('No non-wall square available for BFS', 'error');
      return;
    }

    this.bfsPieceType = resolved.pieceType;
    this.bfsStarts = resolved.starts;
    this.knightStart = resolved.starts[0];
    this.knightPath = null;
    this.knightTarget = null;
    this.knightsTourMoves = null;

    this.computePieceBFS(resolved.starts, resolved.pieceType);
    this.render();

    const originLabel =
      resolved.starts.length === 1
        ? this.getSquareNotation(resolved.starts[0].r, resolved.starts[0].c)
        : `${resolved.starts.length} sources`;
    window.App?.showToast(
      `${this.getPieceName(resolved.pieceType)} BFS from ${originLabel}: ${this.bfsReachableCount}/${this.bfsTraversableCount} reachable. Click any cell for path!`,
      'success'
    );
  }

  /**
   * Computes single- or multi-source minimum-move distances on the current board for pieceType.
   * Respects '#' walls (blocked for landing and for sliding rays; Knights jump over walls cleanly).
   */
  computePieceBFS(starts, pieceType = 'N') {
    const dist = Array.from({ length: this.rows }, () => Array(this.cols).fill(Infinity));
    const parents = Array.from({ length: this.rows }, () => Array(this.cols).fill(null));
    const queue = [];

    for (const s of starts) {
      if (this.board[s.r]?.[s.c]?.piece === '#') continue;
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
          if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) continue;
          if (this.board[nr][nc].piece === '#') continue;
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
          while (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
            const cellPiece = this.board[nr][nc].piece;
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
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.board[r][c].piece === '#') continue;
        traversable++;
        if (dist[r][c] !== Infinity) reachable++;
      }
    }

    this.knightDistances = dist;
    this.knightParents = parents;
    this.bfsReachableCount = reachable;
    this.bfsTraversableCount = traversable;
    return dist;
  }

  computeKnightBFS(sr, sc) {
    this.bfsPieceType = 'N';
    this.knightStart = { r: sr, c: sc };
    this.bfsStarts = [{ r: sr, c: sc }];
    return this.computePieceBFS(this.bfsStarts, 'N');
  }

  traceKnightPath(tr, tc) {
    if (!this.knightParents || !this.knightDistances) return;
    if (this.board[tr]?.[tc]?.piece === '#') {
      window.App?.showToast('Blocked wall (#) is unreachable!', 'error');
      return;
    }
    if (this.knightDistances[tr][tc] === Infinity) {
      window.App?.showToast(`Square ${this.getSquareNotation(tr, tc)} is unreachable!`, 'error');
      return;
    }

    const path = [];
    let curr = [tr, tc];
    while (curr) {
      path.push(curr);
      curr = this.knightParents[curr[0]][curr[1]];
    }
    path.reverse();
    this.knightTarget = { r: tr, c: tc };
    this.knightPath = path;
    const moves = path.length - 1;
    const pieceLabel = this.getPieceName(this.bfsPieceType || 'N');
    window.App?.showToast(`${pieceLabel} shortest path: ${moves} move${moves !== 1 ? 's' : ''}`, 'info');
  }

  // ==========================================
  // N-QUEENS & N-ROOKS (WITH WALL SUPPORT)
  // ==========================================

  solveNQueens() {
    if (this.rows !== this.cols) {
      this.pushUndo();
      window.App?.showToast('N-Queens requires a square board (N × N). Setting to 8×8', 'info');
      this.initBoard(8, 8);
      this.fitBoard();
    }

    const N = this.rows;
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
        if (this.board[row][col].piece === '#') continue;
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

    this.clearSolverOverlays();
    this.nqueensSolutions = solutions;
    this.nqueensIndex = 0;

    const browser = document.getElementById('nqueens-browser');
    const counter = document.getElementById('nqueens-solution-counter');
    if (browser) browser.classList.remove('hidden');

    if (solutions.length > 0) {
      this.pushUndo();
      if (counter) counter.textContent = `1 / ${solutions.length}`;
      this.applyNQueensSolution(0);
      window.App?.showToast(`Found ${solutions.length} solution${solutions.length !== 1 ? 's' : ''} for ${N}-Queens!`, 'success');
    } else {
      if (counter) counter.textContent = '0 solutions';
      window.App?.showToast(`No valid ${N}-Queens placement avoids the current walls (#).`, 'info');
    }
    this.render();
  }

  applyNQueensSolution(idx) {
    if (!this.nqueensSolutions || this.nqueensSolutions.length === 0) return;
    this.nqueensIndex = (idx + this.nqueensSolutions.length) % this.nqueensSolutions.length;
    const sol = this.nqueensSolutions[this.nqueensIndex];

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.board[r][c].piece !== '#') {
          this.board[r][c].piece = null;
        }
      }
    }
    for (let r = 0; r < this.rows; r++) {
      this.board[r][sol[r]].piece = 'Q';
    }

    const counter = document.getElementById('nqueens-solution-counter');
    if (counter) counter.textContent = `${this.nqueensIndex + 1} / ${this.nqueensSolutions.length}`;
    this.render();
    this.saveState();
  }

  navNQueens(dir) {
    this.applyNQueensSolution(this.nqueensIndex + dir);
  }

  toggleNQueensPlay() {
    const playBtn = document.getElementById('btn-nq-play');
    if (this.nqueensTimer) {
      clearInterval(this.nqueensTimer);
      this.nqueensTimer = null;
      if (playBtn) playBtn.textContent = 'Auto';
    } else {
      if (playBtn) playBtn.textContent = 'Pause';
      this.nqueensTimer = setInterval(() => this.navNQueens(1), 700);
    }
  }

  /**
   * Places the maximum number of mutually non-attacking Rooks on the N x M board
   * respecting '#' walls via Row-Segment x Col-Segment Bipartite Matching (Kuhn's algorithm).
   */
  solveNRooks() {
    this.pushUndo();
    this.clearSolverOverlays();

    const rowSeg = Array.from({ length: this.rows }, () => Array(this.cols).fill(-1));
    const colSeg = Array.from({ length: this.rows }, () => Array(this.cols).fill(-1));
    let numRowSegs = 0;
    let numColSegs = 0;

    for (let r = 0; r < this.rows; r++) {
      let inSeg = false;
      for (let c = 0; c < this.cols; c++) {
        if (this.board[r][c].piece === '#') {
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

    for (let c = 0; c < this.cols; c++) {
      let inSeg = false;
      for (let r = 0; r < this.rows; r++) {
        if (this.board[r][c].piece === '#') {
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

    // Build bipartite adjacency list: rowSeg -> [{ colSeg, r, c }]
    const adj = Array.from({ length: numRowSegs }, () => []);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.board[r][c].piece !== '#') {
          adj[rowSeg[r][c]].push({ cs: colSeg[r][c], r, c });
          this.board[r][c].piece = null;
        }
      }
    }

    const matchCol = Array(numColSegs).fill(null); // stores { rs, r, c }
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
      const visited = Array(numColSegs).fill(false);
      dfs(u, visited);
    }

    let placed = 0;
    for (const m of matchCol) {
      if (m) {
        this.board[m.r][m.c].piece = 'R';
        placed++;
      }
    }

    this.render();
    this.saveState();
    window.App?.showToast(`Placed ${placed} max non-attacking Rook${placed !== 1 ? 's' : ''} (bipartite matching)`, 'success');
  }

  // ==========================================
  // KNIGHT'S TOUR (WARNSDORFF + WALL SUPPORT)
  // ==========================================

  solveKnightsTour() {
    this.clearSolverOverlays();
    const N = this.rows;
    const M = this.cols;
    const visited = Array.from({ length: N }, () => Array(M).fill(0));
    let traversable = 0;

    for (let r = 0; r < N; r++) {
      for (let c = 0; c < M; c++) {
        if (this.board[r][c].piece === '#') {
          visited[r][c] = -1;
        } else {
          traversable++;
        }
      }
    }

    if (traversable === 0) {
      window.App?.showToast('No traversable squares for Knight\'s Tour!', 'error');
      return;
    }

    let start = null;
    if (this.selectedSquare && visited[this.selectedSquare.r]?.[this.selectedSquare.c] === 0) {
      start = this.selectedSquare;
    } else {
      for (let r = 0; r < N && !start; r++) {
        for (let c = 0; c < M && !start; c++) {
          if (this.board[r][c].piece === 'N') start = { r, c };
        }
      }
      if (!start) start = this.findFirstNonWallSquare();
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

    this.knightsTourMoves = moves;
    const reached = moves.length;
    let isClosed = false;
    if (reached === traversable && reached > 1) {
      const [sr, sc] = moves[0];
      const [er, ec] = moves[reached - 1];
      isClosed = KNIGHT_DIRS.some(([dr, dc]) => er + dr === sr && ec + dc === sc);
    }

    const tourType = reached === traversable ? (isClosed ? 'Closed Tour!' : 'Open Tour') : 'Partial';
    window.App?.showToast(
      `Knight's Tour (${tourType}): visited ${reached} / ${traversable} squares`,
      reached === traversable ? 'success' : 'info'
    );
    this.render();
  }

  // ==========================================
  // BOARD TRANSFORMS, OBSTACLES & EXPORT
  // ==========================================

  generateRandomWalls() {
    this.pushUndo();
    this.clearSolverOverlays();
    let placed = 0;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.board[r][c].piece === '#') {
          this.board[r][c].piece = null;
        }
        if (!this.board[r][c].piece && Math.random() < 0.2) {
          this.board[r][c].piece = '#';
          placed++;
        }
      }
    }
    this.render();
    this.saveState();
    window.App?.showToast(`Generated ${placed} wall obstacle${placed !== 1 ? 's' : ''} (#)`, 'info');
  }

  rotateBoard90() {
    this.pushUndo();
    this.clearSolverOverlays();
    const newRows = this.cols;
    const newCols = this.rows;
    const next = Array.from({ length: newRows }, (_, nr) =>
      Array.from({ length: newCols }, (_, nc) => ({
        piece: this.board[this.rows - 1 - nc][nr].piece,
        color: this.board[this.rows - 1 - nc][nr].color || 'w'
      }))
    );
    this.rows = newRows;
    this.cols = newCols;
    this.board = next;
    this.selectedSquare = null;
    this.syncDimensionInputs();
    this.fitBoard();
    this.saveState();
    window.App?.showToast('Rotated board 90° clockwise', 'info');
  }

  flipBoardH() {
    this.pushUndo();
    this.clearSolverOverlays();
    for (let r = 0; r < this.rows; r++) {
      this.board[r].reverse();
    }
    this.selectedSquare = null;
    this.render();
    this.saveState();
    window.App?.showToast('Flipped board horizontally', 'info');
  }

  copyPieceCoords() {
    let gridStr = `${this.rows} ${this.cols}\n`;
    const pieceLines = [];
    for (let r = 0; r < this.rows; r++) {
      let rowStr = '';
      for (let c = 0; c < this.cols; c++) {
        const p = this.board[r][c].piece;
        rowStr += p || '.';
        if (p && p !== '#') {
          pieceLines.push(`${p} at ${this.getSquareNotation(r, c)} (r:${r}, c:${c})`);
        }
      }
      gridStr += `${rowStr}\n`;
    }
    if (pieceLines.length > 0) {
      gridStr += `\n# Pieces:\n${pieceLines.join('\n')}`;
    }
    navigator.clipboard?.writeText(gridStr.trimEnd()).then(() => {
      window.App?.showToast(`Copied ${this.rows}×${this.cols} board matrix & pieces!`, 'success');
    });
  }

  // ==========================================
  // RENDERING (Clean Tournament Chessboard)
  // ==========================================

  render() {
    if (!this.ctx || !this.container) return;
    const rect = this.container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    this.computeAttackMap();
    this.updateInspector();
    this.updateStatusPill();

    this.ctx.clearRect(0, 0, rect.width, rect.height);

    const sz = this.squareSize * this.zoom;
    const isOneIdx = window.App?.isOneIndexed;
    const atkCounts = this.attackStats?.counts;
    const conflicts = this.attackStats?.conflicts;

    this.ctx.save();
    this.ctx.translate(this.panX, this.panY);

    // 1. Draw Checkerboard Squares, Obstacles (#), Overlays, Pieces & BFS Distances
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = c * sz;
        const y = r * sz;
        const isLight = (r + c) % 2 === 0;
        const piece = this.board[r][c].piece;

        if (piece === '#') {
          // Wall / Blocked square
          this.ctx.fillStyle = '#1e293b';
          this.ctx.fillRect(x, y, sz, sz);
          this.ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
          this.ctx.lineWidth = 1;
          this.ctx.strokeRect(x, y, sz, sz);

          // Subtle diagonal hatch inside wall
          this.ctx.save();
          this.ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
          this.ctx.lineWidth = 1.5;
          this.ctx.beginPath();
          this.ctx.moveTo(x + sz * 0.22, y + sz * 0.78);
          this.ctx.lineTo(x + sz * 0.78, y + sz * 0.22);
          this.ctx.stroke();
          this.ctx.restore();
          continue;
        }

        let sqColor = isLight ? '#eeeed2' : '#769656';

        if (this.knightDistances) {
          const d = this.knightDistances[r][c];
          if (d === 0) {
            sqColor = '#10b981';
          } else if (d !== Infinity) {
            const alpha = Math.max(0.22, 0.78 - d * 0.08);
            sqColor = `rgba(14, 165, 233, ${alpha})`;
          }
        } else if (this.activeOverlay === 'manhattan' && this.selectedSquare) {
          const d = Math.abs(r - this.selectedSquare.r) + Math.abs(c - this.selectedSquare.c);
          sqColor = `rgba(99, 102, 241, ${0.15 + (d % 4) * 0.2})`;
        } else if (this.activeOverlay === 'chebyshev' && this.selectedSquare) {
          const d = Math.max(Math.abs(r - this.selectedSquare.r), Math.abs(c - this.selectedSquare.c));
          sqColor = `rgba(245, 158, 11, ${0.15 + (d % 3) * 0.25})`;
        } else if (this.activeOverlay === 'bipartite') {
          sqColor = isLight ? '#93c5fd' : '#fca5a5';
        }

        this.ctx.fillStyle = sqColor;
        this.ctx.fillRect(x, y, sz, sz);

        // Attack & Safe overlay shading (stacks cleanly even atop board colors)
        if (!this.knightDistances && this.activeOverlay === 'attack' && atkCounts) {
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

        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x, y, sz, sz);

        // Piece conflict outline (piece under attack by another piece)
        if (conflicts?.has(`${r},${c}`) && (this.activeOverlay === 'attack' || this.nqueensSolutions.length > 0)) {
          this.ctx.save();
          this.ctx.strokeStyle = '#ef4444';
          this.ctx.lineWidth = 2.5;
          this.ctx.strokeRect(x + 2, y + 2, sz - 4, sz - 4);
          this.ctx.restore();
        }

        // Attack multiplicity badge in corner when attacked >= 2 times (or safe dot)
        if (!this.knightDistances && this.activeOverlay === 'attack' && atkCounts) {
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

        // Draw Piece Symbol
        if (piece && !this.knightDistances) {
          this.renderPieceGlyph(piece, x + sz / 2, y + sz / 2, sz);
        }

        // Distance numbers (BFS or Manhattan/Chebyshev when square selected)
        if (this.knightDistances) {
          const d = this.knightDistances[r][c];
          const distFontSize = Math.max(11, Math.min(22, sz * 0.36));
          this.ctx.font = `700 ${distFontSize}px "JetBrains Mono", Menlo, monospace`;
          this.ctx.fillStyle = d === 0 ? '#ffffff' : '#0f172a';
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';
          this.ctx.fillText(d !== Infinity ? d : '∞', x + sz / 2, y + sz / 2);
        } else if ((this.activeOverlay === 'manhattan' || this.activeOverlay === 'chebyshev') && this.selectedSquare && !piece && sz >= 24) {
          const d =
            this.activeOverlay === 'manhattan'
              ? Math.abs(r - this.selectedSquare.r) + Math.abs(c - this.selectedSquare.c)
              : Math.max(Math.abs(r - this.selectedSquare.r), Math.abs(c - this.selectedSquare.c));
          this.ctx.font = `600 ${Math.max(9, Math.min(14, sz * 0.26))}px "JetBrains Mono", Menlo, monospace`;
          this.ctx.fillStyle = '#0f172a';
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';
          this.ctx.fillText(d, x + sz / 2, y + sz / 2);
        }
      }
    }

    // 2. Knight's Tour Lines & Step Pills
    if (this.knightsTourMoves && this.knightsTourMoves.length > 1) {
      this.ctx.save();
      this.ctx.strokeStyle = '#ef4444';
      this.ctx.lineWidth = 2.5;
      this.ctx.beginPath();
      const first = this.knightsTourMoves[0];
      this.ctx.moveTo(first[1] * sz + sz / 2, first[0] * sz + sz / 2);
      for (let i = 1; i < this.knightsTourMoves.length; i++) {
        const m = this.knightsTourMoves[i];
        this.ctx.lineTo(m[1] * sz + sz / 2, m[0] * sz + sz / 2);
      }
      this.ctx.stroke();

      for (let i = 0; i < this.knightsTourMoves.length; i++) {
        const m = this.knightsTourMoves[i];
        const cx = m[1] * sz + sz / 2;
        const cy = m[0] * sz + sz / 2;
        this.ctx.fillStyle = i === 0 ? '#10b981' : i === this.knightsTourMoves.length - 1 ? '#ef4444' : '#1e293b';
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
    if (this.knightPath && this.knightPath.length > 1) {
      this.ctx.save();
      this.ctx.strokeStyle = '#2563eb';
      this.ctx.lineWidth = 3.5;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      this.ctx.beginPath();
      const first = this.knightPath[0];
      this.ctx.moveTo(first[1] * sz + sz / 2, first[0] * sz + sz / 2);
      for (let i = 1; i < this.knightPath.length; i++) {
        const p = this.knightPath[i];
        this.ctx.lineTo(p[1] * sz + sz / 2, p[0] * sz + sz / 2);
      }
      this.ctx.stroke();
      this.ctx.restore();
    }

    // 4. Selected & Hovered Square Borders
    if (this.selectedSquare) {
      this.ctx.strokeStyle = '#f59e0b';
      this.ctx.lineWidth = 2.5;
      this.ctx.strokeRect(
        this.selectedSquare.c * sz + 1.5,
        this.selectedSquare.r * sz + 1.5,
        sz - 3,
        sz - 3
      );
    }

    if (this.hoverSquare) {
      this.ctx.strokeStyle = '#38bdf8';
      this.ctx.lineWidth = 2.5;
      this.ctx.strokeRect(this.hoverSquare.c * sz, this.hoverSquare.r * sz, sz, sz);
    }

    // 5. Outer Board Border & Rank/File Headers
    this.renderBoardHeaders(sz, isOneIdx);

    this.ctx.restore();
  }

  renderPieceGlyph(p, cx, cy, sz) {
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
    this.ctx.font = `${pieceFontSize}px sans-serif`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillStyle = '#18181b';
    this.ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
    this.ctx.shadowBlur = 3;
    this.ctx.fillText(symbol, cx, cy);
    this.ctx.shadowBlur = 0;
  }

  renderBoardHeaders(sz, isOneIdx) {
    const headerFontSize = Math.max(10, Math.min(13, sz * 0.26));
    this.ctx.font = `600 ${headerFontSize}px "JetBrains Mono", Menlo, monospace`;
    this.ctx.fillStyle = '#94a3b8';

    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'bottom';
    for (let c = 0; c < this.cols; c++) {
      let label = isOneIdx ? c + 1 : c;
      if (this.rows <= 26 && this.cols <= 26 && !isOneIdx) {
        label = String.fromCharCode(97 + c);
      }
      this.ctx.fillText(label, c * sz + sz / 2, -8);
    }

    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'middle';
    for (let r = 0; r < this.rows; r++) {
      let label = isOneIdx ? r + 1 : r;
      if (this.rows <= 26 && this.cols <= 26 && !isOneIdx) {
        label = this.rows - r;
      }
      this.ctx.fillText(label, -10, r * sz + sz / 2);
    }

    this.ctx.strokeStyle = '#475569';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(0, 0, this.cols * sz, this.rows * sz);
  }

  cancelAllActivities() {
    const hadActivity = !!(
      this.knightStart ||
      this.knightDistances ||
      this.knightTarget ||
      this.knightPath ||
      this.knightsTourMoves ||
      this.nqueensSolutions?.length ||
      this.nqueensTimer ||
      this.selectedSquare ||
      this.activeOverlay !== 'none' ||
      this.isPanning ||
      this.isPainting
    );
    this.clearSolverOverlays();
    this.selectedSquare = null;
    this.isPanning = false;
    this.isPainting = false;
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
        rows: this.rows,
        cols: this.cols,
        board: this.board,
        activePiece: this.activePiece,
        activeOverlay: this.activeOverlay
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
      if (!state || !Array.isArray(state.board) || !state.rows || !state.cols) return false;

      this.rows = state.rows;
      this.cols = state.cols;
      this.board = state.board;

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

      this.syncDimensionInputs();
      return true;
    } catch (e) {
      console.warn('Failed to load chess state from localStorage', e);
      return false;
    }
  }
}

window.ChessVisualizer = ChessVisualizer;
