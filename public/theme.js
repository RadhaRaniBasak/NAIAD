// Applies the saved theme before the first paint, so a dark-theme visitor never sees a light flash.
// Kept as a file because the production Content-Security-Policy does not allow inline scripts.
try {
  if (localStorage.getItem('naiad.theme') === 'dark') document.documentElement.dataset.theme = 'dark';
} catch (e) {
  // Storage unavailable: stay on the default light theme.
}
