const SUPABASE_URL = "https://szfudvgyxinesgnlvzmt.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6ZnVkdmd5eGluZXNnbmx2em10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyNDU0NDAsImV4cCI6MjEwMjgyMTQ0MH0.2aXwlcd_UKs_T1JlSHvr8T4vMIOY1SYByLqWr3ID6Hg";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { date, id } = req.query;
  const headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation"
  };

  try {
    if (req.method === "GET") {
      const url = date
        ? `${SUPABASE_URL}/rest/v1/bookings?date=eq.${date}&order=hour.asc&select=*`
        : `${SUPABASE_URL}/rest/v1/bookings?select=*&limit=100`;
      const r = await fetch(url, { headers });
      const data = await r.json();
      return res.status(200).json(data);
    }

    if (req.method === "POST") {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/bookings`, {
        method: "POST", headers, body: JSON.stringify(req.body)
      });
      const data = await r.json();
      return res.status(201).json(data);
    }

    if (req.method === "DELETE") {
      await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${id}`, {
        method: "DELETE", headers
      });
      return res.status(200).json({ ok: true });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
