/**
 * TraceMatrix — CP Snippets & Templates Handler
 */

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.copy-snippet-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const codeEl = document.getElementById(targetId);
      if (codeEl) {
        const text = codeEl.textContent;
        navigator.clipboard.writeText(text).then(() => {
          window.App?.showToast('Copied snippet to clipboard!', 'success');
        }).catch(() => {
          window.App?.showToast('Failed to copy', 'error');
        });
      }
    });
  });
});
