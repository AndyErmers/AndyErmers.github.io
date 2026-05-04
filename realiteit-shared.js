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
