import {
  supabase,
  formatDatum,
  escapeIlikeExact,
  fetchAllRowsMatchingProductIlike,
  makeTd,
} from "./realiteit-shared.js";

const tbody = document.getElementById("voorraad-body");
const tellijstBody = document.getElementById("tellijst-body");

const form = document.getElementById("voorraad-form");
const productInput = document.getElementById("product");
const hoeveelheidInput = document.getElementById("hoeveelheid");

const verwijderForm = document.getElementById("verwijder-product-form");
const verwijderNaamInput = document.getElementById("verwijder-product-naam");

function todayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// deterministische random per dag
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// (Mag blijven staan; wordt niet gebruikt maar is niet schadelijk)
function latestPerProduct(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = (r.product ?? "").trim().toLowerCase();
    if (!key) continue;
    if (!map.has(key)) map.set(key, r);
  }
  return Array.from(map.values());
}

function pickDailyCountListProductKeysOldest(latestMap, fixedAmount = 5) {
  const keys = Array.from(latestMap.keys());
  const nTotal = keys.length;
  if (nTotal === 0) return [];

  // maximaal aantal = totaal aantal producten
  const nPick = Math.min(fixedAmount, nTotal);

  const sorted = keys.sort((a, b) => {
    const la = getLastCounted(a);
    const lb = getLastCounted(b);

    if (la === 0 && lb !== 0) return -1;
    if (la !== 0 && lb === 0) return 1;

    if (la !== 0 && lb !== 0 && la !== lb) return la - lb;

    const da = Date.parse(latestMap.get(a)?.Datum ?? "") || 0;
    const db = Date.parse(latestMap.get(b)?.Datum ?? "") || 0;
    if (da !== db) return da - db;

    return a.localeCompare(b);
  });

  return sorted.slice(0, nPick);
}

function cleanupDoneKey() {
  return `cleanup-done-${todayKey()}`;
}

function isCleanupDoneToday() {
  return localStorage.getItem(cleanupDoneKey()) === "1";
}

function markCleanupDoneToday() {
  localStorage.setItem(cleanupDoneKey(), "1");
}

function isDailyTellijstComplete() {
  const dailyKeys = getDailyTellijst();
  if (!Array.isArray(dailyKeys) || dailyKeys.length === 0) return false;

  // dailyKeys zijn genormaliseerd (lowercase), daarom checken op key
  return dailyKeys.every((k) => isProductGeteld(k));
}

async function cleanupOldestRowsPercentage(pct = 0.03) {
  // 1) totaal aantal rijen bepalen
  const { count, error: countError } = await supabase
    .from("Realiteit")
    .select("id", { count: "exact", head: true });

  if (countError) {
    console.error("Cleanup count error:", countError);
    return;
  }

  const total = count ?? 0;
  const nDelete = Math.floor(total * pct);

  if (nDelete <= 0) return;

  // 2) oudste ids ophalen
  const { data: oldestRows, error: fetchError } = await supabase
    .from("Realiteit")
    .select("id")
    .order("Datum", { ascending: true })
    .limit(nDelete);

  if (fetchError) {
    console.error("Cleanup fetch oldest error:", fetchError);
    return;
  }

  const ids = (oldestRows ?? []).map((r) => r.id).filter(Boolean);
  if (ids.length === 0) return;

  // 3) verwijderen
  const { error: delError } = await supabase
    .from("Realiteit")
    .delete()
    .in("id", ids);

  if (delError) {
    console.error("Cleanup delete error:", delError);
    return;
  }

  console.log(`Cleanup: deleted ${ids.length} oldest rows (${Math.round(pct * 100)}%).`);
}

function renderTellijstFromKeys(productKeys, latestMap) {
  if (!tellijstBody) return;

  if (!productKeys || productKeys.length === 0) {
    tellijstBody.innerHTML = `<tr><td colspan="4">Geen producten om te tellen</td></tr>`;
    return;
  }

  tellijstBody.innerHTML = "";

  for (const key of productKeys) {
    const latest = latestMap.get(key);
    if (!latest) continue;

    const productName = latest.product ?? "";
    const huidig = latest.Hoeveelheid ?? 0;

    const tr = document.createElement("tr");

    const tdP = makeTd("Product", { primary: true });
    tdP.textContent = productName;

    const tdHuidig = makeTd("Huidig");
    tdHuidig.textContent = String(huidig);

    const tdGeteld = makeTd("Geteld");
    const tdActie = makeTd("Actie");

    const alreadyCounted = isProductGeteld(productName);

    if (alreadyCounted) {
      tdGeteld.textContent = "✔";
      tdActie.textContent = "Geteld";
      tdActie.classList.add("geteld");
    } else {
      const input = document.createElement("input");
      input.type = "number";
      input.step = "0.01";
      input.min = "0";
      input.placeholder = "0";
      input.className = "input-tellijst-qty";
      tdGeteld.appendChild(input);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-primary";
      btn.textContent = "Opslaan";
      tdActie.appendChild(btn);

      btn.addEventListener("click", async () => {
        const val = Number(input.value);
        if (!Number.isFinite(val) || val < 0) {
          alert("Voer een hoeveelheid in van 0 of hoger.");
          return;
        }

        const { error } = await supabase.from("Realiteit").insert({
          product: productName,
          Hoeveelheid: val,
          Datum: new Date().toISOString(),
        });

        if (error) {
          alert("Fout bij opslaan telling: " + error.message);
          console.error(error);
          return;
        }

markProductGeteld(productName);
setLastCountedNow(normalizeProduct(productName));

// ✅ als tellijst compleet is: 1x per dag 3% oudste rijen verwijderen
if (!isCleanupDoneToday() && isDailyTellijstComplete()) {
  await cleanupOldestRowsPercentage(0.03);
  markCleanupDoneToday();
}

await laadVoorraad();

      });
    }

    tr.appendChild(tdP);
    tr.appendChild(tdHuidig);
    tr.appendChild(tdGeteld);
    tr.appendChild(tdActie);
    tellijstBody.appendChild(tr);
  }
}

function renderVoorraadTabel(latest) {
  tbody.innerHTML = "";

  if (!latest || latest.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4">Geen voorraad</td></tr>`;
    return;
  }

  for (const item of latest) {
    const tr = document.createElement("tr");

    const tdProduct = makeTd("Product", { primary: true });
    const tdHoeveelheid = makeTd("Hoeveelheid");
    const tdDatum = makeTd("Datum");
    const tdActies = makeTd("Acties");

    const oldProduct = item.product ?? "";
    const oldQty =
      typeof item.Hoeveelheid === "number"
        ? item.Hoeveelheid
        : Number(item.Hoeveelheid ?? 0);

    tdProduct.textContent = oldProduct;
    tdHoeveelheid.textContent = String(oldQty);
    tdDatum.textContent = formatDatum(item.Datum);

    const btnEdit = document.createElement("button");
    btnEdit.className = "btn";
    btnEdit.textContent = "Aanpassen";

    const linkAlle = document.createElement("a");
    linkAlle.className = "btn btn-secondary";
    linkAlle.href = `werkelijk-product.html?product=${encodeURIComponent(oldProduct)}`;
    linkAlle.textContent = "Alle regels";

    const btnRow = document.createElement("div");
    btnRow.className = "btn-row";
    btnRow.appendChild(linkAlle);
    btnRow.appendChild(btnEdit);

    btnEdit.addEventListener("click", () => {
      const inputProduct = document.createElement("input");
      inputProduct.type = "text";
      inputProduct.value = oldProduct;

      const inputQty = document.createElement("input");
      inputQty.type = "number";
      inputQty.step = "0.01";
      inputQty.min = "0";
      inputQty.value = String(oldQty);

      tdProduct.textContent = "";
      tdProduct.appendChild(inputProduct);

      tdHoeveelheid.textContent = "";
      tdHoeveelheid.appendChild(inputQty);

      tdActies.textContent = "";

      const btnSave = document.createElement("button");
      btnSave.className = "btn btn-primary";
      btnSave.textContent = "Opslaan";

      const btnCancel = document.createElement("button");
      btnCancel.className = "btn btn-ghost";
      btnCancel.textContent = "Annuleer";

      const actiesWrap = document.createElement("div");
      actiesWrap.className = "btn-row";
      actiesWrap.appendChild(btnSave);
      actiesWrap.appendChild(btnCancel);
      tdActies.appendChild(actiesWrap);

      btnCancel.addEventListener("click", () => {
        tdProduct.textContent = oldProduct;
        tdHoeveelheid.textContent = String(oldQty);
        tdActies.textContent = "";
        tdActies.appendChild(btnRow);
      });

      btnSave.addEventListener("click", async () => {
        const newProduct = inputProduct.value.trim();
        const newQty = Number(inputQty.value);

        if (!newProduct) {
          alert("Productnaam mag niet leeg zijn.");
          return;
        }
        if (!Number.isFinite(newQty) || newQty < 0) {
          alert("Hoeveelheid moet een getal zijn (0 of hoger).");
          return;
        }

        const datumToSave = new Date().toISOString();

        // append-only: nieuwe regel toevoegen i.p.v. UPDATE
        const { error: insertError } = await supabase
          .from("Realiteit")
          .insert({
            product: newProduct,
            Hoeveelheid: newQty,
            Datum: datumToSave,
          });

        if (insertError) {
          alert("Fout bij opslaan wijziging: " + insertError.message);
          console.error("Supabase insert error:", insertError);
          return;
        }

        await laadVoorraad();
      });
    });

    tdActies.appendChild(btnRow);

    tr.appendChild(tdProduct);
    tr.appendChild(tdHoeveelheid);
    tr.appendChild(tdDatum);
    tr.appendChild(tdActies);

    tbody.appendChild(tr);
  }
}

function tellijstStorageKey() {
  return `tellijst-${todayKey()}`;
}

function getGeteldeProductenVandaag() {
  try {
    return JSON.parse(localStorage.getItem(tellijstStorageKey())) ?? [];
  } catch {
    return [];
  }
}

function markProductGeteld(product) {
  const lijst = getGeteldeProductenVandaag();
  const key = product.toLowerCase();
  if (!lijst.includes(key)) {
    lijst.push(key);
    localStorage.setItem(tellijstStorageKey(), JSON.stringify(lijst));
  }
}

function isProductGeteld(product) {
  return getGeteldeProductenVandaag().includes(product.toLowerCase());
}

function dailyTellijstKey() {
  return `daily-tellijst-${todayKey()}`;
}

function getDailyTellijst() {
  try {
    return JSON.parse(localStorage.getItem(dailyTellijstKey())) ?? null;
  } catch {
    return null;
  }
}

function setDailyTellijst(list) {
  localStorage.setItem(dailyTellijstKey(), JSON.stringify(list));
}

function normalizeProduct(p) {
  return (p ?? "").trim().toLowerCase();
}

const DELETE_BATCH = 500;

async function verwijderAlleRijenVoorProduct(rawNaam) {
  const naam = (rawNaam ?? "").trim();
  if (!naam) {
    alert("Vul een productnaam in.");
    return false;
  }

  const pattern = escapeIlikeExact(naam);
  let rows;
  try {
    rows = await fetchAllRowsMatchingProductIlike(pattern);
  } catch (e) {
    alert("Fout bij zoeken: " + (e?.message ?? String(e)));
    console.error(e);
    return false;
  }

  if (rows.length === 0) {
    alert("Geen regels gevonden voor die naam.");
    return false;
  }

  const uniekeNamen = [...new Set(rows.map((r) => (r.product ?? "").trim()).filter(Boolean))];
  const namenTekst =
    uniekeNamen.length <= 6
      ? uniekeNamen.join(", ")
      : `${uniekeNamen.slice(0, 6).join(", ")} … (+${uniekeNamen.length - 6} varianten)`;

  const ok = confirm(
    `Weet je het zeker?\n\n` +
      `${rows.length} regel(s) worden verwijderd.\n` +
      `Productnamen in de database: ${namenTekst}\n\n` +
      `Dit kan niet ongedaan worden gemaakt.`
  );
  if (!ok) return false;

  const ids = rows.map((r) => r.id).filter(Boolean);
  for (let i = 0; i < ids.length; i += DELETE_BATCH) {
    const batch = ids.slice(i, i + DELETE_BATCH);
    const { error: delErr } = await supabase.from("Realiteit").delete().in("id", batch);
    if (delErr) {
      alert("Fout bij verwijderen: " + delErr.message);
      console.error("Supabase delete error:", delErr);
      await laadVoorraad();
      return false;
    }
  }

  await laadVoorraad();
  return true;
}

function lastCountedStorageKey(productKey) {
  return `last-counted-${productKey}`;
}

function getLastCounted(productKey) {
  const v = localStorage.getItem(lastCountedStorageKey(productKey));
  const n = v ? Number(v) : 0;
  return Number.isFinite(n) ? n : 0; // 0 = “nog nooit geteld”
}

function setLastCountedNow(productKey) {
  localStorage.setItem(lastCountedStorageKey(productKey), String(Date.now()));
}


function latestMapByProduct(rowsSortedByDatumDesc) {
  const map = new Map();
  for (const r of rowsSortedByDatumDesc) {
    const key = normalizeProduct(r.product);
    if (!key) continue;
    if (!map.has(key)) map.set(key, r);
  }
  return map;
}

async function laadVoorraad() {
  tbody.innerHTML = `<tr><td colspan="4">Laden...</td></tr>`;
  if (tellijstBody) tellijstBody.innerHTML = `<tr><td colspan="4">Laden...</td></tr>`;

  const { data, error } = await supabase
    .from("Realiteit")
    .select("id, product, Hoeveelheid, Datum")
    .order("Datum", { ascending: false })
    .limit(2000);

  if (error) {
    tbody.innerHTML = `<tr><td colspan="4">Fout bij laden</td></tr>`;
    if (tellijstBody) tellijstBody.innerHTML = `<tr><td colspan="4">Fout bij laden</td></tr>`;
    console.error("Supabase select error:", error);
    return;
  }

  const latestMap = latestMapByProduct(data ?? []);

  // ---- TELLijst: vandaag vast, maar repareren als keys verdwijnen ----
  let dailyKeys = getDailyTellijst();

  // 1) Als geen lijst (of leeg): maak hem op basis van oudste
  if (!Array.isArray(dailyKeys) || dailyKeys.length === 0) {
dailyKeys = pickDailyCountListProductKeysOldest(latestMap, 5); // ✅ 5 producten per dag
    setDailyTellijst(dailyKeys);
  }

  // 2) Verwijder keys die niet meer bestaan
  let filtered = dailyKeys.filter((k) => latestMap.has(k));

  // 3) Als er keys wegvallen: vul aan met oudste die nog niet in lijst zit
  if (filtered.length !== dailyKeys.length) {
    const needed = dailyKeys.length - filtered.length;

const pool = pickDailyCountListProductKeysOldest(latestMap, latestMap.size)
      .filter((k) => !filtered.includes(k));

    filtered = filtered.concat(pool.slice(0, needed));
    setDailyTellijst(filtered);
  }

  dailyKeys = filtered;

  // render tellijst
  renderTellijstFromKeys(dailyKeys, latestMap);

// render voorraad tabel alfabetisch gesorteerd
const latestArr = Array.from(latestMap.values())
  .sort((a, b) =>
    (a.product ?? "").localeCompare(b.product ?? "", "nl", { sensitivity: "base" })
  );

renderVoorraadTabel(latestArr);
}



// Toevoegen via formulier (hoeveelheid mag 0)
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const product = productInput.value.trim();
  const hoeveelheid = Number(hoeveelheidInput.value);

  if (!product || !Number.isFinite(hoeveelheid) || hoeveelheid < 0) return;

  const { error } = await supabase.from("Realiteit").insert({
    product,
    Hoeveelheid: hoeveelheid,
    Datum: new Date().toISOString(),
  });

  if (error) {
    alert("Fout bij opslaan: " + error.message);
    console.error("Supabase insert error:", error);
    return;
  }

  form.reset();
  await laadVoorraad();
});

if (verwijderForm && verwijderNaamInput) {
  verwijderForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ok = await verwijderAlleRijenVoorProduct(verwijderNaamInput.value);
    if (ok) verwijderNaamInput.value = "";
  });
}

laadVoorraad();
