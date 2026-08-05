import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";
import { makeTd } from "./realiteit-shared.js";

const SUPABASE_URL = "https://lbmtkzxoucwsniznvcjg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_8gl1rTwsBMqpKPW1TTnUJA_FAOzBlcI";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const tbody = document.getElementById("theo-body");

function normalizeProduct(p) {
  return (p ?? "").trim().toLowerCase();
}

function daysBetween(aIso, bIso) {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  const diffMs = Math.max(0, b - a);
  return diffMs / (1000 * 60 * 60 * 24);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Berekent per product:
 * - latestQty, latestDate
 * - consumptionPerDay
 *
 * Regels:
 * - GEEN foutmarge
 * - Restock (delta > 0) splitst in blokken
 * - Dagen zonder verbruik tellen mee (maar alleen als er voorraad was)
 * - Dagen met werkelijke voorraad 0 tellen NIET mee (prevQty === 0)
 *   - 10 -> 0 telt mee
 *   - 0 -> 0 telt niet mee
 *   - 0 -> restock telt niet mee (restock splitst blok)
 */
function buildStats(rowsSortedAsc) {
  const MAX_CONS_PER_DAY = 20; // safety cap

  const map = new Map(); // key -> { productName, points: [{date, qty}] }

  for (const r of rowsSortedAsc) {
    const key = normalizeProduct(r.product);
    if (!key) continue;

    if (!map.has(key)) {
      map.set(key, { productName: r.product, points: [] });
    }

    const qty = Number(r.Hoeveelheid ?? 0);
    map.get(key).points.push({
      date: r.Datum,
      qty: Number.isFinite(qty) ? qty : 0
    });
  }

  const results = [];

  for (const obj of map.values()) {
    const pts = obj.points;
    if (pts.length === 0) continue;

    const latest = pts[pts.length - 1];
    const latestQty = Math.max(0, Number(latest.qty ?? 0));
    const latestDate = latest.date;

    if (pts.length < 2) {
      results.push({
        productName: obj.productName,
        latestQty,
        latestDate,
        consumptionPerDay: 0
      });
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

      // RESTOCK => blok afsluiten en resetten
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

    const consumptionPerDay = totalDays > 0 ? totalConsumed / totalDays : 0;

    results.push({
      productName: obj.productName,
      latestQty,
      latestDate,
      consumptionPerDay
    });
  }

  return results;
}

async function loadTheoretisch() {
  tbody.innerHTML = `<tr><td colspan="5">Laden...</td></tr>`;

  const { data, error } = await supabase
    .from("Realiteit")
    .select("product, Hoeveelheid, Datum")
    .order("Datum", { ascending: true })
    .limit(5000);

  if (error) {
    tbody.innerHTML = `<tr><td colspan="5">Fout bij laden</td></tr>`;
    console.error("Supabase select error:", error);
    return;
  }

  const stats = buildStats(data ?? []);

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
}

loadTheoretisch();
