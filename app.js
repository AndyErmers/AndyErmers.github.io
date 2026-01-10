import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// 1) Vul dit in vanuit Supabase → Settings → API
const SUPABASE_URL = "https://lbmtkzxoucwsniznvcjg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_8gl1rTwsBMqpKPW1TTnUJA_FAOzBlcI";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const btn = document.getElementById("load");
const output = document.getElementById("output");

btn.addEventListener("click", async () => {
  output.textContent = "Laden...";

  // 2) Data ophalen uit tabel "Realiteit"
  const { data, error } = await supabase
    .from("Realiteit")
    .select("*")
    .limit(50);

  if (error) {
    output.textContent = "Fout:\n" + JSON.stringify(error, null, 2);
    return;
  }

  output.textContent = JSON.stringify(data, null, 2);
});
