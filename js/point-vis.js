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

    // Segments (lines between points)
    this.segments = [];
    this.nextSegmentId = 1;

    // Active tool: Default mode is 'move' (Drag & Move)
    this.activeTool = 'move';
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
    this.hoverSegment = null;
    this.mouseWorldX = 0;
    this.mouseWorldY = 0;
    this.lastMouseCanvasX = 0;
    this.lastMouseCanvasY = 0;

    // Line creation from existing point
    this.connectingPoint = null;

    // Overlays
    this.convexHull = null;
    this.closestPair = null;
    this.measureResult = null;

    this.initEventListeners();
    this.resizeCanvas();
    this.resetOrigin();
    this.updateCursor();
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
        this.connectingPoint = null;
        this.updateCursor();
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
      this.segments = [];
      this.connectingPoint = null;
      this.nextPointId = 1;
      this.nextSegmentId = 1;
      this.convexHull = null;
      this.closestPair = null;
      this.measureResult = null;
      const rawInput = document.getElementById('points-raw-input');
      if (rawInput) rawInput.value = '';
      this.updatePointTable();
      this.render();
      window.App?.showToast('Cleared all points & lines', 'info');
    });

    document.getElementById('btn-fit-points')?.addEventListener('click', () => this.fitPoints());

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
    const rawPointsInput = document.getElementById('points-raw-input');
    rawPointsInput?.addEventListener('paste', () => {
      setTimeout(() => this.parseRawPoints(true, true), 50);
    });
    rawPointsInput?.addEventListener('input', () => {
      clearTimeout(this._inputSyncTimer);
      this._inputSyncTimer = setTimeout(() => {
        this.parseRawPoints(false, false);
      }, 200);
    });
    rawPointsInput?.addEventListener('change', () => {
      clearTimeout(this._inputSyncTimer);
      this.parseRawPoints(false, false);
    });
    document.getElementById('btn-parse-points')?.addEventListener('click', () => {
      this.parseRawPoints(true, true);
    });
    document.getElementById('btn-copy-points-code')?.addEventListener('click', () => this.copyCppPoints());

    // Canvas Mouse & Wheel
    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    window.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    this.canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });

    // Double-click interaction:
    // - On empty space: add point
    // - On existing point: create line to another point
    this.canvas.addEventListener('dblclick', (e) => this.handleDoubleClick(e));

    // Right-click: cancel connecting or delete segment under cursor
    this.canvas.addEventListener('contextmenu', (e) => this.handleContextMenu(e));

    // Cancel line connecting on Escape
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.connectingPoint) {
        this.cancelConnecting();
      }
    });
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

  findSegmentAt(sx, sy, hitRadius = 8) {
    for (let i = this.segments.length - 1; i >= 0; i--) {
      const seg = this.segments[i];
      const sc1 = this.worldToScreen(seg.p1.x, seg.p1.y);
      const sc2 = this.worldToScreen(seg.p2.x, seg.p2.y);
      const d = this.distToSegment(sx, sy, sc1.x, sc1.y, sc2.x, sc2.y);
      if (d <= hitRadius) return seg;
    }
    return null;
  }

  distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    return Math.hypot(px - projX, py - projY);
  }

  updateCursor() {
    if (!this.canvas) return;
    if (this.isPanning || this.draggedPoint) {
      this.canvas.style.cursor = 'grabbing';
    } else if (this.connectingPoint) {
      this.canvas.style.cursor = this.hoverPoint ? 'pointer' : 'crosshair';
    } else if (this.hoverPoint) {
      this.canvas.style.cursor = 'pointer';
    } else if (this.hoverSegment && this.activeTool === 'delete') {
      this.canvas.style.cursor = 'not-allowed';
    } else if (this.activeTool === 'move') {
      this.canvas.style.cursor = 'grab';
    } else if (this.activeTool === 'add' || this.activeTool === 'point') {
      this.canvas.style.cursor = 'crosshair';
    } else if (this.activeTool === 'delete') {
      this.canvas.style.cursor = 'not-allowed';
    } else {
      this.canvas.style.cursor = 'crosshair';
    }
  }

  handleMouseDown(e) {
    if (e.button === 1 || e.code === 'Space' || (e.shiftKey && this.activeTool !== 'move')) {
      this.isPanning = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.updateCursor();
      return;
    }

    if (e.button !== 0) return;

    const rect = this.container.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const clickedPoint = this.findPointAt(sx, sy);

    // 1. If currently in line connecting mode
    if (this.connectingPoint) {
      if (clickedPoint && clickedPoint !== this.connectingPoint) {
        this.addSegment(this.connectingPoint, clickedPoint);
        window.App?.showToast(`Created line: ${this.connectingPoint.label} — ${clickedPoint.label}`, 'success');
        this.connectingPoint = null;
        this.updateCursor();
        this.render();
        return;
      } else if (!clickedPoint) {
        // Clicking empty space cancels connecting
        this.connectingPoint = null;
        this.updateCursor();
        this.render();
      }
    }

    // 2. Active Tool Behaviors
    if (this.activeTool === 'move') {
      if (clickedPoint) {
        this.draggedPoint = clickedPoint;
      } else {
        this.isPanning = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
      }
    } else if (this.activeTool === 'add' || this.activeTool === 'point') {
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
    } else if (this.activeTool === 'delete') {
      if (clickedPoint) {
        this.deletePoint(clickedPoint.id);
      } else {
        const clickedSeg = this.findSegmentAt(sx, sy);
        if (clickedSeg) {
          this.deleteSegment(clickedSeg.id);
          window.App?.showToast(`Deleted line ${clickedSeg.p1.label} — ${clickedSeg.p2.label}`, 'info');
        }
      }
    } else if (this.activeTool === 'segment') {
      if (clickedPoint) {
        if (this.connectingPoint && this.connectingPoint !== clickedPoint) {
          this.addSegment(this.connectingPoint, clickedPoint);
          this.connectingPoint = null;
        } else {
          this.connectingPoint = clickedPoint;
          window.App?.showToast(`Connecting from ${clickedPoint.label} — click another point`, 'info');
        }
        this.render();
      }
    } else if (this.activeTool === 'measure' || this.activeTool === 'polygon') {
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

    this.updateCursor();
  }

  handleMouseMove(e) {
    const rect = this.container.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    this.lastMouseCanvasX = sx;
    this.lastMouseCanvasY = sy;

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
    this.hoverSegment = this.findSegmentAt(sx, sy);
    this.updateCursor();
    this.render();
  }

  handleMouseUp(e) {
    if (this.draggedPoint) {
      this.syncInputTextarea();
    }
    if (this.connectingPoint && this.draggedPoint && this.draggedPoint === this.connectingPoint) {
      const rect = this.container.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const targetPoint = this.findPointAt(sx, sy);
      if (targetPoint && targetPoint !== this.connectingPoint) {
        this.addSegment(this.connectingPoint, targetPoint);
        window.App?.showToast(`Created line: ${this.connectingPoint.label} — ${targetPoint.label}`, 'success');
        this.connectingPoint = null;
      }
    }
    this.isPanning = false;
    this.draggedPoint = null;
    this.updateCursor();
    this.render();
  }

  handleDoubleClick(e) {
    const rect = this.container.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const clickedPoint = this.findPointAt(sx, sy);

    if (!clickedPoint) {
      // Requirement: Double click on empty space as add point
      const world = this.screenToWorld(sx, sy);
      let wx = world.x;
      let wy = world.y;
      if (this.snapToInteger) {
        wx = Math.round(wx);
        wy = Math.round(wy);
      }
      const exists = this.points.some(p => Math.abs(p.x - wx) < 1e-6 && Math.abs(p.y - wy) < 1e-6);
      if (!exists) {
        const pt = this.addPoint(wx, wy);
        window.App?.showToast(`Added point ${pt.label} (${wx}, ${wy})`, 'success');
      }
      return;
    }

    // Requirement: Double click on exist point that can create line to another point
    if (this.connectingPoint && this.connectingPoint !== clickedPoint) {
      this.addSegment(this.connectingPoint, clickedPoint);
      window.App?.showToast(`Created line: ${this.connectingPoint.label} — ${clickedPoint.label}`, 'success');
      this.connectingPoint = null;
    } else {
      this.connectingPoint = clickedPoint;
      window.App?.showToast(`Connecting from point ${clickedPoint.label} — click or double-click another point to create line`, 'info');
    }
    this.updateCursor();
    this.render();
  }

  handleContextMenu(e) {
    e.preventDefault();
    if (this.connectingPoint) {
      this.cancelConnecting();
      return;
    }
    const rect = this.container.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const clickedPoint = this.findPointAt(sx, sy);
    if (clickedPoint) {
      this.deletePoint(clickedPoint.id);
      window.App?.showToast(`Deleted point ${clickedPoint.label}`, 'info');
      return;
    }

    const seg = this.findSegmentAt(sx, sy);
    if (seg) {
      this.deleteSegment(seg.id);
      window.App?.showToast(`Deleted line ${seg.p1.label} — ${seg.p2.label}`, 'info');
    }
  }

  cancelConnecting() {
    if (this.connectingPoint) {
      this.connectingPoint = null;
      this.updateCursor();
      this.render();
      window.App?.showToast('Line connecting cancelled', 'info');
    }
  }

  addPoint(x, y, label = null, syncText = true) {
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
    if (syncText) {
      this.syncInputTextarea();
    }
    this.render();
    return newPt;
  }

  addSegment(p1, p2, color = '#38bdf8') {
    if (!p1 || !p2 || p1.id === p2.id) return null;
    const exists = this.segments.some(s =>
      (s.p1.id === p1.id && s.p2.id === p2.id) ||
      (s.p1.id === p2.id && s.p2.id === p1.id)
    );
    if (exists) {
      window.App?.showToast(`Line between ${p1.label} and ${p2.label} already exists`, 'info');
      return null;
    }
    const seg = {
      id: this.nextSegmentId++,
      p1,
      p2,
      color
    };
    this.segments.push(seg);
    this.render();
    return seg;
  }

  deleteSegment(id) {
    this.segments = this.segments.filter(s => s.id !== id);
    this.render();
  }

  deletePoint(id) {
    this.points = this.points.filter(p => p.id !== id);
    this.selectedPoints = this.selectedPoints.filter(p => p.id !== id);
    this.segments = this.segments.filter(s => s.p1.id !== id && s.p2.id !== id);
    if (this.connectingPoint && this.connectingPoint.id === id) {
      this.connectingPoint = null;
    }
    this.updatePointTable();
    this.syncInputTextarea();
    this.render();
  }

  syncInputTextarea() {
    const rawInput = document.getElementById('points-raw-input');
    if (!rawInput) return;
    if (document.activeElement === rawInput) return;

    if (this.points.length === 0) {
      rawInput.value = '';
      return;
    }

    const prevLines = rawInput.value.trim().split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const hadCount = prevLines.length > 0 && prevLines[0].split(/\s+/).length === 1 && !isNaN(prevLines[0]);

    const pointLines = this.points.map(p => `${p.x} ${p.y}`);
    if (hadCount) {
      rawInput.value = `${this.points.length}\n${pointLines.join('\n')}`;
    } else {
      rawInput.value = pointLines.join('\n');
    }
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
      tbody.innerHTML = `<tr class="empty-row"><td colspan="4">No points yet. Double-click canvas or add above.</td></tr>`;
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
    this.segments = [];
    this.connectingPoint = null;
    this.nextPointId = 1;
    this.nextSegmentId = 1;
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

  parseRawPoints(fit = false, showToast = false) {
    const rawInput = document.getElementById('points-raw-input');
    const raw = rawInput?.value.trim() ?? '';

    // If completely empty, remove all points from graph
    if (!raw) {
      this.points = [];
      this.segments = [];
      this.connectingPoint = null;
      this.convexHull = null;
      this.closestPair = null;
      this.measureResult = null;
      this.updatePointTable();
      this.render();
      if (showToast) {
        window.App?.showToast('Cleared all points (input is empty)', 'info');
      }
      return;
    }

    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    let start = 0;
    if (lines[0].split(/\s+/).length === 1 && !isNaN(lines[0])) {
      start = 1;
    }

    const parsedPairs = [];
    for (let i = start; i < lines.length; i++) {
      const tokens = lines[i].split(/[\s,]+/).filter(t => t.length > 0);
      if (tokens.length >= 2) {
        const x = parseFloat(tokens[0]);
        const y = parseFloat(tokens[1]);
        if (!isNaN(x) && !isNaN(y)) {
          parsedPairs.push({ x, y });
        }
      }
    }

    // Match existing points with parsedPairs to preserve labels, IDs, colors, and line connections
    const remainingExisting = [...this.points];
    const newPoints = [];

    for (const pair of parsedPairs) {
      const matchIdx = remainingExisting.findIndex(
        p => Math.abs(p.x - pair.x) < 1e-6 && Math.abs(p.y - pair.y) < 1e-6
      );
      if (matchIdx >= 0) {
        newPoints.push(remainingExisting[matchIdx]);
        remainingExisting.splice(matchIdx, 1);
      } else {
        const id = this.nextPointId++;
        newPoints.push({
          id,
          x: pair.x,
          y: pair.y,
          label: this.getAlphabetLabel(id),
          color: '#38bdf8'
        });
      }
    }

    // Any point in remainingExisting was removed by the user in the text box -> remove from graph
    const removedIds = new Set(remainingExisting.map(p => p.id));
    this.points = newPoints;
    this.selectedPoints = this.selectedPoints.filter(p => !removedIds.has(p.id));
    this.segments = this.segments.filter(s => !removedIds.has(s.p1.id) && !removedIds.has(s.p2.id));
    if (this.connectingPoint && removedIds.has(this.connectingPoint.id)) {
      this.connectingPoint = null;
    }

    this.updatePointTable();
    this.render();

    if (fit && this.points.length > 0) {
      this.fitPoints();
    }

    if (showToast) {
      window.App?.showToast(`Loaded ${this.points.length} points from input`, 'success');
    }
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

    // 1. Draw Full Grid with Rows, Columns, Ticks, and Main Axes
    this.renderAxesAndGrid(width, height);

    // 2. Draw User Line Segments (created by double-click or segment tool)
    if (this.segments.length > 0) {
      this.ctx.save();
      for (const seg of this.segments) {
        const sc1 = this.worldToScreen(seg.p1.x, seg.p1.y);
        const sc2 = this.worldToScreen(seg.p2.x, seg.p2.y);

        // Segment glow
        this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
        this.ctx.lineWidth = 5;
        this.ctx.beginPath();
        this.ctx.moveTo(sc1.x, sc1.y);
        this.ctx.lineTo(sc2.x, sc2.y);
        this.ctx.stroke();

        // Main segment line
        this.ctx.strokeStyle = seg.color || '#38bdf8';
        this.ctx.lineWidth = 2.2;
        this.ctx.beginPath();
        this.ctx.moveTo(sc1.x, sc1.y);
        this.ctx.lineTo(sc2.x, sc2.y);
        this.ctx.stroke();

        // Segment length badge at midpoint
        const midX = (sc1.x + sc2.x) / 2;
        const midY = (sc1.y + sc2.y) / 2;
        const dist = Math.hypot(seg.p2.x - seg.p1.x, seg.p2.y - seg.p1.y);
        const distText = Number.isInteger(dist) ? dist.toString() : dist.toFixed(2);

        this.ctx.font = '600 10px "JetBrains Mono", Menlo, monospace';
        const tw = this.ctx.measureText(distText).width;
        const pillW = tw + 8;
        const pillH = 15;

        this.ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        this.ctx.strokeStyle = '#0284c7';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.roundRect(midX - pillW / 2, midY - pillH / 2, pillW, pillH, 4);
        this.ctx.fill();
        this.ctx.stroke();

        this.ctx.fillStyle = '#38bdf8';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(distText, midX, midY);
      }
      this.ctx.restore();
    }

    // 3. Draw Segments between Selected Points (for Polygon / Measure tools)
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

    // 4. Draw Convex Hull
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

    // 5. Draw Closest Pair
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

    // 6. Draw Connecting Line Preview (when dragging / connecting from a point)
    if (this.connectingPoint) {
      const sc1 = this.worldToScreen(this.connectingPoint.x, this.connectingPoint.y);
      const targetSc = this.hoverPoint && this.hoverPoint !== this.connectingPoint
        ? this.worldToScreen(this.hoverPoint.x, this.hoverPoint.y)
        : { x: this.lastMouseCanvasX || sc1.x, y: this.lastMouseCanvasY || sc1.y };

      this.ctx.save();
      // Glowing aura at source point
      this.ctx.beginPath();
      this.ctx.arc(sc1.x, sc1.y, 14, 0, Math.PI * 2);
      this.ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
      this.ctx.fill();

      // Dashed connecting line
      this.ctx.strokeStyle = '#38bdf8';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([6, 4]);
      this.ctx.beginPath();
      this.ctx.moveTo(sc1.x, sc1.y);
      this.ctx.lineTo(targetSc.x, targetSc.y);
      this.ctx.stroke();

      // Tooltip pill near target
      const tipText = this.hoverPoint && this.hoverPoint !== this.connectingPoint
        ? `Connect to ${this.hoverPoint.label}`
        : `Click point to connect (Esc to cancel)`;

      this.ctx.font = '500 11px "JetBrains Mono", Menlo, monospace';
      const tipMetrics = this.ctx.measureText(tipText);
      const tipW = tipMetrics.width + 12;
      const tipH = 22;
      const tipX = Math.min(width - tipW - 10, Math.max(10, targetSc.x + 12));
      const tipY = Math.max(10, Math.min(height - tipH - 10, targetSc.y - 11));

      this.ctx.setLineDash([]);
      this.ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      this.ctx.strokeStyle = '#0284c7';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.roundRect(tipX, tipY, tipW, tipH, 4);
      this.ctx.fill();
      this.ctx.stroke();

      this.ctx.fillStyle = '#38bdf8';
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(tipText, tipX + 6, tipY + tipH / 2);

      this.ctx.restore();
    }

    // 7. Draw Points
    for (const p of this.points) {
      const sc = this.worldToScreen(p.x, p.y);
      const isSelected = this.selectedPoints.includes(p);
      const isHovered = this.hoverPoint === p;
      const isConnecting = this.connectingPoint === p;
      const radius = isHovered ? 7.5 : (isSelected || isConnecting ? 7 : 5.5);

      // Outer glow
      if (isSelected || isHovered || isConnecting) {
        this.ctx.beginPath();
        this.ctx.arc(sc.x, sc.y, radius + 6, 0, Math.PI * 2);
        this.ctx.fillStyle = isConnecting
          ? 'rgba(56, 189, 248, 0.45)'
          : (isSelected ? 'rgba(56, 189, 248, 0.35)' : 'rgba(255, 255, 255, 0.18)');
        this.ctx.fill();
      }

      // Point circle
      this.ctx.beginPath();
      this.ctx.arc(sc.x, sc.y, radius, 0, Math.PI * 2);
      this.ctx.fillStyle = isConnecting ? '#38bdf8' : (isSelected ? '#38bdf8' : (isHovered ? '#7dd3fc' : '#0284c7'));
      this.ctx.fill();
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 1.8;
      this.ctx.stroke();

      // Point Label Pill
      if (this.showLabels) {
        const labelText = `${p.label} (${p.x}, ${p.y})`;
        this.ctx.font = '600 11px "JetBrains Mono", Menlo, monospace';
        const textMetrics = this.ctx.measureText(labelText);
        const textW = textMetrics.width;
        const textH = 14;

        const pillX = sc.x + radius + 4;
        const pillY = sc.y - textH / 2 - 2;

        this.ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        this.ctx.strokeStyle = isConnecting ? '#38bdf8' : '#334155';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.roundRect(pillX - 4, pillY - 2, textW + 8, textH + 4, 4);
        this.ctx.fill();
        this.ctx.stroke();

        this.ctx.fillStyle = '#f8fafc';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(labelText, pillX, pillY + textH / 2);
      }
    }
  }

  renderAxesAndGrid(width, height) {
    // 1. Calculate the exact world bounds visible on screen
    const pTopLeft = this.screenToWorld(0, 0);
    const pBottomRight = this.screenToWorld(width, height);

    const minX = Math.min(pTopLeft.x, pBottomRight.x);
    const maxX = Math.max(pTopLeft.x, pBottomRight.x);
    const minY = Math.min(pTopLeft.y, pBottomRight.y);
    const maxY = Math.max(pTopLeft.y, pBottomRight.y);

    // 2. Dynamic tick spacing (Desmos-style dynamic steps)
    const minPxGap = 65;
    const rawInterval = minPxGap / this.scale;
    const power = Math.pow(10, Math.floor(Math.log10(rawInterval)));
    const normalized = rawInterval / power;
    let step = power;
    if (normalized >= 5) step = 5 * power;
    else if (normalized >= 2) step = 2 * power;
    else step = power;

    let subDiv = 5;
    if (Math.round(step / power) === 2) subDiv = 4;
    const subStep = step / subDiv;

    const isDark = document.querySelector('meta[name="color-scheme"]')?.content !== 'light';

    // 3. Minor Grid Lines (Full row & column lattice across entire plane)
    if (subStep * this.scale >= 9) {
      this.ctx.save();
      this.ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.08)' : 'rgba(100, 116, 139, 0.08)';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();

      const subStartX = Math.floor(minX / subStep) * subStep;
      const subEndX = Math.ceil(maxX / subStep) * subStep;
      for (let x = subStartX; x <= subEndX + subStep * 0.5; x += subStep) {
        if (Math.abs(x / step - Math.round(x / step)) < 1e-4) continue;
        const sx = this.worldToScreen(x, 0).x;
        this.ctx.moveTo(Math.round(sx) + 0.5, 0);
        this.ctx.lineTo(Math.round(sx) + 0.5, height);
      }

      const subStartY = Math.floor(minY / subStep) * subStep;
      const subEndY = Math.ceil(maxY / subStep) * subStep;
      for (let y = subStartY; y <= subEndY + subStep * 0.5; y += subStep) {
        if (Math.abs(y / step - Math.round(y / step)) < 1e-4) continue;
        const sy = this.worldToScreen(0, y).y;
        this.ctx.moveTo(0, Math.round(sy) + 0.5);
        this.ctx.lineTo(width, Math.round(sy) + 0.5);
      }
      this.ctx.stroke();
      this.ctx.restore();
    }

    // 4. Major Grid Lines (Full rows & columns across entire plane)
    this.ctx.save();
    this.ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.22)' : 'rgba(100, 116, 139, 0.22)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();

    const startX = Math.floor(minX / step) * step;
    const endX = Math.ceil(maxX / step) * step;
    for (let x = startX; x <= endX + step * 0.5; x += step) {
      if (Math.abs(x) < 1e-6) continue;
      const sx = this.worldToScreen(x, 0).x;
      this.ctx.moveTo(Math.round(sx) + 0.5, 0);
      this.ctx.lineTo(Math.round(sx) + 0.5, height);
    }

    const startY = Math.floor(minY / step) * step;
    const endY = Math.ceil(maxY / step) * step;
    for (let y = startY; y <= endY + step * 0.5; y += step) {
      if (Math.abs(y) < 1e-6) continue;
      const sy = this.worldToScreen(0, y).y;
      this.ctx.moveTo(0, Math.round(sy) + 0.5);
      this.ctx.lineTo(width, Math.round(sy) + 0.5);
    }
    this.ctx.stroke();
    this.ctx.restore();

    // 5. Main Axes (X = 0, Y = 0)
    const axisY = this.worldToScreen(0, 0).y;
    const axisX = this.worldToScreen(0, 0).x;

    this.ctx.save();
    this.ctx.strokeStyle = isDark ? '#64748b' : '#94a3b8';
    this.ctx.lineWidth = 2;

    // X Axis (Horizontal line at Y = 0)
    this.ctx.beginPath();
    this.ctx.moveTo(0, Math.round(axisY) + 0.5);
    this.ctx.lineTo(width, Math.round(axisY) + 0.5);
    this.ctx.stroke();

    // Y Axis (Vertical line at X = 0)
    this.ctx.beginPath();
    this.ctx.moveTo(Math.round(axisX) + 0.5, 0);
    this.ctx.lineTo(Math.round(axisX) + 0.5, height);
    this.ctx.stroke();
    this.ctx.restore();

    // 6. Draw Row and Column Labels / Numbers
    this.ctx.save();
    this.ctx.font = '500 11px "JetBrains Mono", Menlo, monospace';

    // Column numbers (X ticks)
    for (let x = startX; x <= endX + step * 0.5; x += step) {
      if (Math.abs(x) < 1e-6) continue;
      const sx = this.worldToScreen(x, 0).x;
      if (sx < -20 || sx > width + 20) continue;

      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'top';
      const labelY = Math.max(12, Math.min(height - 24, axisY + 6));

      const valText = Number(x.toFixed(4)).toString();
      const tw = this.ctx.measureText(valText).width;
      this.ctx.fillStyle = isDark ? 'rgba(10, 14, 23, 0.85)' : 'rgba(255, 255, 255, 0.85)';
      this.ctx.fillRect(sx - tw / 2 - 2, labelY - 1, tw + 4, 14);

      this.ctx.fillStyle = isDark ? '#94a3b8' : '#475569';
      this.ctx.fillText(valText, sx, labelY);
    }

    // Row numbers (Y ticks)
    for (let y = startY; y <= endY + step * 0.5; y += step) {
      if (Math.abs(y) < 1e-6) continue;
      const sy = this.worldToScreen(0, y).y;
      if (sy < -20 || sy > height + 20) continue;

      this.ctx.textAlign = 'right';
      this.ctx.textBaseline = 'middle';
      const labelX = Math.max(38, Math.min(width - 10, axisX - 8));

      const valText = Number(y.toFixed(4)).toString();
      const tw = this.ctx.measureText(valText).width;
      this.ctx.fillStyle = isDark ? 'rgba(10, 14, 23, 0.85)' : 'rgba(255, 255, 255, 0.85)';
      this.ctx.fillRect(labelX - tw - 2, sy - 7, tw + 4, 14);

      this.ctx.fillStyle = isDark ? '#94a3b8' : '#475569';
      this.ctx.fillText(valText, labelX, sy);
    }

    // Origin (0, 0)
    if (axisX >= 0 && axisX <= width && axisY >= 0 && axisY <= height) {
      this.ctx.fillStyle = isDark ? 'rgba(10, 14, 23, 0.85)' : 'rgba(255, 255, 255, 0.85)';
      this.ctx.fillRect(axisX - 16, axisY + 4, 14, 14);
      this.ctx.fillStyle = isDark ? '#94a3b8' : '#475569';
      this.ctx.textAlign = 'right';
      this.ctx.textBaseline = 'top';
      this.ctx.fillText('0', axisX - 5, axisY + 5);
    }

    this.ctx.restore();
  }
}

window.PointVisualizer = PointVisualizer;
