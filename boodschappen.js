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

/**
 * Verbruik per dag per product:
 * - GEEN foutmarge
 * - Restock (delta > 0) splitst in nieuw blok
 * - Dagen zonder verbruik tellen mee (maar alleen als er voorraad was)
 * - Dagen met werkelijke voorraad 0 tellen NIET mee (prevQty === 0)
 *   - 10 -> 0 telt mee
 *   - 0 -> 0 telt niet mee
 *   - 0 -> restock telt niet mee (restock splitst blok)
 */
function buildConsumptionPerDay(rowsSortedAsc) {
  const MAX_CONS_PER_DAY = 50; // safety cap

  const map = new Map(); // key -> { productName, points: [{date, qty}] }

  for (const r of rowsSortedAsc) {
    const key = normalizeProduct(r.product);
    if (!key) continue;

    if (!map.has(key)) map.set(key, { productName: r.product, points: [] });

    const qty = Number(r.Hoeveelheid ?? 0);
    map.get(key).points.push({
      date: r.Datum,
      qty: Number.isFinite(qty) ? qty : 0
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

    let blockConsumed = 0;
    let blockDays = 0;

    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const cur = pts[i];

      const dDays = daysBetween(prev.date, cur.date);
      if (dDays <= 0) continue;

      const prevQty = Math.max(0, Number(prev.qty ?? 0));
      const curQty = Math.max(0, Number(cur.qty ?? 0));
      const delta = curQty - prevQty;

      // RESTOCK => blok afsluiten en nieuw blok starten
      if (delta > 0) {
        if (blockDays > 0) {
          totalConsumed += blockConsumed;
          totalDays += blockDays;
        }
        blockConsumed = 0;
        blockDays = 0;
        continue;
      }

      // ✅ Alleen dagen meetellen als je aan het begin voorraad had
      // (prevQty == 0 => je kon niets verbruiken, dus die periode niet meetellen)
      if (prevQty > 0) {
        blockDays += dDays; // delta kan 0 zijn: dagen zonder verbruik tellen mee
      } else {
        continue;
      }

      // Verbruik alleen bij daling
      if (delta < 0) {
        const consumed = -delta;
        const consPerDaySeg = consumed / dDays;
        const cappedSeg = Math.min(consPerDaySeg, MAX_CONS_PER_DAY);
        blockConsumed += cappedSeg * dDays;
      }
    }

    // laatste blok meetellen
    if (blockDays > 0) {
      totalConsumed += blockConsumed;
      totalDays += blockDays;
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
  // pred = 0 → kopen 0
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
  const rowsDesc = [...rowsAsc].sort(
    (a, b) => new Date(b.Datum) - new Date(a.Datum)
  );

  const latestMap = latestMapByProduct(rowsDesc);
  const consMap = buildConsumptionPerDay(rowsAsc);

  const targetIso = addDaysIso(shopDateIso, 7);

  const items = [];

  for (const [key, latest] of latestMap.entries()) {
    const latestQty = Number(latest.Hoeveelheid ?? 0);
    const latestDate = latest.Datum;

    const cons = consMap.get(key)?.consPerDay ?? 0;

    const daysToTarget = daysBetween(latestDate, targetIso);
    const pred = latestQty - cons * daysToTarget;

    if (pred <= 0) {
      items.push({
        product: latest.product ?? "",
        predAtPlus7: pred,
        buy: buyAmountFromPred(pred)
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
    tdV.textContent = String(round0(it.predAtPlus7));

    const tdB = document.createElement("td");
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
(() => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  dateInput.value = `${yyyy}-${mm}-${dd}`;
})();
