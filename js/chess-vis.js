/**
 * TraceMatrix — Chess & Board Visualizer (ChessVis)
 * Tournament-grade N x M Chessboard, Knight Moves BFS Reachability, N-Queens Backtracking, and Distance Overlays.
 */

class ChessVisualizer {
  constructor() {
    this.canvas = document.getElementById('chess-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.container = document.getElementById('chess-canvas-container');

    this.rows = 8;
    this.cols = 8;
    this.squareSize = 56;

    // Viewport transform
    this.panX = 40;
    this.panY = 40;
    this.zoom = 1.0;

    // Board state: 2D array of { piece: 'N'|'Q'|'R'|'B'|'K'|'P'|null, color: 'w'|'b' }
    this.board = [];
    this.initBoard(this.rows, this.cols);

    // Active tool / piece
    this.activePiece = 'N'; // default Knight
    this.activeOverlay = 'none'; // 'none', 'attack', 'manhattan', 'chebyshev', 'bipartite'

    // Interaction state
    this.hoverSquare = null;
    this.selectedSquare = null;
    this.isPanning = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;

    // Knight BFS state
    this.knightStart = null;
    this.knightDistances = null;
    this.knightTarget = null;
    this.knightPath = null;

    // N-Queens solver state
    this.nqueensSolutions = [];
    this.nqueensIndex = 0;
    this.nqueensTimer = null;

    // Knight's Tour state
    this.knightsTourMoves = null;

    this.initEventListeners();
    this.resizeCanvas();
    this.fitBoard();
  }

  initBoard(rows, cols) {
    this.rows = Math.max(1, Math.min(30, rows));
    this.cols = Math.max(1, Math.min(30, cols));
    this.board = Array.from({ length: this.rows }, () =>
      Array.from({ length: this.cols }, () => ({ piece: null, color: 'w' }))
    );
    this.knightDistances = null;
    this.knightPath = null;
    this.knightsTourMoves = null;
    this.nqueensSolutions = [];

    const badge = document.getElementById('chess-dim-badge');
    if (badge) badge.textContent = `${this.rows} × ${this.cols}`;
    const rInput = document.getElementById('chess-rows');
    const cInput = document.getElementById('chess-cols');
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

  fitBoard() {
    const rect = this.container.getBoundingClientRect();
    const totalW = this.cols * this.squareSize;
    const totalH = this.rows * this.squareSize;
    const pad = 60;
    const scaleX = (rect.width - pad * 2) / totalW;
    const scaleY = (rect.height - pad * 2) / totalH;
    this.zoom = Math.max(0.3, Math.min(1.8, Math.min(scaleX, scaleY)));
    this.panX = Math.round((rect.width - totalW * this.zoom) / 2);
    this.panY = Math.round((rect.height - totalH * this.zoom) / 2);
    this.updateStatusPill();
    this.render();
  }

  resetView() {
    this.zoom = 1.0;
    const rect = this.container.getBoundingClientRect();
    const totalW = this.cols * this.squareSize;
    const totalH = this.rows * this.squareSize;
    this.panX = Math.round((rect.width - totalW) / 2);
    this.panY = Math.round((rect.height - totalH) / 2);
    this.updateStatusPill();
    this.render();
  }

  initEventListeners() {
    window.addEventListener('resize', () => this.resizeCanvas());

    // Piece Selector
    document.querySelectorAll('[data-piece]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-piece]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activePiece = btn.dataset.piece;
      });
    });

    // Resize button
    document.getElementById('btn-resize-chess')?.addEventListener('click', () => {
      const r = parseInt(document.getElementById('chess-rows')?.value) || 8;
      const c = parseInt(document.getElementById('chess-cols')?.value) || 8;
      this.initBoard(r, c);
      this.fitBoard();
      window.App?.showToast(`Chessboard set to ${r} × ${c}`, 'info');
    });

    // Preset Sizes
    document.querySelectorAll('[data-chess-size]').forEach(btn => {
      btn.addEventListener('click', () => {
        const [r, c] = btn.dataset.chessSize.split('x').map(Number);
        this.initBoard(r, c);
        this.fitBoard();
        window.App?.showToast(`Chessboard set to ${r} × ${c}`, 'info');
      });
    });

    // Zoom Buttons
    document.getElementById('chess-zoom-in')?.addEventListener('click', () => this.zoom(1.2));
    document.getElementById('chess-zoom-out')?.addEventListener('click', () => this.zoom(0.8));
    document.getElementById('chess-zoom-fit')?.addEventListener('click', () => this.fitBoard());
    document.getElementById('chess-zoom-reset')?.addEventListener('click', () => this.resetView());

    // Algorithms
    document.getElementById('btn-knight-bfs')?.addEventListener('click', () => this.triggerKnightBFS());
    document.getElementById('btn-nqueens-solve')?.addEventListener('click', () => this.solveNQueens());
    document.getElementById('btn-knights-tour')?.addEventListener('click', () => this.solveKnightsTour());

    // N-Queens Solution Navigation
    document.getElementById('btn-nq-prev')?.addEventListener('click', () => this.navNQueens(-1));
    document.getElementById('btn-nq-next')?.addEventListener('click', () => this.navNQueens(1));
    document.getElementById('btn-nq-play')?.addEventListener('click', () => this.toggleNQueensPlay());

    // Overlay Select
    document.getElementById('chess-overlay-select')?.addEventListener('change', (e) => {
      this.activeOverlay = e.target.value;
      this.render();
    });

    // Actions
    document.getElementById('btn-clear-chess')?.addEventListener('click', () => {
      this.initBoard(this.rows, this.cols);
      this.render();
      window.App?.showToast('Cleared board', 'info');
    });
    document.getElementById('btn-copy-chess-coords')?.addEventListener('click', () => this.copyPieceCoords());

    // Canvas Events
    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    window.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    this.canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
  }

  zoom(factor) {
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

  handleMouseDown(e) {
    if (e.button === 1 || e.code === 'Space' || e.shiftKey) {
      this.isPanning = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      return;
    }

    if (e.button !== 0) return;

    const rect = this.container.getBoundingClientRect();
    const sq = this.screenToSquare(e.clientX - rect.left, e.clientY - rect.top);

    if (sq) {
      this.selectedSquare = sq;

      // If Knight BFS mode is active, clicking a square traces shortest path to it!
      if (this.knightDistances && this.knightStart) {
        this.traceKnightPath(sq.r, sq.c);
        this.render();
        return;
      }

      // Apply Piece tool
      if (this.activePiece === 'erase') {
        this.board[sq.r][sq.c].piece = null;
      } else {
        const cur = this.board[sq.r][sq.c].piece;
        this.board[sq.r][sq.c].piece = (cur === this.activePiece) ? null : this.activePiece;
      }
      this.render();
    } else {
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
      this.panX += e.clientX - this.lastMouseX;
      this.panY += e.clientY - this.lastMouseY;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.render();
      return;
    }

    this.hoverSquare = this.screenToSquare(sx, sy);
    this.updateStatusPill();
    this.render();
  }

  handleMouseUp(e) {
    this.isPanning = false;
  }

  getSquareNotation(r, c) {
    const isOneIdx = window.App?.isOneIndexed;
    if (this.rows <= 26 && this.cols <= 26) {
      const file = String.fromCharCode(97 + c);
      const rank = this.rows - r;
      return `${file}${rank}`;
    }
    const rDisp = isOneIdx ? r + 1 : r;
    const cDisp = isOneIdx ? c + 1 : c;
    return `(${rDisp}, ${cDisp})`;
  }

  updateStatusPill() {
    const statusSq = document.getElementById('chess-status-square');
    const statusInfo = document.getElementById('chess-status-info');
    const statusZoom = document.getElementById('chess-status-zoom');

    if (statusZoom) statusZoom.textContent = `Zoom: ${Math.round(this.zoom * 100)}%`;

    if (this.hoverSquare) {
      const { r, c } = this.hoverSquare;
      const notation = this.getSquareNotation(r, c);
      const piece = this.board[r][c].piece;
      const isLight = (r + c) % 2 === 0;

      if (statusSq) statusSq.textContent = `Square: ${notation} [${isLight ? 'Light' : 'Dark'}]`;
      if (statusInfo) {
        let text = piece ? `Piece: ${this.getPieceName(piece)}` : 'Empty';
        if (this.knightDistances) {
          const d = this.knightDistances[r][c];
          text += ` | Knight Moves: ${d !== Infinity ? d : '∞'}`;
        }
        statusInfo.textContent = text;
      }
    } else {
      if (statusSq) statusSq.textContent = 'Square: -';
      if (statusInfo) statusInfo.textContent = 'Piece: None';
    }
  }

  getPieceName(p) {
    switch (p) {
      case 'N': return 'Knight (♞)';
      case 'Q': return 'Queen (♛)';
      case 'R': return 'Rook (♜)';
      case 'B': return 'Bishop (♝)';
      case 'K': return 'King (♚)';
      case 'P': return 'Pawn (♟)';
      default: return p;
    }
  }

  // ==========================================
  // CP PROBLEM SOLVERS
  // ==========================================

  triggerKnightBFS() {
    let start = null;
    if (this.selectedSquare) {
      start = this.selectedSquare;
    } else {
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          if (this.board[r][c].piece === 'N') {
            start = { r, c };
            break;
          }
        }
        if (start) break;
      }
    }

    if (!start) {
      start = { r: 0, c: 0 };
      this.board[0][0].piece = 'N';
    }

    this.knightStart = start;
    this.computeKnightBFS(start.r, start.c);
    this.render();
    window.App?.showToast(`Computed Knight reachability from ${this.getSquareNotation(start.r, start.c)}. Click any square to draw path!`, 'success');
  }

  computeKnightBFS(sr, sc) {
    const dist = Array.from({ length: this.rows }, () => Array(this.cols).fill(Infinity));
    this.knightParents = Array.from({ length: this.rows }, () => Array(this.cols).fill(null));

    const dr = [-2, -2, -1, -1, 1, 1, 2, 2];
    const dc = [-1, 1, -2, 2, -2, 2, -1, 1];

    const queue = [[sr, sc]];
    dist[sr][sc] = 0;

    while (queue.length > 0) {
      const [r, c] = queue.shift();
      for (let i = 0; i < 8; i++) {
        const nr = r + dr[i];
        const nc = c + dc[i];
        if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
          if (dist[nr][nc] === Infinity) {
            dist[nr][nc] = dist[r][c] + 1;
            this.knightParents[nr][nc] = [r, c];
            queue.push([nr, nc]);
          }
        }
      }
    }

    this.knightDistances = dist;
  }

  traceKnightPath(tr, tc) {
    if (!this.knightParents || !this.knightDistances) return;
    if (this.knightDistances[tr][tc] === Infinity) {
      window.App?.showToast('Target square is unreachable by knight!', 'error');
      return;
    }

    const path = [];
    let curr = [tr, tc];
    while (curr) {
      path.push(curr);
      curr = this.knightParents[curr[0]][curr[1]];
    }
    path.reverse();
    this.knightPath = path;
    const moves = path.length - 1;
    window.App?.showToast(`Knight shortest path: ${moves} move${moves !== 1 ? 's' : ''}`, 'info');
  }

  solveNQueens() {
    if (this.rows !== this.cols) {
      window.App?.showToast('N-Queens requires a square board (N × N). Setting to 8×8', 'info');
      this.initBoard(8, 8);
      this.fitBoard();
    }

    const N = this.rows;
    if (N > 14) {
      window.App?.showToast('N-Queens solver limited to N <= 14 for instant responsiveness in CP', 'error');
      return;
    }

    const solutions = [];
    const cols = new Set();
    const diag1 = new Set(); // r - c
    const diag2 = new Set(); // r + c
    const currentPlacement = Array(N).fill(-1);

    const backtrack = (row) => {
      if (row === N) {
        solutions.push([...currentPlacement]);
        return;
      }
      for (let col = 0; col < N; col++) {
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

    this.nqueensSolutions = solutions;
    this.nqueensIndex = 0;

    const browser = document.getElementById('nqueens-browser');
    const counter = document.getElementById('nqueens-solution-counter');
    if (browser) browser.classList.remove('hidden');

    if (solutions.length > 0) {
      if (counter) counter.textContent = `1 / ${solutions.length}`;
      this.applyNQueensSolution(0);
      window.App?.showToast(`Found ${solutions.length} solutions for ${N}-Queens!`, 'success');
    } else {
      if (counter) counter.textContent = `0 solutions`;
      window.App?.showToast(`No solutions exist for ${N}-Queens.`, 'info');
    }
    this.render();
  }

  applyNQueensSolution(idx) {
    if (!this.nqueensSolutions || this.nqueensSolutions.length === 0) return;
    this.nqueensIndex = (idx + this.nqueensSolutions.length) % this.nqueensSolutions.length;
    const sol = this.nqueensSolutions[this.nqueensIndex];

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        this.board[r][c].piece = null;
      }
    }
    for (let r = 0; r < this.rows; r++) {
      this.board[r][sol[r]].piece = 'Q';
    }

    const counter = document.getElementById('nqueens-solution-counter');
    if (counter) counter.textContent = `${this.nqueensIndex + 1} / ${this.nqueensSolutions.length}`;
    this.render();
  }

  navNQueens(dir) {
    this.applyNQueensSolution(this.nqueensIndex + dir);
  }

  toggleNQueensPlay() {
    const playBtn = document.getElementById('btn-nq-play');
    if (this.nqueensTimer) {
      clearInterval(this.nqueensTimer);
      this.nqueensTimer = null;
      if (playBtn) playBtn.textContent = '▶ Auto-Play';
    } else {
      if (playBtn) playBtn.textContent = '⏸ Pause';
      this.nqueensTimer = setInterval(() => {
        this.navNQueens(1);
      }, 700);
    }
  }

  solveKnightsTour() {
    const N = this.rows;
    const M = this.cols;
    const total = N * M;
    const visited = Array.from({ length: N }, () => Array(M).fill(0));

    const dr = [-2, -2, -1, -1, 1, 1, 2, 2];
    const dc = [-1, 1, -2, 2, -2, 2, -1, 1];

    const getDegree = (r, c) => {
      let count = 0;
      for (let i = 0; i < 8; i++) {
        const nr = r + dr[i];
        const nc = c + dc[i];
        if (nr >= 0 && nr < N && nc >= 0 && nc < M && visited[nr][nc] === 0) {
          count++;
        }
      }
      return count;
    };

    let curR = this.selectedSquare ? this.selectedSquare.r : 0;
    let curC = this.selectedSquare ? this.selectedSquare.c : 0;
    visited[curR][curC] = 1;
    const moves = [[curR, curC]];

    for (let step = 2; step <= total; step++) {
      let minDeg = Infinity;
      let nextR = -1;
      let nextC = -1;

      for (let i = 0; i < 8; i++) {
        const nr = curR + dr[i];
        const nc = curC + dc[i];
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
    window.App?.showToast(`Knight's Tour completed ${reached} of ${total} squares`, reached === total ? 'success' : 'info');
    this.render();
  }

  copyPieceCoords() {
    let out = `Pieces on ${this.rows}x${this.cols} board:\n`;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const p = this.board[r][c].piece;
        if (p) {
          out += `${p} at ${this.getSquareNotation(r, c)} (r:${r}, c:${c})\n`;
        }
      }
    }
    navigator.clipboard.writeText(out).then(() => {
      window.App?.showToast('Copied piece positions to clipboard!', 'success');
    });
  }

  // ==========================================
  // RENDERING (Clean Tournament Chessboard)
  // ==========================================

  render() {
    if (!this.ctx || !this.container) return;
    const rect = this.container.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    this.ctx.clearRect(0, 0, width, height);

    const sz = this.squareSize * this.zoom;
    const isOneIdx = window.App?.isOneIndexed;

    this.ctx.save();
    this.ctx.translate(this.panX, this.panY);

    // 1. Draw Checkerboard Squares
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = c * sz;
        const y = r * sz;
        const isLight = (r + c) % 2 === 0;

        // Tournament Colors: Cream & Forest Green
        let sqColor = isLight ? '#eeeed2' : '#769656';

        // Overlays
        if (this.knightDistances) {
          const d = this.knightDistances[r][c];
          if (d === 0) {
            sqColor = '#10b981'; // Green origin
          } else if (d !== Infinity) {
            // Soft gradient by distance
            const alpha = Math.max(0.2, 0.75 - d * 0.1);
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

        // Thin subtle square grid line
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x, y, sz, sz);

        // Knight BFS distance numbers
        if (this.knightDistances) {
          const d = this.knightDistances[r][c];
          const distFontSize = Math.max(11, Math.min(22, sz * 0.38));
          this.ctx.font = `700 ${distFontSize}px "JetBrains Mono", Menlo, monospace`;
          this.ctx.fillStyle = d === 0 ? '#ffffff' : '#0f172a';
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';
          this.ctx.fillText(d !== Infinity ? d : '∞', x + sz / 2, y + sz / 2);
        }

        // Draw Piece Symbol
        const piece = this.board[r][c].piece;
        if (piece && !this.knightDistances) {
          this.renderPieceGlyph(piece, x + sz / 2, y + sz / 2, sz);
        }
      }
    }

    // 2. Knight Tour Lines & Step Pills
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
        this.ctx.fillStyle = i === 0 ? '#10b981' : (i === this.knightsTourMoves.length - 1 ? '#ef4444' : '#1e293b');
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

    // 3. Knight Path Arrows
    if (this.knightPath && this.knightPath.length > 1) {
      this.ctx.save();
      this.ctx.strokeStyle = '#2563eb';
      this.ctx.lineWidth = 3.5;
      this.ctx.lineCap = 'round';
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

    // 4. Highlight Hovered & Selected Square
    if (this.hoverSquare) {
      const hx = this.hoverSquare.c * sz;
      const hy = this.hoverSquare.r * sz;
      this.ctx.strokeStyle = '#38bdf8';
      this.ctx.lineWidth = 2.5;
      this.ctx.strokeRect(hx, hy, sz, sz);
    }

    // 5. Clean Outer Board Border & Rank/File Headers
    this.renderBoardHeaders(sz, isOneIdx);

    this.ctx.restore();
  }

  renderPieceGlyph(p, cx, cy, sz) {
    const glyphs = {
      'N': '♞',
      'Q': '♛',
      'R': '♜',
      'B': '♝',
      'K': '♚',
      'P': '♟'
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

    // File Letters (top)
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'bottom';
    for (let c = 0; c < this.cols; c++) {
      let label = isOneIdx ? c + 1 : c;
      if (this.rows <= 26 && this.cols <= 26 && !isOneIdx) {
        label = String.fromCharCode(97 + c);
      }
      const x = c * sz + sz / 2;
      this.ctx.fillText(label, x, -8);
    }

    // Rank Numbers (left)
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'middle';
    for (let r = 0; r < this.rows; r++) {
      let label = isOneIdx ? r + 1 : r;
      if (this.rows <= 26 && this.cols <= 26 && !isOneIdx) {
        label = this.rows - r;
      }
      const y = r * sz + sz / 2;
      this.ctx.fillText(label, -10, y);
    }

    // Board Outer Border
    this.ctx.strokeStyle = '#475569';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(0, 0, this.cols * sz, this.rows * sz);
  }
}

window.ChessVisualizer = ChessVisualizer;
