/**
 * TraceMatrix — Points & Computational Geometry Visualizer (PointVis)
 * Desmos-grade interactive coordinate plane for CP Geometry:
 * - Points, Segments (x1 y1 x2 y2), Circles (c x y r), Query Pivot Q
 * - Multi-color selection, Undo/Redo, Live Pair/CCW/Polygon Inspector
 * - Strict & Collinear Convex Hull, Closest Pair, Welzl's Min Enclosing Circle,
 *   Segment Intersections, Point-in-Polygon, Shoelace + Pick's, Polar Sort
 */

class PointVisualizer {
  constructor() {
    this.canvas = document.getElementById('point-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.container = document.getElementById('point-canvas-container');

    // Coordinate plane transform
    this.scale = 40;
    this.originX = 0;
    this.originY = 0;

    // Geometry Primitives
    this.points = [];
    this.nextPointId = 1;
    this.segments = [];
    this.nextSegmentId = 1;
    this.circles = [];
    this.nextCircleId = 1;
    this.queryPoint = null; // { x, y }

    // Tools & Options
    this.activeTool = 'move'; // 'move' | 'select' | 'segment' | 'query'
    this.activeColor = '#38bdf8';
    this.snapToInteger = true;
    this.isMatrixCoords = false;
    this.showLabels = true;
    this.closePolygon = false;

    // Interaction state
    this.draggedPoint = null;
    this.dragStartedSnapshot = false;
    this.selectedPoints = [];
    this.selectedSegment = null;
    this.isPanning = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;
    this.hoverPoint = null;
    this.hoverSegment = null;
    this.mouseWorldX = 0;
    this.mouseWorldY = 0;
    this.lastMouseCanvasX = 0;
    this.lastMouseCanvasY = 0;
    this.connectingPoint = null;

    // Algorithm Overlays
    this.convexHull = null;
    this.closestPair = null;
    this.mecCircle = null;
    this.intersections = null;
    this.pipResult = null;
    this.polarPivot = null;
    this.measureResult = null;

    // History Stacks
    this.undoStack = [];
    this.redoStack = [];

    this.initEventListeners();
    this.resizeCanvas();
    const loaded = this.loadState();
    this.syncControlStatesUI();
    if (loaded && (this.points.length > 0 || this.circles.length > 0)) {
      this.fitPoints();
    } else {
      this.resetOrigin();
    }
    this.updateInspector();
    this.updateCursor();
  }

  // ==========================================
  // UNDO / REDO HISTORY
  // ==========================================

  captureSnapshot() {
    const idMap = new Map(this.points.map((p, i) => [p.id, i]));
    return JSON.stringify({
      points: this.points,
      segments: this.segments.map(s => ({
        id: s.id,
        p1Idx: idMap.get(s.p1.id),
        p2Idx: idMap.get(s.p2.id),
        color: s.color
      })).filter(s => s.p1Idx !== undefined && s.p2Idx !== undefined),
      circles: this.circles,
      nextPointId: this.nextPointId,
      nextSegmentId: this.nextSegmentId,
      nextCircleId: this.nextCircleId,
      queryPoint: this.queryPoint
    });
  }

  pushUndo() {
    const snap = this.captureSnapshot();
    if (this.undoStack.length > 0 && this.undoStack[this.undoStack.length - 1] === snap) return;
    this.undoStack.push(snap);
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
  }

  restoreSnapshot(snapStr) {
    const snap = JSON.parse(snapStr);
    this.points = snap.points || [];
    this.circles = snap.circles || [];
    this.nextPointId = snap.nextPointId || (this.points.length + 1);
    this.nextSegmentId = snap.nextSegmentId || 1;
    this.nextCircleId = snap.nextCircleId || 1;
    this.queryPoint = snap.queryPoint || null;
    this.segments = [];
    for (const s of (snap.segments || [])) {
      const p1 = this.points[s.p1Idx];
      const p2 = this.points[s.p2Idx];
      if (p1 && p2) {
        this.segments.push({ id: s.id, p1, p2, color: s.color || '#38bdf8' });
      }
    }
    this.selectedPoints = [];
    this.selectedSegment = null;
    this.clearAlgoOverlays();
    this.updatePointTable();
    this.syncInputTextarea();
    this.updateInspector();
    this.render();
    this.saveState();
  }

  undo() {
    if (this.undoStack.length === 0) {
      window.App?.showToast('Nothing to undo', 'info');
      return;
    }
    this.redoStack.push(this.captureSnapshot());
    this.restoreSnapshot(this.undoStack.pop());
    window.App?.showToast('Undid geometry change', 'info');
  }

  redo() {
    if (this.redoStack.length === 0) {
      window.App?.showToast('Nothing to redo', 'info');
      return;
    }
    this.undoStack.push(this.captureSnapshot());
    this.restoreSnapshot(this.redoStack.pop());
    window.App?.showToast('Redid geometry change', 'info');
  }

  clearAlgoOverlays() {
    this.convexHull = null;
    this.closestPair = null;
    this.mecCircle = null;
    this.intersections = null;
    this.pipResult = null;
    this.polarPivot = null;
    this.measureResult = null;
    for (const p of this.points) {
      delete p.polarIdx;
    }
    document.getElementById('geom-results-box')?.classList.add('hidden');
  }

  // ==========================================
  // VIEWPORT & ZOOM
  // ==========================================

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
    if (!this.container) return;
    const rect = this.container.getBoundingClientRect();
    this.originX = Math.round(rect.width / 2);
    this.originY = Math.round(rect.height / 2);
    this.scale = 40;
    this.updateStatusPill();
    this.render();
  }

  fitPoints() {
    if (this.points.length === 0 && this.circles.length === 0) {
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
    for (const c of this.circles) {
      minX = Math.min(minX, c.x - c.r);
      maxX = Math.max(maxX, c.x + c.r);
      minY = Math.min(minY, c.y - c.r);
      maxY = Math.max(maxY, c.y + c.r);
    }
    const spanX = Math.max(3, maxX - minX);
    const spanY = Math.max(3, maxY - minY);

    const pad = 90;
    const scaleX = (rect.width - pad * 2) / spanX;
    const scaleY = (rect.height - pad * 2) / spanY;
    this.scale = Math.max(8, Math.min(120, Math.min(scaleX, scaleY)));

    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    this.originX = rect.width / 2 - midX * this.scale;
    this.originY = rect.height / 2 + (this.isMatrixCoords ? -midY * this.scale : midY * this.scale);

    this.updateStatusPill();
    this.render();
  }

  // ==========================================
  // EVENT LISTENERS
  // ==========================================

  initEventListeners() {
    window.addEventListener('resize', () => this.resizeCanvas());

    // Tool Buttons
    document.querySelectorAll('[data-point-tool]').forEach(btn => {
      btn.addEventListener('click', () => this.setActiveTool(btn.dataset.pointTool));
    });

    // Zoom & Esc Buttons
    document.getElementById('point-zoom-in')?.addEventListener('click', () => this.zoom(1.25));
    document.getElementById('point-zoom-out')?.addEventListener('click', () => this.zoom(0.8));
    document.getElementById('point-zoom-fit')?.addEventListener('click', () => this.fitPoints());
    document.getElementById('point-zoom-reset')?.addEventListener('click', () => this.resetOrigin());
    document.getElementById('point-btn-esc')?.addEventListener('click', () => this.cancelAllActivities());

    // Options Toggles
    document.getElementById('point-snap-int')?.addEventListener('change', (e) => {
      this.snapToInteger = e.target.checked;
      this.saveState();
    });
    document.getElementById('point-system-toggle')?.addEventListener('change', (e) => {
      this.isMatrixCoords = e.target.checked;
      this.updateInspector();
      this.render();
      this.saveState();
    });
    document.getElementById('point-show-labels')?.addEventListener('change', (e) => {
      this.showLabels = e.target.checked;
      this.render();
      this.saveState();
    });
    document.getElementById('point-close-poly')?.addEventListener('change', (e) => {
      this.closePolygon = e.target.checked;
      this.updateInspector();
      this.render();
      this.saveState();
    });

    // Manual Point / Circle Add
    const addManualFn = () => {
      const x = parseFloat(document.getElementById('manual-x')?.value);
      const y = parseFloat(document.getElementById('manual-y')?.value);
      const r = parseFloat(document.getElementById('manual-r')?.value);
      const vx = !isNaN(x) ? x : 0;
      const vy = !isNaN(y) ? y : 0;
      this.pushUndo();
      if (!isNaN(r) && r > 0) {
        this.addCircle(vx, vy, r);
      } else {
        this.addPoint(vx, vy);
      }
    };
    document.getElementById('btn-add-manual-pt')?.addEventListener('click', addManualFn);
    document.querySelectorAll('#pt-quick-add input').forEach(inp => {
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addManualFn();
        }
      });
    });

    // Utility Segmented Bar (Undo, Redo, Random, Clear) & Copy
    document.getElementById('btn-pt-undo')?.addEventListener('click', () => this.undo());
    document.getElementById('btn-pt-redo')?.addEventListener('click', () => this.redo());
    document.getElementById('btn-pt-random')?.addEventListener('click', () => this.addRandomPoints(8));
    document.getElementById('btn-pt-copy-io')?.addEventListener('click', () => this.copyCppPoints());

    document.getElementById('btn-clear-points')?.addEventListener('click', () => {
      if (this.points.length || this.segments.length || this.circles.length || this.queryPoint) {
        this.pushUndo();
      }
      this.points = [];
      this.segments = [];
      this.circles = [];
      this.queryPoint = null;
      this.selectedPoints = [];
      this.selectedSegment = null;
      this.connectingPoint = null;
      this.nextPointId = 1;
      this.nextSegmentId = 1;
      this.nextCircleId = 1;
      this.clearAlgoOverlays();
      const rawInput = document.getElementById('points-raw-input');
      if (rawInput) rawInput.value = '';
      this.updatePointTable();
      this.updateInspector();
      this.render();
      this.saveState();
      window.App?.showToast('Cleared all points, segments & circles', 'info');
    });

    // Color Palette
    document.querySelectorAll('[data-pt-color]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setActiveColor(btn.dataset.ptColor, btn);
        this.applyColorToSelection(this.activeColor);
      });
    });

    const customPicker = document.getElementById('pt-custom-color');
    customPicker?.addEventListener('input', (e) => {
      this.setActiveColor(e.target.value, null);
      this.applyColorToSelection(this.activeColor, false);
    });
    customPicker?.addEventListener('change', (e) => {
      this.setActiveColor(e.target.value, null);
      this.applyColorToSelection(this.activeColor, false);
      this.saveState();
    });

    document.getElementById('btn-pt-uncolor')?.addEventListener('click', () => {
      this.applyColorToSelection('#38bdf8');
    });
    document.getElementById('btn-pt-clear-colors')?.addEventListener('click', () => {
      this.pushUndo();
      for (const p of this.points) p.color = '#38bdf8';
      for (const s of this.segments) s.color = '#38bdf8';
      for (const c of this.circles) c.color = '#38bdf8';
      this.render();
      this.saveState();
      window.App?.showToast('Reset all point & line colors', 'info');
    });

    // Coordinate Transforms
    document.getElementById('btn-pt-rot90')?.addEventListener('click', () => this.transformPoints('rot90'));
    document.getElementById('btn-pt-flipx')?.addEventListener('click', () => this.transformPoints('flipx'));
    document.getElementById('btn-pt-flipy')?.addEventListener('click', () => this.transformPoints('flipy'));
    document.getElementById('btn-pt-center')?.addEventListener('click', () => this.transformPoints('center'));

    // Algorithm Buttons
    document.getElementById('btn-convex-hull')?.addEventListener('click', () => this.computeConvexHull(false));
    document.getElementById('btn-collinear-hull')?.addEventListener('click', () => this.computeConvexHull(true));
    document.getElementById('btn-closest-pair')?.addEventListener('click', () => this.computeClosestPair());
    document.getElementById('btn-mec')?.addEventListener('click', () => this.computeMinEnclosingCircle());
    document.getElementById('btn-seg-intersect')?.addEventListener('click', () => this.computeSegmentIntersections());
    document.getElementById('btn-point-in-poly')?.addEventListener('click', () => this.computePointInPolygon());
    document.getElementById('btn-polygon-shoelace')?.addEventListener('click', () => this.computePolygonArea());
    document.getElementById('btn-polar-sort')?.addEventListener('click', () => this.computePolarSort());

    document.getElementById('btn-close-geom-res')?.addEventListener('click', () => {
      document.getElementById('geom-results-box')?.classList.add('hidden');
    });

    // Raw I/O
    const rawPointsInput = document.getElementById('points-raw-input');
    rawPointsInput?.addEventListener('paste', () => {
      this.pushUndo();
      setTimeout(() => this.parseRawPoints(true, true), 50);
    });
    rawPointsInput?.addEventListener('input', () => {
      clearTimeout(this._inputSyncTimer);
      this._inputSyncTimer = setTimeout(() => {
        this.parseRawPoints(false, false);
      }, 220);
    });
    rawPointsInput?.addEventListener('change', () => {
      clearTimeout(this._inputSyncTimer);
      this.parseRawPoints(false, false);
    });

    // Canvas Mouse & Wheel
    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    window.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    this.canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
    this.canvas.addEventListener('dblclick', (e) => this.handleDoubleClick(e));
    this.canvas.addEventListener('contextmenu', (e) => this.handleContextMenu(e));

    window.addEventListener('beforeunload', () => this.saveState());
  }

  setActiveTool(tool) {
    this.activeTool = tool || 'move';
    document.querySelectorAll('[data-point-tool]').forEach(b => {
      b.classList.toggle('active', b.dataset.pointTool === this.activeTool);
    });
    this.connectingPoint = null;
    this.updateCursor();
    this.render();
    this.saveState();
  }

  setActiveColor(color, activeSwatchBtn = null) {
    this.activeColor = color;
    document.querySelectorAll('[data-pt-color]').forEach(btn => {
      btn.classList.toggle('active', activeSwatchBtn ? btn === activeSwatchBtn : btn.dataset.ptColor === color);
    });
    const picker = document.getElementById('pt-custom-color');
    if (picker && /^#[0-9a-fA-F]{6}$/.test(color)) picker.value = color;
    this.saveState();
  }

  applyColorToSelection(color, showToast = true) {
    const hasSel = this.selectedPoints.length > 0 || !!this.selectedSegment;
    if (!hasSel) return;
    this.pushUndo();
    for (const p of this.selectedPoints) p.color = color;
    if (this.selectedSegment) this.selectedSegment.color = color;
    this.render();
    this.saveState();
    if (showToast) {
      window.App?.showToast('Updated color of selection', 'info');
    }
  }

  // ==========================================
  // COORDINATES & HIT TESTING
  // ==========================================

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
      if (Math.hypot(sc.x - sx, sc.y - sy) <= hitRadius) return p;
    }
    return null;
  }

  findSegmentAt(sx, sy, hitRadius = 8) {
    for (let i = this.segments.length - 1; i >= 0; i--) {
      const seg = this.segments[i];
      const sc1 = this.worldToScreen(seg.p1.x, seg.p1.y);
      const sc2 = this.worldToScreen(seg.p2.x, seg.p2.y);
      if (this.distToSegment(sx, sy, sc1.x, sc1.y, sc2.x, sc2.y) <= hitRadius) return seg;
    }
    return null;
  }

  findCircleAt(sx, sy, hitRadius = 8) {
    for (let i = this.circles.length - 1; i >= 0; i--) {
      const c = this.circles[i];
      const sc = this.worldToScreen(c.x, c.y);
      const rPx = c.r * this.scale;
      const distEdge = Math.abs(Math.hypot(sx - sc.x, sy - sc.y) - rPx);
      if (distEdge <= hitRadius) return c;
    }
    return null;
  }

  distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  updateCursor() {
    if (!this.canvas) return;
    if (this.isPanning || this.draggedPoint) {
      this.canvas.style.cursor = 'grabbing';
    } else if (this.connectingPoint || this.activeTool === 'query' || this.activeTool === 'segment') {
      this.canvas.style.cursor = this.hoverPoint ? 'pointer' : 'crosshair';
    } else if (this.hoverPoint || this.hoverSegment) {
      this.canvas.style.cursor = 'pointer';
    } else if (this.activeTool === 'move') {
      this.canvas.style.cursor = 'grab';
    } else {
      this.canvas.style.cursor = 'crosshair';
    }
  }

  // ==========================================
  // MOUSE INTERACTIONS
  // ==========================================

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

    if (this.connectingPoint) {
      if (clickedPoint && clickedPoint !== this.connectingPoint) {
        this.pushUndo();
        this.addSegment(this.connectingPoint, clickedPoint);
        window.App?.showToast(`Connected ${this.connectingPoint.label} — ${clickedPoint.label}`, 'success');
        this.connectingPoint = null;
        this.updateInspector();
        this.updateCursor();
        this.render();
        return;
      } else if (!clickedPoint) {
        this.connectingPoint = null;
        this.updateCursor();
        this.render();
      }
    }

    if (this.activeTool === 'query') {
      this.pushUndo();
      const w = this.screenToWorld(sx, sy);
      const qx = this.snapToInteger ? Math.round(w.x) : Number(w.x.toFixed(2));
      const qy = this.snapToInteger ? Math.round(w.y) : Number(w.y.toFixed(2));
      this.queryPoint = { x: qx, y: qy };
      this.updateInspector();
      this.render();
      this.saveState();
      window.App?.showToast(`Query point Q placed at (${qx}, ${qy})`, 'info');
      return;
    }

    if (this.activeTool === 'segment') {
      if (clickedPoint) {
        this.connectingPoint = clickedPoint;
        window.App?.showToast(`Connecting from ${clickedPoint.label} — click target point`, 'info');
        this.render();
      }
      this.updateCursor();
      return;
    }

    if (this.activeTool === 'select') {
      if (clickedPoint) {
        this.selectedSegment = null;
        const idx = this.selectedPoints.indexOf(clickedPoint);
        if (idx >= 0) this.selectedPoints.splice(idx, 1);
        else this.selectedPoints.push(clickedPoint);
      } else {
        const seg = this.findSegmentAt(sx, sy);
        if (seg) {
          this.selectedSegment = seg;
          this.selectedPoints = [seg.p1, seg.p2];
        } else {
          this.selectedPoints = [];
          this.selectedSegment = null;
          this.isPanning = true;
          this.lastMouseX = e.clientX;
          this.lastMouseY = e.clientY;
        }
      }
      this.updateInspector();
      this.updateCursor();
      this.render();
      return;
    }

    // Default 'move' tool
    if (clickedPoint) {
      this.draggedPoint = clickedPoint;
      this.dragStartedSnapshot = false;
      this.downScreenPos = { x: sx, y: sy };
      this.dragMoved = false;
    } else {
      const seg = this.findSegmentAt(sx, sy);
      if (seg) {
        this.selectedSegment = seg;
        this.selectedPoints = [seg.p1, seg.p2];
        this.updateInspector();
        this.render();
      } else {
        this.selectedPoints = [];
        this.selectedSegment = null;
        this.isPanning = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.updateInspector();
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
      if (!this.dragMoved && this.downScreenPos) {
        if (Math.hypot(sx - this.downScreenPos.x, sy - this.downScreenPos.y) < 4) {
          return;
        }
        this.dragMoved = true;
      }
      if (!this.dragStartedSnapshot) {
        this.pushUndo();
        this.dragStartedSnapshot = true;
      }
      this.draggedPoint.x = this.snapToInteger ? Math.round(world.x) : Number(world.x.toFixed(2));
      this.draggedPoint.y = this.snapToInteger ? Math.round(world.y) : Number(world.y.toFixed(2));
      this.updatePointTable();
      this.updateInspector();
      this.render();
      return;
    }

    this.hoverPoint = this.findPointAt(sx, sy);
    this.hoverSegment = this.findSegmentAt(sx, sy);
    this.updateCursor();
    this.render();
  }

  handleMouseUp(e) {
    let stateChanged = false;
    if (this.draggedPoint) {
      if (!this.dragMoved) {
        this.selectedSegment = null;
        const idx = this.selectedPoints.indexOf(this.draggedPoint);
        if (idx >= 0) this.selectedPoints.splice(idx, 1);
        else this.selectedPoints.push(this.draggedPoint);
        this.updateInspector();
      } else {
        this.syncInputTextarea();
        stateChanged = true;
      }
    }
    if (this.connectingPoint && this.draggedPoint && this.draggedPoint === this.connectingPoint) {
      const rect = this.container.getBoundingClientRect();
      const targetPoint = this.findPointAt(e.clientX - rect.left, e.clientY - rect.top);
      if (targetPoint && targetPoint !== this.connectingPoint) {
        this.pushUndo();
        this.addSegment(this.connectingPoint, targetPoint);
        this.connectingPoint = null;
        stateChanged = true;
      }
    }
    this.isPanning = false;
    this.draggedPoint = null;
    this.dragStartedSnapshot = false;
    this.updateCursor();
    this.render();
    if (stateChanged) this.saveState();
  }

  handleDoubleClick(e) {
    const rect = this.container.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const clickedPoint = this.findPointAt(sx, sy);

    if (!clickedPoint) {
      const world = this.screenToWorld(sx, sy);
      const wx = this.snapToInteger ? Math.round(world.x) : Number(world.x.toFixed(2));
      const wy = this.snapToInteger ? Math.round(world.y) : Number(world.y.toFixed(2));
      const exists = this.points.some(p => Math.abs(p.x - wx) < 1e-6 && Math.abs(p.y - wy) < 1e-6);
      if (!exists) {
        this.pushUndo();
        const pt = this.addPoint(wx, wy);
        window.App?.showToast(`Added point ${pt.label} (${wx}, ${wy})`, 'success');
      }
      return;
    }

    if (this.connectingPoint && this.connectingPoint !== clickedPoint) {
      this.pushUndo();
      this.addSegment(this.connectingPoint, clickedPoint);
      window.App?.showToast(`Connected ${this.connectingPoint.label} — ${clickedPoint.label}`, 'success');
      this.connectingPoint = null;
    } else {
      this.connectingPoint = clickedPoint;
      window.App?.showToast(`Connecting from ${clickedPoint.label} — click another point`, 'info');
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
      this.pushUndo();
      this.deletePoint(clickedPoint.id);
      window.App?.showToast(`Deleted point ${clickedPoint.label}`, 'info');
      return;
    }

    const seg = this.findSegmentAt(sx, sy);
    if (seg) {
      this.pushUndo();
      this.deleteSegment(seg.id);
      window.App?.showToast(`Deleted line ${seg.p1.label} — ${seg.p2.label}`, 'info');
      return;
    }

    const circ = this.findCircleAt(sx, sy);
    if (circ) {
      this.pushUndo();
      this.circles = this.circles.filter(c => c.id !== circ.id);
      this.syncInputTextarea();
      this.render();
      this.saveState();
      window.App?.showToast(`Deleted circle (${circ.x}, ${circ.y}, r=${circ.r})`, 'info');
    }
  }

  cancelConnecting() {
    if (this.connectingPoint) {
      this.connectingPoint = null;
      this.updateCursor();
      this.render();
    }
  }

  cancelAllActivities() {
    const hadActivity = !!(
      this.connectingPoint ||
      this.selectedPoints.length > 0 ||
      this.selectedSegment ||
      this.draggedPoint ||
      this.isPanning ||
      this.convexHull ||
      this.closestPair ||
      this.mecCircle ||
      this.intersections ||
      this.pipResult ||
      this.polarPivot ||
      this.measureResult ||
      this.activeTool !== 'move'
    );
    this.connectingPoint = null;
    this.selectedPoints = [];
    this.selectedSegment = null;
    this.draggedPoint = null;
    this.isPanning = false;
    this.clearAlgoOverlays();
    this.setActiveTool('move');
    this.updateInspector();
    this.updateCursor();
    this.render();
    if (hadActivity) {
      window.App?.showToast('Cancelled active geometry tools & overlays', 'info');
    }
  }

  // ==========================================
  // PRIMITIVE MUTATORS & TRANSFORMS
  // ==========================================

  addPoint(x, y, label = null, syncText = true) {
    const id = this.nextPointId++;
    const newPt = {
      id,
      x,
      y,
      label: label || this.getAlphabetLabel(id),
      color: this.activeColor || '#38bdf8'
    };
    this.points.push(newPt);
    this.updatePointTable();
    if (syncText) this.syncInputTextarea();
    this.updateInspector();
    this.render();
    this.saveState();
    return newPt;
  }

  addSegment(p1, p2, color = null, syncText = false) {
    if (!p1 || !p2 || p1.id === p2.id) return null;
    const exists = this.segments.some(s =>
      (s.p1.id === p1.id && s.p2.id === p2.id) ||
      (s.p1.id === p2.id && s.p2.id === p1.id)
    );
    if (exists) return null;
    const seg = { id: this.nextSegmentId++, p1, p2, color: color || this.activeColor || '#38bdf8' };
    this.segments.push(seg);
    if (syncText) this.syncInputTextarea();
    this.render();
    this.saveState();
    return seg;
  }

  addCircle(x, y, r, syncText = true) {
    const c = { id: this.nextCircleId++, x, y, r, color: this.activeColor || '#38bdf8' };
    this.circles.push(c);
    if (syncText) this.syncInputTextarea();
    this.updatePointTable();
    this.render();
    this.saveState();
    return c;
  }

  deleteSegment(id) {
    if (this.selectedSegment && this.selectedSegment.id === id) {
      this.selectedSegment = null;
    }
    this.segments = this.segments.filter(s => s.id !== id);
    this.updateInspector();
    this.render();
    this.saveState();
  }

  deletePoint(id) {
    this.points = this.points.filter(p => p.id !== id);
    this.selectedPoints = this.selectedPoints.filter(p => p.id !== id);
    this.segments = this.segments.filter(s => s.p1.id !== id && s.p2.id !== id);
    if (this.connectingPoint && this.connectingPoint.id === id) this.connectingPoint = null;
    this.updatePointTable();
    this.syncInputTextarea();
    this.updateInspector();
    this.render();
    this.saveState();
  }

  addRandomPoints(count = 8) {
    this.pushUndo();
    for (let i = 0; i < count; i++) {
      const x = Math.floor(Math.random() * 17) - 8;
      const y = Math.floor(Math.random() * 17) - 8;
      if (!this.points.some(p => p.x === x && p.y === y)) {
        this.addPoint(x, y, null, false);
      }
    }
    this.syncInputTextarea();
    this.fitPoints();
    this.saveState();
    window.App?.showToast(`Added random points`, 'info');
  }

  transformPoints(op) {
    if (this.points.length === 0 && this.circles.length === 0) return;
    this.pushUndo();
    if (op === 'rot90') {
      for (const p of this.points) {
        const nx = -p.y, ny = p.x;
        p.x = nx; p.y = ny;
      }
      for (const c of this.circles) {
        const nx = -c.y, ny = c.x;
        c.x = nx; c.y = ny;
      }
    } else if (op === 'flipx') {
      for (const p of this.points) p.y = -p.y;
      for (const c of this.circles) c.y = -c.y;
    } else if (op === 'flipy') {
      for (const p of this.points) p.x = -p.x;
      for (const c of this.circles) c.x = -c.x;
    } else if (op === 'center' && this.points.length > 0) {
      let sx = 0, sy = 0;
      for (const p of this.points) { sx += p.x; sy += p.y; }
      const dx = Math.round(sx / this.points.length);
      const dy = Math.round(sy / this.points.length);
      for (const p of this.points) { p.x -= dx; p.y -= dy; }
      for (const c of this.circles) { c.x -= dx; c.y -= dy; }
    }
    this.clearAlgoOverlays();
    this.syncInputTextarea();
    this.updatePointTable();
    this.updateInspector();
    this.fitPoints();
    this.saveState();
  }

  syncInputTextarea() {
    const rawInput = document.getElementById('points-raw-input');
    if (!rawInput || document.activeElement === rawInput) return;

    const lines = this.points.map(p => `${p.x} ${p.y}`);
    for (const c of this.circles) {
      lines.push(`c ${c.x} ${c.y} ${c.r}`);
    }
    rawInput.value = lines.join('\n');
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
    const badge = document.getElementById('point-count-badge');
    if (badge) {
      const cSuffix = this.circles.length > 0 ? ` · ${this.circles.length} cir` : '';
      badge.textContent = `${this.points.length} pts${cSuffix}`;
    }
  }

  updateStatusPill() {
    const cursorEl = document.getElementById('point-status-cursor');
    const distEl = document.getElementById('point-status-dist');
    const zoomEl = document.getElementById('point-status-zoom');

    if (cursorEl) cursorEl.textContent = `X: ${this.mouseWorldX.toFixed(2)}, Y: ${this.mouseWorldY.toFixed(2)}`;
    if (distEl) {
      const ref = this.selectedPoints.length > 0 ? this.selectedPoints[this.selectedPoints.length - 1] : { x: 0, y: 0 };
      const d = Math.hypot(this.mouseWorldX - ref.x, this.mouseWorldY - ref.y);
      distEl.textContent = `Dist: ${d.toFixed(2)}`;
    }
    if (zoomEl) zoomEl.textContent = `${(this.scale / 40).toFixed(1)}×`;
  }

  // ==========================================
  // LIVE INSPECTOR
  // ==========================================

  updateInspector() {
    const selEl = document.getElementById('pt-stat-selection');
    const l1 = document.getElementById('pt-lbl-m1');
    const v1 = document.getElementById('pt-stat-metric1');
    const l2 = document.getElementById('pt-lbl-m2');
    const v2 = document.getElementById('pt-stat-metric2');
    const l3 = document.getElementById('pt-lbl-m3');
    const v3 = document.getElementById('pt-stat-metric3');
    if (!selEl || !l1 || !v1 || !l2 || !v2 || !l3 || !v3) return;

    const pts = this.selectedPoints;
    if (pts.length === 1) {
      const p = pts[0];
      const mag = Math.hypot(p.x, p.y);
      const ang = ((Math.atan2(p.y, p.x) * 180) / Math.PI).toFixed(1);
      selEl.textContent = `${p.label}(${p.x}, ${p.y})`;
      l1.textContent = 'Dist to Origin:';
      v1.textContent = mag.toFixed(3);
      l2.textContent = 'Polar Angle:';
      v2.textContent = `${ang}°`;
      l3.textContent = 'L1 / L∞:';
      v3.textContent = `${Math.abs(p.x) + Math.abs(p.y)} / ${Math.max(Math.abs(p.x), Math.abs(p.y))}`;
      return;
    }

    if (pts.length === 2) {
      const [A, B] = pts;
      const dx = B.x - A.x, dy = B.y - A.y;
      const l2Dist = Math.hypot(dx, dy);
      const l1Dist = Math.abs(dx) + Math.abs(dy);
      const slope = dx === 0 ? '∞' : (dy / dx).toFixed(3);
      selEl.textContent = `${A.label}(${A.x},${A.y}) — ${B.label}(${B.x},${B.y})`;
      l1.textContent = 'Length (L2):';
      v1.textContent = l2Dist.toFixed(4);
      l2.textContent = 'L1 / Slope:';
      v2.textContent = `${l1Dist} / ${slope}`;
      l3.textContent = 'Midpoint:';
      v3.textContent = `(${((A.x + B.x) / 2).toFixed(2)}, ${((A.y + B.y) / 2).toFixed(2)})`;
      return;
    }

    if (pts.length === 3) {
      const [A, B, C] = pts;
      const cross = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x);
      const dot = (B.x - A.x) * (C.x - A.x) + (B.y - A.y) * (C.y - A.y);
      const turn = cross > 0 ? 'CCW' : (cross < 0 ? 'CW' : 'Collinear');
      const ang = (Math.acos(Math.max(-1, Math.min(1, dot / (Math.hypot(B.x - A.x, B.y - A.y) * Math.hypot(C.x - A.x, C.y - A.y) || 1)))) * 180 / Math.PI).toFixed(1);
      selEl.textContent = `${A.label} → ${B.label} → ${C.label}`;
      l1.textContent = 'Cross / Turn:';
      v1.textContent = `${cross} (${turn})`;
      l2.textContent = 'Angle ∠BAC:';
      v2.textContent = `${ang}°`;
      l3.textContent = 'Dot Product:';
      v3.textContent = `${dot}`;
      return;
    }

    const poly = pts.length >= 4 ? pts : (this.points.length >= 3 ? this.points : []);
    if (poly.length >= 3) {
      const { area, perimeter, boundary, interior, orientation } = this.calcPolygonMetrics(poly);
      selEl.textContent = `${pts.length >= 4 ? 'Sel' : 'All'} Poly (${poly.length} v)`;
      l1.textContent = 'Shoelace Area:';
      v1.textContent = `${area.toFixed(2)} (${orientation})`;
      l2.textContent = 'Perimeter:';
      v2.textContent = perimeter.toFixed(3);
      l3.textContent = "Pick's B / I:";
      v3.textContent = `${boundary} / ${Number.isInteger(interior) ? interior : interior.toFixed(1)}`;
      return;
    }

    selEl.textContent = this.queryPoint ? `Q(${this.queryPoint.x}, ${this.queryPoint.y})` : 'None';
    l1.textContent = 'Metric 1:'; v1.textContent = '-';
    l2.textContent = 'Metric 2:'; v2.textContent = '-';
    l3.textContent = 'Metric 3:'; v3.textContent = '-';
  }

  calcPolygonMetrics(pts) {
    const n = pts.length;
    let signedArea2 = 0, boundary = 0, perimeter = 0;
    const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      signedArea2 += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
      perimeter += Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y);
      boundary += gcd(Math.round(Math.abs(pts[j].x - pts[i].x)), Math.round(Math.abs(pts[j].y - pts[i].y)));
    }
    const area = Math.abs(signedArea2) / 2;
    const orientation = signedArea2 === 0 ? 'Collinear' : (signedArea2 > 0 ? (this.isMatrixCoords ? 'CW' : 'CCW') : (this.isMatrixCoords ? 'CCW' : 'CW'));
    const interior = area - boundary / 2 + 1;
    return { area, perimeter, boundary, interior, orientation, signedArea2 };
  }

  // ==========================================
  // CP COMPUTATIONAL GEOMETRY ALGORITHMS
  // ==========================================

  computeConvexHull(includeCollinear = false) {
    if (this.points.length < 3) {
      window.App?.showToast('Convex Hull requires at least 3 points', 'error');
      return;
    }

    const sorted = [...this.points].sort((a, b) => (a.x !== b.x ? a.x - b.x : a.y - b.y));
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

    const lower = [];
    for (const p of sorted) {
      while (lower.length >= 2) {
        const cr = cross(lower[lower.length - 2], lower[lower.length - 1], p);
        if (includeCollinear ? cr < 0 : cr <= 0) lower.pop();
        else break;
      }
      lower.push(p);
    }

    // Check if all sorted points are collinear when includeCollinear is true
    let hull;
    if (includeCollinear && lower.length === sorted.length && cross(sorted[0], sorted[1], sorted[sorted.length - 1]) === 0) {
      hull = lower;
    } else {
      const upper = [];
      for (let i = sorted.length - 1; i >= 0; i--) {
        const p = sorted[i];
        while (upper.length >= 2) {
          const cr = cross(upper[upper.length - 2], upper[upper.length - 1], p);
          if (includeCollinear ? cr < 0 : cr <= 0) upper.pop();
          else break;
        }
        upper.push(p);
      }
      lower.pop();
      upper.pop();
      hull = lower.concat(upper);
    }

    this.convexHull = hull;

    let perimeter = 0, area2 = 0, maxDiam = 0;
    const n = hull.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      perimeter += Math.hypot(hull[j].x - hull[i].x, hull[j].y - hull[i].y);
      area2 += hull[i].x * hull[j].y - hull[j].x * hull[i].y;
      for (let k = i + 1; k < n; k++) {
        maxDiam = Math.max(maxDiam, Math.hypot(hull[k].x - hull[i].x, hull[k].y - hull[i].y));
      }
    }

    this.showGeometryResult(includeCollinear ? 'Convex Hull (With Collinear)' : 'Convex Hull (Monotone Chain)', `
      <div><strong>Vertices (${n}):</strong> ${hull.map(p => p.label).join(' → ')}</div>
      <div><strong>Area:</strong> ${(Math.abs(area2) / 2).toFixed(3)} | <strong>Perim:</strong> ${perimeter.toFixed(3)}</div>
      <div><strong>Hull Diameter:</strong> ${maxDiam.toFixed(4)}</div>
    `);
    this.render();
  }

  computeClosestPair() {
    if (this.points.length < 2) {
      window.App?.showToast('Need at least 2 points for closest pair', 'error');
      return;
    }
    let minDist = Infinity, p1 = null, p2 = null;
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
    const l1 = Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);
    const linf = Math.max(Math.abs(p1.x - p2.x), Math.abs(p1.y - p2.y));

    this.showGeometryResult('Closest Pair of Points', `
      <div><strong>Pair:</strong> ${p1.label}(${p1.x},${p1.y}) — ${p2.label}(${p2.x},${p2.y})</div>
      <div><strong>L₂:</strong> <strong class="text-accent">${minDist.toFixed(4)}</strong> | <strong>L₁:</strong> ${l1} | <strong>L∞:</strong> ${linf}</div>
    `);
    this.render();
  }

  computeMinEnclosingCircle() {
    if (this.points.length === 0) {
      window.App?.showToast('Add at least 1 point for Min Enclosing Circle', 'error');
      return;
    }
    const pts = [...this.points].sort(() => Math.random() - 0.5);
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const inCircle = (c, p) => c && dist(c, p) <= c.r + 1e-7;
    const circle2 = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, r: dist(a, b) / 2 });
    const circle3 = (a, b, c) => {
      const D = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
      if (Math.abs(D) < 1e-9) {
        const c1 = circle2(a, b), c2 = circle2(b, c), c3 = circle2(a, c);
        return [c1, c2, c3].sort((u, v) => v.r - u.r).find(ci => inCircle(ci, a) && inCircle(ci, b) && inCircle(ci, c));
      }
      const a2 = a.x * a.x + a.y * a.y;
      const b2 = b.x * b.x + b.y * b.y;
      const c2 = c.x * c.x + c.y * c.y;
      const ux = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / D;
      const uy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / D;
      return { x: ux, y: uy, r: Math.hypot(ux - a.x, uy - a.y) };
    };

    let c = { x: pts[0].x, y: pts[0].y, r: 0 };
    for (let i = 1; i < pts.length; i++) {
      if (!inCircle(c, pts[i])) {
        c = { x: pts[i].x, y: pts[i].y, r: 0 };
        for (let j = 0; j < i; j++) {
          if (!inCircle(c, pts[j])) {
            c = circle2(pts[i], pts[j]);
            for (let k = 0; k < j; k++) {
              if (!inCircle(c, pts[k])) {
                c = circle3(pts[i], pts[j], pts[k]);
              }
            }
          }
        }
      }
    }

    this.mecCircle = c;
    this.showGeometryResult('Smallest Enclosing Circle (Welzl)', `
      <div><strong>Center:</strong> (${c.x.toFixed(3)}, ${c.y.toFixed(3)})</div>
      <div><strong>Radius (R):</strong> <strong class="text-accent">${c.r.toFixed(4)}</strong> | Area: ${(Math.PI * c.r * c.r).toFixed(3)}</div>
    `);
    this.render();
  }

  getActiveSegmentsForIntersection() {
    const segs = [...this.segments];
    if (this.closePolygon && this.points.length >= 3) {
      for (let i = 0; i < this.points.length; i++) {
        segs.push({ p1: this.points[i], p2: this.points[(i + 1) % this.points.length], label: `${this.points[i].label}${this.points[(i + 1) % this.points.length].label}` });
      }
    }
    return segs;
  }

  computeSegmentIntersections() {
    const segs = this.getActiveSegmentsForIntersection();
    if (segs.length < 2) {
      window.App?.showToast('Need at least 2 segments (draw lines or paste x1 y1 x2 y2)', 'error');
      return;
    }

    const hits = [];
    const cross = (ax, ay, bx, by) => ax * by - ay * bx;
    const onSeg = (px, py, qx, qy, rx, ry) =>
      rx >= Math.min(px, qx) - 1e-9 && rx <= Math.max(px, qx) + 1e-9 &&
      ry >= Math.min(py, qy) - 1e-9 && ry <= Math.max(py, qy) + 1e-9;

    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        const A = segs[i].p1, B = segs[i].p2;
        const C = segs[j].p1, D = segs[j].p2;
        if (A === C || A === D || B === C || B === D) continue; // skip shared polygon vertices

        const rx = B.x - A.x, ry = B.y - A.y;
        const sx = D.x - C.x, sy = D.y - C.y;
        const denom = cross(rx, ry, sx, sy);
        const qpx = C.x - A.x, qpy = C.y - A.y;

        if (Math.abs(denom) > 1e-9) {
          const t = cross(qpx, qpy, sx, sy) / denom;
          const u = cross(qpx, qpy, rx, ry) / denom;
          if (t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) {
            hits.push({ x: A.x + t * rx, y: A.y + t * ry, pair: `${A.label}${B.label} ∩ ${C.label}${D.label}` });
          }
        } else if (Math.abs(cross(qpx, qpy, rx, ry)) < 1e-9) {
          // Collinear overlap check
          for (const pt of [C, D]) {
            if (onSeg(A.x, A.y, B.x, B.y, pt.x, pt.y)) {
              hits.push({ x: pt.x, y: pt.y, pair: `${A.label}${B.label} ∩ ${C.label}${D.label} (overlap)` });
            }
          }
        }
      }
    }

    this.intersections = hits;
    const summary = hits.length > 0
      ? hits.slice(0, 5).map(h => `(${h.x.toFixed(2)}, ${h.y.toFixed(2)}) [${h.pair}]`).join('<br>')
      : 'No non-vertex crossings found';
    this.showGeometryResult(`Segment Intersections (${hits.length})`, summary);
    this.render();
  }

  computePointInPolygon() {
    const poly = this.selectedPoints.length >= 3 ? this.selectedPoints : this.points;
    if (poly.length < 3) {
      window.App?.showToast('Need a polygon of at least 3 points', 'error');
      return;
    }

    let q = this.queryPoint;
    let usedPoly = poly;
    if (!q && !this.selectedPoints.length && this.points.length >= 4) {
      q = this.points[this.points.length - 1];
      usedPoly = this.points.slice(0, -1);
    }
    if (!q) {
      window.App?.showToast('Select "Query Q" tool and click canvas to place test point Q', 'info');
      return;
    }

    let onBoundary = false;
    let inside = false;
    const n = usedPoly.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const a = usedPoly[j], b = usedPoly[i];
      const d = this.distToSegment(q.x, q.y, a.x, a.y, b.x, b.y);
      if (d < 1e-7) {
        onBoundary = true;
        break;
      }
      const intersect = ((a.y > q.y) !== (b.y > q.y)) &&
        (q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x);
      if (intersect) inside = !inside;
    }

    const status = onBoundary ? 'ON BOUNDARY' : (inside ? 'INSIDE' : 'OUTSIDE');
    const color = onBoundary ? 'var(--color-warning)' : (inside ? 'var(--color-success)' : 'var(--color-danger)');
    this.pipResult = { q, poly: usedPoly, status };
    this.showGeometryResult('Point in Polygon Test', `
      <div><strong>Query Q:</strong> (${q.x}, ${q.y}) vs ${n}-gon</div>
      <div><strong>Result:</strong> <strong style="color:${color}">${status}</strong></div>
    `);
    this.render();
  }

  computePolygonArea() {
    const pts = this.selectedPoints.length >= 3 ? this.selectedPoints : this.points;
    if (pts.length < 3) {
      window.App?.showToast('Please add or select at least 3 points', 'error');
      return;
    }
    const { area, perimeter, boundary, interior, orientation } = this.calcPolygonMetrics(pts);
    this.showGeometryResult("Polygon Area & Pick's Theorem", `
      <div><strong>Vertices (${pts.length}):</strong> ${pts.map(p => p.label).join(' → ')} (${orientation})</div>
      <div><strong>Shoelace Area:</strong> <strong class="text-accent">${area.toFixed(2)}</strong> | Perim: ${perimeter.toFixed(3)}</div>
      <div><strong>Pick's (B / I):</strong> <strong>${boundary}</strong> boundary, <strong>${Number.isInteger(interior) ? interior : interior.toFixed(1)}</strong> interior</div>
    `);
    this.render();
  }

  computePolarSort() {
    if (this.points.length < 2) {
      window.App?.showToast('Need at least 2 points for Polar Sort', 'error');
      return;
    }
    const pivot = this.queryPoint || { x: 0, y: 0 };
    const half = (p) => {
      const dx = p.x - pivot.x, dy = p.y - pivot.y;
      return dy > 0 || (dy === 0 && dx >= 0) ? 0 : 1;
    };
    const cross = (a, b) => (a.x - pivot.x) * (b.y - pivot.y) - (a.y - pivot.y) * (b.x - pivot.x);
    const dist2 = (p) => (p.x - pivot.x) ** 2 + (p.y - pivot.y) ** 2;

    this.points.sort((a, b) => {
      const ha = half(a), hb = half(b);
      if (ha !== hb) return ha - hb;
      const cr = cross(a, b);
      if (Math.abs(cr) > 1e-9) return cr > 0 ? -1 : 1;
      return dist2(a) - dist2(b);
    });

    this.points.forEach((p, idx) => { p.polarIdx = idx + 1; });
    this.polarPivot = pivot;
    this.syncInputTextarea();
    this.showGeometryResult('Polar Angle Sort (CCW)', `
      <div><strong>Pivot:</strong> (${pivot.x}, ${pivot.y})</div>
      <div><strong>Order:</strong> ${this.points.map((p, i) => `${i + 1}:${p.label}`).join(' → ')}</div>
    `);
    this.render();
    this.saveState();
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

  // ==========================================
  // UNIVERSAL INPUT PARSING & EXPORT
  // ==========================================

  parseRawPoints(fit = false, showToast = false) {
    const rawInput = document.getElementById('points-raw-input');
    const raw = rawInput?.value.trim() ?? '';

    if (!raw) {
      this.points = [];
      this.segments = [];
      this.circles = [];
      this.connectingPoint = null;
      this.clearAlgoOverlays();
      this.updatePointTable();
      this.updateInspector();
      this.render();
      this.saveState();
      if (showToast) window.App?.showToast('Cleared all points (input is empty)', 'info');
      return;
    }

    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    let start = 0;
    const firstTokens = lines[0].split(/[\s,]+/).filter(Boolean);
    if (firstTokens.length === 1 && /^-?\d+$/.test(firstTokens[0])) {
      start = 1;
    }

    const parsedPts = [];
    const parsedSegs = [];
    const parsedCircles = [];

    const addOrGetPt = (x, y) => {
      let existing = parsedPts.find(p => Math.abs(p.x - x) < 1e-6 && Math.abs(p.y - y) < 1e-6);
      if (!existing) {
        existing = { x, y };
        parsedPts.push(existing);
      }
      return existing;
    };

    for (let i = start; i < lines.length; i++) {
      const tokens = lines[i].split(/[\s,]+/).filter(Boolean);
      if (tokens.length === 0) continue;

      if ((tokens[0].toLowerCase() === 'c' || tokens[0].toLowerCase() === 'circle') && tokens.length >= 4) {
        const cx = parseFloat(tokens[1]), cy = parseFloat(tokens[2]), cr = parseFloat(tokens[3]);
        if (!isNaN(cx) && !isNaN(cy) && !isNaN(cr) && cr > 0) {
          parsedCircles.push({ x: cx, y: cy, r: cr });
        }
      } else if (tokens.length === 4 && tokens.every(t => !isNaN(parseFloat(t)))) {
        const x1 = parseFloat(tokens[0]), y1 = parseFloat(tokens[1]);
        const x2 = parseFloat(tokens[2]), y2 = parseFloat(tokens[3]);
        addOrGetPt(x1, y1);
        addOrGetPt(x2, y2);
        parsedSegs.push({ x1, y1, x2, y2 });
      } else if (tokens.length === 3 && tokens.every(t => !isNaN(parseFloat(t))) && parseFloat(tokens[2]) > 0) {
        parsedCircles.push({ x: parseFloat(tokens[0]), y: parseFloat(tokens[1]), r: parseFloat(tokens[2]) });
      } else if (tokens.length >= 2) {
        const x = parseFloat(tokens[0]), y = parseFloat(tokens[1]);
        if (!isNaN(x) && !isNaN(y)) {
          parsedPts.push({ x, y });
        }
      }
    }

    const remainingExisting = [...this.points];
    const newPoints = [];
    for (const pair of parsedPts) {
      const matchIdx = remainingExisting.findIndex(
        p => Math.abs(p.x - pair.x) < 1e-6 && Math.abs(p.y - pair.y) < 1e-6
      );
      if (matchIdx >= 0) {
        newPoints.push(remainingExisting[matchIdx]);
        remainingExisting.splice(matchIdx, 1);
      } else {
        const id = this.nextPointId++;
        newPoints.push({ id, x: pair.x, y: pair.y, label: this.getAlphabetLabel(id), color: '#38bdf8' });
      }
    }

    const removedIds = new Set(remainingExisting.map(p => p.id));
    this.points = newPoints;
    this.selectedPoints = this.selectedPoints.filter(p => !removedIds.has(p.id));
    this.segments = this.segments.filter(s => !removedIds.has(s.p1.id) && !removedIds.has(s.p2.id));
    if (this.connectingPoint && removedIds.has(this.connectingPoint.id)) this.connectingPoint = null;

    for (const seg of parsedSegs) {
      const p1 = this.points.find(p => Math.abs(p.x - seg.x1) < 1e-6 && Math.abs(p.y - seg.y1) < 1e-6);
      const p2 = this.points.find(p => Math.abs(p.x - seg.x2) < 1e-6 && Math.abs(p.y - seg.y2) < 1e-6);
      if (p1 && p2) this.addSegment(p1, p2, null, false);
    }

    this.circles = parsedCircles.map((c, idx) => ({
      id: idx + 1, x: c.x, y: c.y, r: c.r, color: this.circles[idx]?.color || '#38bdf8'
    }));
    this.nextCircleId = this.circles.length + 1;

    this.updatePointTable();
    this.updateInspector();
    this.render();
    this.saveState();

    if (fit && (this.points.length > 0 || this.circles.length > 0)) {
      this.fitPoints();
    }
    if (showToast) {
      window.App?.showToast(`Loaded ${this.points.length} points`, 'success');
    }
  }

  copyCppPoints() {
    let out = `struct Point { long long x, y; };\nvector<Point> pts = {\n`;
    out += this.points.map(p => `    {${p.x}, ${p.y}}`).join(',\n');
    out += `\n};`;
    navigator.clipboard?.writeText(out).then(() => {
      window.App?.showToast('Copied C++ Point vector to clipboard!', 'success');
    }).catch(() => {});
  }

  // ==========================================
  // RENDERING
  // ==========================================

  render() {
    if (!this.ctx || !this.container) return;
    const rect = this.container.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    this.ctx.clearRect(0, 0, width, height);
    this.renderAxesAndGrid(width, height);

    // 1. User Circles
    for (const c of this.circles) {
      const sc = this.worldToScreen(c.x, c.y);
      const rPx = c.r * this.scale;
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.arc(sc.x, sc.y, rPx, 0, Math.PI * 2);
      this.ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
      this.ctx.fill();
      this.ctx.strokeStyle = c.color || '#38bdf8';
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
      this.ctx.beginPath();
      this.ctx.arc(sc.x, sc.y, 3, 0, Math.PI * 2);
      this.ctx.fillStyle = c.color || '#38bdf8';
      this.ctx.fill();
      this.ctx.restore();
    }

    // 2. Min Enclosing Circle (Welzl)
    if (this.mecCircle) {
      const sc = this.worldToScreen(this.mecCircle.x, this.mecCircle.y);
      const rPx = this.mecCircle.r * this.scale;
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.arc(sc.x, sc.y, rPx, 0, Math.PI * 2);
      this.ctx.fillStyle = 'rgba(168, 85, 247, 0.1)';
      this.ctx.fill();
      this.ctx.strokeStyle = '#a855f7';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([6, 4]);
      this.ctx.stroke();
      this.ctx.restore();
    }

    // 3. Auto-closed polygon outline
    if (this.closePolygon && this.points.length >= 3) {
      this.ctx.save();
      this.ctx.beginPath();
      const f = this.worldToScreen(this.points[0].x, this.points[0].y);
      this.ctx.moveTo(f.x, f.y);
      for (let i = 1; i < this.points.length; i++) {
        const sc = this.worldToScreen(this.points[i].x, this.points[i].y);
        this.ctx.lineTo(sc.x, sc.y);
      }
      this.ctx.closePath();
      this.ctx.fillStyle = 'rgba(56, 189, 248, 0.10)';
      this.ctx.fill();
      this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
      this.ctx.lineWidth = 1.8;
      this.ctx.stroke();
      this.ctx.restore();
    }

    // 4. Polar Sweep Rays
    if (this.polarPivot && this.points.length > 0) {
      const pSc = this.worldToScreen(this.polarPivot.x, this.polarPivot.y);
      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(168, 85, 247, 0.35)';
      this.ctx.lineWidth = 1.2;
      this.ctx.setLineDash([4, 4]);
      for (const p of this.points) {
        const sc = this.worldToScreen(p.x, p.y);
        this.ctx.beginPath();
        this.ctx.moveTo(pSc.x, pSc.y);
        this.ctx.lineTo(sc.x, sc.y);
        this.ctx.stroke();
      }
      this.ctx.restore();
    }

    // 5. User Line Segments
    for (const seg of this.segments) {
      const sc1 = this.worldToScreen(seg.p1.x, seg.p1.y);
      const sc2 = this.worldToScreen(seg.p2.x, seg.p2.y);
      const isSel = this.selectedSegment === seg;
      this.ctx.save();
      this.ctx.strokeStyle = isSel ? 'rgba(245, 158, 11, 0.35)' : 'rgba(56, 189, 248, 0.2)';
      this.ctx.lineWidth = isSel ? 6 : 4;
      this.ctx.beginPath();
      this.ctx.moveTo(sc1.x, sc1.y);
      this.ctx.lineTo(sc2.x, sc2.y);
      this.ctx.stroke();

      this.ctx.strokeStyle = isSel ? '#f59e0b' : (seg.color || '#38bdf8');
      this.ctx.lineWidth = isSel ? 2.8 : 2.2;
      this.ctx.beginPath();
      this.ctx.moveTo(sc1.x, sc1.y);
      this.ctx.lineTo(sc2.x, sc2.y);
      this.ctx.stroke();

      const midX = (sc1.x + sc2.x) / 2, midY = (sc1.y + sc2.y) / 2;
      const dist = Math.hypot(seg.p2.x - seg.p1.x, seg.p2.y - seg.p1.y);
      const distText = Number.isInteger(dist) ? dist.toString() : dist.toFixed(2);
      this.ctx.font = '600 10px "JetBrains Mono", Menlo, monospace';
      const pillW = this.ctx.measureText(distText).width + 8;
      this.ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      this.ctx.strokeStyle = seg.color || '#0284c7';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.roundRect(midX - pillW / 2, midY - 7.5, pillW, 15, 4);
      this.ctx.fill();
      this.ctx.stroke();
      this.ctx.fillStyle = '#e0f2fe';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(distText, midX, midY);
      this.ctx.restore();
    }

    // 6. Selected Point Path
    if (this.selectedPoints.length >= 2 && !this.selectedSegment) {
      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
      this.ctx.lineWidth = 1.8;
      this.ctx.setLineDash([4, 3]);
      this.ctx.beginPath();
      const first = this.worldToScreen(this.selectedPoints[0].x, this.selectedPoints[0].y);
      this.ctx.moveTo(first.x, first.y);
      for (let i = 1; i < this.selectedPoints.length; i++) {
        const sc = this.worldToScreen(this.selectedPoints[i].x, this.selectedPoints[i].y);
        this.ctx.lineTo(sc.x, sc.y);
      }
      this.ctx.stroke();
      this.ctx.restore();
    }

    // 7. Convex Hull Overlay
    if (this.convexHull && this.convexHull.length >= 2) {
      this.ctx.save();
      this.ctx.beginPath();
      const f = this.worldToScreen(this.convexHull[0].x, this.convexHull[0].y);
      this.ctx.moveTo(f.x, f.y);
      for (let i = 1; i < this.convexHull.length; i++) {
        const sc = this.worldToScreen(this.convexHull[i].x, this.convexHull[i].y);
        this.ctx.lineTo(sc.x, sc.y);
      }
      this.ctx.closePath();
      this.ctx.fillStyle = 'rgba(16, 185, 129, 0.14)';
      this.ctx.fill();
      this.ctx.strokeStyle = '#10b981';
      this.ctx.lineWidth = 2.4;
      this.ctx.stroke();
      this.ctx.restore();
    }

    // 8. Closest Pair Overlay
    if (this.closestPair && this.closestPair.length === 2) {
      const sc1 = this.worldToScreen(this.closestPair[0].x, this.closestPair[0].y);
      const sc2 = this.worldToScreen(this.closestPair[1].x, this.closestPair[1].y);
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

    // 9. Segment Intersection Points
    if (this.intersections && this.intersections.length > 0) {
      this.ctx.save();
      for (const hit of this.intersections) {
        const sc = this.worldToScreen(hit.x, hit.y);
        this.ctx.beginPath();
        this.ctx.arc(sc.x, sc.y, 6, 0, Math.PI * 2);
        this.ctx.fillStyle = '#f43f5e';
        this.ctx.fill();
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 1.6;
        this.ctx.stroke();
      }
      this.ctx.restore();
    }

    // 10. Connecting Line Preview
    if (this.connectingPoint) {
      const sc1 = this.worldToScreen(this.connectingPoint.x, this.connectingPoint.y);
      const targetSc = this.hoverPoint && this.hoverPoint !== this.connectingPoint
        ? this.worldToScreen(this.hoverPoint.x, this.hoverPoint.y)
        : { x: this.lastMouseCanvasX || sc1.x, y: this.lastMouseCanvasY || sc1.y };
      this.ctx.save();
      this.ctx.strokeStyle = '#38bdf8';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([6, 4]);
      this.ctx.beginPath();
      this.ctx.moveTo(sc1.x, sc1.y);
      this.ctx.lineTo(targetSc.x, targetSc.y);
      this.ctx.stroke();
      this.ctx.restore();
    }

    // 11. Draw Points
    for (const p of this.points) {
      const sc = this.worldToScreen(p.x, p.y);
      const isSelected = this.selectedPoints.includes(p);
      const isHovered = this.hoverPoint === p;
      const isConnecting = this.connectingPoint === p;
      const radius = isHovered ? 7.5 : (isSelected || isConnecting ? 7 : 5.5);

      if (isSelected || isHovered || isConnecting) {
        this.ctx.beginPath();
        this.ctx.arc(sc.x, sc.y, radius + 6, 0, Math.PI * 2);
        this.ctx.fillStyle = isSelected ? 'rgba(56, 189, 248, 0.35)' : 'rgba(255, 255, 255, 0.18)';
        this.ctx.fill();
      }

      this.ctx.beginPath();
      this.ctx.arc(sc.x, sc.y, radius, 0, Math.PI * 2);
      this.ctx.fillStyle = p.color || '#0284c7';
      this.ctx.fill();
      this.ctx.strokeStyle = isSelected ? '#fde047' : '#ffffff';
      this.ctx.lineWidth = isSelected ? 2.2 : 1.7;
      this.ctx.stroke();

      if (this.showLabels) {
        const prefix = p.polarIdx ? `#${p.polarIdx} ` : '';
        const labelText = `${prefix}${p.label} (${p.x}, ${p.y})`;
        this.ctx.font = '600 11px "JetBrains Mono", Menlo, monospace';
        const textW = this.ctx.measureText(labelText).width;
        const pillX = sc.x + radius + 4;
        const pillY = sc.y - 9;

        this.ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        this.ctx.strokeStyle = isSelected ? '#38bdf8' : '#334155';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.roundRect(pillX - 4, pillY, textW + 8, 18, 4);
        this.ctx.fill();
        this.ctx.stroke();

        this.ctx.fillStyle = '#f8fafc';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(labelText, pillX, pillY + 9);
      }
    }

    // 12. Query Point Q (Diamond)
    if (this.queryPoint) {
      const qSc = this.worldToScreen(this.queryPoint.x, this.queryPoint.y);
      this.ctx.save();
      this.ctx.translate(qSc.x, qSc.y);
      this.ctx.rotate(Math.PI / 4);
      this.ctx.fillStyle = '#f59e0b';
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 1.8;
      this.ctx.fillRect(-5.5, -5.5, 11, 11);
      this.ctx.strokeRect(-5.5, -5.5, 11, 11);
      this.ctx.restore();

      if (this.showLabels) {
        const qText = `Q (${this.queryPoint.x}, ${this.queryPoint.y})`;
        this.ctx.font = '600 11px "JetBrains Mono", Menlo, monospace';
        this.ctx.fillStyle = '#fbbf24';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(qText, qSc.x + 11, qSc.y);
      }
    }
  }

  renderAxesAndGrid(width, height) {
    const pTopLeft = this.screenToWorld(0, 0);
    const pBottomRight = this.screenToWorld(width, height);
    const minX = Math.min(pTopLeft.x, pBottomRight.x);
    const maxX = Math.max(pTopLeft.x, pBottomRight.x);
    const minY = Math.min(pTopLeft.y, pBottomRight.y);
    const maxY = Math.max(pTopLeft.y, pBottomRight.y);

    const minPxGap = 65;
    const rawInterval = minPxGap / this.scale;
    const power = Math.pow(10, Math.floor(Math.log10(rawInterval)));
    const normalized = rawInterval / power;
    let step = power;
    if (normalized >= 5) step = 5 * power;
    else if (normalized >= 2) step = 2 * power;

    const subDiv = Math.round(step / power) === 2 ? 4 : 5;
    const subStep = step / subDiv;
    const isDark = document.querySelector('meta[name="color-scheme"]')?.content !== 'light';

    if (subStep * this.scale >= 9) {
      this.ctx.save();
      this.ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.08)' : 'rgba(100, 116, 139, 0.08)';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      for (let x = Math.floor(minX / subStep) * subStep; x <= Math.ceil(maxX / subStep) * subStep + subStep * 0.5; x += subStep) {
        if (Math.abs(x / step - Math.round(x / step)) < 1e-4) continue;
        const sx = this.worldToScreen(x, 0).x;
        this.ctx.moveTo(Math.round(sx) + 0.5, 0);
        this.ctx.lineTo(Math.round(sx) + 0.5, height);
      }
      for (let y = Math.floor(minY / subStep) * subStep; y <= Math.ceil(maxY / subStep) * subStep + subStep * 0.5; y += subStep) {
        if (Math.abs(y / step - Math.round(y / step)) < 1e-4) continue;
        const sy = this.worldToScreen(0, y).y;
        this.ctx.moveTo(0, Math.round(sy) + 0.5);
        this.ctx.lineTo(width, Math.round(sy) + 0.5);
      }
      this.ctx.stroke();
      this.ctx.restore();
    }

    this.ctx.save();
    this.ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.22)' : 'rgba(100, 116, 139, 0.22)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    const startX = Math.floor(minX / step) * step, endX = Math.ceil(maxX / step) * step;
    for (let x = startX; x <= endX + step * 0.5; x += step) {
      if (Math.abs(x) < 1e-6) continue;
      const sx = this.worldToScreen(x, 0).x;
      this.ctx.moveTo(Math.round(sx) + 0.5, 0);
      this.ctx.lineTo(Math.round(sx) + 0.5, height);
    }
    const startY = Math.floor(minY / step) * step, endY = Math.ceil(maxY / step) * step;
    for (let y = startY; y <= endY + step * 0.5; y += step) {
      if (Math.abs(y) < 1e-6) continue;
      const sy = this.worldToScreen(0, y).y;
      this.ctx.moveTo(0, Math.round(sy) + 0.5);
      this.ctx.lineTo(width, Math.round(sy) + 0.5);
    }
    this.ctx.stroke();
    this.ctx.restore();

    const axisY = this.worldToScreen(0, 0).y;
    const axisX = this.worldToScreen(0, 0).x;
    this.ctx.save();
    this.ctx.strokeStyle = isDark ? '#64748b' : '#94a3b8';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(0, Math.round(axisY) + 0.5);
    this.ctx.lineTo(width, Math.round(axisY) + 0.5);
    this.ctx.moveTo(Math.round(axisX) + 0.5, 0);
    this.ctx.lineTo(Math.round(axisX) + 0.5, height);
    this.ctx.stroke();
    this.ctx.restore();

    this.ctx.save();
    this.ctx.font = '500 11px "JetBrains Mono", Menlo, monospace';
    for (let x = startX; x <= endX + step * 0.5; x += step) {
      if (Math.abs(x) < 1e-6) continue;
      const sx = this.worldToScreen(x, 0).x;
      if (sx < -20 || sx > width + 20) continue;
      const labelY = Math.max(12, Math.min(height - 24, axisY + 6));
      const valText = Number(x.toFixed(4)).toString();
      const tw = this.ctx.measureText(valText).width;
      this.ctx.fillStyle = isDark ? 'rgba(10, 14, 23, 0.85)' : 'rgba(255, 255, 255, 0.85)';
      this.ctx.fillRect(sx - tw / 2 - 2, labelY - 1, tw + 4, 14);
      this.ctx.fillStyle = isDark ? '#94a3b8' : '#475569';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'top';
      this.ctx.fillText(valText, sx, labelY);
    }
    for (let y = startY; y <= endY + step * 0.5; y += step) {
      if (Math.abs(y) < 1e-6) continue;
      const sy = this.worldToScreen(0, y).y;
      if (sy < -20 || sy > height + 20) continue;
      const labelX = Math.max(38, Math.min(width - 10, axisX - 8));
      const valText = Number(y.toFixed(4)).toString();
      const tw = this.ctx.measureText(valText).width;
      this.ctx.fillStyle = isDark ? 'rgba(10, 14, 23, 0.85)' : 'rgba(255, 255, 255, 0.85)';
      this.ctx.fillRect(labelX - tw - 2, sy - 7, tw + 4, 14);
      this.ctx.fillStyle = isDark ? '#94a3b8' : '#475569';
      this.ctx.textAlign = 'right';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(valText, labelX, sy);
    }
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

  // ==========================================
  // UI SYNC & PERSISTENCE (localStorage)
  // ==========================================

  syncControlStatesUI() {
    document.querySelectorAll('[data-point-tool]').forEach(b => {
      b.classList.toggle('active', b.dataset.pointTool === this.activeTool);
    });
    document.querySelectorAll('[data-pt-color]').forEach(b => {
      b.classList.toggle('active', b.dataset.ptColor === this.activeColor);
    });
    const picker = document.getElementById('pt-custom-color');
    if (picker && /^#[0-9a-fA-F]{6}$/.test(this.activeColor)) picker.value = this.activeColor;

    const setChk = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.checked = !!v;
    };
    setChk('point-snap-int', this.snapToInteger);
    setChk('point-system-toggle', this.isMatrixCoords);
    setChk('point-show-labels', this.showLabels);
    setChk('point-close-poly', this.closePolygon);
  }

  saveState() {
    try {
      const rawInput = document.getElementById('points-raw-input');
      const state = {
        points: this.points,
        segments: this.segments.map(s => ({ id: s.id, p1Id: s.p1.id, p2Id: s.p2.id, color: s.color })),
        circles: this.circles,
        queryPoint: this.queryPoint,
        nextPointId: this.nextPointId,
        nextSegmentId: this.nextSegmentId,
        nextCircleId: this.nextCircleId,
        snapToInteger: this.snapToInteger,
        isMatrixCoords: this.isMatrixCoords,
        showLabels: this.showLabels,
        closePolygon: this.closePolygon,
        activeTool: this.activeTool,
        activeColor: this.activeColor,
        rawInputText: rawInput ? rawInput.value : ''
      };
      localStorage.setItem('tracematrix_point_state', JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to save point state to localStorage', e);
    }
  }

  loadState() {
    try {
      const raw = localStorage.getItem('tracematrix_point_state');
      if (!raw) return false;
      const state = JSON.parse(raw);
      if (!state || !Array.isArray(state.points)) return false;

      this.points = state.points;
      this.circles = Array.isArray(state.circles) ? state.circles : [];
      this.queryPoint = state.queryPoint || null;
      this.nextPointId = state.nextPointId || (this.points.length + 1);
      this.nextSegmentId = state.nextSegmentId || 1;
      this.nextCircleId = state.nextCircleId || (this.circles.length + 1);

      const pointMap = new Map(this.points.map(p => [p.id, p]));
      this.segments = [];
      for (const s of (state.segments || [])) {
        const p1 = pointMap.get(s.p1Id), p2 = pointMap.get(s.p2Id);
        if (p1 && p2) this.segments.push({ id: s.id, p1, p2, color: s.color || '#38bdf8' });
      }

      if (typeof state.snapToInteger === 'boolean') this.snapToInteger = state.snapToInteger;
      if (typeof state.isMatrixCoords === 'boolean') this.isMatrixCoords = state.isMatrixCoords;
      if (typeof state.showLabels === 'boolean') this.showLabels = state.showLabels;
      if (typeof state.closePolygon === 'boolean') this.closePolygon = state.closePolygon;
      if (state.activeTool) this.activeTool = state.activeTool;
      if (state.activeColor) this.activeColor = state.activeColor;

      const rawInput = document.getElementById('points-raw-input');
      if (rawInput && state.rawInputText !== undefined) rawInput.value = state.rawInputText;
      else if (rawInput && this.points.length > 0) this.syncInputTextarea();

      this.syncControlStatesUI();
      this.updatePointTable();
      this.updateInspector();
      return true;
    } catch (e) {
      console.warn('Failed to load point state from localStorage', e);
      return false;
    }
  }
}

window.PointVisualizer = PointVisualizer;
