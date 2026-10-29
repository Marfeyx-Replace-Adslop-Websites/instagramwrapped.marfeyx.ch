/* Kept separate from the application so module failures can still show recovery UI. */
(function () {
  var root = document.getElementById('root');
  if (!root) return;
  function pending() { return root.querySelector('[data-mfx-boot]') || !root.hasChildNodes(); }
  function failed() {
    if (!pending()) return;
    var card = root.querySelector('[data-mfx-boot]');
    if (!card) {
      card = document.createElement('main');
      card.className = 'mfx-boot';
      card.setAttribute('data-mfx-boot', '');
      card.appendChild(document.createElement('h1'));
      card.appendChild(document.createElement('p'));
      var reload = document.createElement('button');
      reload.type = 'button';
      reload.textContent = 'Reload page';
      reload.addEventListener('click', function () { location.reload(); });
      card.appendChild(reload);
      root.replaceChildren(card);
    }
    card.setAttribute('data-mfx-startup-error', '');
    card.querySelector('h1').textContent = 'Marfeyx could not start.';
    card.querySelector('p').textContent = 'Reload this page to get the latest files. If it still cannot open, try again later.';
    card.setAttribute('role', 'alert');
  }
  window.addEventListener('error', function (event) {
    if (event.message || (event.target && event.target.tagName === 'SCRIPT')) failed();
  }, true);
  window.addEventListener('unhandledrejection', failed);
  window.addEventListener('vite:preloadError', failed);
  // A failed React render can clear the root after its initial loader was removed.
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(function () {
      if (!root.hasChildNodes()) queueMicrotask(function () { if (!root.hasChildNodes()) failed(); });
    }).observe(root, { childList: true });
  }
  if (location.protocol === 'file:') {
    var status = root.querySelector('[data-mfx-boot] p');
    if (status) status.textContent = 'Open this tool through its website or a local preview server.';
  }
  setTimeout(function () {
    var card = root.querySelector('[data-mfx-boot]');
    if (!card || card.hasAttribute('data-mfx-startup-error')) return;
    card.querySelector('p').textContent = 'Loading is taking longer than usual. You can reload this page to try again.';
  }, 15000);
})();
