import { supabase, makeTd } from "./realiteit-shared.js";

const TABLE = "Houdbaarheid";

const form = document.getElementById("tht-form");
const productInput = document.getElementById("tht-product");
const datumInput = document.getElementById("tht-datum");
const formStatus = document.getElementById("tht-form-status");

const bodyExpired = document.getElementById("tht-body-expired");
const bodyWarn = document.getElementById("tht-body-warn");
const bodyOk = document.getElementById("tht-body-ok");

const countExpired = document.getElementById("tht-count-expired");
const countWarn = document.getElementById("tht-count-warn");
const countOk = document.getElementById("tht-count-ok");

/** Lokale kalenderdag als YYYY-MM-DD */
function todayLocalIsoDate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseIsoDate(isoDate) {
  const [y, m, d] = String(isoDate).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDateNl(isoDate) {
  if (!isoDate) return "";
  const dt = parseIsoDate(isoDate);
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function daysBetweenDates(aIso, bIso) {
  const a = parseIsoDate(aIso).getTime();
  const b = parseIsoDate(bIso).getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

/**
 * Status t.o.v. vandaag:
 * - expired: vandaag > THT
 * - warn: vandaag >= midden tussen invoerdatum en THT (en nog niet expired)
 * - ok: anders
 */
function classifyItem(row, todayIso = todayLocalIsoDate()) {
  const entered = String(row.ingevoerd_op).slice(0, 10);
  const tht = String(row.tht_datum).slice(0, 10);

  if (daysBetweenDates(todayIso, tht) < 0) {
    return "expired";
  }

  const span = daysBetweenDates(entered, tht);
  // Korte of ongeldige periode: meteen in "bijna" (tenzij al verlopen)
  if (span <= 0) {
    return "warn";
  }

  // Midden: helft van de dagen vanaf invoer tot THT (naar beneden)
  const midOffset = Math.floor(span / 2);
  const midDate = new Date(parseIsoDate(entered));
  midDate.setDate(midDate.getDate() + midOffset);
  const midIso = [
    midDate.getFullYear(),
    String(midDate.getMonth() + 1).padStart(2, "0"),
    String(midDate.getDate()).padStart(2, "0"),
  ].join("-");

  if (daysBetweenDates(todayIso, midIso) <= 0) {
    return "warn";
  }

  return "ok";
}

function setFormStatus(msg, isError = false) {
  if (!formStatus) return;
  formStatus.textContent = msg;
  formStatus.style.color = isError ? "#b45309" : "";
}

function emptyRow(msg) {
  return `<tr><td colspan="4">${msg}</td></tr>`;
}

function renderGroup(tbody, items, emptyMsg) {
  tbody.innerHTML = "";
  if (!items.length) {
    tbody.innerHTML = emptyRow(emptyMsg);
    return;
  }

  for (const row of items) {
    const tr = document.createElement("tr");

    const tdP = makeTd("Product", { primary: true });
    tdP.textContent = row.product ?? "";

    const tdTht = makeTd("THT");
    tdTht.textContent = formatDateNl(row.tht_datum);

    const tdIn = makeTd("Ingevoerd");
    tdIn.textContent = formatDateNl(row.ingevoerd_op);

    const tdActie = makeTd("Actie");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-ghost";
    btn.textContent = "Weggegooid";
    btn.addEventListener("click", async () => {
      const ok = confirm(
        `“${row.product}” (THT ${formatDateNl(row.tht_datum)}) verwijderen uit de lijst?`
      );
      if (!ok) return;
      btn.disabled = true;
      const { error } = await supabase.from(TABLE).delete().eq("id", row.id);
      if (error) {
        alert("Verwijderen mislukt: " + error.message);
        btn.disabled = false;
        return;
      }
      await loadAll();
    });
    tdActie.appendChild(btn);

    tr.appendChild(tdP);
    tr.appendChild(tdTht);
    tr.appendChild(tdIn);
    tr.appendChild(tdActie);
    tbody.appendChild(tr);
  }
}

function isMissingTableError(error) {
  const msg = error?.message ?? "";
  const code = error?.code ?? "";
  return (
    code === "PGRST205" ||
    /Could not find the table/i.test(msg) ||
    /relation .* does not exist/i.test(msg)
  );
}

async function fetchAll() {
  const out = [];
  let from = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from(TABLE)
      .select("id, product, tht_datum, ingevoerd_op")
      .order("tht_datum", { ascending: true })
      .range(from, from + page - 1);

    if (error) throw error;
    const chunk = data ?? [];
    out.push(...chunk);
    if (chunk.length < page) break;
    from += page;
  }
  return out;
}

async function loadAll() {
  bodyExpired.innerHTML = emptyRow("Laden…");
  bodyWarn.innerHTML = emptyRow("Laden…");
  bodyOk.innerHTML = emptyRow("Laden…");

  let rows;
  try {
    rows = await fetchAll();
  } catch (error) {
    console.error(error);
    const tip = isMissingTableError(error)
      ? "Tabel ontbreekt nog. Voer supabase-houdbaarheid.sql uit in de Supabase SQL Editor."
      : error.message;
    bodyExpired.innerHTML = emptyRow(tip);
    bodyWarn.innerHTML = emptyRow("—");
    bodyOk.innerHTML = emptyRow("—");
    countExpired.textContent = "0";
    countWarn.textContent = "0";
    countOk.textContent = "0";
    return;
  }

  const expired = [];
  const warn = [];
  const ok = [];

  for (const row of rows) {
    const status = classifyItem(row);
    if (status === "expired") expired.push(row);
    else if (status === "warn") warn.push(row);
    else ok.push(row);
  }

  const byProduct = (a, b) =>
    String(a.product).localeCompare(String(b.product), "nl") ||
    String(a.tht_datum).localeCompare(String(b.tht_datum));

  expired.sort(byProduct);
  warn.sort(byProduct);
  ok.sort(byProduct);

  countExpired.textContent = String(expired.length);
  countWarn.textContent = String(warn.length);
  countOk.textContent = String(ok.length);

  renderGroup(bodyExpired, expired, "Geen verlopen producten.");
  renderGroup(bodyWarn, warn, "Niets bijna aan de THT.");
  renderGroup(bodyOk, ok, "Geen producten in deze lijst.");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setFormStatus("");

  const product = (productInput.value ?? "").trim();
  const tht = datumInput.value;

  if (!product) {
    setFormStatus("Vul een productnaam in.", true);
    return;
  }
  if (!tht) {
    setFormStatus("Kies een THT-datum.", true);
    return;
  }

  const today = todayLocalIsoDate();
  if (daysBetweenDates(today, tht) < 0) {
    const go = confirm(
      "Deze THT ligt in het verleden. Toch toevoegen als verlopen item?"
    );
    if (!go) return;
  }

  const btn = form.querySelector('button[type="submit"]');
  if (btn) btn.disabled = true;

  const { error } = await supabase.from(TABLE).insert({
    product,
    tht_datum: tht,
    ingevoerd_op: today,
  });

  if (btn) btn.disabled = false;

  if (error) {
    console.error(error);
    if (isMissingTableError(error)) {
      setFormStatus(
        "Tabel ontbreekt. Voer supabase-houdbaarheid.sql uit in Supabase.",
        true
      );
    } else {
      setFormStatus("Opslaan mislukt: " + error.message, true);
    }
    return;
  }

  productInput.value = "";
  datumInput.value = "";
  setFormStatus("Toegevoegd.");
  productInput.focus();
  await loadAll();
});

// Default THT-veld leeg laten; focus op product
if (datumInput && !datumInput.value) {
  // geen default — gebruiker moet bewust een THT kiezen
}

loadAll();
