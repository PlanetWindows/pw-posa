import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM_EMAIL = Deno.env.get("ASSISTANCE_FROM_EMAIL") || "posapw@planetwindows.it";
const BUCKET = "pw-assistance-private";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json"
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: cors });

function b64(bytes: Uint8Array) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
  return btoa(out);
}

function safe(v: unknown) { return String(v ?? "").trim(); }
function boolText(v: boolean) { return v ? "Si" : "No"; }
function euro(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? `${n.toFixed(2).replace(".", ",")} EUR` : "-";
}
function formatDate(v: unknown) {
  const s = safe(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s || "-";
}
function formatTime(v: unknown) { return safe(v).slice(0, 5) || "-"; }

async function sendEmail(to: string, name: string, bytes: Uint8Array, protocol: string, client: string) {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY non configurata");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject: `Planet Windows · Rapportino assistenza ${protocol}`,
      html: `<p>Gentile ${client},</p><p>in allegato trova il rapportino firmato relativo all'assistenza <strong>${protocol}</strong>.</p><p>Grazie,<br>Planet Windows</p>`,
      attachments: [{ filename: name, content: b64(bytes) }]
    })
  });
  if (!r.ok) throw new Error(`Servizio email: ${r.status} ${await r.text()}`);
}

async function makePdf(a: any, body: any, signedAt: Date) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const gold = rgb(0.79, 0.61, 0.26);
  const black = rgb(0.08, 0.08, 0.08);
  const muted = rgb(0.38, 0.38, 0.38);
  const line = rgb(0.88, 0.84, 0.75);
  const left = 44, right = 551, width = right - left;
  let y = 790;

  page.drawRectangle({ x: 0, y: 805, width: 595.28, height: 36, color: black });
  page.drawText("PLANET WINDOWS", { x: left, y: 817, size: 13, font: bold, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: left, y: 783, width: 62, height: 3, color: gold });
  page.drawText("RAPPORTINO DI ASSISTENZA", { x: left, y: 758, size: 20, font: bold, color: black });
  page.drawText(`Protocollo / ordine: ${safe(a.protocol_order)}`, { x: left, y: 738, size: 10, font: regular, color: muted });
  y = 712;

  const addRow = (label: string, value: string) => {
    page.drawText(label.toUpperCase(), { x: left, y, size: 7.5, font: bold, color: muted });
    page.drawText(value || "-", { x: left + 128, y: y - 1, size: 10, font: regular, color: black });
    page.drawLine({ start: { x: left, y: y - 8 }, end: { x: right, y: y - 8 }, thickness: 0.6, color: line });
    y -= 27;
  };

  addRow("Cliente", safe(a.client_name));
  addRow("Telefono", safe(a.client_phone) || "-");
  addRow("Indirizzo", [safe(a.address), safe(a.city), safe(a.postal_code)].filter(Boolean).join(", "));
  addRow("Data assistenza", `${formatDate(a.scheduled_date)} · ${formatTime(a.start_time)}${a.end_time ? ` - ${formatTime(a.end_time)}` : ""}`);
  addRow("Garanzia", boolText(!!a.warranty));
  addRow("Pagamento", a.payment_required ? `Si · ${euro(a.payment_amount)}` : "No");

  const block = (title: string, value: string, minHeight = 62) => {
    const text = value || "-";
    const chars = 86;
    const lines: string[] = [];
    for (const para of text.split(/\n+/)) {
      let rest = para.trim();
      while (rest.length > chars) {
        let cut = rest.lastIndexOf(" ", chars);
        if (cut < 25) cut = chars;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut).trim();
      }
      lines.push(rest || " ");
    }
    const h = Math.max(minHeight, 34 + lines.length * 12);
    page.drawRectangle({ x: left, y: y - h + 8, width, height: h, borderColor: line, borderWidth: 0.8, color: rgb(0.99, 0.985, 0.97) });
    page.drawText(title.toUpperCase(), { x: left + 12, y: y - 10, size: 8, font: bold, color: muted });
    let ty = y - 29;
    for (const ln of lines) { page.drawText(ln, { x: left + 12, y: ty, size: 9.5, font: regular, color: black }); ty -= 12; }
    y -= h + 12;
  };

  block("Problematica riscontrata", safe(body.issue_description));
  addRow("Il problema e stato risolto?", body.problem_resolved ? "Si" : "No");
  block("Come si e intervenuti", safe(body.intervention), 72);
  if (safe(body.final_notes)) block("Note finali", safe(body.final_notes), 54);

  const sigData = safe(body.signature_data_url);
  if (!sigData.startsWith("data:image/png;base64,")) throw new Error("Firma obbligatoria o formato non valido");
  const pngBytes = Uint8Array.from(atob(sigData.split(",")[1]), c => c.charCodeAt(0));
  const sig = await pdf.embedPng(pngBytes);
  const boxH = 92;
  if (y < 125) y = 125;
  page.drawRectangle({ x: left, y: y - boxH + 8, width, height: boxH, borderColor: gold, borderWidth: 1 });
  page.drawText("FIRMA CLIENTE", { x: left + 12, y: y - 10, size: 8, font: bold, color: muted });
  const sw = Math.min(170, sig.width * 0.42), sh = Math.min(48, sw * sig.height / sig.width);
  page.drawImage(sig, { x: left + 12, y: y - 68, width: sw, height: sh });
  page.drawText(safe(body.signer_name), { x: left + 205, y: y - 40, size: 10, font: bold, color: black });
  page.drawText(signedAt.toLocaleString("it-IT", { timeZone: "Europe/Rome" }), { x: left + 205, y: y - 57, size: 9, font: regular, color: muted });
  page.drawText("Documento generato automaticamente da PW Posa", { x: left, y: 28, size: 7.5, font: regular, color: muted });
  return new Uint8Array(await pdf.save());
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "Sessione mancante" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "Utente non autenticato" }, 401);
    const body = await req.json();
    const id = safe(body.assistance_id);
    if (!id) return json({ error: "assistance_id obbligatorio" }, 400);
    const signer = safe(body.signer_name), issue = safe(body.issue_description), intervention = safe(body.intervention), notes = safe(body.final_notes);
    if (!signer) return json({ error: "Nome e cognome del firmatario obbligatori" }, 400);
    if (!issue) return json({ error: "Problematica obbligatoria" }, 400);
    if (typeof body.problem_resolved !== "boolean") return json({ error: "Indicare se il problema e stato risolto" }, 400);
    if (!intervention) return json({ error: "Descrivere come si e intervenuti" }, 400);

    const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profile?.role !== "installer") return json({ error: "Solo il posatore puo completare il rapportino" }, 403);
    const { data: a, error: aError } = await userClient.from("assistances").select("*").eq("id", id).single();
    if (aError || !a) return json({ error: "Assistenza non accessibile" }, 403);
    if (a.signed_at) return json({ error: "Rapportino gia firmato e archiviato" }, 409);

    const signedAt = new Date();
    const pdfBytes = await makePdf(a, body, signedAt);
    const safeProtocol = safe(a.protocol_order).replace(/[^a-zA-Z0-9_-]+/g, "_") || "assistenza";
    const fileName = `Rapportino_Assistenza_${safeProtocol}_firmato.pdf`;
    const path = `${id}/reports/${Date.now()}-${fileName}`;
    const up = await admin.storage.from(BUCKET).upload(path, pdfBytes, { contentType: "application/pdf", upsert: false });
    if (up.error) throw up.error;

    const upd = await admin.from("assistances").update({
      final_issue_description: issue,
      problem_resolved: body.problem_resolved,
      intervention,
      final_notes: notes || null,
      final_report_path: path,
      final_report_name: fileName,
      signed_document_path: path,
      signed_document_name: fileName,
      signer_name: signer,
      signed_at: signedAt.toISOString(),
      status: "completed",
      completed_by: user.id,
      completed_at: signedAt.toISOString(),
      updated_by: user.id,
      email_status: "pending",
      email_last_error: null
    }).eq("id", id);
    if (upd.error) throw upd.error;

    let emailStatus = "sent", emailError: string | null = null;
    try { await sendEmail(a.client_email, fileName, pdfBytes, a.protocol_order, a.client_name); }
    catch (e) { emailStatus = "retry"; emailError = e instanceof Error ? e.message : String(e); }
    await admin.from("assistances").update({ email_status: emailStatus, email_last_error: emailError }).eq("id", id);
    return json({ ok: true, email_status: emailStatus, email_error: emailError, report_path: path });
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
