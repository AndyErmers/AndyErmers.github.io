import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://lbmtkzxoucwsniznvcjg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_8gl1rTwsBMqpKPW1TTnUJA_FAOzBlcI";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const lijst = document.getElementById("voorraad-lijst");
const form = document.getElementById("voorraad-form");

const productInput = document.getElementById("product");
const hoeveelheidInput = document.getElementById("hoeveelheid");

function formatDatum(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("nl-NL");
}

async function laadVoorraad() {
  lijst.innerHTML = "<li>Laden...</li>";

  const { data, error } = await supabase
    .from("Realiteit")
    .select("id, product, Hoeveelheid, Datum")
    .order("Datum", { ascending: false })
    .limit(200);

  if (error) {
    lijst.innerHTML = "<li>Fout bij laden</li>";
    console.error("Supabase select error:", error);
    return;
  }

  if (!data || data.length === 0) {
    lijst.innerHTML = "<li>Geen voorraad</li>";
    return;
  }

  lijst.innerHTML = "";
  for (const item of data) {
    const li = document.createElement("li");

    const qty =
      typeof item.Hoeveelheid === "number"
        ? item.Hoeveelheid.toString()
        : String(item.Hoeveelheid ?? "");

    li.textContent = `${item.product} — ${qty} (laatst bijgewerkt: ${formatDatum(item.Datum)})`;
    lijst.appendChild(li);
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const product = productInput.value.trim();
  const hoeveelheid = Number(hoeveelheidInput.value);

  if (!product || !Number.isFinite(hoeveelheid) || hoeveelheid <= 0) return;

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
