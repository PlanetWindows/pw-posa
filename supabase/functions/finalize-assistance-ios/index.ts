import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: cors });
const safe = (v: unknown) => String(v ?? "").trim();

async function invokeStep(auth: string, name: string, body: Record<string, unknown>) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: auth,
      apikey: ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || `${name}: errore ${response.status}`);
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth) return json({ ok: false, error: "Sessione mancante" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ ok: false, error: "Utente non autenticato" }, 401);

    const { data: profile } = await admin
      .from("profiles")
      .select("role,active")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.role !== "installer" || profile?.active === false) {
      return json({ ok: false, error: "Solo il posatore può completare l'assistenza" }, 403);
    }

    const body = await req.json();
    const assistanceId = safe(body.assistance_id);
    const ddtId = safe(body.ddt_id);
    if (!assistanceId || !ddtId) {
      return json({ ok: false, error: "Dati assistenza o DDT mancanti" }, 400);
    }

    const ddt = await invokeStep(auth, "finalize-ddt", {
      ddt_id: ddtId,
      installer_signature_data_url: body.ddt_installer_signature_data_url,
      client_signature_data_url: body.ddt_client_signature_data_url,
    });

    const report = await invokeStep(auth, "finalize-assistance-v2", {
      assistance_id: assistanceId,
      intervention: body.intervention,
      problem_resolved: body.problem_resolved,
      final_notes: body.final_notes,
      installer_signer_name: body.installer_signer_name,
      installer_signature_data_url: body.report_installer_signature_data_url,
      signer_name: body.signer_name,
      signature_data_url: body.report_client_signature_data_url,
    });

    const email = await invokeStep(auth, "send-assistance-package", {
      assistance_id: assistanceId,
    });

    return json({ ok: true, ddt, report, email });
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
