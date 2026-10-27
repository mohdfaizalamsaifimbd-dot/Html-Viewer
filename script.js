(function(){
"use strict";

/* ============================================================
   0. CONSTANTS & DEFAULT CONTENT
   ============================================================ */
const LS_KEY = "htmlviewer_playground_v2_tw";
const isMac = /Mac|iPhone|iPod|iPad/.test(navigator.platform);
const modKey = isMac ? "⌘" : "Ctrl";

const DEFAULTS = {
  html: `<section class="card">
  <span class="eyebrow">✦ New</span>
  <h1>Paste it, see it.</h1>
  <p>Edit the HTML, CSS and JavaScript on the left —
     the preview updates instantly, right here on the right.</p>
  <button id="cta">Say hello</button>
</section>`,
  css: `:root{
  --ink:#0A0A0A;
  --sub:#5C5C5C;
  --line:#E5E5E5;
}
*{ box-sizing:border-box; }
body{
  margin:0;
  min-height:100vh;
  display:flex;
  align-items:center;
  justify-content:center;
  font-family:'Inter',-apple-system,sans-serif;
  background:#FAFAFA;
}
.card{
  max-width:420px;
  padding:40px;
  text-align:center;
}
.eyebrow{
  display:inline-block;
  font-size:12px;
  font-weight:600;
  color:var(--ink);
  background:#fff;
  border:1px solid var(--line);
  padding:5px 11px;
  border-radius:999px;
  margin-bottom:18px;
}
h1{
  font-size:34px;
  letter-spacing:-0.03em;
  margin:0 0 12px;
  color:var(--ink);
  font-weight:800;
}
p{
  color:var(--sub);
  line-height:1.6;
  margin:0 0 26px;
  font-size:14px;
}
button{
  border:none;
  cursor:pointer;
  padding:12px 24px;
  border-radius:10px;
  font-size:13.5px;
  font-weight:600;
  color:#fff;
  background:var(--ink);
  transition:opacity .15s ease, transform .15s ease;
}
button:hover{ opacity:.85; transform:translateY(-1px); }`,
  js: `const btn = document.getElementById('cta');

btn.addEventListener('click', () => {
  console.log('Button clicked at', new Date().toLocaleTimeString());
  btn.textContent = 'Hello! 👋';
});

console.info('Playground ready — nothing here leaves your browser.');`
};

/* ============================================================
   1. STATE
   ============================================================ */
const state = {
  activeTab: "html",
  device: "desktop",
  zoom: 1,
  autoRun: true,
  wordWrap: false,
  autoFormat: false,
  autosave: true,
  fontSize: 13,
  indent: 2,
  theme: "light",
  errCount: 0,
  warnCount: 0,
};

/* ============================================================
   2. DOM SHORTCUTS
   ============================================================ */
const $ = (sel, ctx) => (ctx || document).querySelector(sel);
const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

/* ============================================================
   3. TOASTS (role=status/aria-live region declared in markup)
   ============================================================ */
function toast(msg){
  const c = $("#toastContainer");
  const el = document.createElement("div");
  el.className = "flex items-center gap-2 bg-surface-inverse text-text-inverse text-[12.5px] font-semibold px-4 py-2.5 rounded-full shadow-lg";
  el.style.animation = "toastIn 200ms cubic-bezier(.16,1,.3,1)";
  el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 text-success" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg><span></span>`;
  el.querySelector("span").textContent = msg;
  c.appendChild(el);
  setTimeout(()=>{
    el.style.transition = "opacity 120ms, transform 120ms";
    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
    setTimeout(()=> el.remove(), 150);
  }, 2400);
}
const styleSheet = document.createElement("style");
styleSheet.textContent = "@keyframes toastIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}";
document.head.appendChild(styleSheet);

/* ============================================================
   4. CODEMIRROR SETUP
   ============================================================ */
let cm = {};
function initEditors(){
  const commonExtra = {
    "Tab": tabHandler,
    [`${isMac?"Cmd":"Ctrl"}-Enter`]: () => renderPreview(true),
    [`${isMac?"Cmd":"Ctrl"}-/`]: "toggleComment",
    [`${isMac?"Cmd":"Ctrl"}-F`]: "findPersistent",
    [`${isMac?"Cmd":"Ctrl"}-H`]: "replace",
    [`${isMac?"Cmd":"Ctrl"}-D`]: "selectNextOccurrence",
  };
  const base = {
    lineNumbers: true,
    theme: "brand",
    tabSize: state.indent === "tab" ? 4 : Number(state.indent),
    indentUnit: state.indent === "tab" ? 4 : Number(state.indent),
    indentWithTabs: state.indent === "tab",
    lineWrapping: state.wordWrap,
    autoCloseBrackets: true,
    autoCloseTags: true,
    matchBrackets: true,
    styleActiveLine: true,
    foldGutter: true,
    gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
    highlightSelectionMatches: {showToken: /\w/, annotateScrollbar: false},
    keyMap: "sublime",
    extraKeys: commonExtra,
  };

  cm.html = CodeMirror($("#host-html"), Object.assign({}, base, {mode:"htmlmixed", value: DEFAULTS.html, placeholder:"<!-- Write HTML here -->"}));
  cm.css  = CodeMirror($("#host-css"),  Object.assign({}, base, {mode:"css", value: DEFAULTS.css, placeholder:"/* Write CSS here */"}));
  cm.js   = CodeMirror($("#host-js"),   Object.assign({}, base, {mode:"javascript", value: DEFAULTS.js, placeholder:"// Write JavaScript here"}));

  Object.keys(cm).forEach(lang=>{
    cm[lang].on("change", ()=>{
      updateCounts();
      scheduleAutosave();
      if(state.autoRun) schedulePreview();
    });
    cm[lang].on("cursorActivity", ()=>{
      if(state.activeTab === lang) updateStatusBar(lang);
    });
  });

  applyFontToEditors();
  updateCounts();
  updateStatusBar("html");
}

function tabHandler(cmInstance){
  if(cmInstance.somethingSelected()){
    cmInstance.execCommand("indentMore");
    return;
  }
  const cur = cmInstance.getCursor();
  const line = cmInstance.getLine(cur.line);
  const before = line.slice(0, cur.ch);
  const m = before.match(/([a-zA-Z][a-zA-Z0-9]*)((?:[.#][a-zA-Z0-9_-]+)*)$/);
  if(m && cmInstance.getOption("mode") === "htmlmixed" && m[0].length > 0){
    const expanded = expandEmmet(m[0]);
    if(expanded){
      const from = {line: cur.line, ch: cur.ch - m[0].length};
      cmInstance.replaceRange(expanded.text, from, cur);
      cmInstance.setCursor({line: from.line, ch: from.ch + expanded.cursorOffset});
      return;
    }
  }
  cmInstance.execCommand(cmInstance.getOption("indentWithTabs") ? "insertTab" : "insertSoftTab");
}

function expandEmmet(abbr){
  const tagMatch = abbr.match(/^([a-zA-Z][a-zA-Z0-9]*)/);
  if(!tagMatch) return null;
  const tag = tagMatch[1];
  const classes = [...abbr.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map(x=>x[1]);
  const idMatch = abbr.match(/#([a-zA-Z0-9_-]+)/);
  let attrs = "";
  if(idMatch) attrs += ` id="${idMatch[1]}"`;
  if(classes.length) attrs += ` class="${classes.join(" ")}"`;
  const voidTags = ["img","br","hr","input","meta","link"];
  if(voidTags.includes(tag)){
    const t = `<${tag}${attrs} />`;
    return {text: t, cursorOffset: t.length};
  }
  const open = `<${tag}${attrs}>`;
  const close = `</${tag}>`;
  return {text: open + close, cursorOffset: open.length};
}

function applyFontToEditors(){
  $$(".cm-host, #host-html, #host-css, #host-js").forEach(h=>{ h.style.fontSize = state.fontSize + "px"; });
  Object.values(cm).forEach(c=> c.refresh());
  $("#fontVal").textContent = state.fontSize;
  $("#setFontVal").textContent = state.fontSize;
}

/* ============================================================
   5. TAB SWITCHING (roving-tabindex ARIA tabs pattern)
   ============================================================ */
function switchTab(lang, focusPanel){
  state.activeTab = lang;
  ["html","css","js"].forEach(l=>{
    const btn = $("#tabbtn-" + l);
    const isActive = l === lang;
    btn.setAttribute("aria-selected", String(isActive));
    btn.tabIndex = isActive ? 0 : -1;
    btn.classList.toggle("text-text", isActive);
    btn.classList.toggle("border-text", isActive);
    btn.classList.toggle("text-text-tertiary", !isActive);
    btn.classList.toggle("border-transparent", !isActive);
    btn.querySelector(".w-1\\.5").classList.toggle("opacity-50", !isActive);
    $("#host-" + l).classList.toggle("hidden", !isActive);
    $("#host-" + l).classList.toggle("block", isActive);
  });
  cm[lang].refresh();
  if(focusPanel !== false) cm[lang].focus();
  updateStatusBar(lang);
  $("#statLang").textContent = ({html:"HTML", css:"CSS", js:"JavaScript"})[lang];
}
$$(".tab").forEach(t=> t.addEventListener("click", ()=> switchTab(t.dataset.lang)));
$$(".tab").forEach((t,i,arr)=> t.addEventListener("keydown", (e)=>{
  const order = ["html","css","js"];
  let idx = order.indexOf(t.dataset.lang);
  if(e.key === "ArrowRight"){ idx = (idx+1) % order.length; }
  else if(e.key === "ArrowLeft"){ idx = (idx-1+order.length) % order.length; }
  else if(e.key === "Home"){ idx = 0; }
  else if(e.key === "End"){ idx = order.length-1; }
  else return;
  e.preventDefault();
  switchTab(order[idx]);
  $("#tabbtn-" + order[idx]).focus();
}));

/* ============================================================
   6. STATUS BAR / COUNTS
   ============================================================ */
function updateStatusBar(lang){
  const c = cm[lang];
  const pos = c.getCursor();
  $("#statLine").textContent = pos.line + 1;
  $("#statCol").textContent = pos.ch + 1;
  $("#statLines").textContent = c.lineCount();
  $("#statChars").textContent = c.getValue().length;
  $("#statIndent").textContent = state.indent === "tab" ? "tab" : state.indent;
}
function updateCounts(){
  $("#cntHtml").textContent = cm.html.getValue().length;
  $("#cntCss").textContent = cm.css.getValue().length;
  $("#cntJs").textContent = cm.js.getValue().length;
  updateStatusBar(state.activeTab);
}

/* ============================================================
   7. LIVE PREVIEW
   ============================================================ */
let previewTimer = null;
function schedulePreview(){
  clearTimeout(previewTimer);
  previewTimer = setTimeout(()=> renderPreview(false), 260);
}

const CONSOLE_BRIDGE = `
<script>
(function(){
  function safe(a){
    try{
      if(a instanceof Error) return a.name + ': ' + a.message;
      if(typeof a === 'object' && a !== null) return JSON.stringify(a, null, 2);
      return String(a);
    }catch(e){ return String(a); }
  }
  function send(type, args){
    try{ parent.postMessage({__hvConsole:true, type:type, args: args.map(safe)}, '*'); }catch(e){}
  }
  ['log','info','warn','error'].forEach(function(m){
    var orig = console[m];
    console[m] = function(){
      send(m, Array.prototype.slice.call(arguments));
      orig && orig.apply(console, arguments);
    };
  });
  window.addEventListener('error', function(e){
    send('error', [(e.message || 'Script error') + ' (line ' + (e.lineno||'?') + ')']);
  });
  window.addEventListener('unhandledrejection', function(e){
    send('error', ['Unhandled promise rejection: ' + safe(e.reason)]);
  });
})();
<\/script>`;

function buildDoc(){
  const html = cm.html.getValue();
  const css = cm.css.getValue();
  const js = cm.js.getValue();
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
${CONSOLE_BRIDGE}
<style>
${css}
</style>
</head>
<body>
${html}
<script>
${js}
<\/script>
</body>
</html>`;
}

function renderPreview(clearConsoleFirst){
  const frame = $("#previewFrame");
  if(clearConsoleFirst) clearConsole();
  frame.srcdoc = buildDoc();
}

window.addEventListener("message", (e)=>{
  const data = e.data;
  if(!data || !data.__hvConsole) return;
  logToConsole(data.type, data.args.join(" "));
});

/* ============================================================
   8. CONSOLE PANEL
   ============================================================ */
const ICONS = {
  log:  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>`,
  info: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>`,
  warn: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>`,
  error:`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>`,
};
const LOG_COLOR = { error:"text-error", warn:"text-warning", info:"text-info", log:"text-text-tertiary" };
function logToConsole(type, msg){
  const body = $("#consoleBody");
  const empty = body.querySelector(".console-empty-msg");
  if(empty) empty.remove();
  const row = document.createElement("div");
  row.className = "flex gap-2 px-4 py-1.5 border-b border-border items-start";
  const colorClass = LOG_COLOR[type] || LOG_COLOR.log;
  row.innerHTML = `<span class="w-3.5 h-3.5 mt-0.5 shrink-0 ${colorClass}">${ICONS[type] || ICONS.log}</span><span class="text-[9.5px] font-bold uppercase tracking-wide text-text-tertiary shrink-0 font-sans pt-0.5">${type}</span><span class="whitespace-pre-wrap break-words min-w-0 ${type==='error'||type==='warn'||type==='info' ? colorClass : 'text-text-secondary'}"></span>`;
  row.querySelector("span:last-child").textContent = msg;
  body.appendChild(row);
  body.scrollTop = body.scrollHeight;
  if(type === "error"){ state.errCount++; updateBadges(); showErrorBanner(msg); }
  if(type === "warn"){ state.warnCount++; updateBadges(); }
}
function updateBadges(){
  const be = $("#badgeErr"), bw = $("#badgeWarn");
  be.textContent = state.errCount; be.classList.toggle("hidden", state.errCount===0);
  bw.textContent = state.warnCount; bw.classList.toggle("hidden", state.warnCount===0);
}
function clearConsole(){
  state.errCount = 0; state.warnCount = 0; updateBadges();
  $("#consoleBody").innerHTML = `<div class="console-empty-msg px-4 py-6 text-center text-text-tertiary font-sans text-[12.5px]">Console output will appear here</div>`;
  hideErrorBanner();
}
function clearConsoleAction(){ clearConsole(); toast("Console cleared"); }
$("#btnClearConsole").addEventListener("click", (e)=>{ e.stopPropagation(); clearConsoleAction(); });
$("#btnClearConsole").addEventListener("keydown", (e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); e.stopPropagation(); clearConsoleAction(); } });
$("#consoleHeader").addEventListener("click", ()=>{
  const collapsed = $("#console").style.height === "38px";
  $("#console").style.height = collapsed ? "190px" : "38px";
  $("#consoleHeader").setAttribute("aria-expanded", String(collapsed));
  $(".chev", $("#consoleHeader")).style.transform = collapsed ? "" : "rotate(-90deg)";
  setTimeout(()=> Object.values(cm).forEach(c=>c.refresh()), 260);
});

function showErrorBanner(msg){
  $("#errorBannerMsg").textContent = msg;
  $("#errorBanner").classList.remove("hidden");
  $("#errorBanner").classList.add("flex");
}
function hideErrorBanner(){ $("#errorBanner").classList.add("hidden"); $("#errorBanner").classList.remove("flex"); }
$("#errorBannerClose").addEventListener("click", hideErrorBanner);
$("#tipBannerClose").addEventListener("click", ()=>{ $("#tipBanner").classList.add("hidden"); $("#tipBanner").classList.remove("flex"); });

/* ============================================================
   9. DEVICE PREVIEW
   ============================================================ */
const deviceLabels = {desktop: "Responsive · 100%", tablet: "768 × 1024", phone: "390 × 844"};
function setDevice(dev){
  state.device = dev;
  $$(".pv-device[data-device]").forEach(b=>{
    const active = b.dataset.device === dev;
    b.classList.toggle("active", active);
    b.classList.toggle("bg-surface-inverse", active);
    b.classList.toggle("text-bg", active);
    b.classList.toggle("text-text-tertiary", !active);
    b.setAttribute("aria-pressed", String(active));
  });
  const frame = $("#deviceFrame");
  frame.className = "screen-frame is-" + dev + " bg-bg border border-border rounded-lg overflow-hidden shadow-md relative";
  $("#viewportLabel").textContent = deviceLabels[dev];
}
$$(".pv-device[data-device]").forEach(b=> b.addEventListener("click", ()=> setDevice(b.dataset.device)));

/* ============================================================
   10. ZOOM CONTROLS
   ============================================================ */
function applyZoom(){
  $("#stageInner").style.transform = `scale(${state.zoom})`;
  $("#zoomLabel").textContent = Math.round(state.zoom * 100) + "%";
}
$("#zoomIn").addEventListener("click", ()=>{ state.zoom = Math.min(2, +(state.zoom + 0.1).toFixed(2)); applyZoom(); });
$("#zoomOut").addEventListener("click", ()=>{ state.zoom = Math.max(0.3, +(state.zoom - 0.1).toFixed(2)); applyZoom(); });
$("#zoomLabel").addEventListener("click", ()=>{ state.zoom = 1; applyZoom(); });
$("#zoomFit").addEventListener("click", ()=>{
  const stage = $("#previewStage");
  const frame = $("#deviceFrame");
  const availW = stage.clientWidth - 68;
  const availH = stage.clientHeight - 68;
  const scale = Math.min(availW / frame.offsetWidth, availH / frame.offsetHeight, 1.4);
  state.zoom = Math.max(0.25, +scale.toFixed(2));
  applyZoom();
  toast("Fit to screen");
});

/* ============================================================
   11. DIVIDER RESIZE (mouse + keyboard)
   ============================================================ */
(function(){
  const divider = $("#divider");
  const editorPane = $("#editorPane");
  const workspace = $("#editorMain");
  let dragging = false;

  function setPct(pct){
    pct = Math.min(78, Math.max(20, pct));
    editorPane.style.width = pct + "%";
    divider.setAttribute("aria-valuenow", Math.round(pct));
  }
  divider.setAttribute("aria-valuemin", "20");
  divider.setAttribute("aria-valuemax", "78");
  divider.setAttribute("aria-valuenow", "46");

  divider.addEventListener("mousedown", ()=>{
    dragging = true;
    document.body.style.userSelect = "none";
  });
  window.addEventListener("mousemove", (e)=>{
    if(!dragging) return;
    const rect = workspace.getBoundingClientRect();
    setPct(((e.clientX - rect.left) / rect.width) * 100);
  });
  window.addEventListener("mouseup", ()=>{
    if(!dragging) return;
    dragging = false;
    document.body.style.userSelect = "";
    Object.values(cm).forEach(c=> c.refresh());
    scheduleAutosave();
  });
  divider.addEventListener("keydown", (e)=>{
    const current = parseFloat(editorPane.style.width) || 46;
    if(e.key === "ArrowLeft"){ e.preventDefault(); setPct(current - 2); Object.values(cm).forEach(c=>c.refresh()); scheduleAutosave(); }
    else if(e.key === "ArrowRight"){ e.preventDefault(); setPct(current + 2); Object.values(cm).forEach(c=>c.refresh()); scheduleAutosave(); }
  });
})();

/* ============================================================
   12. FULLSCREEN (CSS-based maximize)
   ============================================================ */
function refreshLayout(){ setTimeout(()=> Object.values(cm).forEach(c=>c.refresh()), 280); }
function toggleMaximize(paneToShow, paneToHide){
  const showing = paneToHide.classList.toggle("hidden");
  $("#divider").classList.toggle("hidden", showing);
  if(showing){ paneToShow.style.width = "100%"; paneToShow.style.flex = "1 1 100%"; }
  else{ paneToShow.style.width = ""; paneToShow.style.flex = ""; }
  refreshLayout();
}
$("#btnEditorFull").addEventListener("click", ()=> toggleMaximize($("#editorPane"), $("#previewPane")));
$("#btnPreviewFull").addEventListener("click", ()=> toggleMaximize($("#previewPane"), $("#editorPane")));

/* ============================================================
   13. FORMAT / MINIFY
   ============================================================ */
function formatAll(){
  try{
    if(window.html_beautify){
      cm.html.setValue(window.html_beautify(cm.html.getValue(), {indent_size: indentSize(), wrap_line_length: 0}));
    }
    if(window.css_beautify){
      cm.css.setValue(window.css_beautify(cm.css.getValue(), {indent_size: indentSize()}));
    }
    if(window.js_beautify){
      cm.js.setValue(window.js_beautify(cm.js.getValue(), {indent_size: indentSize()}));
    }
    toast("Code formatted");
  }catch(err){
    toast("Formatter unavailable");
  }
}
function indentSize(){ return state.indent === "tab" ? 4 : Number(state.indent); }

function minifyAll(){
  try{
    cm.css.setValue(minifyCss(cm.css.getValue()));
    cm.js.setValue(minifyJs(cm.js.getValue()));
    cm.html.setValue(minifyHtml(cm.html.getValue()));
    toast("Code minified");
  }catch(err){
    toast("Minify failed");
  }
}
function minifyCss(s){
  return s.replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/\s+/g, " ")
          .replace(/\s*([{}:;,])\s*/g, "$1")
          .replace(/;}/g, "}")
          .trim();
}
function minifyJs(s){
  return s.replace(/\/\*[\s\S]*?\*\//g, "")
          .split("\n")
          .map(l=> l.replace(/(^|[^:])\/\/.*$/, "$1"))
          .filter(l=> l.trim().length)
          .map(l=> l.trim())
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
}
function minifyHtml(s){
  return s.replace(/<!--[\s\S]*?-->/g, "")
          .replace(/>\s+</g, "><")
          .replace(/\s{2,}/g, " ")
          .trim();
}
$("#btnFormat").addEventListener("click", formatAll);
$("#btnMinify").addEventListener("click", minifyAll);

/* ============================================================
   14. UNDO / REDO
   ============================================================ */
$("#btnUndo").addEventListener("click", ()=> cm[state.activeTab].undo());
$("#btnRedo").addEventListener("click", ()=> cm[state.activeTab].redo());

/* ============================================================
   15. COPY / DOWNLOAD / UPLOAD / EXPORT
   ============================================================ */
$("#btnCopy").addEventListener("click", async ()=>{
  try{
    await navigator.clipboard.writeText(buildDoc());
    toast("Output copied to clipboard");
  }catch(e){
    toast("Copy failed — clipboard blocked");
  }
});

function downloadBlob(content, filename, type){
  const blob = new Blob([content], {type: type || "text/plain"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=> URL.revokeObjectURL(url), 1000);
}

$("#btnDownload").addEventListener("click", async ()=>{
  if(state.autoFormat) formatAll();
  if(window.JSZip){
    try{
      const zip = new JSZip();
      zip.file("index.html", `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n<link rel="stylesheet" href="style.css">\n</head>\n<body>\n${cm.html.getValue()}\n<script src="script.js"><\/script>\n</body>\n</html>`);
      zip.file("style.css", cm.css.getValue());
      zip.file("script.js", cm.js.getValue());
      const blob = await zip.generateAsync({type:"blob"});
      if(window.saveAs){ window.saveAs(blob, "html-viewer-project.zip"); }
      else { downloadBlob(blob, "html-viewer-project.zip"); }
      toast("Project exported as ZIP");
      return;
    }catch(e){ /* fall through to single file */ }
  }
  downloadBlob(buildDoc(), "index.html", "text/html");
  toast("Downloaded index.html");
});

function readFileAsText(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = ()=> resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
async function handleFiles(fileList){
  const files = Array.from(fileList);
  for(const file of files){
    const name = file.name.toLowerCase();
    const text = await readFileAsText(file);
    if(name.endsWith(".css")) cm.css.setValue(text);
    else if(name.endsWith(".js")) cm.js.setValue(text);
    else if(name.endsWith(".html") || name.endsWith(".htm")) cm.html.setValue(text);
  }
  toast(files.length > 1 ? `${files.length} files imported` : `${files[0].name} imported`);
  renderPreview(true);
}
$("#btnUpload").addEventListener("click", ()=> $("#fileInput").click());
$("#fileInput").addEventListener("change", (e)=>{ if(e.target.files.length) handleFiles(e.target.files); e.target.value=""; });

const editorBody = $("#editorBody");
function showDropZone(){ const dz = $("#dropZone"); dz.classList.remove("hidden"); dz.classList.add("flex"); }
function hideDropZone(){ const dz = $("#dropZone"); dz.classList.add("hidden"); dz.classList.remove("flex"); }
["dragenter","dragover"].forEach(ev=> editorBody.addEventListener(ev, (e)=>{ e.preventDefault(); showDropZone(); }));
["dragleave","drop"].forEach(ev=> editorBody.addEventListener(ev, (e)=>{
  if(ev === "dragleave" && e.target !== editorBody) return;
  hideDropZone();
}));
editorBody.addEventListener("drop", (e)=>{
  e.preventDefault();
  if(e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
});

/* ============================================================
   16. RUN / AUTO-RUN
   ============================================================ */
$("#btnRun").addEventListener("click", ()=> { renderPreview(true); toast("Preview updated"); });
function setAutoRun(on){
  state.autoRun = on;
  $("#autoRunSwitch").checked = on;
  $("#setAutoRunSwitch").checked = on;
  const runBtn = $("#btnRun");
  runBtn.classList.toggle("hidden", on);
  runBtn.classList.toggle("flex", !on);
  $("#liveBadge").style.opacity = on ? "1" : ".4";
}
$("#autoRunSwitch").addEventListener("change", (e)=> setAutoRun(e.target.checked));
$("#setAutoRunSwitch").addEventListener("change", (e)=> setAutoRun(e.target.checked));

/* ============================================================
   17. THEME (APP)
   ============================================================ */
function setAppTheme(t){
  state.theme = t;
  document.documentElement.setAttribute("data-theme", t);
  $("#themeColorMeta").setAttribute("content", t === "dark" ? "#0A0A0A" : "#FFFFFF");
  $$(".pv-device[data-app-theme]").forEach(s=>{
    const active = s.dataset.appTheme === t;
    s.classList.toggle("active", active);
    s.classList.toggle("bg-surface-inverse", active);
    s.classList.toggle("text-bg", active);
    s.classList.toggle("text-text-tertiary", !active);
    s.setAttribute("aria-pressed", String(active));
  });
  $("#btnTheme .icon-sun").classList.toggle("hidden", t === "dark");
  $("#btnTheme .icon-moon").classList.toggle("hidden", t !== "dark");
  scheduleAutosave();
}
$("#btnTheme").addEventListener("click", ()=> setAppTheme(state.theme === "dark" ? "light" : "dark"));
$$(".pv-device[data-app-theme]").forEach(s=> s.addEventListener("click", ()=> setAppTheme(s.dataset.appTheme)));

/* ============================================================
   18. SETTINGS PANEL
   ============================================================ */
let lastFocusedBeforeSettings = null;
function openSettings(){
  lastFocusedBeforeSettings = document.activeElement;
  $("#settingsPanel").classList.remove("translate-x-full");
  $("#scrim").classList.remove("opacity-0","pointer-events-none");
  $("#scrim").classList.add("opacity-100");
  $("#btnCloseSettings").focus();
}
function closeSettings(){
  $("#settingsPanel").classList.add("translate-x-full");
  if(!cmdkOpen){ $("#scrim").classList.add("opacity-0","pointer-events-none"); $("#scrim").classList.remove("opacity-100"); }
  if(lastFocusedBeforeSettings) lastFocusedBeforeSettings.focus();
}
$("#btnSettings").addEventListener("click", openSettings);
$("#btnCloseSettings").addEventListener("click", closeSettings);
$("#scrim").addEventListener("click", ()=>{ closeSettings(); closeCmdk(); });

function setFontSize(v){
  state.fontSize = Math.min(22, Math.max(10, v));
  applyFontToEditors();
  scheduleAutosave();
}
$("#fontInc").addEventListener("click", ()=> setFontSize(state.fontSize + 1));
$("#fontDec").addEventListener("click", ()=> setFontSize(state.fontSize - 1));
$("#setFontInc").addEventListener("click", ()=> setFontSize(state.fontSize + 1));
$("#setFontDec").addEventListener("click", ()=> setFontSize(state.fontSize - 1));

$("#setIndent").addEventListener("change", (e)=>{
  state.indent = e.target.value === "tab" ? "tab" : Number(e.target.value);
  Object.values(cm).forEach(c=>{
    c.setOption("tabSize", state.indent === "tab" ? 4 : state.indent);
    c.setOption("indentUnit", state.indent === "tab" ? 4 : state.indent);
    c.setOption("indentWithTabs", state.indent === "tab");
  });
  updateStatusBar(state.activeTab);
  scheduleAutosave();
});

function setWordWrap(on){
  state.wordWrap = on;
  Object.values(cm).forEach(c=> c.setOption("lineWrapping", on));
  $("#setWrapSwitch").checked = on;
  $("#btnWrap").classList.toggle("active", on);
  $("#btnWrap").setAttribute("aria-pressed", String(on));
  scheduleAutosave();
}
$("#btnWrap").addEventListener("click", ()=> setWordWrap(!state.wordWrap));
$("#setWrapSwitch").addEventListener("change", (e)=> setWordWrap(e.target.checked));

$("#setAutoFormatSwitch").addEventListener("change", (e)=>{
  state.autoFormat = e.target.checked;
  scheduleAutosave();
});

$("#setAutosaveSwitch").addEventListener("change", (e)=>{
  state.autosave = e.target.checked;
});

$("#btnReset").addEventListener("click", ()=>{
  if(!confirm("Reset the workspace to the default starter code? This cannot be undone.")) return;
  cm.html.setValue(DEFAULTS.html);
  cm.css.setValue(DEFAULTS.css);
  cm.js.setValue(DEFAULTS.js);
  renderPreview(true);
  toast("Workspace reset");
});

$("#btnSearch").addEventListener("click", ()=> cm[state.activeTab].execCommand("findPersistent"));

/* ============================================================
   19. COMMAND PALETTE
   ============================================================ */
const commands = [
  {label:"Run preview", kx: modKey+"⏎", fn: ()=> renderPreview(true)},
  {label:"Format code", kx:"", fn: formatAll},
  {label:"Minify code", kx:"", fn: minifyAll},
  {label:"Toggle theme", kx:"", fn: ()=> setAppTheme(state.theme==="dark"?"light":"dark")},
  {label:"Toggle word wrap", kx:"", fn: ()=> setWordWrap(!state.wordWrap)},
  {label:"Toggle console", kx:"", fn: ()=> $("#consoleHeader").click()},
  {label:"Clear console", kx:"", fn: clearConsoleAction},
  {label:"Toggle auto-run", kx:"", fn: ()=> setAutoRun(!state.autoRun)},
  {label:"Copy output HTML", kx:"", fn: ()=> $("#btnCopy").click()},
  {label:"Download project", kx: modKey+"S", fn: ()=> $("#btnDownload").click()},
  {label:"Increase font size", kx:"", fn: ()=> setFontSize(state.fontSize+1)},
  {label:"Decrease font size", kx:"", fn: ()=> setFontSize(state.fontSize-1)},
  {label:"Switch to Desktop preview", kx:"", fn: ()=> setDevice("desktop")},
  {label:"Switch to Tablet preview", kx:"", fn: ()=> setDevice("tablet")},
  {label:"Switch to Phone preview", kx:"", fn: ()=> setDevice("phone")},
  {label:"Fullscreen editor", kx:"", fn: ()=> $("#btnEditorFull").click()},
  {label:"Fullscreen preview", kx:"", fn: ()=> $("#btnPreviewFull").click()},
  {label:"Open settings", kx:"", fn: openSettings},
  {label:"Reset workspace", kx:"", fn: ()=> $("#btnReset").click()},
];
let cmdkSel = 0, cmdkFiltered = commands.slice(), cmdkOpen = false;
let lastFocusedBeforeCmdk = null;

function renderCmdk(){
  const list = $("#cmdkList");
  if(!cmdkFiltered.length){
    list.innerHTML = `<div class="p-6 text-center text-text-tertiary text-[12.5px]">No matching commands</div>`;
    return;
  }
  list.innerHTML = cmdkFiltered.map((c,i)=> `
    <div class="cmdk-item flex items-center gap-3 px-3 py-2.5 rounded-sm cursor-pointer text-[13px] font-medium border-l-2 ${i===cmdkSel? 'bg-surface text-text border-text font-semibold' : 'text-text-secondary border-transparent'}" data-i="${i}" role="option" aria-selected="${i===cmdkSel}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 opacity-70" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
      <span class="min-w-0 truncate"></span>
      ${c.kx ? `<span class="ml-auto text-[10px] text-text-tertiary font-mono">${c.kx}</span>` : ""}
    </div>`).join("");
  $$(".cmdk-item", list).forEach((el,i)=>{
    el.querySelector("span").textContent = cmdkFiltered[i].label;
    el.addEventListener("click", ()=> runCmdkItem(Number(el.dataset.i)));
  });
}
function runCmdkItem(i){
  const item = cmdkFiltered[i];
  if(!item) return;
  closeCmdk();
  setTimeout(item.fn, 60);
}
function openCmdk(){
  cmdkOpen = true;
  lastFocusedBeforeCmdk = document.activeElement;
  $("#cmdk").classList.remove("opacity-0","pointer-events-none","scale-95");
  $("#cmdk").classList.add("opacity-100","scale-100");
  $("#scrim").classList.remove("opacity-0","pointer-events-none");
  $("#scrim").classList.add("opacity-100");
  $("#cmdkInput").value = "";
  cmdkFiltered = commands.slice();
  cmdkSel = 0;
  renderCmdk();
  setTimeout(()=> $("#cmdkInput").focus(), 30);
}
function closeCmdk(){
  cmdkOpen = false;
  $("#cmdk").classList.add("opacity-0","pointer-events-none","scale-95");
  $("#cmdk").classList.remove("opacity-100","scale-100");
  if(!$("#settingsPanel").classList.contains("translate-x-full") === false){ /* settings closed */ }
  if($("#settingsPanel").classList.contains("translate-x-full")){
    $("#scrim").classList.add("opacity-0","pointer-events-none");
    $("#scrim").classList.remove("opacity-100");
  }
  if(lastFocusedBeforeCmdk) lastFocusedBeforeCmdk.focus();
}
$("#cmdkInput").addEventListener("input", (e)=>{
  const q = e.target.value.toLowerCase();
  cmdkFiltered = commands.filter(c=> c.label.toLowerCase().includes(q));
  cmdkSel = 0;
  renderCmdk();
});
$("#cmdkInput").addEventListener("keydown", (e)=>{
  if(e.key === "ArrowDown"){ e.preventDefault(); cmdkSel = Math.min(cmdkFiltered.length-1, cmdkSel+1); renderCmdk(); }
  else if(e.key === "ArrowUp"){ e.preventDefault(); cmdkSel = Math.max(0, cmdkSel-1); renderCmdk(); }
  else if(e.key === "Enter"){ e.preventDefault(); runCmdkItem(cmdkSel); }
  else if(e.key === "Escape"){ closeCmdk(); }
});

/* ============================================================
   20. GLOBAL KEYBOARD SHORTCUTS
   ============================================================ */
window.addEventListener("keydown", (e)=>{
  const mod = isMac ? e.metaKey : e.ctrlKey;
  if(mod && e.shiftKey && (e.key === "P" || e.key === "p")){ e.preventDefault(); openCmdk(); return; }
  if(mod && (e.key === "s" || e.key === "S")){ e.preventDefault(); $("#btnDownload").click(); return; }
  if(mod && e.key === "Enter"){ e.preventDefault(); renderPreview(true); return; }
  if(e.key === "Escape"){ closeCmdk(); closeSettings(); }
});

/* ============================================================
   21. AUTOSAVE / RESTORE
   ============================================================ */
let saveTimer = null;
function scheduleAutosave(){
  if(!state.autosave) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 400);
}
function persist(){
  try{
    const payload = {
      html: cm.html.getValue(), css: cm.css.getValue(), js: cm.js.getValue(),
      theme: state.theme, fontSize: state.fontSize,
      wordWrap: state.wordWrap, indent: state.indent,
      autoRun: state.autoRun, editorWidth: $("#editorPane").style.width || null,
    };
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
  }catch(e){ /* storage unavailable */ }
}
function restore(){
  let saved = null;
  try{ saved = JSON.parse(localStorage.getItem(LS_KEY)); }catch(e){}
  if(!saved) return false;
  if(typeof saved.html === "string") cm.html.setValue(saved.html);
  if(typeof saved.css === "string") cm.css.setValue(saved.css);
  if(typeof saved.js === "string") cm.js.setValue(saved.js);
  if(saved.theme) setAppTheme(saved.theme);
  if(saved.fontSize) setFontSize(saved.fontSize);
  if(typeof saved.wordWrap === "boolean") setWordWrap(saved.wordWrap);
  if(saved.indent){ state.indent = saved.indent; $("#setIndent").value = saved.indent; }
  if(typeof saved.autoRun === "boolean") setAutoRun(saved.autoRun);
  if(saved.editorWidth){ $("#editorPane").style.width = saved.editorWidth; }
  return true;
}

/* ============================================================
   22. INIT
   ============================================================ */
function init(){
  initEditors();
  const hadSession = restore();
  renderPreview(true);
  applyZoom();
  setDevice("desktop");
  updateBadges();
  if(!hadSession){
    toast("Paste it, see it — nothing leaves your machine.");
    setTimeout(()=>{ $("#tipBanner").classList.remove("hidden"); $("#tipBanner").classList.add("flex"); }, 900);
  }
  window.addEventListener("resize", ()=> Object.values(cm).forEach(c=> c.refresh()));
}
init();

})();
