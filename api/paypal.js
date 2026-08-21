const PAYPAL_CLIENT_ID = "BAAdPHxH-oXU5vZypM2htB9c18ltzEnSm51jyV1chNpAPxQ5lVcWHLyoF4KXh67CJc4XCrxlT-YIDDK9h8";
const PAYPAL_SECRET = "EP4f4Fw6JIU1NXBS2c1WlilJk6RHtYvvK8r4HXLoN_EY-Bu3p5uHieXDgNbje9oDbZl-OQFDD1xNgN5u";
const SUPABASE_URL = "https://szfudvgyxinesgnlvzmt.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6ZnVkdmd5eGluZXNnbmx2em10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyNDU0NDAsImV4cCI6MjEwMjgyMTQ0MH0.2aXwlcd_UKs_T1JlSHvr8T4vMIOY1SYByLqWr3ID6Hg";
const PAYPAL_BASE = "https://api-m.paypal.com";

async function getAccessToken() {
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Token failed: " + JSON.stringify(data));
  return data.access_token;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { action, amount, orderID, booking } = req.body || {};

  try {
    const token = await getAccessToken();

    if (action === "create") {
      const r = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{
            amount: { currency_code: "EUR", value: String(parseFloat(amount).toFixed(2)) },
            description: "Q8 Billard Tischbuchung"
          }],
          application_context: {
            return_url: "https://billard.q8-sportslounge.de?buchung=bestaetigt",
            cancel_url: "https://billard.q8-sportslounge.de?buchung=abgebrochen",
            user_action: "PAY_NOW"
          }
        })
      });
      const order = await r.json();
      
      // Save pending booking with order ID
      if (booking && order.id) {
        await fetch(`${SUPABASE_URL}/rest/v1/pending_bookings`, {
          method: "POST",
          headers: {
            "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json", "Prefer": "return=representation"
          },
          body: JSON.stringify({ ...booking, order_id: order.id })
        });
      }

      return res.status(200).json(order);
    }

    if (action === "capture") {
      const r = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderID}/capture`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }
      });
      const capture = await r.json();
      return res.status(200).json(capture);
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    console.error("PayPal error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
