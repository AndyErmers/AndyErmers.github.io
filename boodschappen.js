import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://lbmtkzxoucwsniznvcjg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_8gl1rTwsBMqpKPW1TTnUJA_FAOzBlcI";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const form = document.getElementById("boodschappen-form");
const dateInput = document.getElementById("boodschappen-datum");
const tbody = document.getElementById("boodschappen-body");

function normalizeProduct(p) {
  return (p ?? "").trim().toLowerCase();
}

function daysBetween(aIso, bIso) {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  return Math.max(0, (b - a) / (1000 * 60 * 60 * 24));
}

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

// Verbruik per dag per product, met restock + foutmarge uitgesloten
function buildConsumptionPerDay(rowsSortedAsc) {
  // Strakke marge (klein): pas aan als nodig
  const TOLERANCE_ABS = 0.1;    // kleine telruis
  const TOLERANCE_PCT = 0.005;  // 0.5%
  const MAX_CONS_PER_DAY = 50;  // safety cap

  const map = new Map(); // key -> { productName, points: [{date, qty}] }

  for (const r of rowsSortedAsc) {
    const key = normalizeProduct(r.product);
    if (!key) continue;

    if (!map.has(key)) map.set(key, { productName: r.product, points: [] });

    const qty = Number(r.Hoeveelheid ?? 0);
    map.get(key).points.push({
      date: r.Datum,
      qty: Number.isFinite(qty) ? qty : 0,
    });
  }

  const result = new Map(); // key -> { productName, consPerDay }

  for (const [key, obj] of map.entries()) {
    const pts = obj.points;
    if (pts.length < 2) {
      result.set(key, { productName: obj.productName, consPerDay: 0 });
      continue;
    }

    let totalConsumed = 0;
    let totalDays = 0;

    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const cur = pts[i];

      const dDays = daysBetween(prev.date, cur.date);
      if (dDays <= 0) continue;

      const delta = cur.qty - prev.qty;

      // dynamische foutmarge
      const tol = Math.max(TOLERANCE_ABS, Math.abs(prev.qty) * TOLERANCE_PCT);

      // ruis/telfout negeren
      if (Math.abs(delta) <= tol) continue;

      // stijging = restock/correctie → niet als verbruik tellen
      if (delta > 0) continue;

      // echte daling = verbruik
      const consumed = -delta;
      const consPerDaySegment = consumed / dDays;
      const capped = Math.min(consPerDaySegment, MAX_CONS_PER_DAY);

      totalConsumed += capped * dDays;
      totalDays += dDays;
    }

    const consPerDay = totalDays > 0 ? totalConsumed / totalDays : 0;
    result.set(key, { productName: obj.productName, consPerDay });
  }

  return result;
}

function parseDateInputToIso(dateStr) {
  // date input is YYYY-MM-DD; maak er lokale dagstart van
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
  return dt.toISOString();
}

function addDaysIso(iso, days) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function round0(n) {
  return Math.round(n); // voor “verwacht op +7” als heel getal
}

function buyAmountFromPred(predAtPlus7) {
  // Als pred <= 0 → kopen om op 0 uit te komen
  // pred = -7 → kopen 7
  // pred = 0 → kopen 0 (zoals jij zei)
  if (predAtPlus7 > 0) return 0;
  return Math.ceil(-predAtPlus7);
}

async function calculateShoppingList(shopDateIso) {
  tbody.innerHTML = `<tr><td colspan="3">Laden...</td></tr>`;

  // Haal genoeg historie op
  const { data, error } = await supabase
    .from("Realiteit")
    .select("product, Hoeveelheid, Datum")
    .order("Datum", { ascending: true })
    .limit(5000);

  if (error) {
    tbody.innerHTML = `<tr><td colspan="3">Fout bij laden</td></tr>`;
    console.error("Supabase select error:", error);
    return;
  }

  const rowsAsc = data ?? [];
  const rowsDesc = [...rowsAsc].sort((a, b) => new Date(b.Datum) - new Date(a.Datum));

  const latestMap = latestMapByProduct(rowsDesc);
  const consMap = buildConsumptionPerDay(rowsAsc);

  const targetIso = addDaysIso(shopDateIso, 7);

  const items = [];

  for (const [key, latest] of latestMap.entries()) {
    const latestQty = Number(latest.Hoeveelheid ?? 0);
    const latestDate = latest.Datum;

    const cons = consMap.get(key)?.consPerDay ?? 0;

    const daysToTarget = daysBetween(latestDate, targetIso);
    const pred = latestQty - (cons * daysToTarget);

    if (pred <= 0) {
      items.push({
        product: latest.product ?? "",
        predAtPlus7: pred,
        buy: buyAmountFromPred(pred),
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

    const tdP = document.createElement("td");
    tdP.textContent = it.product;

    const tdV = document.createElement("td");
    tdV.textContent = String(round0(it.predAtPlus7)); // altijd heel getal

    const tdB = document.createElement("td");
    tdB.textContent = String(it.buy); // koopadvies als integer

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
(() => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  dateInput.value = `${yyyy}-${mm}-${dd}`;
})();
