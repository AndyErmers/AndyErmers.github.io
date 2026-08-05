import {
  daysBetween,
  fetchAllRealiteitHistory,
  buildConsumptionStats,
} from "./realiteit-shared.js";

const tbody = document.getElementById("theo-body");

function round2(n) {
  return Math.round(n * 100) / 100;
}

async function loadTheoretisch() {
  tbody.innerHTML = `<tr><td colspan="5">Laden...</td></tr>`;

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

  for (const s of stats) {
    const days = daysBetween(s.latestDate, nowIso);

    const theoRaw = Math.max(0, s.latestQty - s.consumptionPerDay * days);
    const theoInt = Math.max(0, Math.round(theoRaw));

    const tr = document.createElement("tr");

    const tdP = document.createElement("td");
    tdP.textContent = s.productName;

    const tdL = document.createElement("td");
    tdL.textContent = String(round2(s.latestQty));

    const tdC = document.createElement("td");
    tdC.textContent = String(round2(s.consumptionPerDay));

    const tdD = document.createElement("td");
    tdD.textContent = String(round2(days));

    const tdT = document.createElement("td");
    tdT.textContent = String(theoInt);

    tr.appendChild(tdP);
    tr.appendChild(tdL);
    tr.appendChild(tdC);
    tr.appendChild(tdD);
    tr.appendChild(tdT);

    tbody.appendChild(tr);
  }
}

loadTheoretisch();
