/**
 * TraceMatrix — Points & Computational Geometry Visualizer (PointVis)
 * Desmos-grade interactive coordinate plane for CP Geometry, Convex Hull, Shoelace, and Vectors.
 */

class PointVisualizer {
  constructor() {
    this.canvas = document.getElementById('point-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.container = document.getElementById('point-canvas-container');

    // Coordinate plane transform
    this.scale = 40; // pixels per unit
    this.originX = 0;
    this.originY = 0;

    // Points data
    this.points = [];
    this.nextPointId = 1;

    // Active tool
    this.activeTool = 'add';
    this.snapToInteger = true;
    this.isMatrixCoords = false;
    this.showLabels = true;

    // Interaction state
    this.draggedPoint = null;
    this.selectedPoints = [];
    this.isPanning = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    this.hoverPoint = null;
    this.mouseWorldX = 0;
    this.mouseWorldY = 0;

    // Overlays
    this.convexHull = null;
    this.closestPair = null;
    this.measureResult = null;

    this.initEventListeners();
    this.resizeCanvas();
    this.resetOrigin();
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

  resetOrigin() {
    const rect = this.container.getBoundingClientRect();
    this.originX = Math.round(rect.width / 2);
    this.originY = Math.round(rect.height / 2);
    this.scale = 40;
    this.updateStatusPill();
    this.render();
  }

  fitPoints() {
    if (this.points.length === 0) {
      this.resetOrigin();
      return;
    }
    const rect = this.container.getBoundingClientRect();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of this.points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const spanX = Math.max(3, maxX - minX);
    const spanY = Math.max(3, maxY - minY);

    const pad = 90;
    const scaleX = (rect.width - pad * 2) / spanX;
    const scaleY = (rect.height - pad * 2) / spanY;
    this.scale = Math.max(10, Math.min(100, Math.min(scaleX, scaleY)));

    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    this.originX = rect.width / 2 - midX * this.scale;
    this.originY = rect.height / 2 + (this.isMatrixCoords ? -midY * this.scale : midY * this.scale);

    this.updateStatusPill();
    this.render();
  }

  initEventListeners() {
    window.addEventListener('resize', () => this.resizeCanvas());

    // Tool Buttons
    document.querySelectorAll('[data-point-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-point-tool]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeTool = btn.dataset.pointTool;
        this.selectedPoints = [];
        this.render();
      });
    });

    // Zoom Buttons
    document.getElementById('point-zoom-in')?.addEventListener('click', () => this.zoom(1.25));
    document.getElementById('point-zoom-out')?.addEventListener('click', () => this.zoom(0.8));
    document.getElementById('point-zoom-fit')?.addEventListener('click', () => this.fitPoints());
    document.getElementById('point-zoom-reset')?.addEventListener('click', () => this.resetOrigin());

    // Toggles
    document.getElementById('point-snap-int')?.addEventListener('change', (e) => {
      this.snapToInteger = e.target.checked;
    });
    document.getElementById('point-system-toggle')?.addEventListener('change', (e) => {
      this.isMatrixCoords = e.target.checked;
      this.render();
    });
    document.getElementById('point-show-labels')?.addEventListener('change', (e) => {
      this.showLabels = e.target.checked;
      this.render();
    });

    // Manual Point Add
    document.getElementById('btn-add-manual-pt')?.addEventListener('click', () => {
      const x = parseFloat(document.getElementById('manual-x')?.value) || 0;
      const y = parseFloat(document.getElementById('manual-y')?.value) || 0;
      this.addPoint(x, y);
    });

    // Clear and Fit
    document.getElementById('btn-clear-points')?.addEventListener('click', () => {
      this.points = [];
      this.nextPointId = 1;
      this.convexHull = null;
      this.closestPair = null;
      this.measureResult = null;
      this.updatePointTable();
      this.render();
      window.App?.showToast('Cleared all points', 'info');
    });

    // Algorithm Buttons
    document.getElementById('btn-convex-hull')?.addEventListener('click', () => this.computeConvexHull());
    document.getElementById('btn-closest-pair')?.addEventListener('click', () => this.computeClosestPair());
    document.getElementById('btn-polygon-shoelace')?.addEventListener('click', () => this.computePolygonArea());
    document.getElementById('btn-cross-product')?.addEventListener('click', () => this.computeOrientation());

    // Close Geom result box
    document.getElementById('btn-close-geom-res')?.addEventListener('click', () => {
      document.getElementById('geom-results-box')?.classList.add('hidden');
    });

    // Presets
    document.querySelectorAll('[data-point-preset]').forEach(btn => {
      btn.addEventListener('click', () => this.loadPreset(btn.dataset.pointPreset));
    });

    // Raw I/O
    document.getElementById('btn-parse-points')?.addEventListener('click', () => this.parseRawPoints());
    document.getElementById('btn-copy-points-code')?.addEventListener('click', () => this.copyCppPoints());

    // Canvas Mouse & Wheel
    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    window.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    this.canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
  }

  worldToScreen(wx, wy) {
    const sx = this.originX + wx * this.scale;
    const sy = this.originY + (this.isMatrixCoords ? wy * this.scale : -wy * this.scale);
    return { x: sx, y: sy };
  }

  screenToWorld(sx, sy) {
    const wx = (sx - this.originX) / this.scale;
    const wy = this.isMatrixCoords ? (sy - this.originY) / this.scale : (this.originY - sy) / this.scale;
    return { x: wx, y: wy };
  }

  zoom(factor) {
    const rect = this.container.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const newScale = Math.max(4, Math.min(300, this.scale * factor));
    this.originX = cx - (cx - this.originX) * (newScale / this.scale);
    this.originY = cy - (cy - this.originY) * (newScale / this.scale);
    this.scale = newScale;
    this.updateStatusPill();
    this.render();
  }

  handleWheel(e) {
    e.preventDefault();
    const rect = this.container.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    const newScale = Math.max(4, Math.min(300, this.scale * factor));

    this.originX = mx - (mx - this.originX) * (newScale / this.scale);
    this.originY = my - (my - this.originY) * (newScale / this.scale);
    this.scale = newScale;

    this.updateStatusPill();
    this.render();
  }

  findPointAt(sx, sy, hitRadius = 14) {
    for (let i = this.points.length - 1; i >= 0; i--) {
      const p = this.points[i];
      const sc = this.worldToScreen(p.x, p.y);
      const dist = Math.hypot(sc.x - sx, sc.y - sy);
      if (dist <= hitRadius) return p;
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
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const clickedPoint = this.findPointAt(sx, sy);

    if (this.activeTool === 'add') {
      if (clickedPoint) {
        this.draggedPoint = clickedPoint;
      } else {
        const world = this.screenToWorld(sx, sy);
        let wx = world.x;
        let wy = world.y;
        if (this.snapToInteger) {
          wx = Math.round(wx);
          wy = Math.round(wy);
        }
        this.addPoint(wx, wy);
      }
    } else if (this.activeTool === 'move') {
      if (clickedPoint) {
        this.draggedPoint = clickedPoint;
      } else {
        this.isPanning = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
      }
    } else if (this.activeTool === 'delete') {
      if (clickedPoint) {
        this.deletePoint(clickedPoint.id);
      }
    } else if (this.activeTool === 'segment' || this.activeTool === 'measure' || this.activeTool === 'polygon') {
      if (clickedPoint) {
        const idx = this.selectedPoints.indexOf(clickedPoint);
        if (idx >= 0) {
          this.selectedPoints.splice(idx, 1);
        } else {
          this.selectedPoints.push(clickedPoint);
        }
        this.render();
      }
    }
  }

  handleMouseMove(e) {
    const rect = this.container.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (this.isPanning) {
      this.originX += e.clientX - this.lastMouseX;
      this.originY += e.clientY - this.lastMouseY;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.render();
      return;
    }

    const world = this.screenToWorld(sx, sy);
    this.mouseWorldX = world.x;
    this.mouseWorldY = world.y;
    this.updateStatusPill();

    if (this.draggedPoint) {
      let wx = world.x;
      let wy = world.y;
      if (this.snapToInteger) {
        wx = Math.round(wx);
        wy = Math.round(wy);
      }
      this.draggedPoint.x = wx;
      this.draggedPoint.y = wy;
      this.updatePointTable();
      this.render();
      return;
    }

    this.hoverPoint = this.findPointAt(sx, sy);
    this.render();
  }

  handleMouseUp(e) {
    this.isPanning = false;
    this.draggedPoint = null;
  }

  addPoint(x, y, label = null) {
    const id = this.nextPointId++;
    const ptLabel = label || this.getAlphabetLabel(id);
    const newPt = {
      id,
      x,
      y,
      label: ptLabel,
      color: '#38bdf8'
    };
    this.points.push(newPt);
    this.updatePointTable();
    this.render();
    return newPt;
  }

  deletePoint(id) {
    this.points = this.points.filter(p => p.id !== id);
    this.selectedPoints = this.selectedPoints.filter(p => p.id !== id);
    this.updatePointTable();
    this.render();
  }

  getAlphabetLabel(id) {
    let s = '';
    let num = id - 1;
    while (num >= 0) {
      s = String.fromCharCode(65 + (num % 26)) + s;
      num = Math.floor(num / 26) - 1;
    }
    return s;
  }

  updatePointTable() {
    const tbody = document.getElementById('point-table-body');
    const badge = document.getElementById('point-count-badge');
    if (badge) badge.textContent = `${this.points.length} point${this.points.length !== 1 ? 's' : ''}`;

    if (!tbody) return;
    if (this.points.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="4">No points yet. Click on canvas or add above.</td></tr>`;
      return;
    }

    tbody.innerHTML = this.points.map(p => `
      <tr>
        <td><strong>${p.label}</strong></td>
        <td>${p.x}</td>
        <td>${p.y}</td>
        <td>
          <button type="button" class="pt-del-btn" onclick="window.pointVis.deletePoint(${p.id})" title="Delete Point">&times;</button>
        </td>
      </tr>
    `).join('');
  }

  updateStatusPill() {
    const cursorEl = document.getElementById('point-status-cursor');
    const distEl = document.getElementById('point-status-dist');
    const zoomEl = document.getElementById('point-status-zoom');

    if (cursorEl) {
      const x = this.snapToInteger ? Math.round(this.mouseWorldX) : this.mouseWorldX.toFixed(2);
      const y = this.snapToInteger ? Math.round(this.mouseWorldY) : this.mouseWorldY.toFixed(2);
      cursorEl.textContent = `X: ${x}, Y: ${y}`;
    }
    if (distEl) {
      const d = Math.hypot(this.mouseWorldX, this.mouseWorldY).toFixed(2);
      distEl.textContent = `Dist to (0,0): ${d}`;
    }
    if (zoomEl) {
      zoomEl.textContent = `${(this.scale / 40).toFixed(1)}×`;
    }
  }

  // ==========================================
  // COMPUTATIONAL GEOMETRY ALGORITHMS
  // ==========================================

  computeConvexHull() {
    if (this.points.length < 3) {
      window.App?.showToast('Convex Hull requires at least 3 points', 'error');
      return;
    }

    const sorted = [...this.points].sort((a, b) => a.x !== b.x ? a.x - b.x : a.y - b.y);
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

    const lower = [];
    for (const p of sorted) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
        lower.pop();
      }
      lower.push(p);
    }

    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
      const p = sorted[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
        upper.pop();
      }
      upper.push(p);
    }

    lower.pop();
    upper.pop();
    const hull = lower.concat(upper);
    this.convexHull = hull;

    let perimeter = 0;
    let area2 = 0;
    const n = hull.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      perimeter += Math.hypot(hull[j].x - hull[i].x, hull[j].y - hull[i].y);
      area2 += hull[i].x * hull[j].y - hull[j].x * hull[i].y;
    }
    const area = Math.abs(area2) / 2;

    this.showGeometryResult('Convex Hull (Monotone Chain)', `
      <div><strong>Hull Vertices (${hull.length}):</strong> ${hull.map(p => p.label).join(' → ')} → ${hull[0].label}</div>
      <div><strong>Perimeter:</strong> ${perimeter.toFixed(3)}</div>
      <div><strong>Area:</strong> ${area.toFixed(3)}</div>
    `);
    this.render();
  }

  computeClosestPair() {
    if (this.points.length < 2) {
      window.App?.showToast('Need at least 2 points for closest pair', 'error');
      return;
    }

    let minDist = Infinity;
    let p1 = null;
    let p2 = null;

    for (let i = 0; i < this.points.length; i++) {
      for (let j = i + 1; j < this.points.length; j++) {
        const d = Math.hypot(this.points[i].x - this.points[j].x, this.points[i].y - this.points[j].y);
        if (d < minDist) {
          minDist = d;
          p1 = this.points[i];
          p2 = this.points[j];
        }
      }
    }

    this.closestPair = [p1, p2];
    const manhattan = Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);
    const chebyshev = Math.max(Math.abs(p1.x - p2.x), Math.abs(p1.y - p2.y));

    this.showGeometryResult('Closest Pair of Points', `
      <div><strong>Pair:</strong> ${p1.label} (${p1.x}, ${p1.y}) and ${p2.label} (${p2.x}, ${p2.y})</div>
      <div><strong>Euclidean Distance (L₂):</strong> <span class="text-accent"><strong>${minDist.toFixed(4)}</strong></span></div>
      <div><strong>Manhattan Distance (L₁):</strong> ${manhattan}</div>
      <div><strong>Chebyshev Distance (L∞):</strong> ${chebyshev}</div>
    `);
    this.render();
  }

  computePolygonArea() {
    const pts = this.selectedPoints.length >= 3 ? this.selectedPoints : this.points;
    if (pts.length < 3) {
      window.App?.showToast('Please select at least 3 points or add 3 points', 'error');
      return;
    }

    const n = pts.length;
    let signedArea2 = 0;
    let boundary = 0;
    let perimeter = 0;

    const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      signedArea2 += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
      perimeter += Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y);
      const dx = Math.round(Math.abs(pts[j].x - pts[i].x));
      const dy = Math.round(Math.abs(pts[j].y - pts[i].y));
      boundary += gcd(dx, dy);
    }

    const area = Math.abs(signedArea2) / 2;
    const orientation = signedArea2 > 0 ? (this.isMatrixCoords ? 'Clockwise (CW)' : 'Counter-Clockwise (CCW)') : (this.isMatrixCoords ? 'Counter-Clockwise (CCW)' : 'Clockwise (CW)');
    const interior = area - boundary / 2 + 1;

    this.showGeometryResult("Polygon Area & Pick's Theorem", `
      <div><strong>Vertices (${n}):</strong> ${pts.map(p => p.label).join(' → ')}</div>
      <div><strong>Orientation:</strong> ${orientation}</div>
      <div><strong>Shoelace Area:</strong> <strong class="text-accent">${area.toFixed(2)}</strong></div>
      <div><strong>Perimeter:</strong> ${perimeter.toFixed(3)}</div>
      <div style="margin-top:4px; padding-top:4px; border-top:1px dashed var(--border);">
        <strong>Pick's Theorem (Integer Lattice):</strong><br>
        Boundary points (B): <strong>${boundary}</strong><br>
        Interior points (I = A - B/2 + 1): <strong>${Number.isInteger(interior) ? interior : interior.toFixed(1)}</strong>
      </div>
    `);
    this.render();
  }

  computeOrientation() {
    if (this.selectedPoints.length !== 3) {
      if (this.points.length >= 3) {
        this.selectedPoints = [this.points[0], this.points[1], this.points[2]];
      } else {
        window.App?.showToast('Select 3 points (A, B, C) using Measure tool or click 3 points', 'error');
        return;
      }
    }

    const [A, B, C] = this.selectedPoints;
    const cross = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x);
    const dot = (B.x - A.x) * (C.x - A.x) + (B.y - A.y) * (C.y - A.y);
    const magAB = Math.hypot(B.x - A.x, B.y - A.y);
    const magAC = Math.hypot(C.x - A.x, C.y - A.y);
    const cosAngle = dot / (magAB * magAC || 1);
    const angleDeg = (Math.acos(Math.max(-1, Math.min(1, cosAngle))) * 180 / Math.PI).toFixed(2);

    let orientationStr = 'Collinear (= 0)';
    let color = 'var(--text-muted)';
    if (cross > 0) {
      orientationStr = 'Counter-Clockwise (Left Turn)';
      color = 'var(--color-success)';
    } else if (cross < 0) {
      orientationStr = 'Clockwise (Right Turn)';
      color = 'var(--color-danger)';
    }

    this.showGeometryResult('Orientation & Cross Product (CCW)', `
      <div><strong>Points:</strong> A=${A.label}(${A.x},${A.y}), B=${B.label}(${B.x},${B.y}), C=${C.label}(${C.x},${C.y})</div>
      <div><strong>Cross Product:</strong> <strong style="color:${color}">${cross}</strong></div>
      <div><strong>Orientation:</strong> <strong style="color:${color}">${orientationStr}</strong></div>
      <div><strong>Angle ∠BAC:</strong> ${angleDeg}° (Dot: ${dot})</div>
    `);
    this.render();
  }

  showGeometryResult(title, htmlContent) {
    const box = document.getElementById('geom-results-box');
    const titleEl = document.getElementById('geom-result-title');
    const contentEl = document.getElementById('geom-result-content');
    if (!box || !titleEl || !contentEl) return;
    titleEl.textContent = title;
    contentEl.innerHTML = htmlContent;
    box.classList.remove('hidden');
  }

  loadPreset(type) {
    this.points = [];
    this.nextPointId = 1;
    this.convexHull = null;
    this.closestPair = null;

    if (type === 'hull-test') {
      const raw = [[0, 0], [4, 0], [5, 3], [3, 6], [-1, 5], [-2, 2], [1, 2], [2, 3], [3, 1]];
      for (const [x, y] of raw) this.addPoint(x, y);
      this.computeConvexHull();
      window.App?.showToast('Convex Hull test preset loaded', 'info');
    } else if (type === 'collinear') {
      for (let i = -3; i <= 3; i++) {
        this.addPoint(i, i * 2);
      }
      this.addPoint(0, 3);
      this.addPoint(2, -1);
      window.App?.showToast('Collinear points preset loaded', 'info');
    } else if (type === 'star') {
      const R = 6, r = 2.5;
      for (let i = 0; i < 10; i++) {
        const rad = i % 2 === 0 ? R : r;
        const ang = (i * 36 - 90) * Math.PI / 180;
        this.addPoint(Math.round(rad * Math.cos(ang)), Math.round(rad * Math.sin(ang)));
      }
      this.computePolygonArea();
      window.App?.showToast('Star polygon loaded', 'info');
    } else if (type === 'random-pts') {
      for (let i = 0; i < 12; i++) {
        const x = Math.floor(Math.random() * 20) - 10;
        const y = Math.floor(Math.random() * 20) - 10;
        this.addPoint(x, y);
      }
      this.computeConvexHull();
      window.App?.showToast('12 Random points loaded', 'info');
    }
    this.fitPoints();
  }

  parseRawPoints() {
    const raw = document.getElementById('points-raw-input')?.value.trim();
    if (!raw) {
      window.App?.showToast('Points input is empty', 'error');
      return;
    }

    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    this.points = [];
    this.nextPointId = 1;

    let start = 0;
    if (lines[0].split(/\s+/).length === 1 && !isNaN(lines[0])) {
      start = 1;
    }

    for (let i = start; i < lines.length; i++) {
      const tokens = lines[i].split(/[\s,]+/).filter(t => t.length > 0);
      if (tokens.length >= 2) {
        const x = parseFloat(tokens[0]);
        const y = parseFloat(tokens[1]);
        if (!isNaN(x) && !isNaN(y)) {
          this.addPoint(x, y);
        }
      }
    }

    this.fitPoints();
    window.App?.showToast(`Loaded ${this.points.length} points from input`, 'success');
  }

  copyCppPoints() {
    let out = `struct Point { long long x, y; };\n`;
    out += `vector<Point> pts = {\n`;
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      out += `    {${p.x}, ${p.y}}${i < this.points.length - 1 ? ',' : ''}\n`;
    }
    out += `};`;
    navigator.clipboard.writeText(out).then(() => {
      window.App?.showToast('Copied C++ Point vector to clipboard!', 'success');
    });
  }

  // ==========================================
  // RENDERING (Desmos Grade Clean Plane)
  // ==========================================

  render() {
    if (!this.ctx || !this.container) return;
    const rect = this.container.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    this.ctx.clearRect(0, 0, width, height);

    // 1. Draw Adaptive Cartesian Grid and Axes
    this.renderAxesAndGrid(width, height);

    // 2. Draw Segments between Selected Points
    if (this.selectedPoints.length >= 2) {
      this.ctx.save();
      this.ctx.strokeStyle = '#38bdf8';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      const first = this.worldToScreen(this.selectedPoints[0].x, this.selectedPoints[0].y);
      this.ctx.moveTo(first.x, first.y);
      for (let i = 1; i < this.selectedPoints.length; i++) {
        const sc = this.worldToScreen(this.selectedPoints[i].x, this.selectedPoints[i].y);
        this.ctx.lineTo(sc.x, sc.y);
      }
      if (this.activeTool === 'polygon' && this.selectedPoints.length >= 3) {
        this.ctx.closePath();
        this.ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
        this.ctx.fill();
      }
      this.ctx.stroke();
      this.ctx.restore();
    }

    // 3. Draw Convex Hull
    if (this.convexHull && this.convexHull.length >= 3) {
      this.ctx.save();
      this.ctx.beginPath();
      const first = this.worldToScreen(this.convexHull[0].x, this.convexHull[0].y);
      this.ctx.moveTo(first.x, first.y);
      for (let i = 1; i < this.convexHull.length; i++) {
        const sc = this.worldToScreen(this.convexHull[i].x, this.convexHull[i].y);
        this.ctx.lineTo(sc.x, sc.y);
      }
      this.ctx.closePath();
      this.ctx.fillStyle = 'rgba(16, 185, 129, 0.14)';
      this.ctx.fill();
      this.ctx.strokeStyle = '#10b981';
      this.ctx.lineWidth = 2.5;
      this.ctx.stroke();
      this.ctx.restore();
    }

    // 4. Draw Closest Pair
    if (this.closestPair && this.closestPair.length === 2) {
      const [p1, p2] = this.closestPair;
      const sc1 = this.worldToScreen(p1.x, p1.y);
      const sc2 = this.worldToScreen(p2.x, p2.y);
      this.ctx.save();
      this.ctx.strokeStyle = '#f59e0b';
      this.ctx.lineWidth = 2.5;
      this.ctx.setLineDash([5, 4]);
      this.ctx.beginPath();
      this.ctx.moveTo(sc1.x, sc1.y);
      this.ctx.lineTo(sc2.x, sc2.y);
      this.ctx.stroke();
      this.ctx.restore();
    }

    // 5. Draw Points with Clean Legible Pills
    for (const p of this.points) {
      const sc = this.worldToScreen(p.x, p.y);
      const isSelected = this.selectedPoints.includes(p);
      const isHovered = this.hoverPoint === p;
      const radius = isHovered ? 7.5 : (isSelected ? 7 : 5.5);

      // Outer glow
      if (isSelected || isHovered) {
        this.ctx.beginPath();
        this.ctx.arc(sc.x, sc.y, radius + 5, 0, Math.PI * 2);
        this.ctx.fillStyle = isSelected ? 'rgba(56, 189, 248, 0.35)' : 'rgba(255, 255, 255, 0.18)';
        this.ctx.fill();
      }

      // Point circle
      this.ctx.beginPath();
      this.ctx.arc(sc.x, sc.y, radius, 0, Math.PI * 2);
      this.ctx.fillStyle = isSelected ? '#38bdf8' : (isHovered ? '#7dd3fc' : '#0284c7');
      this.ctx.fill();
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 1.8;
      this.ctx.stroke();

      // Point Label Pill (Never clashes with gridlines!)
      if (this.showLabels) {
        const labelText = `${p.label} (${p.x}, ${p.y})`;
        this.ctx.font = '600 11px "JetBrains Mono", Menlo, monospace';
        const textMetrics = this.ctx.measureText(labelText);
        const textW = textMetrics.width;
        const textH = 14;

        const pillX = sc.x + radius + 4;
        const pillY = sc.y - textH / 2 - 2;

        // Draw pill background
        this.ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        this.ctx.strokeStyle = '#334155';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.roundRect(pillX - 4, pillY - 2, textW + 8, textH + 4, 4);
        this.ctx.fill();
        this.ctx.stroke();

        // Draw label text
        this.ctx.fillStyle = '#f8fafc';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(labelText, pillX, pillY + textH / 2);
      }
    }
  }

  renderAxesAndGrid(width, height) {
    // Dynamic tick spacing with minimum 75px between numbers (Desmos style)
    const minPxGap = 75;
    const rawInterval = minPxGap / this.scale;
    const power = Math.pow(10, Math.floor(Math.log10(rawInterval)));
    const normalized = rawInterval / power;
    let step = power;
    if (normalized >= 5) step = 5 * power;
    else if (normalized >= 2) step = 2 * power;
    else step = power;

    const subStep = step / 5;

    // 1. Minor Grid Lines
    if (subStep * this.scale > 12) {
      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(148, 163, 184, 0.05)';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();

      const startWorldX = Math.floor(-this.originX / (subStep * this.scale)) * subStep;
      const endWorldX = Math.ceil((width - this.originX) / (subStep * this.scale)) * subStep;

      for (let x = startWorldX; x <= endWorldX; x += subStep) {
        const sx = this.originX + x * this.scale;
        this.ctx.moveTo(sx, 0);
        this.ctx.lineTo(sx, height);
      }

      const startWorldY = Math.floor(-this.originY / (subStep * this.scale)) * subStep;
      const endWorldY = Math.ceil((height - this.originY) / (subStep * this.scale)) * subStep;

      for (let y = startWorldY; y <= endWorldY; y += subStep) {
        const sy = this.originY + (this.isMatrixCoords ? y * this.scale : -y * this.scale);
        this.ctx.moveTo(0, sy);
        this.ctx.lineTo(width, sy);
      }
      this.ctx.stroke();
      this.ctx.restore();
    }

    // 2. Major Grid Lines & Numbers
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    this.ctx.lineWidth = 1;
    this.ctx.fillStyle = '#94a3b8';
    this.ctx.font = '500 11px "JetBrains Mono", Menlo, monospace';

    const startX = Math.floor(-this.originX / (step * this.scale)) * step;
    const endX = Math.ceil((width - this.originX) / (step * this.scale)) * step;

    for (let x = startX; x <= endX; x += step) {
      const sx = this.originX + x * this.scale;
      this.ctx.beginPath();
      this.ctx.moveTo(sx, 0);
      this.ctx.lineTo(sx, height);
      this.ctx.stroke();

      if (Math.abs(x) > 1e-9) {
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        // Keep tick label attached to axis or clamped to screen margin
        const labelY = Math.max(12, Math.min(height - 24, this.originY + 6));
        this.ctx.fillText(Number(x.toFixed(4)), sx, labelY);
      }
    }

    const startY = Math.floor(-this.originY / (step * this.scale)) * step;
    const endY = Math.ceil((height - this.originY) / (step * this.scale)) * step;

    for (let y = startY; y <= endY; y += step) {
      const sy = this.originY + (this.isMatrixCoords ? y * this.scale : -y * this.scale);
      this.ctx.beginPath();
      this.ctx.moveTo(0, sy);
      this.ctx.lineTo(width, sy);
      this.ctx.stroke();

      if (Math.abs(y) > 1e-9) {
        this.ctx.textAlign = 'right';
        this.ctx.textBaseline = 'middle';
        const labelX = Math.max(34, Math.min(width - 8, this.originX - 8));
        this.ctx.fillText(Number(y.toFixed(4)), labelX, sy);
      }
    }
    this.ctx.restore();

    // 3. Main Axes (X = 0, Y = 0)
    this.ctx.save();
    this.ctx.strokeStyle = '#64748b';
    this.ctx.lineWidth = 2;

    // X Axis
    this.ctx.beginPath();
    this.ctx.moveTo(0, this.originY);
    this.ctx.lineTo(width, this.originY);
    this.ctx.stroke();

    // Y Axis
    this.ctx.beginPath();
    this.ctx.moveTo(this.originX, 0);
    this.ctx.lineTo(this.originX, height);
    this.ctx.stroke();

    // Origin (0, 0)
    this.ctx.fillStyle = '#94a3b8';
    this.ctx.font = '600 11px "JetBrains Mono", Menlo, monospace';
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText('0', this.originX - 6, this.originY + 6);

    this.ctx.restore();
  }
}

window.PointVisualizer = PointVisualizer;
