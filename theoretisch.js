import {
  daysBetween,
  fetchAllRealiteitHistory,
  buildConsumptionStats,
  makeTd,
} from "./realiteit-shared.js";

const tbody = document.getElementById("theo-body");
const copyBtn = document.getElementById("theo-copy-btn");
const copyStatus = document.getElementById("theo-copy-status");

/** @type {string} */
let copyText = "";

function round2(n) {
  return Math.round(n * 100) / 100;
}

function setCopyStatus(msg) {
  if (copyStatus) copyStatus.textContent = msg;
}

async function copyListToClipboard() {
  if (!copyText) {
    setCopyStatus("Geen lijst om te kopiëren.");
    return;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(copyText);
    } else {
      const ta = document.createElement("textarea");
      ta.value = copyText;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopyStatus("Gekopieerd ✓");
  } catch (err) {
    console.error(err);
    setCopyStatus("Kopiëren mislukt.");
  }
}

async function loadTheoretisch() {
  tbody.innerHTML = `<tr><td colspan="5">Laden...</td></tr>`;
  copyText = "";
  if (copyBtn) copyBtn.disabled = true;
  setCopyStatus("");

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
  copyBtn.addEventListener("click", copyListToClipboard);
}

loadTheoretisch();
