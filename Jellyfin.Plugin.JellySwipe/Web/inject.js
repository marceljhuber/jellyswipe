// Injected into jellyfin-web (via File Transformation) to add a JellySwipe entry
// to the sidebar and a flame button to the header. Safe to run repeatedly.
(function () {
  'use strict';
  var script = document.currentScript;
  var base = script ? new URL('./', script.src).href : '../JellySwipe/';
  var href = base; // .../JellySwipe/
  var enabled = null;

  fetch(base + 'api/status').then(function (r) { return r.json(); }).then(function (s) {
    enabled = s.sidebar !== false;
    if (enabled) ensure();
  }).catch(function () { enabled = false; });

  var FLAME = '<svg viewBox="0 0 64 64" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M33.5 4c1.2 8.6-3.1 13.6-7.4 18.3C22 26.7 17.4 31.1 17.4 39c0 10.1 6.4 18.5 14.8 18.5 9 0 15-7.6 15-16.2 0-6.3-2.7-11.1-5.7-14.6-.5 4.3-2.6 7.5-5.5 8.7 1.6-5.5 1.8-11.1-.2-16.7C34.4 14.4 33.6 9.4 33.5 4Z"/></svg>';

  function legacyDrawer() {
    var host = document.querySelector('.mainDrawer .customMenuOptions') || document.querySelector('.mainDrawer-scrollContainer');
    if (!host || host.querySelector('.jellyswipe-link')) return;
    var a = document.createElement('a');
    a.setAttribute('is', 'emby-linkbutton');
    a.className = 'navMenuOption lnkMediaFolder jellyswipe-link emby-button';
    a.href = href;
    a.innerHTML = '<span class="material-icons navMenuOptionIcon favorite" aria-hidden="true"></span><span class="sectionName navMenuOptionText">JellySwipe</span>';
    var home = host.querySelector('.lnkMediaFolder');
    if (host.classList.contains('customMenuOptions') || !home) host.appendChild(a);
    else home.parentNode.insertBefore(a, home.nextSibling);
  }

  function muiDrawer() {
    var list = document.querySelector('.MuiDrawer-paper .MuiList-root');
    if (!list || list.querySelector('.jellyswipe-link')) return;
    var li = document.createElement('li');
    li.className = 'jellyswipe-link';
    li.innerHTML = '<a href="' + href + '" style="display:flex;align-items:center;gap:32px;padding:8px 16px;color:inherit;text-decoration:none">' +
      '<span class="material-icons" aria-hidden="true">favorite</span><span>JellySwipe</span></a>';
    list.appendChild(li);
  }

  function headerButton() {
    var right = document.querySelector('.headerRight');
    if (!right || right.querySelector('.jellyswipe-btn')) return;
    var b = document.createElement('a');
    b.className = 'headerButton headerButtonRight paper-icon-button-light jellyswipe-btn';
    b.href = href;
    b.title = 'JellySwipe';
    b.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;color:#fd4a6c';
    b.innerHTML = FLAME;
    right.insertBefore(b, right.firstChild);
  }

  var queued = false;
  function ensure() {
    if (!enabled || queued) return;
    queued = true;
    requestAnimationFrame(function () {
      queued = false;
      // Only for signed-in users (not on the login / server-select screens).
      if (!window.ApiClient || !window.ApiClient.getCurrentUserId || !window.ApiClient.getCurrentUserId()) return;
      try { legacyDrawer(); muiDrawer(); headerButton(); } catch (e) { /* layout changed; ignore */ }
    });
  }

  new MutationObserver(ensure).observe(document.documentElement, { childList: true, subtree: true });
})();
