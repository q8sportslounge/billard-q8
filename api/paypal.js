const PAYPAL_CLIENT_ID = "BAAdPHxH-oXU5vZypM2htB9c18ltzEnSm51jyV1chNpAPxQ5lVcWHLyoF4KXh67CJc4XCrxlT-YIDDK9h8";
const PAYPAL_SECRET = "EMu4WgDpu71Een3uvrXOWHce6eW8Wstm7_H09JoSmitOJ7bKDZQ1oU9YfRUI2YwHVFDINdywTcHnB26";
const PAYPAL_BASE = "https://api-m.paypal.com";

async function getAccessToken() {
  const credentials = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString("base64");
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
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

  const { action, amount, orderID } = req.body || {};

  try {
    const token = await getAccessToken();

    if (action === "create") {
      const r = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{
            amount: { currency_code: "EUR", value: String(parseFloat(amount).toFixed(2)) },
            description: "Q8 Billard Tischbuchung"
          }],
          application_context: {
            return_url: "https://billard.q8-sportslounge.de",
            cancel_url: "https://billard.q8-sportslounge.de"
          }
        })
      });
      const order = await r.json();
      console.log("Order created:", order.id, "links:", order.links?.map(l => l.rel));
      return res.status(200).json(order);
    }

    if (action === "capture") {
      const r = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderID}/capture`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });
      const capture = await r.json();
      return res.status(200).json(capture);
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    console.error("PayPal API error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
