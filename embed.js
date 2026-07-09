/* =====================================================================
 * Website Review — embed widget  (Phase 2: point-pin tool)
 * ---------------------------------------------------------------------
 * Paste into any site you control, before </body>:
 *   <script>window.WR_CONFIG = { supabaseUrl:"…", supabaseAnon:"…" };</script>
 *   <script src=".../embed.js" data-review-key="<project_key>" defer></script>
 * DORMANT for normal visitors; activates only when the page URL has ?review
 * (any value). The review board = the site's own domain, so ONE universal
 * snippet works on every site with no per-site key. Optional overrides:
 * ?board=<id>, data-review-key on the tag, or WR_CONFIG.projectKey.
 * Scopes via the x-board-key header + Supabase RLS (HomeApp model).
 * ===================================================================== */
(function () {
  "use strict";
  if (window.__wrLoaded) return;            // never double-mount

  var CFG = window.WR_CONFIG || {};
  var thisScript = document.currentScript;
  var params = new URLSearchParams(location.search);

  // Activate ONLY in review mode — dormant (nothing loads) for normal visitors.
  if (!params.has("review") && !CFG.alwaysOn) return;

  // Board identity = the site's own domain (universal snippet, zero per-site setup).
  // Optional explicit overrides: ?board=, data-review-key, or WR_CONFIG.projectKey.
  function normHost(h) { return String(h || "").replace(/^www\./i, "").toLowerCase() || "localhost"; }
  var BOARD =
    params.get("board") ||
    (thisScript && thisScript.getAttribute("data-review-key")) ||
    CFG.projectKey ||
    normHost(location.hostname);

  if (!CFG.supabaseUrl || !CFG.supabaseAnon) {
    console.warn("[review] WR_CONFIG.supabaseUrl / supabaseAnon missing — widget off.");
    return;
  }
  window.__wrLoaded = true;                  // claim the mount only now (dormant runs don't poison a later activation)

  /* ---------------- identity + local cache (no login) ---------------- */
  var LS = { name: "wr:name", aid: "wr:aid", notes: "wr:notes:" + BOARD };
  function uid() { return (crypto.randomUUID && crypto.randomUUID()) || (Date.now() + "-" + Math.random().toString(16).slice(2)); }
  var ME = "";
  var AID = "";
  try { ME = localStorage.getItem(LS.name) || CFG.me || ""; } catch (e) {}
  try { AID = localStorage.getItem(LS.aid) || ""; if (!AID) { AID = uid(); localStorage.setItem(LS.aid, AID); } } catch (e) { AID = uid(); }
  function cacheRead() { try { return JSON.parse(localStorage.getItem(LS.notes) || "[]"); } catch (e) { return []; } }
  function cacheWrite() { try { localStorage.setItem(LS.notes, JSON.stringify(notes)); } catch (e) {} }

  /* ---------------- state ---------------- */
  var supa = null;
  var notes = cacheRead();                   // render instantly from cache
  var armed = false;                         // pin tool armed?
  var markers = new Map();                    // note.id -> {el, note}
  var listOpen = false;

  /* ---------------- shadow root + styles ---------------- */
  var host = document.createElement("div");
  host.id = "wr-root";
  host.style.cssText = "all:initial !important;position:fixed !important;top:0 !important;left:0 !important;width:0 !important;height:0 !important;z-index:2147483000 !important;";
  (document.body || document.documentElement).appendChild(host);
  var root = host.attachShadow({ mode: "open" });
  root.innerHTML =
    '<style>' +
    ':host,*{box-sizing:border-box}' +
    '.wr{direction:ltr;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#12151c}' +
    '.wr-overlay{position:fixed;inset:0;pointer-events:none;z-index:2147483000}' +
    '.wr-capture{position:fixed;inset:0;z-index:2147483001;cursor:crosshair;background:rgba(43,108,255,.04)}' +
    '.wr-pin{position:fixed;transform:translate(-50%,-100%);pointer-events:auto;cursor:pointer;width:26px;height:26px;' +
      'border:0;border-radius:50% 50% 50% 2px;background:#2b6cff;color:#fff;font:600 12px/1 inherit;' +
      'display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.35);rotate:-45deg}' +
    '.wr-pin>span{rotate:45deg}' +
    '.wr-pin--done{background:#48b98a}' +
    '.wr-pin--pulse{animation:wrp .9s ease 2}' +
    '@keyframes wrp{0%,100%{box-shadow:0 2px 8px rgba(0,0,0,.35)}50%{box-shadow:0 0 0 8px rgba(43,108,255,.35)}}' +
    '.wr-dock{position:fixed;bottom:16px;left:16px;z-index:2147483002;pointer-events:auto;display:flex;gap:8px;align-items:center}' +
    '.wr-btn{pointer-events:auto;border:0;border-radius:999px;padding:10px 14px;font:600 13px/1 inherit;cursor:pointer;' +
      'background:#12151c;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.25);display:inline-flex;gap:7px;align-items:center}' +
    '.wr-btn--go{background:#2b6cff}.wr-btn--ghost{background:#fff;color:#12151c;border:1px solid #e2e5ea}' +
    '.wr-badge{background:rgba(255,255,255,.22);border-radius:999px;padding:1px 7px;font-size:11px}' +
    '.wr-panel{position:fixed;bottom:64px;left:16px;z-index:2147483002;width:min(340px,86vw);max-height:60vh;overflow:auto;' +
      'background:#fff;border:1px solid #e2e5ea;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.22);padding:8px}' +
    '.wr-panel h4{margin:6px 8px 8px;font:600 12px/1 inherit;color:#697086;text-transform:uppercase;letter-spacing:.04em}' +
    '.wr-card{display:flex;gap:9px;padding:9px 8px;border-radius:10px;cursor:pointer}' +
    '.wr-card:hover{background:#f4f6f9}' +
    '.wr-num{flex:0 0 22px;height:22px;border-radius:50%;background:#2b6cff;color:#fff;font:600 11px/22px inherit;text-align:center}' +
    '.wr-card--done .wr-num{background:#48b98a}' +
    '.wr-meta{font-size:11px;color:#8a93a3;margin-top:2px}' +
    '.wr-empty{padding:16px 10px;color:#8a93a3;text-align:center}' +
    '.wr-pop{position:fixed;z-index:2147483003;width:min(300px,86vw);background:#fff;border:1px solid #e2e5ea;border-radius:14px;' +
      'box-shadow:0 12px 40px rgba(0,0,0,.24);padding:12px}' +
    '.wr-pop textarea{width:100%;min-height:74px;resize:vertical;border:1px solid #d7dbe2;border-radius:10px;padding:9px;font:inherit;color:inherit}' +
    '.wr-pop input{width:100%;border:1px solid #d7dbe2;border-radius:10px;padding:9px;font:inherit;color:inherit}' +
    '.wr-row{display:flex;gap:8px;justify-content:flex-end;margin-top:9px;align-items:center}' +
    '.wr-row .wr-sp{margin-right:auto;color:#8a93a3;font-size:12px}' +
    '.wr-x{background:none;border:0;font-size:16px;cursor:pointer;color:#8a93a3;padding:2px 6px}' +
    '.wr-read{white-space:pre-wrap;line-height:1.5}' +
    '.wr-hint{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:2147483003;background:#12151c;color:#fff;' +
      'padding:8px 14px;border-radius:999px;font-size:13px;pointer-events:none;box-shadow:0 4px 14px rgba(0,0,0,.3)}' +
    '</style>' +
    '<div class="wr"><div class="wr-overlay" id="ov"></div><div class="wr-dock" id="dock"></div></div>';
  var overlay = root.getElementById("ov");
  var dock = root.getElementById("dock");

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function openCount() { return notes.filter(function (n) { return n.status !== "resolved" && n.status !== "wont_fix"; }).length; }

  /* ---------------- dock (launcher) ---------------- */
  var addBtn = el("button", "wr-btn wr-btn--go");
  var listBtn = el("button", "wr-btn wr-btn--ghost");
  dock.appendChild(addBtn); dock.appendChild(listBtn);
  function renderDock() {
    addBtn.innerHTML = armed ? "✕ Cancel" : '<span>📍</span> Add note';
    listBtn.innerHTML = 'Notes <span class="wr-badge">' + openCount() + "</span>";
  }
  addBtn.addEventListener("click", function () { armed ? disarm() : arm(); });
  listBtn.addEventListener("click", function () { listOpen ? closePanel() : openPanel(); });

  /* ---------------- pin tool: arm / capture click ---------------- */
  var captureLayer = null, hintEl = null;
  function arm() {
    if (armed) return; armed = true; renderDock();
    captureLayer = el("div", "wr-capture");
    captureLayer.addEventListener("click", onCaptureClick, true);
    root.querySelector(".wr").appendChild(captureLayer);
    hintEl = el("div", "wr-hint", "Click the spot you want to comment on  ·  Esc to cancel");
    root.querySelector(".wr").appendChild(hintEl);
    document.addEventListener("keydown", onEsc, true);
  }
  function disarm() {
    armed = false; renderDock();
    if (captureLayer) { captureLayer.remove(); captureLayer = null; }
    if (hintEl) { hintEl.remove(); hintEl = null; }
    document.removeEventListener("keydown", onEsc, true);
  }
  function onEsc(e) { if (e.key === "Escape") { disarm(); } }
  function onCaptureClick(e) {
    e.preventDefault(); e.stopPropagation();
    var x = e.clientX, y = e.clientY;
    captureLayer.style.pointerEvents = "none";
    var target = document.elementFromPoint(x, y) || document.body;
    captureLayer.style.pointerEvents = "";
    var a = resolveAnchor(x, y, target);
    disarm();
    ensureName(function () { openComposer(x, y, a); });
  }

  /* ---------------- anchoring (D1: nearest id + fractional xy) ------- */
  function resolveAnchor(clientX, clientY, targetEl) {
    var a = targetEl;
    while (a && a !== document.body && !a.id) a = a.parentElement;
    if (!a || !a.id) a = document.body;
    var rect = a.getBoundingClientRect();
    var fx = rect.width ? (clientX - rect.left) / rect.width : 0.5;
    var fy = rect.height ? (clientY - rect.top) / rect.height : 0.5;
    var selector = a.id ? "#" + (window.CSS && CSS.escape ? CSS.escape(a.id) : a.id) : "body";
    var h = a.querySelector ? a.querySelector("h1,h2,h3,h4") : null;
    var desc = (a.tagName ? a.tagName.toLowerCase() : "el") + (a.id ? " #" + a.id : "") +
      (h && h.textContent ? ' — "' + h.textContent.trim().slice(0, 40) + '"' : "");
    return { section_id: a.id || null, selector: selector, fx: fx, fy: fy, desc: desc };
  }
  function anchorEl(note) {
    var a = null;
    try { a = note.target_selector && document.querySelector(note.target_selector); } catch (e) {}
    if (!a && note.section_id) a = document.getElementById(note.section_id);
    return a || document.body || document.documentElement;
  }
  function placeMarker(m) {
    var r = anchorEl(m.note).getBoundingClientRect();
    var g = m.note.geometry || {};
    m.el.style.left = (r.left + (g.x != null ? g.x : 0.5) * r.width) + "px";
    m.el.style.top = (r.top + (g.y != null ? g.y : 0.5) * r.height) + "px";
  }
  function placeAll() { markers.forEach(placeMarker); }
  window.addEventListener("scroll", placeAll, { passive: true });
  window.addEventListener("resize", placeAll);

  /* ---------------- markers ---------------- */
  function numberOf(note) {
    var sorted = notes.slice().sort(function (a, b) { return (a.created_at || "") < (b.created_at || "") ? -1 : 1; });
    return sorted.findIndex(function (n) { return n.id === note.id; }) + 1;
  }
  function addMarker(note) {
    var m = markers.get(note.id);
    if (m) { m.note = note; m.el.firstChild.textContent = numberOf(note); m.el.className = "wr-pin" + (isDone(note) ? " wr-pin--done" : ""); placeMarker(m); return; }
    var b = el("button", "wr-pin" + (isDone(note) ? " wr-pin--done" : ""));
    b.appendChild(el("span", null, numberOf(note)));
    b.title = (note.author || "?") + ": " + (note.body || "");
    b.addEventListener("click", function (e) { e.stopPropagation(); openNote(note, b); });
    overlay.appendChild(b);
    m = { el: b, note: note }; markers.set(note.id, m); placeMarker(m);
  }
  function isDone(n) { return n.status === "resolved" || n.status === "wont_fix"; }
  function removeMarker(id) { var m = markers.get(id); if (m) { m.el.remove(); markers.delete(id); } }
  function renderAll() {
    var seen = {};
    notes.forEach(function (n) { seen[n.id] = 1; addMarker(n); });
    markers.forEach(function (_, id) { if (!seen[id]) removeMarker(id); });
    renderDock(); if (listOpen) renderPanel();
  }

  /* ---------------- name gate ---------------- */
  function ensureName(next) {
    if (ME) return next();
    var pop = el("div", "wr-pop"); pop.style.left = "16px"; pop.style.bottom = "64px"; pop.style.top = "auto";
    pop.innerHTML = "<div style='font-weight:600;margin-bottom:8px'>What's your name?</div>";
    var inp = el("input"); inp.placeholder = "e.g. Ruth"; pop.appendChild(inp);
    var row = el("div", "wr-row"); var ok = el("button", "wr-btn wr-btn--go", "Continue"); row.appendChild(ok); pop.appendChild(row);
    root.querySelector(".wr").appendChild(pop); inp.focus();
    function done() { var v = inp.value.trim(); if (!v) return inp.focus(); ME = v; try { localStorage.setItem(LS.name, v); } catch (e) {} pop.remove(); next(); }
    ok.addEventListener("click", done);
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") done(); });
  }

  /* ---------------- composer (new note) ---------------- */
  var openPop = null;
  function closePop() { if (openPop) { openPop.remove(); openPop = null; } }
  function positionPop(pop, x, y) {
    root.querySelector(".wr").appendChild(pop);
    var w = pop.offsetWidth, h = pop.offsetHeight, pad = 12;
    var L = Math.min(Math.max(pad, x + 14), innerWidth - w - pad);
    var T = Math.min(Math.max(pad, y + 14), innerHeight - h - pad);
    pop.style.left = L + "px"; pop.style.top = T + "px";
  }
  function openComposer(x, y, a) {
    closePop();
    var pop = el("div", "wr-pop");
    var head = el("div", "wr-row"); head.innerHTML = "<div class='wr-sp'>New note · " + (a.section_id ? "#" + a.section_id : "page") + "</div>";
    var xb = el("button", "wr-x", "✕"); head.appendChild(xb); pop.appendChild(head);
    var ta = el("textarea"); ta.placeholder = "What should change here?"; pop.appendChild(ta);
    var row = el("div", "wr-row"); var save = el("button", "wr-btn wr-btn--go", "Save note"); row.appendChild(save); pop.appendChild(row);
    openPop = pop; positionPop(pop, x, y); ta.focus();
    xb.addEventListener("click", closePop);
    function submit() {
      var body = ta.value.trim(); if (!body) return ta.focus();
      closePop();
      saveNote({
        kind: "pin", section_id: a.section_id, target_selector: a.selector, elem_desc: a.desc,
        geometry: { x: round(a.fx), y: round(a.fy) }, viewport_w: innerWidth, viewport_h: innerHeight, body: body
      });
    }
    save.addEventListener("click", submit);
    ta.addEventListener("keydown", function (e) { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit(); });
  }
  function round(n) { return Math.round(n * 10000) / 10000; }

  /* ---------------- read / resolve an existing note --------------- */
  function openNote(note, markerEl) {
    closePop();
    var r = markerEl.getBoundingClientRect();
    var pop = el("div", "wr-pop");
    var head = el("div", "wr-row");
    head.innerHTML = "<div class='wr-sp'>#" + numberOf(note) + " · " + (note.author || "?") +
      (note.section_id ? " · #" + note.section_id : "") + "</div>";
    var xb = el("button", "wr-x", "✕"); head.appendChild(xb); pop.appendChild(head);
    pop.appendChild(el("div", "wr-read", note.body || ""));
    if (note.resolution) { var res = el("div", "wr-meta", "Resolved: " + note.resolution); res.style.marginTop = "8px"; pop.appendChild(res); }
    var row = el("div", "wr-row");
    var toggle = el("button", "wr-btn wr-btn--ghost", isDone(note) ? "Reopen" : "Mark resolved");
    var del = el("button", "wr-x", "🗑");
    row.appendChild(del); row.appendChild(toggle); pop.appendChild(row);
    openPop = pop; positionPop(pop, r.left, r.top);
    xb.addEventListener("click", closePop);
    toggle.addEventListener("click", function () { setStatus(note, isDone(note) ? "open" : "resolved"); closePop(); });
    del.addEventListener("click", function () { if (confirm("Delete this note?")) { deleteNote(note); closePop(); } });
  }

  /* ---------------- data ops (Supabase + optimistic cache) -------- */
  function colsOf(n) {
    return {
      id: n.id, project_key: BOARD, kind: n.kind, page_url: n.page_url, page_title: n.page_title,
      section_id: n.section_id, target_selector: n.target_selector, target_text: n.target_text,
      elem_desc: n.elem_desc, geometry: n.geometry, viewport_w: n.viewport_w, viewport_h: n.viewport_h,
      body: n.body, status: n.status, author: n.author, author_id: n.author_id
    };
  }
  function saveNote(partial) {
    var rec = Object.assign({
      id: uid(), project_key: BOARD, kind: "pin", page_url: location.pathname, page_title: document.title,
      status: "open", author: ME, author_id: AID, created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    }, partial);
    notes.push(rec); cacheWrite(); renderAll();
    if (!supa) return;
    supa.from("notes").insert(colsOf(rec)).then(function (res) {
      if (res.error) console.warn("[review] insert failed (cached locally):", res.error.message);
    });
  }
  function setStatus(note, status) {
    note.status = status; note.updated_at = new Date().toISOString(); note.updated_by = ME;
    cacheWrite(); renderAll();
    if (supa) supa.from("notes").update({ status: status, updated_by: ME }).eq("id", note.id).then(function (r) { if (r.error) console.warn(r.error.message); });
  }
  function deleteNote(note) {
    notes = notes.filter(function (n) { return n.id !== note.id; }); removeMarker(note.id); cacheWrite(); renderAll();
    if (supa) supa.from("notes").delete().eq("id", note.id).then(function (r) { if (r.error) console.warn(r.error.message); });
  }
  function fetchNotes() {
    if (!supa) return;
    supa.from("notes").select("*").eq("project_key", BOARD).order("created_at", { ascending: true }).then(function (res) {
      if (res.error) { console.warn("[review] fetch failed:", res.error.message); return; }
      notes = res.data || []; cacheWrite(); renderAll();
    });
  }

  /* ---------------- notes list panel ---------------- */
  var panel = null;
  function openPanel() { listOpen = true; renderPanel(); }
  function closePanel() { listOpen = false; if (panel) { panel.remove(); panel = null; } }
  function renderPanel() {
    if (panel) panel.remove();
    panel = el("div", "wr-panel");
    panel.appendChild(el("h4", null, "Review notes"));
    var sorted = notes.slice().sort(function (a, b) { return (a.created_at || "") < (b.created_at || "") ? -1 : 1; });
    if (!sorted.length) panel.appendChild(el("div", "wr-empty", "No notes yet. Hit “Add note”, then click a spot on the page."));
    sorted.forEach(function (n) {
      var card = el("div", "wr-card" + (isDone(n) ? " wr-card--done" : ""));
      card.appendChild(el("div", "wr-num", numberOf(n)));
      var body = el("div"); body.style.minWidth = "0";
      var t = el("div", null, n.body || ""); t.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
      body.appendChild(t);
      body.appendChild(el("div", "wr-meta", (n.author || "?") + (n.section_id ? " · #" + n.section_id : "") + (isDone(n) ? " · resolved" : "")));
      card.appendChild(body);
      card.addEventListener("click", function () { jumpTo(n); });
      panel.appendChild(card);
    });
    root.querySelector(".wr").appendChild(panel);
    renderDock();
  }
  function jumpTo(note) {
    var a = anchorEl(note);
    a.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(function () {
      var m = markers.get(note.id);
      if (m) { m.el.classList.add("wr-pin--pulse"); setTimeout(function () { m.el.classList.remove("wr-pin--pulse"); }, 1800); }
    }, 350);
  }

  /* ---------------- boot ---------------- */
  renderAll();
  loadSupabase(function () {
    supa = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnon, {
      global: { headers: { "x-board-key": BOARD } }
    });
    // Self-register this site as a review board (idempotent) so notes have a home.
    supa.from("projects").upsert(
      { project_key: BOARD, name: document.title || BOARD, site_host: BOARD },
      { onConflict: "project_key" }
    ).then(function (r) { if (r.error) console.warn("[review] board register:", r.error.message); });
    fetchNotes();
  });
  window.addEventListener("focus", fetchNotes);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) fetchNotes(); });

  function loadSupabase(cb) {
    if (window.supabase && window.supabase.createClient) return cb();
    var s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    s.onload = cb; s.onerror = function () { console.warn("[review] supabase-js failed to load; running offline (localStorage only)."); };
    document.head.appendChild(s);
  }

  // expose a tiny handle for debugging / headless tests
  window.__wr = { arm: arm, notes: function () { return notes; }, fetch: fetchNotes, board: BOARD };
})();
