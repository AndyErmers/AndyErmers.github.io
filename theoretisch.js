import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

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
 * - avgConsumptionPerDay (alleen dalingen tellen als verbruik)
 */
function buildStats(rowsSortedAsc) {
  // Instelbare parameters (pas aan als je wilt)
const TOLERANCE_ABS = 0.1;     // kleine float-ruis
const TOLERANCE_PCT = 0.005;   // 0.5% voor grotere aantallen

  const MAX_CONS_PER_DAY = 20;    // cap: max verbruik per dag (bescherming tegen onzin)

  const map = new Map(); // key -> { productName, points: [{date, qty}] }

  for (const r of rowsSortedAsc) {
    const key = normalizeProduct(r.product);
    if (!key) continue;

    if (!map.has(key)) {
      map.set(key, { productName: r.product, points: [] });
    }

    const qty = Number(r.Hoeveelheid ?? 0);
    map.get(key).points.push({ date: r.Datum, qty: Number.isFinite(qty) ? qty : 0 });
  }

  const results = [];

  for (const obj of map.values()) {
    const pts = obj.points;
    if (pts.length === 0) continue;

    // laatste punt
    const latest = pts[pts.length - 1];
    const latestQty = latest.qty;
    const latestDate = latest.date;

    let totalConsumed = 0;
    let totalDays = 0;

    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const cur = pts[i];

      const dDays = daysBetween(prev.date, cur.date);
      if (dDays <= 0) continue;

      const delta = cur.qty - prev.qty;

      // Dynamische foutmarge: max(vaste marge, procentueel)
      const tol = Math.max(TOLERANCE_ABS, Math.abs(prev.qty) * TOLERANCE_PCT);

      // 1) Kleine ruis/telfout => negeren
      if (Math.abs(delta) <= tol) {
        continue;
      }

      // 2) Stijging (bijvullen/aankoop) => negeren voor verbruik
      if (delta > 0) {
        continue;
      }

      // 3) Echte daling => verbruik
      const consumed = -delta;

      // Extra safety: als iemand per ongeluk van 100 naar 0 zet in 1 dag,
      // en dat is niet logisch, dan wil je dit niet je hele model laten slopen.
      const consPerDay = consumed / dDays;
      const cappedConsPerDay = Math.min(consPerDay, MAX_CONS_PER_DAY);

      totalConsumed += cappedConsPerDay * dDays;
      totalDays += dDays;
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

  // Pak genoeg historie om verbruik te kunnen schatten
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

  // Bereken theoretische voorraad nu
  const nowIso = new Date().toISOString();

  // sorteer op productnaam
  stats.sort((a, b) => a.productName.localeCompare(b.productName, "nl"));

  tbody.innerHTML = "";

  for (const s of stats) {
    const days = daysBetween(s.latestDate, nowIso);
const theoRaw = Math.max(0, s.latestQty - (s.consumptionPerDay * days));
const theoInt = Math.max(0, Math.round(theoRaw)); // of Math.floor / Math.ceil, zie hieronder

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
