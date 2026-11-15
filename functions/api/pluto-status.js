// Demo endpoint for the Pluto status light on meandelman.com.
// Returns made-up but plausible data: the real Pluto server is private, so
// this stands in for it. Briefs go out at 7:00 and 21:00 Eastern.
export async function onRequestGet() {
  const now = new Date();
  // Eastern wall-clock time, and its offset from UTC right now.
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const offset = now.getTime() - et.getTime();
  const at = (day, h, m) => { const d = new Date(et); d.setDate(d.getDate() + day); d.setHours(h, m, 0, 0); return d; };
  // A few minutes late each time, varying by day, like a real job queue.
  const dayKey = et.getFullYear() * 400 + et.getMonth() * 32 + et.getDate();
  const late = (n) => 1 + ((dayKey * 7 + n * 13) % 4);
  const slots = [at(-1, 21, late(2)), at(0, 7, late(1)), at(0, 21, late(2)), at(1, 7, late(3))];
  const last = slots.filter((d) => d <= et).pop();
  const next = slots.find((d) => d > et);
  const hours = et.getHours() + et.getMinutes() / 60;
  const messages = Math.max(0, Math.round(hours * 0.9 + (dayKey % 5)) - 4);
  const uptime = Math.floor((now - Date.UTC(2026, 8, 1)) / 86400000);
  const body = {
    demo: true,
    online: true,
    last_brief: new Date(last.getTime() + offset).toISOString(),
    next_brief: new Date(next.getTime() + offset).toISOString(),
    messages_today: messages,
    uptime_days: uptime,
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
