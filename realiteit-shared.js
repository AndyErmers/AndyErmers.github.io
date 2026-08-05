import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://lbmtkzxoucwsniznvcjg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_8gl1rTwsBMqpKPW1TTnUJA_FAOzBlcI";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const SELECT_PAGE = 1000;

export function formatDatum(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
}

/** ILIKE-patroon voor exacte (case-insensitive) match; escapet %, _ en \. */
export function escapeIlikeExact(s) {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function fetchAllRowsMatchingProductIlike(ilikePattern) {
  const out = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("Realiteit")
      .select("id, product")
      .ilike("product", ilikePattern)
      .order("id", { ascending: true })
      .range(from, from + SELECT_PAGE - 1);

    if (error) throw error;
    const chunk = data ?? [];
    out.push(...chunk);
    if (chunk.length < SELECT_PAGE) break;
    from += SELECT_PAGE;
  }
  return out;
}

/** Alle rijen voor product (zelfde naam-match als verwijderen), nieuwste datum eerst. */
export async function fetchFullRowsForProduct(trimmedName) {
  const naam = (trimmedName ?? "").trim();
  if (!naam) return [];
  const pattern = escapeIlikeExact(naam);
  const out = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("Realiteit")
      .select("id, product, Hoeveelheid, Datum")
      .ilike("product", pattern)
      .order("Datum", { ascending: false })
      .range(from, from + SELECT_PAGE - 1);

    if (error) throw error;
    const chunk = data ?? [];
    out.push(...chunk);
    if (chunk.length < SELECT_PAGE) break;
    from += SELECT_PAGE;
  }
  return out;
}

export function toDatetimeLocalValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDatetimeLocalValue(s) {
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}

/** Tabelcel met data-label voor gestapelde mobiele kaarten. */
export function makeTd(label, { primary = false } = {}) {
  const td = document.createElement("td");
  if (label) td.dataset.label = label;
  if (primary) td.classList.add("cell-primary");
  return td;
}

export function normalizeProduct(p) {
  return (p ?? "").trim().toLowerCase();
}

export function daysBetween(aIso, bIso) {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  return Math.max(0, (b - a) / (1000 * 60 * 60 * 24));
}

/**
 * Segmenten korter dan dit (1 uur) behandelen we als correcties
 * (bijv. 500 → 0 binnen een paar seconden) en tellen niet mee.
 */
export const MIN_SEGMENT_DAYS = 1 / 24;

/**
 * Alle Realiteit-rijen ophalen (paginated), oudste eerst.
 */
export async function fetchAllRealiteitHistory() {
  const out = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("Realiteit")
      .select("product, Hoeveelheid, Datum")
      .order("Datum", { ascending: true })
      .range(from, from + SELECT_PAGE - 1);

    if (error) throw error;
    const chunk = data ?? [];
    out.push(...chunk);
    if (chunk.length < SELECT_PAGE) break;
    from += SELECT_PAGE;
  }
  return out;
}

/**
 * Verbruik/dag = totaal verbruik / totale tijd.
 *
 * Regels:
 * - Restock (delta > 0) splitst in blokken (restock-periode telt niet mee)
 * - Alleen dalingen (verbruik > 0) gaan in de teller
 * - Tijd telt mee zolang er aan het begin voorraad was (prevQty > 0),
 *   inclusief vlakke periodes zonder verbruik
 * - prevQty === 0: periode telt niet mee (geen verbruik, geen tijd)
 * - Zeer korte segmenten (< MIN_SEGMENT_DAYS) worden overgeslagen (correcties)
 * - Geen vaste max-per-dag cap: die zette producten in ml (Energy) vast op de cap
 */
export function buildConsumptionStats(rowsSortedAsc) {
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
      qty: Number.isFinite(qty) ? qty : 0,
    });
  }

  const results = new Map(); // key -> { productName, latestQty, latestDate, consumptionPerDay }

  for (const [key, obj] of map.entries()) {
    const pts = obj.points;
    if (pts.length === 0) continue;

    const latest = pts[pts.length - 1];
    const latestQty = Math.max(0, Number(latest.qty ?? 0));
    const latestDate = latest.date;

    if (pts.length < 2) {
      results.set(key, {
        productName: obj.productName,
        latestQty,
        latestDate,
        consumptionPerDay: 0,
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

      // Correcties / dubbele invoer binnen korte tijd overslaan
      if (dDays < MIN_SEGMENT_DAYS) continue;

      // Geen voorraad aan het begin => periode niet meetellen
      if (prevQty <= 0) continue;

      // Tijd meetellen (ook zonder verbruik, zolang er voorraad was)
      blockDays += dDays;

      // Verbruik alleen bij daling
      if (delta < 0) {
        blockConsumed += -delta;
      }
    }

    if (blockDays > 0) {
      totalConsumed += blockConsumed;
      totalDays += blockDays;
    }

    const consumptionPerDay = totalDays > 0 ? totalConsumed / totalDays : 0;

    results.set(key, {
      productName: obj.productName,
      latestQty,
      latestDate,
      consumptionPerDay,
    });
  }

  return results;
}
