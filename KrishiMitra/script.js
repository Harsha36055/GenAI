// KrishiMitra frontend logic (vanilla ES6+). All server text is inserted with textContent (no innerHTML) to prevent XSS.
const $ = (s) => document.querySelector(s);
const SPEECH_LANG = { en: "en-IN", hi: "hi-IN", pa: "pa-IN", mr: "mr-IN", te: "te-IN", ta: "ta-IN" };
let lang = localStorage.getItem("km_lang") || "en";
let history = [];       // chat turns sent to the server for context
let pickedFile = null;  // leaf photo chosen by the user
let lastDiagnosis = null;
let lastDiagnosisSource = null;

const t = (k) => SECTION_TRANSLATIONS[lang]?.[k] || TRANSLATIONS[lang]?.[k] || SECTION_TRANSLATIONS.en[k] || TRANSLATIONS.en[k] || k;
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

// ---------- i18n + theme ----------
function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((n) => (n.textContent = t(n.dataset.i18n)));
  document.querySelectorAll("[data-i18n-ph]").forEach((n) => (n.placeholder = t(n.dataset.i18nPh)));
  document.querySelectorAll("[data-i18n-a]").forEach((n) => n.setAttribute("aria-label", t(n.dataset.i18nA)));
  refreshLocalizedChat();
  $("#lang").value = lang;
}
$("#lang").onchange = (e) => {
  lang = e.target.value; localStorage.setItem("km_lang", lang); applyLang();
  if (currentTab === "diagnose" && lastDiagnosis) renderDiagnosis(lastDiagnosis, lastDiagnosisSource);
  loadTab(currentTab);
};
function setTheme(th) { document.documentElement.dataset.theme = th; localStorage.setItem("km_theme", th); }
$("#theme").onclick = () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
setTheme(localStorage.getItem("km_theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

// ---------- tabs ----------
let currentTab = "chat";
const loaded = {};
document.querySelectorAll("#tabs button").forEach((b) => (b.onclick = () => {
  currentTab = b.dataset.tab;
  document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x.id === "tab-" + currentTab));
  document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("active", x === b));
  loadTab(currentTab);
}));
function loadTab(tab) { ({ weather: loadWeather, mandi: loadMandi, schemes: loadSchemes })[tab]?.(); }
async function api(path, opts) { const r = await fetch(path, opts); if (!r.ok) throw new Error(r.status); return r.json(); }

// ---------- speech ----------
function speak(text) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text); u.lang = SPEECH_LANG[lang]; speechSynthesis.speak(u);
}
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
$("#mic").onclick = () => {
  if (!SR) return alert(t("noVoice"));
  const rec = new SR(); rec.lang = SPEECH_LANG[lang]; rec.interimResults = false;
  rec.onresult = (e) => { $("#msg").value = e.results[0][0].transcript; sendChat(); };
  rec.start();
};

// ---------- chat ----------
function addBubble(text, who, translationKey = null, isOffline = false) {
  const b = el("div", "bubble " + who);
  const message = el("span", "bubble-text", text);
  b.append(message);
  if (translationKey) {
    b.dataset.translationKey = translationKey;
    b.dataset.offline = String(isOffline);
  }
  if (who === "ai") {
    const s = el("button", "", "🔊 " + t("speak"));
    s.onclick = () => speak(message.textContent);
    b.append(document.createElement("br"), s);
  }
  $("#log").append(b); b.scrollIntoView({ behavior: "smooth", block: "end" }); return b;
}
function refreshLocalizedChat() {
  document.querySelectorAll(".bubble.ai[data-translation-key]").forEach((bubble) => {
    const text = t(bubble.dataset.translationKey);
    bubble.querySelector(".bubble-text").textContent = text + (bubble.dataset.offline === "true" ? `\n(${t("offline")})` : "");
    bubble.querySelector("button").textContent = "🔊 " + t("speak");
  });
}
async function sendChat() {
  const text = $("#msg").value.trim(); if (!text) return;
  $("#msg").value = ""; addBubble(text, "me");
  const wait = addBubble(t("loading"), "ai", "loading");
  try {
    const d = await api("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text, history, lang }) });
    wait.remove();
    const reply = d.reply_key ? t(d.reply_key) : d.reply;
    addBubble(reply + (d.source === "offline" ? "\n(" + t("offline") + ")" : ""), "ai", d.reply_key, d.source === "offline");
    history.push({ role: "user", text }, { role: "model", text: reply });
  } catch { wait.remove(); addBubble(t("error"), "ai", "error"); }
}
$("#send").onclick = sendChat;
$("#msg").onkeydown = (e) => e.key === "Enter" && sendChat();

// ---------- crop doctor: file picker, camera, drag & drop ----------
function setFile(f) {
  if (!f || !f.type.startsWith("image/")) return;
  pickedFile = f; const p = $("#preview"); p.src = URL.createObjectURL(f); p.hidden = false;
}
$("#file").onchange = (e) => setFile(e.target.files[0]);
$("#camera").onchange = (e) => setFile(e.target.files[0]);
$("#shoot").onclick = () => $("#camera").click();   // capture="environment" opens the rear camera on phones
const drop = $("#drop");
["dragover", "dragenter"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => setFile(e.dataTransfer.files[0]));

// Downscale big phone photos before upload: saves data on 3G/4G.
function shrink(file, max = 1024) {
  return new Promise((res) => {
    const img = new Image(); img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas");
      c.width = img.width * s; c.height = img.height * s; c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => res(b || file), "image/jpeg", 0.8);
    }; img.onerror = () => res(file); img.src = URL.createObjectURL(file);
  });
}
$("#analyze").onclick = async () => {
  const out = $("#diagResult"); out.hidden = false; out.replaceChildren(el("p", "", t("loading")));
  if (!pickedFile) { out.replaceChildren(el("p", "", t("upload"))); return; }
  const fd = new FormData(); fd.append("image", await shrink(pickedFile), "leaf.jpg"); fd.append("lang", lang); fd.append("crop_hint", $("#crop").value);
  try {
    const { diagnosis: response, source } = await api("/api/diagnose", { method: "POST", body: fd });
    lastDiagnosis = response;
    lastDiagnosisSource = source;
    renderDiagnosis(response, source);
  } catch { lastDiagnosis = null; out.replaceChildren(el("p", "", t("error"))); }
};

function renderDiagnosis(response, source) {
  const out = $("#diagResult");
  const d = source === "offline" ? localizeOfflineDiagnosis(response) : response;
  out.replaceChildren(el("h3", "", `${d.crop || ""}: ${d.disease || ""}`));
  ["symptoms", "organic_remedy", "chemical_remedy", "prevention"].forEach((key) => {
    if (!d[key] || !d[key].length) return;
    out.append(el("strong", "", t(key)), Object.assign(el("ul"), {}));
    d[key].forEach((item) => out.lastChild.append(el("li", "", item)));
  });
  if (d.disclaimer) out.append(el("small", "", t(source === "offline" ? "offlineDiagnosisDisclaimer" : "aiDiagnosisDisclaimer")));
  if (source === "offline") out.append(el("div", "", "(" + t("offline") + ")"));
  const speakButton = el("button", "", "🔊 " + t("speak"));
  speakButton.onclick = () => speak(`${d.disease}. ${(d.organic_remedy || []).join(". ")}`);
  out.append(speakButton);
}

function localizeOfflineDiagnosis(diagnosis) {
  const crop = (diagnosis.crop || "").trim().toLowerCase();
  const content = SECTION_TRANSLATIONS[lang].offlineDiagnosis[crop] || SECTION_TRANSLATIONS[lang].offlineDiagnosis.generic;
  const cropNames = { paddy: "crop_paddy", tomato: "crop_tomato", cotton: "crop_cotton", unknown: "crop_unknown" };
  return {
    ...diagnosis,
    crop: cropNames[crop] ? t(cropNames[crop]) : diagnosis.crop,
    disease: content.disease,
    symptoms: content.symptoms,
    organic_remedy: content.organic_remedy,
    chemical_remedy: content.chemical_remedy,
    prevention: content.prevention,
    disclaimer: t("offlineDiagnosisDisclaimer"),
  };
}

// ---------- weather ----------
function loadWeather() {
  const go = async (lat, lon) => {
    const box = $("#weatherOut"); box.replaceChildren(el("p", "", t("loading")));
    try {
      const w = await api(`/api/weather?lat=${lat}&lon=${lon}`);
      if (!w.available) return box.replaceChildren(el("p", "", t("weatherUnavailable")));
      const badge = el("span", "badge " + (w.spray.safe ? "ok" : "bad"), w.spray.safe ? t("sprayOk") : t("sprayNo"));
      const stats = el("div", "stats", `${t("temp")}: ${w.current.temp_c}°C   ${t("humidity")}: ${w.current.humidity}%   ${t("wind")}: ${w.current.wind_kmh} km/h`);
      box.replaceChildren(badge, stats, ...w.spray.reasons.map((r) => el("div", "", "• " + t("r_" + r))));
      w.forecast.forEach((f) => {
        const date = new Date(`${f.date}T00:00:00`).toLocaleDateString(SPEECH_LANG[lang], { year: "numeric", month: "2-digit", day: "2-digit" });
        box.append(el("div", "", `${date}: ${f.min_c}–${f.max_c}°C, 🌧 ${t("rain")}: ${f.rain_mm} mm (${t("rainChance")}: ${f.rain_chance}%)`));
      });
    } catch { box.replaceChildren(el("p", "", t("error"))); }
  };
  navigator.geolocation ? navigator.geolocation.getCurrentPosition((p) => go(p.coords.latitude, p.coords.longitude), () => go(13.08, 80.27), { timeout: 6000 }) : go(13.08, 80.27);
}

// ---------- mandi + schemes ----------
async function loadMandi() {
  const box = $("#mandiOut");
  try {
    const d = await api("/api/mandi"); box.replaceChildren();
    d.items.forEach((i) => { const c = el("div", "card glass"); c.append(el("h3", "", `${localizeKnown("crop", i.crop)} — ${localizeKnown("state", i.state)}`), el("div", "", `${t("price")}: ₹${i.modal_price}/q   ${t("msp")}: ₹${i.msp}/q`), el("span", "badge " + (i.above_msp ? "ok" : "bad"), (i.gap >= 0 ? "+" : "") + i.gap)); box.append(c); });
    box.append(el("small", "", t("mandiNote")));
  } catch { box.replaceChildren(el("p", "", t("error"))); }
}
async function loadSchemes() {
  const box = $("#schemesOut");
  try {
    const d = await api("/api/schemes"); box.replaceChildren();
    d.schemes.forEach((s) => { const c = el("div", "card glass"), a = el("a", "", t("externalLink")); a.href = s.link; a.target = "_blank"; a.rel = "noopener"; c.append(el("h3", "", t(`scheme_${s.id}`)), el("div", "", t(`benefit_${s.id}`)), a); box.append(c); });
  } catch { box.replaceChildren(el("p", "", t("error"))); }
}

function localizeKnown(type, value) {
  const key = `${type}_${value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
  return SECTION_TRANSLATIONS[lang][key] || value;
}

applyLang();
