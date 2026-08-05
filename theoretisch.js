import {
  daysBetween,
  fetchAllRealiteitHistory,
  buildConsumptionStats,
  makeTd,
} from "./realiteit-shared.js";

const tbody = document.getElementById("theo-body");
const copyBtn = document.getElementById("theo-copy-btn");
const copyStatus = document.getElementById("theo-copy-status");
const copyFallback = document.getElementById("theo-copy-fallback");

/** @type {string} */
let copyText = "";

function round2(n) {
  return Math.round(n * 100) / 100;
}

function setCopyStatus(msg, ok = true) {
  if (!copyStatus) return;
  copyStatus.textContent = msg;
  copyStatus.classList.toggle("theo-copy-status--error", !ok);
}

function hideFallback() {
  if (!copyFallback) return;
  copyFallback.hidden = true;
  copyFallback.value = "";
}

function showFallbackForManualCopy() {
  if (!copyFallback) return;
  copyFallback.hidden = false;
  copyFallback.value = copyText;
  copyFallback.focus();
  copyFallback.select();
  copyFallback.setSelectionRange(0, copyFallback.value.length);
  setCopyStatus("Selecteer de tekst hieronder en kopieer handmatig.", false);
}

/** iOS-/Android-vriendelijke execCommand-fallback */
function copyViaExecCommand(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.setAttribute("aria-hidden", "true");
  // Niet off-screen: iOS kopieert anders vaak niet
  ta.style.cssText =
    "position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;outline:none;box-shadow:none;background:transparent;opacity:0.01;z-index:-1;";
  document.body.appendChild(ta);

  ta.focus();
  ta.select();
  ta.setSelectionRange(0, ta.value.length);

  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }

  document.body.removeChild(ta);
  return ok;
}

async function copyListToClipboard() {
  if (!copyText) {
    setCopyStatus("Geen lijst om te kopiëren.", false);
    return;
  }

  hideFallback();

  // 1) Moderne Clipboard API
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopyStatus("Gekopieerd ✓", true);
      return;
    } catch (err) {
      console.warn("clipboard.writeText mislukt, probeer fallback:", err);
    }
  }

  // 2) execCommand-fallback (werkt vaak beter op oudere/mobile browsers)
  if (copyViaExecCommand(copyText)) {
    setCopyStatus("Gekopieerd ✓", true);
    return;
  }

  // 3) Laatste redmiddel: zichtbaar tekstveld om handmatig te kopiëren
  showFallbackForManualCopy();
}

async function loadTheoretisch() {
  tbody.innerHTML = `<tr><td colspan="5">Laden...</td></tr>`;
  copyText = "";
  if (copyBtn) copyBtn.disabled = true;
  setCopyStatus("");
  hideFallback();

  let rows;
  try {
    rows = await fetchAllRealiteitHistory();
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="5">Fout bij laden</td></tr>`;
    console.error("Supabase select error:", error);
    return;
  }

  const statsMap = buildConsumptionStats(rows);
  const stats = [...statsMap.values()];

  if (stats.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5">Geen data</td></tr>`;
    return;
  }

  const nowIso = new Date().toISOString();

  stats.sort((a, b) => a.productName.localeCompare(b.productName, "nl"));

  tbody.innerHTML = "";

  const lines = [];

  for (const s of stats) {
    const days = daysBetween(s.latestDate, nowIso);

    const theoRaw = Math.max(0, s.latestQty - s.consumptionPerDay * days);
    const theoInt = Math.max(0, Math.round(theoRaw));

    lines.push(`${s.productName}: ${theoInt}`);

    const tr = document.createElement("tr");

    const tdP = makeTd("Product", { primary: true });
    tdP.textContent = s.productName;

    const tdL = makeTd("Laatste stand");
    tdL.textContent = String(round2(s.latestQty));

    const tdC = makeTd("Verbruik/dag");
    tdC.textContent = String(round2(s.consumptionPerDay));

    const tdD = makeTd("Dagen");
    tdD.textContent = String(round2(days));

    const tdT = makeTd("Theoretisch nu");
    tdT.textContent = String(theoInt);

    tr.appendChild(tdP);
    tr.appendChild(tdL);
    tr.appendChild(tdC);
    tr.appendChild(tdD);
    tr.appendChild(tdT);

    tbody.appendChild(tr);
  }

  copyText = lines.join("\n");
  if (copyBtn) copyBtn.disabled = false;
}

if (copyBtn) {
  // Gebruik pointerup + click voor betere mobiele ondersteuning;
  // voorkom dubbele actie met een korte lock.
  let copying = false;
  const onCopy = async (e) => {
    e.preventDefault();
    if (copying || copyBtn.disabled) return;
    copying = true;
    try {
      await copyListToClipboard();
    } finally {
      copying = false;
    }
  };
  copyBtn.addEventListener("click", onCopy);
}

loadTheoretisch();
