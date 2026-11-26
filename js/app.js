/**
 * TraceMatrix — Core Application Coordinator
 * Compliant with modern-web-guidance for tabs, color-scheme theming, and dialogs.
 */

class AppCoordinator {
  constructor() {
    this.isOneIndexed = false;
    this.isReversedIndex = false;
    this.currentTab = 'grid';

    this.initTabs();
    this.initIndexToggle();
    this.initThemeToggle();
    this.initShortcutsModal();
    this.initSidebarCollapse();
    this.initGlobalShortcuts();

    // Initialize Subsystem Visualizers
    window.gridVis = new GridVisualizer();
    window.pointVis = new PointVisualizer();
    window.chessVis = new ChessVisualizer();
    window.canvasNotes = new CanvasNotesManager();

    this.loadState();

    window.addEventListener('resize', () => {
      this.refreshCurrentVisualizer();
    });

    window.addEventListener('beforeunload', () => {
      this.saveState();
    });
  }

  // ==========================================
  // TAB NAVIGATION (Modern-Web-Guidance)
  // ==========================================
  initTabs() {
    const tabs = Array.from(document.querySelectorAll('.nav-tab'));
    const panels = {
      'tab-grid': document.getElementById('panel-grid'),
      'tab-point': document.getElementById('panel-point'),
      'tab-chess': document.getElementById('panel-chess'),
      'tab-snippets': document.getElementById('panel-snippets')
    };

    const selectTab = (selectedTab) => {
      for (const tab of tabs) {
        const isSelected = tab === selectedTab;
        tab.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        tab.classList.toggle('active', isSelected);
        tab.toggleAttribute('focusgroupstart', isSelected);

        const panel = panels[tab.id];
        if (panel) {
          if (isSelected) {
            panel.removeAttribute('hidden');
            panel.classList.add('active');
          } else {
            panel.setAttribute('hidden', 'until-found');
            panel.classList.remove('active');
          }
        }
      }

      this.currentTab = selectedTab.id.replace('tab-', '');
      this.saveState();
      setTimeout(() => {
        this.refreshCurrentVisualizer();
      }, 30);
    };

    tabs.forEach(tab => {
      tab.addEventListener('click', () => selectTab(tab));

      tab.addEventListener('keydown', (e) => {
        let targetIndex = -1;
        const curIndex = tabs.indexOf(tab);
        if (e.key === 'ArrowRight') {
          targetIndex = (curIndex + 1) % tabs.length;
        } else if (e.key === 'ArrowLeft') {
          targetIndex = (curIndex - 1 + tabs.length) % tabs.length;
        } else if (e.key === 'Home') {
          targetIndex = 0;
        } else if (e.key === 'End') {
          targetIndex = tabs.length - 1;
        }

        if (targetIndex !== -1) {
          e.preventDefault();
          tabs[targetIndex].focus();
          selectTab(tabs[targetIndex]);
        }
      });
    });

    this.selectTabById = (tabId) => {
      const tab = document.getElementById(tabId);
      if (tab) selectTab(tab);
    };
  }

  refreshCurrentVisualizer() {
    if (this.currentTab === 'grid' && window.gridVis) {
      window.gridVis.resizeCanvas();
    } else if (this.currentTab === 'point' && window.pointVis) {
      window.pointVis.resizeCanvas();
    } else if (this.currentTab === 'chess' && window.chessVis) {
      window.chessVis.resizeCanvas();
    }
  }

  // ==========================================
  // SIDEBAR COLLAPSE TOGGLE
  // ==========================================
  initSidebarCollapse() {
    document.querySelectorAll('.sidebar-collapse-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.toggleSidebar;
        const sidebar = document.getElementById(targetId);
        if (sidebar) {
          sidebar.classList.toggle('collapsed');
          const isCollapsed = sidebar.classList.contains('collapsed');
          btn.querySelector('svg').style.transform = isCollapsed ? 'rotate(180deg)' : 'none';
          btn.title = isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar';
          this.saveState();
          setTimeout(() => {
            this.refreshCurrentVisualizer();
          }, 260);
        }
      });
    });

    this.toggleCurrentSidebar = () => {
      const curSidebarId = `sidebar-${this.currentTab}`;
      const sidebar = document.getElementById(curSidebarId);
      const btn = document.querySelector(`[data-toggle-sidebar="${curSidebarId}"]`);
      if (sidebar && btn) {
        sidebar.classList.toggle('collapsed');
        const isCollapsed = sidebar.classList.contains('collapsed');
        btn.querySelector('svg').style.transform = isCollapsed ? 'rotate(180deg)' : 'none';
        this.saveState();
        setTimeout(() => {
          this.refreshCurrentVisualizer();
        }, 260);
      }
    };
  }

  // ==========================================
  // INDEXING MODE TOGGLE (0-idx / 1-idx / Rev)
  // ==========================================
  getDisplayRow(r, rows) {
    const offset = this.isOneIndexed ? 1 : 0;
    return this.isReversedIndex ? (rows - 1 - r + offset) : (r + offset);
  }

  getDisplayCol(c, cols) {
    const offset = this.isOneIndexed ? 1 : 0;
    return this.isReversedIndex ? (cols - 1 - c + offset) : (c + offset);
  }

  fromDisplayRow(dispR, rows) {
    const offset = this.isOneIndexed ? 1 : 0;
    return this.isReversedIndex ? (rows - 1 - (dispR - offset)) : (dispR - offset);
  }

  fromDisplayCol(dispC, cols) {
    const offset = this.isOneIndexed ? 1 : 0;
    return this.isReversedIndex ? (cols - 1 - (dispC - offset)) : (dispC - offset);
  }

  initIndexToggle() {
    const btn0 = document.getElementById('btn-idx-0');
    const btn1 = document.getElementById('btn-idx-1');
    const revBtns = Array.from(document.querySelectorAll('[data-rev-idx-btn]'));

    const refreshVisualizersForIndex = () => {
      if (window.gridVis) {
        window.gridVis.syncBatchInputFromGrid();
        window.gridVis.updateSubmatrixStats();
        window.gridVis.updateStatusPill();
        window.gridVis.render();
      }
      if (window.chessVis) {
        window.chessVis.updateStatusPill();
        window.chessVis.render();
      }
    };

    const setIndexMode = (oneIndexed) => {
      this.isOneIndexed = oneIndexed;
      if (btn0) btn0.classList.toggle('active', !oneIndexed);
      if (btn1) btn1.classList.toggle('active', oneIndexed);
      this.saveState();
      refreshVisualizersForIndex();
      this.showToast(`Coordinates set to ${oneIndexed ? '1-indexed' : '0-indexed'}`, 'info');
    };

    const setReversedMode = (reversed) => {
      this.isReversedIndex = !!reversed;
      revBtns.forEach(btn => {
        btn.classList.toggle('active', this.isReversedIndex);
        btn.setAttribute('aria-pressed', this.isReversedIndex ? 'true' : 'false');
      });
      this.saveState();
      refreshVisualizersForIndex();
      this.showToast(
        this.isReversedIndex ? 'Row & column indices reversed ([N..0])' : 'Row & column indices normal ([0..N])',
        'info'
      );
    };

    btn0?.addEventListener('click', () => setIndexMode(false));
    btn1?.addEventListener('click', () => setIndexMode(true));
    revBtns.forEach(btn => {
      btn.addEventListener('click', () => setReversedMode(!this.isReversedIndex));
    });

    this.toggleIndexMode = () => setIndexMode(!this.isOneIndexed);
    this.toggleReverseIndex = () => setReversedMode(!this.isReversedIndex);
  }

  // ==========================================
  // THEME MANAGEMENT (Obsidian Dark Only)
  // ==========================================
  initThemeToggle() {
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) meta.content = 'dark';
    try {
      localStorage.removeItem('color-scheme');
    } catch (e) {}
  }

  // ==========================================
  // SHORTCUTS MODAL
  // ==========================================
  initShortcutsModal() {
    const dialog = document.getElementById('shortcuts-dialog');
    const openBtn = document.getElementById('btn-shortcuts');

    openBtn?.addEventListener('click', () => {
      if (dialog?.showModal) {
        dialog.showModal();
      }
    });

    dialog?.querySelectorAll('[data-close-dialog]').forEach(btn => {
      btn.addEventListener('click', () => dialog.close());
    });

    dialog?.addEventListener('click', (e) => {
      const rect = dialog.getBoundingClientRect();
      const inDialog = (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      );
      if (!inDialog) dialog.close();
    });
  }

  // ==========================================
  // GLOBAL SHORTCUTS
  // ==========================================
  cancelAllActive() {
    const dialog = document.getElementById('shortcuts-dialog');
    if (dialog?.open) dialog.close();

    if (this.currentTab === 'grid') window.gridVis?.cancelAllActivities?.();
    else if (this.currentTab === 'point') window.pointVis?.cancelAllActivities?.();
    else if (this.currentTab === 'chess') window.chessVis?.cancelAllActivities?.();
  }

  initGlobalShortcuts() {
    window.addEventListener('keydown', (e) => {
      const target = e.target;
      const isEditable = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if (e.key === 'Escape') {
        if (target.classList?.contains('cell-inline-input')) {
          return; // inline editor handles its own Esc first
        }
        if (isEditable) {
          target.blur();
        }
        this.cancelAllActive();
        return;
      }

      if (isEditable) {
        return;
      }

      // Undo / Redo for Grid, Point & Chess Visualizers
      if (e.ctrlKey || e.metaKey) {
        const targetVis =
          this.currentTab === 'grid'
            ? window.gridVis
            : this.currentTab === 'point'
              ? window.pointVis
              : this.currentTab === 'chess'
                ? window.chessVis
                : null;
        if (targetVis) {
          if (e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (e.shiftKey) targetVis.redo?.();
            else targetVis.undo?.();
            return;
          }
          if (e.key.toLowerCase() === 'y') {
            e.preventDefault();
            targetVis.redo?.();
            return;
          }
        }
      }

      if (e.key === '1') {
        this.selectTabById('tab-grid');
      } else if (e.key === '2') {
        this.selectTabById('tab-point');
      } else if (e.key === '3') {
        this.selectTabById('tab-chess');
      } else if (e.key === '4') {
        this.selectTabById('tab-snippets');
      } else if (e.key === 'b' || e.key === 'B') {
        this.toggleCurrentSidebar();
      } else if (e.key === 'i' || e.key === 'I') {
        this.toggleIndexMode();
      } else if (e.key === '?') {
        const dialog = document.getElementById('shortcuts-dialog');
        if (dialog?.open) dialog.close();
        else dialog?.showModal?.();
      } else if (e.key === 'f' || e.key === 'F') {
        if (this.currentTab === 'grid') window.gridVis?.fitGrid();
        else if (this.currentTab === 'point') window.pointVis?.fitPoints();
        else if (this.currentTab === 'chess') window.chessVis?.fitBoard();
      } else if (e.key === '0') {
        if (this.currentTab === 'grid') window.gridVis?.resetView();
        else if (this.currentTab === 'point') window.pointVis?.resetOrigin();
        else if (this.currentTab === 'chess') window.chessVis?.resetView();
      } else if (e.key === 'h' || e.key === 'H') {
        if (this.currentTab === 'point') window.pointVis?.computeConvexHull();
      } else if (e.key === 'c' || e.key === 'C') {
        if (this.currentTab === 'point') window.pointVis?.startDynamicCircle();
      } else if (e.key === 'Enter') {
        if (this.currentTab === 'chess') window.chessVis?.triggerKnightBFS();
      }
    });
  }

  // ==========================================
  // TOAST SYSTEM
  // ==========================================
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, 2500);
  }

  // ==========================================
  // PERSISTENCE (localStorage)
  // ==========================================
  saveState() {
    try {
      const collapsed = [];
      document.querySelectorAll('.sidebar-panel.collapsed').forEach(el => {
        if (el.id) collapsed.push(el.id);
      });
      const state = {
        currentTab: this.currentTab,
        isOneIndexed: this.isOneIndexed,
        isReversedIndex: this.isReversedIndex,
        collapsedSidebars: collapsed
      };
      localStorage.setItem('tracematrix_app_state', JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to save app state to localStorage', e);
    }
  }

  loadState() {
    try {
      const raw = localStorage.getItem('tracematrix_app_state');
      if (!raw) return;
      const state = JSON.parse(raw);

      if (typeof state.isOneIndexed === 'boolean') {
        const btn0 = document.getElementById('btn-idx-0');
        const btn1 = document.getElementById('btn-idx-1');
        this.isOneIndexed = state.isOneIndexed;
        if (btn0) btn0.classList.toggle('active', !this.isOneIndexed);
        if (btn1) btn1.classList.toggle('active', this.isOneIndexed);
      }

      if (typeof state.isReversedIndex === 'boolean') {
        this.isReversedIndex = state.isReversedIndex;
        document.querySelectorAll('[data-rev-idx-btn]').forEach(btn => {
          btn.classList.toggle('active', this.isReversedIndex);
          btn.setAttribute('aria-pressed', this.isReversedIndex ? 'true' : 'false');
        });
      }

      if (typeof state.isOneIndexed === 'boolean' || typeof state.isReversedIndex === 'boolean') {
        if (window.gridVis) {
          window.gridVis.syncBatchInputFromGrid();
          window.gridVis.updateSubmatrixStats();
          window.gridVis.updateStatusPill();
          window.gridVis.render();
        }
        if (window.chessVis) {
          window.chessVis.updateStatusPill();
          window.chessVis.render();
        }
      }

      if (Array.isArray(state.collapsedSidebars)) {
        state.collapsedSidebars.forEach(id => {
          const sidebar = document.getElementById(id);
          const btn = document.querySelector(`[data-toggle-sidebar="${id}"]`);
          if (sidebar) {
            sidebar.classList.add('collapsed');
            if (btn) {
              const svg = btn.querySelector('svg');
              if (svg) svg.style.transform = 'rotate(180deg)';
              btn.title = 'Expand Sidebar';
            }
          }
        });
      }

      if (state.currentTab && state.currentTab !== 'grid') {
        this.selectTabById(`tab-${state.currentTab}`);
      }
    } catch (e) {
      console.warn('Failed to load app state from localStorage', e);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.App = new AppCoordinator();
});
