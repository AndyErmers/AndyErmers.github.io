import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://lbmtkzxoucwsniznvcjg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_8gl1rTwsBMqpKPW1TTnUJA_FAOzBlcI";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const tbody = document.getElementById("voorraad-body");
const tellijstBody = document.getElementById("tellijst-body");

const form = document.getElementById("voorraad-form");
const productInput = document.getElementById("product");
const hoeveelheidInput = document.getElementById("hoeveelheid");

function formatDatum(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
}

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

// Laatste stand per product (data moet op Datum DESC staan)
function latestPerProduct(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = (r.product ?? "").trim().toLowerCase();
    if (!key) continue;
    if (!map.has(key)) map.set(key, r); // eerste is nieuwste
  }
  return Array.from(map.values());
}

function pickDailyCountList(productsLatest, percentage = 0.2) {
  const nTotal = productsLatest.length;
  if (nTotal === 0) return [];
  const nPick = Math.max(1, Math.ceil(nTotal * percentage));

  const rand = mulberry32(seedFromString(todayKey() + "|tellijst"));
  const arr = [...productsLatest];

  // shuffle
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr.slice(0, nPick);
}

function renderTellijst(items) {
  if (!tellijstBody) return;

  if (!items || items.length === 0) {
    tellijstBody.innerHTML = `<tr><td colspan="4">Geen producten om te tellen</td></tr>`;
    return;
  }

  tellijstBody.innerHTML = "";

  for (const item of items) {
    const tr = document.createElement("tr");

    const tdP = document.createElement("td");
    tdP.textContent = item.product ?? "";

    const tdHuidig = document.createElement("td");
    tdHuidig.textContent = String(item.Hoeveelheid ?? 0);

    const tdGeteld = document.createElement("td");
    const tdActie = document.createElement("td");

    const alreadyCounted = isProductGeteld(item.product ?? "");

    if (alreadyCounted) {
      tdGeteld.textContent = "✔";
      tdActie.textContent = "Geteld";
      tdActie.classList.add("geteld");
      tdActie.style.color = "#16a34a";
      tdActie.style.fontWeight = "600";
    } else {
      const input = document.createElement("input");
      input.type = "number";
      input.step = "0.01";
      input.min = "0";
      input.placeholder = "0";
      input.style.width = "110px";

      tdGeteld.appendChild(input);

      const btn = document.createElement("button");
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
          product: item.product,
          Hoeveelheid: val,
          Datum: new Date().toISOString(),
        });

        if (error) {
          alert("Fout bij opslaan telling: " + error.message);
          console.error(error);
          return;
        }

        // 👉 markeer als geteld
        markProductGeteld(item.product);

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

    const tdProduct = document.createElement("td");
    const tdHoeveelheid = document.createElement("td");
    const tdDatum = document.createElement("td");
    const tdActies = document.createElement("td");

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
    btnEdit.textContent = "Bewerk";

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

      tdActies.appendChild(btnSave);
      tdActies.appendChild(btnCancel);

      btnCancel.addEventListener("click", () => {
        tdProduct.textContent = oldProduct;
        tdHoeveelheid.textContent = String(oldQty);
        tdActies.textContent = "";
        tdActies.appendChild(btnEdit);
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

        const updateData = {};
        const productChanged = newProduct !== oldProduct;
        const qtyChanged = newQty !== oldQty;

        // product wijzigen: alleen product
        if (productChanged) updateData.product = newProduct;

        // hoeveelheid wijzigen: hoeveelheid + datum naar nu
        if (qtyChanged) {
          updateData.Hoeveelheid = newQty;
          updateData.Datum = new Date().toISOString();
        }

        if (Object.keys(updateData).length === 0) {
          btnCancel.click();
          return;
        }

        const { error: updateError } = await supabase
          .from("Realiteit")
          .update(updateData)
          .eq("id", item.id);

        if (updateError) {
          alert("Fout bij bewerken: " + updateError.message);
          console.error("Supabase update error:", updateError);
          return;
        }

        await laadVoorraad();
      });
    });

    tdActies.appendChild(btnEdit);

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


async function laadVoorraad() {
  // laad both tables
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

  const latest = latestPerProduct(data ?? []);

  // 20% tellijst op basis van latest
  const daily = pickDailyCountList(latest, 0.2);
  renderTellijst(daily);

  // voorraad tabel = latest stand per product
  renderVoorraadTabel(latest);
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

laadVoorraad();
