/**
 * TraceMatrix — Core Application Coordinator
 * Compliant with modern-web-guidance for tabs, color-scheme theming, and dialogs.
 */

class AppCoordinator {
  constructor() {
    this.isOneIndexed = false; // default 0-indexed for C++/Python
    this.currentTab = 'grid'; // 'grid', 'point', 'chess', 'snippets'

    this.initTabs();
    this.initIndexToggle();
    this.initThemeToggle();
    this.initShortcutsModal();
    this.initGlobalShortcuts();

    // Initialize Subsystem Visualizers
    window.gridVis = new GridVisualizer();
    window.pointVis = new PointVisualizer();
    window.chessVis = new ChessVisualizer();

    // Responsive window resize
    window.addEventListener('resize', () => {
      this.refreshCurrentVisualizer();
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
      // Trigger canvas resize & render when panel becomes visible
      setTimeout(() => {
        this.refreshCurrentVisualizer();
      }, 20);
    };

    tabs.forEach(tab => {
      tab.addEventListener('click', () => selectTab(tab));

      // Arrow key navigation for tabs
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
  // INDEXING MODE TOGGLE (0-idx vs 1-idx)
  // ==========================================
  initIndexToggle() {
    const btn0 = document.getElementById('btn-idx-0');
    const btn1 = document.getElementById('btn-idx-1');

    const setIndexMode = (oneIndexed) => {
      this.isOneIndexed = oneIndexed;
      if (btn0) btn0.classList.toggle('active', !oneIndexed);
      if (btn1) btn1.classList.toggle('active', oneIndexed);

      // Re-render active visualizer
      if (window.gridVis) {
        window.gridVis.updateSubmatrixStats();
        window.gridVis.updateStatusPill();
        window.gridVis.render();
      }
      if (window.chessVis) {
        window.chessVis.updateStatusPill();
        window.chessVis.render();
      }

      this.showToast(`Coordinates set to ${oneIndexed ? '1-indexed' : '0-indexed'}`, 'info');
    };

    btn0?.addEventListener('click', () => setIndexMode(false));
    btn1?.addEventListener('click', () => setIndexMode(true));

    this.toggleIndexMode = () => setIndexMode(!this.isOneIndexed);
  }

  // ==========================================
  // THEME MANAGEMENT (Modern-Web-Guidance)
  // ==========================================
  initThemeToggle() {
    const meta = document.querySelector('meta[name="color-scheme"]');
    const toggleBtn = document.getElementById('btn-theme-toggle');

    const updateTheme = (targetScheme) => {
      if (meta) meta.content = targetScheme;
      try {
        if (targetScheme === 'light dark') {
          localStorage.removeItem('color-scheme');
        } else {
          localStorage.setItem('color-scheme', targetScheme);
        }
      } catch (e) {}

      this.refreshCurrentVisualizer();
      this.showToast(`Theme: ${targetScheme}`, 'info');
    };

    toggleBtn?.addEventListener('click', () => {
      const currentMeta = meta?.content || 'light dark';
      let nextScheme = 'dark';
      if (currentMeta === 'dark') {
        nextScheme = 'light';
      } else if (currentMeta === 'light') {
        nextScheme = 'light dark';
      } else {
        // From system: pick opposite of system
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        nextScheme = prefersDark ? 'light' : 'dark';
      }
      updateTheme(nextScheme);
    });

    // Handle cross-tab storage changes
    window.addEventListener('storage', (e) => {
      if (e.key === 'color-scheme') {
        if (meta) meta.content = e.newValue || 'light dark';
        this.refreshCurrentVisualizer();
      }
    });
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
      // Close on backdrop click
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
  initGlobalShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Don't trigger shortcuts if user is typing in an input or textarea
      const target = e.target;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (e.key === '1') {
        this.selectTabById('tab-grid');
      } else if (e.key === '2') {
        this.selectTabById('tab-point');
      } else if (e.key === '3') {
        this.selectTabById('tab-chess');
      } else if (e.key === '4') {
        this.selectTabById('tab-snippets');
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
      } else if (e.key === 'Enter') {
        if (this.currentTab === 'grid') window.gridVis?.runPathfinding();
        else if (this.currentTab === 'chess') window.chessVis?.triggerKnightBFS();
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
}

// Instantiate App when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.App = new AppCoordinator();
});
