import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://lbmtkzxoucwsniznvcjg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_8gl1rTwsBMqpKPW1TTnUJA_FAOzBlcI";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const tbody = document.getElementById("voorraad-body");
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


async function laadVoorraad() {
  tbody.innerHTML = `<tr><td colspan="4">Laden...</td></tr>`;

  const { data, error } = await supabase
    .from("Realiteit")
    .select("id, product, Hoeveelheid, Datum")
    .order("Datum", { ascending: false })
    .limit(200);

  if (error) {
    tbody.innerHTML = `<tr><td colspan="4">Fout bij laden</td></tr>`;
    console.error("Supabase select error:", error);
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4">Geen voorraad</td></tr>`;
    return;
  }

  tbody.innerHTML = "";

  for (const item of data) {
    const tr = document.createElement("tr");

    // cellen
    const tdProduct = document.createElement("td");
    const tdHoeveelheid = document.createElement("td");
    const tdDatum = document.createElement("td");
    const tdActies = document.createElement("td");

    const oldProduct = item.product ?? "";
    const oldQty = typeof item.Hoeveelheid === "number" ? item.Hoeveelheid : Number(item.Hoeveelheid ?? 0);

    tdProduct.textContent = oldProduct;
    tdHoeveelheid.textContent = String(oldQty);
    tdDatum.textContent = formatDatum(item.Datum);

    // acties
    const btnEdit = document.createElement("button");
    btnEdit.className = "btn";
    btnEdit.textContent = "Bewerk";

    btnEdit.addEventListener("click", () => {
      // inputs
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

      // knoppen save/cancel
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
        // terugzetten
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

        // Alleen updaten wat veranderd is:
        const updateData = {};
        const productChanged = newProduct !== oldProduct;
        const qtyChanged = newQty !== oldQty;

        if (productChanged) updateData.product = newProduct;

        // Als hoeveelheid verandert: datum ook naar NU
        if (qtyChanged) {
          updateData.Hoeveelheid = newQty;
          updateData.Datum = new Date().toISOString();
        }

        // Niks veranderd? Dan gewoon terug
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


form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const product = productInput.value.trim();
  const hoeveelheid = Number(hoeveelheidInput.value);

if (!product || !Number.isFinite(hoeveelheid) || hoeveelheid < 0) return;


  const { error } = await supabase.from("Realiteit").insert({
    product: product,
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
