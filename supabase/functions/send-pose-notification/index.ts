import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:info@planetwindows.it";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

type PoseRecord = {
  id: string;
  job_number?: string | null;
  client_name?: string | null;
  scheduled_date?: string | null;
  start_time?: string | null;
  team_id?: string | null;
};

type WebhookBody = {
  type?: "INSERT" | "UPDATE" | "DELETE";
  table?: string;
  schema?: string;
  record?: PoseRecord | null;
  old_record?: PoseRecord | null;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

function formatDate(iso?: string | null) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return json({ error: "VAPID secrets missing" }, 500);
    }

    const body = (await req.json()) as WebhookBody;
    const pose = body.record;
    if (!pose?.id || !pose.team_id) return json({ ok: true, skipped: "No pose/team" });

    const eventType = String(body.type || "UPDATE").toUpperCase();
    if (!['INSERT', 'UPDATE'].includes(eventType)) return json({ ok: true, skipped: eventType });

    // On UPDATE, notify only when relevant scheduling/assignment fields changed.
    if (eventType === "UPDATE" && body.old_record) {
      const old = body.old_record;
      const changed =
        old.team_id !== pose.team_id ||
        old.scheduled_date !== pose.scheduled_date ||
        old.start_time !== pose.start_time ||
        old.job_number !== pose.job_number ||
        old.client_name !== pose.client_name;
      if (!changed) return json({ ok: true, skipped: "No relevant changes" });
    }

    const { data: installers, error: installersError } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "installer")
      .eq("team_id", pose.team_id);
    if (installersError) throw installersError;

    const userIds = (installers || []).map((x: { id: string }) => x.id).filter(Boolean);
    if (!userIds.length) return json({ ok: true, sent: 0, skipped: "No installers for team" });

    const { data: subscriptions, error: subsError } = await supabase
      .from("push_subscriptions")
      .select("id,user_id,endpoint,p256dh,auth")
      .in("user_id", userIds);
    if (subsError) throw subsError;

    const isNew = eventType === "INSERT";
    const title = isNew ? "PW Posa · Nuova posa" : "PW Posa · Posa aggiornata";
    const when = [formatDate(pose.scheduled_date), pose.start_time ? String(pose.start_time).slice(0, 5) : ""]
      .filter(Boolean)
      .join(" · ");
    const bodyText = `${pose.job_number || "Commessa"}${pose.client_name ? ` · ${pose.client_name}` : ""}${when ? `\n${when}` : ""}`;
    const payload = JSON.stringify({
      title,
      body: bodyText,
      url: `./?pose=${encodeURIComponent(pose.id)}`,
      tag: `pose-${pose.id}-${Date.now()}`,
    });

    let sent = 0;
    let removed = 0;
    const failures: string[] = [];

    for (const sub of subscriptions || []) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
        );
        sent++;
      } catch (error: any) {
        const status = Number(error?.statusCode || error?.status || 0);
        if (status === 404 || status === 410) {
          const { error: deleteError } = await supabase.from("push_subscriptions").delete().eq("id", sub.id);
          if (!deleteError) removed++;
        } else {
          failures.push(`${sub.id}:${error?.message || String(error)}`);
        }
      }
    }

    return json({ ok: true, sent, removed, failures });
  } catch (error: any) {
    console.error("PW Posa automatic push:", error);
    return json({ error: error?.message || String(error) }, 500);
  }
});
