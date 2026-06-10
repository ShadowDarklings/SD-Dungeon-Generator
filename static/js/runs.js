// Delete-run handler for the My Saved Runs page.
// Lives in a separate file (not inline in runs.html) so the nginx
// Content-Security-Policy can stay `script-src 'self'` with no
// 'unsafe-inline' exception for scripts.
document.querySelectorAll('.delete-run-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        const runId = btn.dataset.runId;
        if (!confirm('Delete this saved run? This cannot be undone.')) return;
        try {
            const resp = await fetch(`/api/runs/${runId}`, { method: 'DELETE' });
            if (resp.ok) {
                btn.closest('tr').remove();
            } else {
                alert('Failed to delete run.');
            }
        } catch (e) {
            alert('Error deleting run.');
        }
    });
});
