import {
  normalizeProduct,
  daysBetween,
  fetchAllRealiteitHistory,
  buildConsumptionStats,
  makeTd,
} from "./realiteit-shared.js";

const form = document.getElementById("boodschappen-form");
const dateInput = document.getElementById("boodschappen-datum");
const tbody = document.getElementById("boodschappen-body");

// Laatste stand per product op basis van Datum desc (eerste per product = nieuwste)
function latestMapByProduct(rowsSortedByDatumDesc) {
  const map = new Map();
  for (const r of rowsSortedByDatumDesc) {
    const key = normalizeProduct(r.product);
    if (!key) continue;
    if (!map.has(key)) map.set(key, r);
  }
  return map;
}

function parseDateInputToIso(dateStr) {
  // date input is YYYY-MM-DD; maak er lokale dagstart van
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
  return dt.toISOString();
}

function round0(n) {
  return Math.round(n);
}

function buyAmountFromPred(predAtPlus7) {
  if (predAtPlus7 > 0) return 0;
  return Math.ceil(-predAtPlus7);
}

async function calculateShoppingList(shopDateIso) {
  tbody.innerHTML = `<tr><td colspan="3">Laden...</td></tr>`;

  let rowsAsc;
  try {
    rowsAsc = await fetchAllRealiteitHistory();
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="3">Fout bij laden</td></tr>`;
    console.error("Supabase select error:", error);
    return;
  }

  const rowsDesc = [...rowsAsc].sort((a, b) => new Date(b.Datum) - new Date(a.Datum));

  const latestMap = latestMapByProduct(rowsDesc);
  const consMap = buildConsumptionStats(rowsAsc);

  const items = [];

  for (const [key, latest] of latestMap.entries()) {
    const latestQty = Number(latest.Hoeveelheid ?? 0);
    const latestDate = latest.Datum;

    const cons = consMap.get(key)?.consumptionPerDay ?? 0;

    // 1) voorraad op boodschappendatum: nooit onder 0
    const daysToShop = daysBetween(latestDate, shopDateIso);
    const stockAtShop = Math.max(0, latestQty - cons * daysToShop);

    // 2) voorspelling op +7 vanaf boodschappendatum (mag negatief zijn)
    const predAtPlus7 = stockAtShop - cons * 7;

    if (predAtPlus7 <= 0) {
      items.push({
        product: latest.product ?? "",
        predAtPlus7,
        buy: buyAmountFromPred(predAtPlus7)
      });
    }
  }

  items.sort((a, b) => b.buy - a.buy || a.product.localeCompare(b.product, "nl"));

  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3">Geen boodschappen nodig (alles blijft boven 0).</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  for (const it of items) {
    const tr = document.createElement("tr");

    const tdP = makeTd("Product", { primary: true });
    tdP.textContent = it.product;

    const tdV = makeTd("Verwacht op +7");
    tdV.textContent = String(round0(it.predAtPlus7));

    const tdB = makeTd("Kopen");
    tdB.textContent = String(it.buy);

    tr.appendChild(tdP);
    tr.appendChild(tdV);
    tr.appendChild(tdB);
    tbody.appendChild(tr);
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const dateStr = dateInput.value;
  if (!dateStr) return;

  const shopDateIso = parseDateInputToIso(dateStr);
  await calculateShoppingList(shopDateIso);
});

// Zet default datum op vandaag
const today = new Date();
const yyyy = today.getFullYear();
const mm = String(today.getMonth() + 1).padStart(2, "0");
const dd = String(today.getDate()).padStart(2, "0");
dateInput.value = `${yyyy}-${mm}-${dd}`;
