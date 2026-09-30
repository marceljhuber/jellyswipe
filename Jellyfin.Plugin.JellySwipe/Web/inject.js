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

  var FLAME = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M8.2 9.1c.1 1.8.9 3.1 2.1 3.5-.5-3.6 1.2-7.1 4.6-9.3-.3 2.5.6 4.4 2.2 6.1 1.5 1.6 2.6 3.4 2.6 5.9 0 4.2-3.4 7.2-7.7 7.2S4.3 19.6 4.3 15.5c0-2.8 1.5-5 3.9-6.4Z"/></svg>';

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

  // New MUI layout (default in Jellyfin 12, optional in 10.9–10.11): clone a native drawer item so it looks identical.
  function muiDrawer() {
    var list = document.querySelector('.MuiDrawer-paper .MuiList-root');
    if (!list || list.querySelector('.jellyswipe-link')) return;
    var items = list.querySelectorAll(':scope > li');
    var template = null;
    for (var i = items.length - 1; i >= 0; i--) {
      if (items[i].querySelector('a[href^="#/home"]')) { template = items[i]; break; }
    }
    var li;
    if (template) {
      li = template.cloneNode(true);
      var a = li.querySelector('a');
      a.href = href;
      a.classList.remove('Mui-selected');
      a.removeAttribute('aria-current');
      var icon = li.querySelector('.MuiListItemIcon-root');
      if (icon) icon.innerHTML = FLAME.replace('width="24" height="24"', 'width="24" height="24" style="color:#fd4a6c"');
      var text = li.querySelector('.MuiListItemText-primary');
      if (text) text.textContent = 'JellySwipe';
    } else {
      li = document.createElement('li');
      li.innerHTML = '<a href="' + href + '" style="display:flex;align-items:center;gap:32px;padding:8px 16px;color:inherit;text-decoration:none">' +
        FLAME.replace('width="24" height="24"', 'width="24" height="24" style="color:#fd4a6c"') + '<span>JellySwipe</span></a>';
    }
    li.classList.add('jellyswipe-link');
    list.appendChild(li);
  }

  function headerButton() {
    // Legacy layout
    var right = document.querySelector('.headerRight');
    if (right && right.offsetParent && !right.querySelector('.jellyswipe-btn')) {
      var b = document.createElement('a');
      b.className = 'headerButton headerButtonRight paper-icon-button-light jellyswipe-btn';
      b.href = href;
      b.title = 'JellySwipe';
      b.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;color:#fd4a6c';
      b.innerHTML = FLAME;
      right.insertBefore(b, right.firstChild);
    }
    // MUI layout: put it in front of the first right-hand toolbar button (SyncPlay / Cast / Search)
    var bar = document.querySelector('.MuiAppBar-root .MuiToolbar-root');
    if (bar && !bar.querySelector('.jellyswipe-btn')) {
      var anchor = bar.querySelector('[aria-label="SyncPlay"], [aria-label="Cast to Device"], [aria-label="Search"], [aria-label="User Menu"]');
      if (anchor) {
        var m = document.createElement('a');
        m.className = anchor.className + ' jellyswipe-btn';
        m.href = href;
        m.title = 'JellySwipe';
        m.setAttribute('aria-label', 'JellySwipe');
        m.style.color = '#fd4a6c';
        m.innerHTML = FLAME;
        anchor.parentNode.insertBefore(m, anchor);
      }
    }
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
