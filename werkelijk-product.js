import {
  supabase,
  formatDatum,
  fetchFullRowsForProduct,
  toDatetimeLocalValue,
  fromDatetimeLocalValue,
} from "./realiteit-shared.js";

const titleEl = document.getElementById("product-page-title");
const subtitleEl = document.getElementById("product-page-subtitle");
const tbody = document.getElementById("product-rows-body");

function getProductQuery() {
  const q = new URLSearchParams(window.location.search).get("product");
  if (!q) return "";
  try {
    return decodeURIComponent(q).trim();
  } catch {
    return q.trim();
  }
}

function renderRow(row, reload) {
  const tr = document.createElement("tr");
  const id = row.id;
  const product0 = row.product ?? "";
  const qty0 =
    typeof row.Hoeveelheid === "number"
      ? row.Hoeveelheid
      : Number(row.Hoeveelheid ?? 0);
  const datum0 = row.Datum ?? "";

  const tdDatum = document.createElement("td");
  const tdProduct = document.createElement("td");
  const tdQty = document.createElement("td");
  const tdActies = document.createElement("td");

  tdDatum.textContent = formatDatum(datum0);
  tdProduct.textContent = product0;
  tdQty.textContent = String(qty0);

  const btnEdit = document.createElement("button");
  btnEdit.className = "btn";
  btnEdit.type = "button";
  btnEdit.textContent = "Regel aanpassen";

  btnEdit.addEventListener("click", () => {
    const inpProduct = document.createElement("input");
    inpProduct.type = "text";
    inpProduct.value = product0;
    inpProduct.className = "input-inline";

    const inpQty = document.createElement("input");
    inpQty.type = "number";
    inpQty.step = "0.01";
    inpQty.min = "0";
    inpQty.value = String(qty0);
    inpQty.className = "input-inline";

    const inpWhen = document.createElement("input");
    inpWhen.type = "datetime-local";
    inpWhen.value = toDatetimeLocalValue(datum0);
    inpWhen.className = "input-inline input-inline--wide";

    tdDatum.textContent = "";
    tdDatum.appendChild(inpWhen);

    tdProduct.textContent = "";
    tdProduct.appendChild(inpProduct);

    tdQty.textContent = "";
    tdQty.appendChild(inpQty);

    tdActies.textContent = "";

    const btnSave = document.createElement("button");
    btnSave.className = "btn btn-primary";
    btnSave.type = "button";
    btnSave.textContent = "Opslaan";

    const btnCancel = document.createElement("button");
    btnCancel.className = "btn btn-ghost";
    btnCancel.type = "button";
    btnCancel.textContent = "Annuleer";

    tdActies.appendChild(btnSave);
    tdActies.appendChild(btnCancel);

    btnCancel.addEventListener("click", () => {
      tdDatum.textContent = formatDatum(datum0);
      tdProduct.textContent = product0;
      tdQty.textContent = String(qty0);
      tdActies.textContent = "";
      tdActies.appendChild(btnEdit);
    });

    btnSave.addEventListener("click", async () => {
      const product = inpProduct.value.trim();
      const hoeveelheid = Number(inpQty.value);
      const datumIso = fromDatetimeLocalValue(inpWhen.value);

      if (!product) {
        alert("Productnaam mag niet leeg zijn.");
        return;
      }
      if (!Number.isFinite(hoeveelheid) || hoeveelheid < 0) {
        alert("Hoeveelheid moet een getal zijn (0 of hoger).");
        return;
      }
      if (!datumIso) {
        alert("Kies een geldige datum en tijd.");
        return;
      }

      const { error } = await supabase
        .from("Realiteit")
        .update({
          product,
          Hoeveelheid: hoeveelheid,
          Datum: datumIso,
        })
        .eq("id", id);

      if (error) {
        alert(
          "Fout bij opslaan: " +
            error.message +
            "\n\nControleer in Supabase of er een UPDATE-policy voor de anon-rol op Realiteit staat."
        );
        console.error(error);
        return;
      }

      await reload();
    });
  });

  tdActies.appendChild(btnEdit);
  tr.appendChild(tdDatum);
  tr.appendChild(tdProduct);
  tr.appendChild(tdQty);
  tr.appendChild(tdActies);
  tbody.appendChild(tr);
}

async function load() {
  const productName = getProductQuery();

  if (!productName) {
    titleEl.textContent = "Geen product gekozen";
    subtitleEl.textContent = "Open deze pagina via «Alle regels» op de werkelijke-voorraadpagina.";
    tbody.innerHTML = `<tr><td colspan="4">—</td></tr>`;
    return;
  }

  titleEl.textContent = productName;
  subtitleEl.textContent = "Alle meetregels in de database voor dit product (nieuwste bovenaan). Wijzigingen overschrijven de gekozen regel.";

  tbody.innerHTML = `<tr><td colspan="4">Laden…</td></tr>`;

  let rows;
  try {
    rows = await fetchFullRowsForProduct(productName);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4">Fout bij laden</td></tr>`;
    console.error(e);
    return;
  }

  tbody.innerHTML = "";

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="4">Geen regels gevonden voor dit product.</td></tr>`;
    return;
  }

  const reload = async () => {
    tbody.innerHTML = `<tr><td colspan="4">Laden…</td></tr>`;
    let again;
    try {
      again = await fetchFullRowsForProduct(productName);
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="4">Fout bij laden</td></tr>`;
      console.error(e);
      return;
    }
    tbody.innerHTML = "";
    if (!again.length) {
      tbody.innerHTML = `<tr><td colspan="4">Geen regels meer.</td></tr>`;
      return;
    }
    for (const r of again) renderRow(r, reload);
  };

  for (const r of rows) renderRow(r, reload);
}

load();
