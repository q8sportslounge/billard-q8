import { useState, useEffect } from "react";

const PAYPAL_CLIENT_ID = "BAAdPHxH-oXU5vZypM2htB9c18ltzEnSm51jyV1chNpAPxQ5lVcWHLyoF4KXh67CJc4XCrxlT-YIDDK9h8";


const SUPABASE_URL = "https://szfudvgyxinesgnlvzmt.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6ZnVkdmd5eGluZXNnbmx2em10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyNDU0NDAsImV4cCI6MjEwMjgyMTQ0MH0.2aXwlcd_UKs_T1JlSHvr8T4vMIOY1SYByLqWr3ID6Hg";

async function supabaseRequest(method, path, body = null) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": method === "POST" ? "return=representation" : ""
    },
    body: body ? JSON.stringify(body) : null
  });
  return res.json();
}

async function getBookingsFromDB(date) {
  const data = await supabaseRequest("GET", `bookings?date=eq.${date}&select=*`);
  return Array.isArray(data) ? data : [];
}

async function saveBookingToDB(booking) {
  return supabaseRequest("POST", "bookings", booking);
}

const TABLES = [{ id: 1 }, { id: 2 }];

// Öffnungszeiten pro Wochentag (0=So,1=Mo,...,6=Sa)
// close: Stunde bis zu der noch gestartet werden darf (z.B. 23 = letzter Start 22:00 bei 1h)
const OPENING_HOURS = {
  0: { open: 14, close: 23 }, // Sonntag
  1: null,                     // Montag: geschlossen
  2: { open: 17, close: 23 }, // Dienstag
  3: { open: 17, close: 23 }, // Mittwoch
  4: { open: 17, close: 23 }, // Donnerstag
  5: { open: 16, close: 24 }, // Freitag, letzter Start 23:00
  6: { open: 14, close: 24 }, // Samstag, letzter Start 23:00
};

function getSlotsForDate(dateStr, duration = 1) {
  const dow = new Date(dateStr + "T12:00:00").getDay();
  const hours = OPENING_HOURS[dow];
  if (!hours) return [];
  const slots = [];
  for (let h = hours.open; h + duration <= hours.close; h++) {
    const display = h >= 24
      ? String(h - 24).padStart(2,"0") + ":00"
      : String(h).padStart(2,"0") + ":00";
    slots.push({ hour: h, display });
  }
  return slots;
}

function isOpenDay(dateStr) {
  const dow = new Date(dateStr + "T12:00:00").getDay();
  return OPENING_HOURS[dow] !== null;
}
const DURATIONS_NORMAL = [{ label: "1 Stunde", value: 1, price: 12 }, { label: "2 Stunden", value: 2, price: 24 }];
const DURATIONS_TAG    = [{ label: "1 Stunde", value: 1, price: 9  }, { label: "2 Stunden", value: 2, price: 18 }];
const PAYMENT_METHODS  = [{ id: "paypal", label: "PayPal", icon: null }];

const DAY_NAMES   = ["So","Mo","Di","Mi","Do","Fr","Sa"];
const MONTH_NAMES = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
const MONTH_SHORT = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];

const today = new Date();
const todayMidnight = new Date(today); todayMidnight.setHours(0,0,0,0);
const formatDate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
};
const todayStr = formatDate(today);

const bookingsCache = {};

async function apiFetch(method, params = {}, body = null) {
  try {
    let url = '/api/bookings';
    const qs = new URLSearchParams(params).toString();
    if (qs) url += '?' + qs;
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : null
    });
    const text = await res.text();
    return text ? JSON.parse(text) : [];
  } catch(e) { return []; }
}

async function loadBookingsForDate(date) {
  if (bookingsCache[date]) return bookingsCache[date];
  const data = await apiFetch("GET", { date });
  bookingsCache[date] = Array.isArray(data) ? data : [];
  return bookingsCache[date];
}

async function getBookedTablesDB(date, hour, duration) {
  const bookings = await loadBookingsForDate(date);
  const booked = new Set();
  for (let h = 0; h < duration; h++) {
    bookings.filter(b => b.hour === hour + h).forEach(b => booked.add(b.table_id));
  }
  return booked;
}

async function isSlotAvailableDB(date, hour, duration) {
  const booked = await getBookedTablesDB(date, hour, duration);
  return TABLES.some(t => !booked.has(t.id));
}

async function assignTableDB(date, hour, duration, bookingData) {
  const booked = await getBookedTablesDB(date, hour, duration);
  const free = TABLES.find(t => !booked.has(t.id));
  if (!free) return null;
  for (let h = 0; h < duration; h++) {
    await apiFetch("POST", {}, { date, hour: hour + h, duration, table_id: free.id, ...bookingData });
  }
  delete bookingsCache[date];
  return free.id;
}

// Legacy in-memory fallback
const bookingsDB = {};
function getBookedTables(date, hour, duration) {
  const booked = new Set();
  for (let h = 0; h < duration; h++) {
    const key = `${date}_${String(hour+h).padStart(2,"0")}:00`;
    (bookingsDB[key]||[]).forEach(id => booked.add(id));
  }
  return booked;
}
function isSlotAvailable(date, hour, duration) {
  const booked = getBookedTables(date, hour, duration);
  return TABLES.some(t => !booked.has(t.id));
}
function assignTable(date, hour, duration) {
  const booked = getBookedTables(date, hour, duration);
  const free = TABLES.find(t => !booked.has(t.id));
  if (!free) return null;
  for (let h = 0; h < duration; h++) {
    const key = `${date}_${String(hour+h).padStart(2,"0")}:00`;
    if (!bookingsDB[key]) bookingsDB[key] = [];
    bookingsDB[key].push(free.id);
  }
  return free.id;
}

// Kalender-Hilfsfunktionen
function getDaysInMonth(year, month) {
  return new Date(year, month+1, 0).getDate();
}
function getFirstDayOfMonth(year, month) {
  // Montag = 0
  const d = new Date(year, month, 1).getDay();
  return (d + 6) % 7;
}

function Calendar({ mode, selectedDate, onSelect }) {
  const initDate = selectedDate ? new Date(selectedDate+"T12:00:00") : today;
  const [viewYear, setViewYear]   = useState(initDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initDate.getMonth());

  const isBillardTag = mode === "tag";
  const daysInMonth  = getDaysInMonth(viewYear, viewMonth);
  const firstDay     = getFirstDayOfMonth(viewYear, viewMonth);
  const maxDate      = new Date(today); maxDate.setFullYear(today.getFullYear()+1);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y-1); }
    else setViewMonth(m => m-1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y+1); }
    else setViewMonth(m => m+1);
  };

  // Ist prev/next erlaubt?
  const canPrev = !(viewYear === today.getFullYear() && viewMonth === today.getMonth());
  const canNext = !(viewYear === maxDate.getFullYear() && viewMonth === maxDate.getMonth());

  const cells = [];
  // Leere Zellen vor dem 1.
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div style={{ userSelect: "none" }}>
      {/* Monats-Navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <button onClick={prevMonth} disabled={!canPrev}
          style={{ background: "none", border: "none", color: canPrev ? "#4a9c2f" : "#333", fontSize: 20, cursor: canPrev ? "pointer" : "default", padding: "4px 10px" }}>‹</button>
        <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: "0.05em" }}>
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button onClick={nextMonth} disabled={!canNext}
          style={{ background: "none", border: "none", color: canNext ? "#4a9c2f" : "#333", fontSize: 20, cursor: canNext ? "pointer" : "default", padding: "4px 10px" }}>›</button>
      </div>

      {/* Wochentag-Header Mo–So */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3, marginBottom: 6 }}>
        {["Mo","Di","Mi","Do","Fr","Sa","So"].map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: 10, color: d === "Di" ? "#3a7a22" : "#444", fontFamily: "sans-serif", fontWeight: 700, padding: "4px 0" }}>{d}</div>
        ))}
      </div>

      {/* Kalender-Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
        {cells.map((day, idx) => {
          if (!day) return <div key={`e-${idx}`} />;

          const d = new Date(viewYear, viewMonth, day);
          const key = formatDate(d);
          const isTue     = d.getDay() === 2;
          const isPast    = d < todayMidnight;
          const isTooFar  = d > maxDate;
          const isDisabled = isPast || isTooFar || (isBillardTag && !isTue) || (!isBillardTag && !isOpenDay(key));
          const isActive  = selectedDate === key;
          const isToday   = key === todayStr;
          const isAngebot = isTue && !isBillardTag;

          let bg = "#111", color = "#fff", border = "1px solid #1e1e1e";
          if (isDisabled) { bg = "transparent"; color = "#2a2a2a"; border = "1px solid transparent"; }
          else if (isActive) { bg = isTue ? "#2d6b1a" : "#4a9c2f"; color = isTue ? "#4a9c2f" : "#000"; border = "2px solid #4a9c2f"; }
          else if (isAngebot) { bg = "#0a1a07"; color = "#3a7a22"; border = "1px solid #1e4a10"; }
          else if (isToday) { border = "1px solid #555"; }

          return (
            <button key={key}
              onClick={() => !isDisabled && onSelect(key, isTue)}
              style={{
                background: bg, color, border, borderRadius: 5,
                padding: "7px 2px", textAlign: "center",
                cursor: isDisabled ? "default" : "pointer",
                fontSize: 13, fontWeight: isActive ? 900 : 600,
                transition: "all 0.12s", position: "relative",
                fontFamily: "'Montserrat', sans-serif",
              }}>
              {isAngebot && !isActive && (
                <div style={{
                  position: "absolute", top: 1, right: 2,
                  width: 5, height: 5, borderRadius: "50%", background: "#4a9c2f",
                }} />
              )}
              {day}
            </button>
          );
        })}
      </div>

      {/* Legende */}
      <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
        {!isBillardTag && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#666", fontFamily: "sans-serif" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#4a9c2f" }} />
            Billard Tag – Aktionspreis
          </div>
        )}
        {isBillardTag && (
          <div style={{ fontSize: 10, color: "#555", fontFamily: "sans-serif" }}>
            Nur Dienstage buchbar
          </div>
        )}
      </div>
    </div>
  );
}

function PayPalButton({ amount, onSuccess }) {
  useEffect(() => {
    if (window.paypal) { renderButton(); return; }
    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&currency=EUR`;
    script.onload = renderButton;
    document.body.appendChild(script);

    function renderButton() {
      const container = document.getElementById("paypal-button-container");
      if (!container || container.childElementCount > 0) return;
      window.paypal.Buttons({
        style: { layout: "vertical", color: "gold", shape: "rect", label: "pay" },
        createOrder: (data, actions) => actions.order.create({
          purchase_units: [{ amount: { value: String(amount), currency_code: "EUR" }, description: "Q8 Billard Tischbuchung" }]
        }),
        onApprove: async (data, actions) => {
          try {
            await actions.order.capture();
          } catch(e) {
            console.warn("Capture warning:", e);
          }
          onSuccess();
        },
        onError: (err) => { console.error("PayPal Error:", err); alert("PayPal Fehler. Bitte erneut versuchen."); }
      }).render("#paypal-button-container");
    }
  }, [amount]);

  return <div id="paypal-button-container" style={{ marginTop: 8 }} />;
}

function AdminPanel() {
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [selectedDate, setSelectedDate] = useState(formatDate(today));
  const [loading, setLoading] = useState(false);
  const ADMIN_PASSWORD = "q8admin2024";

  const loadBookings = async (date) => {
    setLoading(true);
    const data = await supabaseRequest("GET", `bookings?date=eq.${date}&order=hour.asc&select=*`);
    setBookings(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  const blockSlot = async (date, hour) => {
    await supabaseRequest("POST", "bookings", {
      date, hour, duration: 1, table_id: 1, name: "GESPERRT", blocked: true
    });
    loadBookings(date);
  };

  const deleteBooking = async (id) => {
    await supabaseRequest("DELETE", `bookings?id=eq.${id}`, null);
    loadBookings(selectedDate);
  };

  if (!loggedIn) return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, padding: 32, width: "100%", maxWidth: 360 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: "#fff" }}>🎱 Q8 Admin</div>
          <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>Buchungsverwaltung</div>
        </div>
        <input type="password" placeholder="Passwort" value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === "Enter" && password === ADMIN_PASSWORD && setLoggedIn(true)}
          style={{ width: "100%", background: "#1a1a1a", border: "2px solid #333", color: "#fff", borderRadius: 8, padding: "14px 16px", fontSize: 15, boxSizing: "border-box", marginBottom: 12, outline: "none" }} />
        <button onClick={() => password === ADMIN_PASSWORD ? setLoggedIn(true) : alert("Falsches Passwort")}
          style={{ width: "100%", background: "#4a9c2f", color: "#fff", border: "none", borderRadius: 8, padding: "14px", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
          Einloggen
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff", padding: 20, fontFamily: "'Roboto Flex', sans-serif" }}>
      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>🎱 Q8 Buchungsverwaltung</h1>
          <button onClick={() => setLoggedIn(false)} style={{ background: "transparent", border: "1px solid #333", color: "#666", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 12 }}>Logout</button>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 20, alignItems: "center" }}>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
            style={{ background: "#111", border: "1px solid #333", color: "#fff", borderRadius: 8, padding: "10px 14px", fontSize: 14, outline: "none" }} />
          <button onClick={() => loadBookings(selectedDate)}
            style={{ background: "#4a9c2f", color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            Laden
          </button>
        </div>

        {loading && <div style={{ color: "#555", fontSize: 14 }}>Lädt...</div>}

        {!loading && bookings.length === 0 && (
          <div style={{ background: "#111", borderRadius: 10, padding: 24, textAlign: "center", color: "#555", fontSize: 14 }}>
            Keine Buchungen für diesen Tag.
          </div>
        )}

        {bookings.map(b => (
          <div key={b.id} style={{ background: b.blocked ? "#1a0a00" : "#111", border: `1px solid ${b.blocked ? "#ff4444" : "#222"}`, borderRadius: 10, padding: "14px 16px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>
                {String(b.hour >= 24 ? b.hour-24 : b.hour).padStart(2,"0")}:00 Uhr — {b.blocked ? "⛔ GESPERRT" : b.name}
              </div>
              {!b.blocked && <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>{b.persons} Pers. · {b.price}€ · {b.phone}</div>}
            </div>
            <button onClick={() => deleteBooking(b.id)}
              style={{ background: "#ff4444", color: "#fff", border: "none", borderRadius: 6, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
              Löschen
            </button>
          </div>
        ))}

        <div style={{ marginTop: 24, background: "#111", border: "1px solid #222", borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 12, color: "#4a9c2f", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>Slot manuell sperren</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[17,18,19,20,21,22].map(h => (
              <button key={h} onClick={() => blockSlot(selectedDate, h)}
                style={{ background: "#1a0a00", border: "1px solid #ff4444", color: "#ff4444", borderRadius: 6, padding: "8px 14px", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                {String(h).padStart(2,"0")}:00
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  if (window.location.hash === "#admin") return <AdminPanel />;
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [selectedDuration, setSelectedDuration] = useState(null);
  const [persons, setPersons] = useState(2);
  const [form, setForm] = useState({ name: "", phone: "", email: "", note: "" });
  const [touched, setTouched] = useState({ name: false, phone: false, email: false });
  const [payment, setPayment] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [animating, setAnimating] = useState(false);

  const isBillardTag = mode === "tag";
  const isSelectedTuesday = selectedDate ? new Date(selectedDate+"T12:00:00").getDay() === 2 : false;
  const durations = (isBillardTag || isSelectedTuesday) ? DURATIONS_TAG : DURATIONS_NORMAL;

  const go = (dir) => {
    setAnimating(true);
    setTimeout(() => { setStep(s => s+dir); setAnimating(false); }, 180);
  };

  const handleModeSelect = (m) => {
    setMode(m);
    setSelectedDate(null);
    setSelectedTime(null);
    setSelectedDuration(null);
    go(1);
  };

  const handleDateSelect = (key, isTue) => {
    setSelectedDate(key);
    setSelectedTime(null);
    setSelectedDuration((isBillardTag || isTue) ? DURATIONS_TAG[0] : DURATIONS_NORMAL[0]);
  };

  const handleSubmit = async () => {
    // In Supabase speichern
    await assignTableDB(selectedDate, selectedTime, selectedDuration.value, {
      name: form.name, phone: form.phone, email: form.email,
      persons, price: selectedDuration?.price, buchungsart
    });    
    const dateObj = selectedDate ? new Date(selectedDate+"T12:00:00") : null;
    const dateStr = dateObj ? `${DAY_NAMES[dateObj.getDay()]}, ${dateObj.getDate()}. ${MONTH_SHORT[dateObj.getMonth()]} ${dateObj.getFullYear()}` : "";
    const timeStr = selectedTime !== null ? `${selectedTime >= 24 ? String(selectedTime-24).padStart(2,"0") : String(selectedTime).padStart(2,"0")}:00` : "";
    const endStr = selectedTime !== null && selectedDuration ? (() => { const h = selectedTime + selectedDuration.value; return (h >= 24 ? String(h-24).padStart(2,"0") : String(h).padStart(2,"0")) + ":00"; })() : "";
    const buchungsart = (isBillardTag || isSelectedTuesday) ? "⚡ Billard Tag" : "🎱 Billard";

    // ICS Kalenderdatei generieren
    const icsStart = (() => {
      const h = selectedTime >= 24 ? selectedTime - 24 : selectedTime;
      const d = selectedTime >= 24 ? new Date(new Date(selectedDate+"T00:00:00").getTime() + 86400000) : new Date(selectedDate+"T00:00:00");
      return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}T${String(h).padStart(2,"0")}0000`;
    })();
    const icsEnd = (() => {
      const h = (selectedTime + selectedDuration.value) >= 24 ? (selectedTime + selectedDuration.value) - 24 : (selectedTime + selectedDuration.value);
      const d = (selectedTime + selectedDuration.value) >= 24 ? new Date(new Date(selectedDate+"T00:00:00").getTime() + 86400000) : new Date(selectedDate+"T00:00:00");
      return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}T${String(h).padStart(2,"0")}0000`;
    })();

    const icsContent = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Q8 Sports Lounge//Billard Buchung//DE\nBEGIN:VEVENT\nDTSTART:${icsStart}\nDTEND:${icsEnd}\nSUMMARY:Billard – ${form.name} (${persons} Pers.) – ${selectedDuration?.price}€\nDESCRIPTION:Buchung: ${buchungsart}\\nName: ${form.name}\\nTelefon: ${form.phone}\\nEmail: ${form.email}\\nPersonen: ${persons}\\nPreis: ${selectedDuration?.price} €\\nZahlung: PayPal\nLOCATION:Q8 Sports Lounge\\, Mainz\nEND:VEVENT\nEND:VCALENDAR`;

    const blob = new Blob([icsContent], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Q8-Billard-${form.name}-${dateStr}.ics`;
    a.click();

    // Mail an Q8
    await fetch("https://formspree.io/f/mwleylzn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        _subject: `🎱 Neue Buchung – ${form.name} – ${dateStr}`,
        Name: form.name,
        Telefon: form.phone,
        Email: form.email,
        Datum: dateStr,
        Uhrzeit: `${timeStr} – ${endStr} Uhr`,
        Spielzeit: selectedDuration?.label,
        Personen: persons,
        Buchungsart: buchungsart,
        Preis: `${selectedDuration?.price} €`,
        Zahlung: "PayPal",
        Anmerkung: form.note || "–",
      })
    });

    // Bestätigungsmail an Kunden
    await fetch("https://formspree.io/f/mljrzjkq", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        _replyto: form.email,
        email: form.email,
        _subject: `Deine Billard-Buchung bei Q8 Sports Lounge`,
        message: `Hey ${form.name},

deine Buchung ist bestätigt – wir freuen uns auf dich!

DEINE BUCHUNGSDETAILS:
Datum: ${dateStr}
Uhrzeit: ${timeStr} – ${endStr} Uhr
Spielzeit: ${selectedDuration?.label}
Personen: ${persons}
Preis: ${selectedDuration?.price} € – bereits bezahlt via PayPal

WICHTIGE HINWEISE:
- Zahlung wurde erfolgreich verarbeitet
- Keine Stornierung oder Umbuchung möglich
- Bitte pünktlich erscheinen – deine Zeit läuft ab dem gebuchten Slot

Bei Fragen erreichst du uns unter:
info@q8-sportslounge.de
Q8 Sports Lounge · Mainz

Bis bald – auf ein gutes Spiel!

Dein Q8 Team

--
Datenschutz: Deine Daten (Name, Telefon, E-Mail) werden ausschließlich zur Abwicklung deiner Buchung verwendet und nicht an Dritte weitergegeben. Weitere Infos: q8-sportslounge.de`
      })
    });

    setSubmitted(true);
  };

  const [dbAvailability, setDbAvailability] = useState({});

  useEffect(() => {
    if (!selectedDate || !selectedDuration) return;
    loadBookingsForDate(selectedDate).then(bookings => {
      const slots = getSlotsForDate(selectedDate, selectedDuration.value);
      const avail = {};
      slots.forEach(({ hour }) => {
        const booked = new Set();
        for (let h = 0; h < selectedDuration.value; h++) {
          bookings.filter(b => b.hour === hour + h).forEach(b => booked.add(b.table_id));
        }
        avail[`${selectedDate}_${hour}_${selectedDuration.value}`] = TABLES.some(t => !booked.has(t.id));
      });
      setDbAvailability(avail);
    });
  }, [selectedDate, selectedDuration]);

  const selectedDateObj = selectedDate ? new Date(selectedDate+"T12:00:00") : null;
  const endHour = (selectedTime !== null && selectedDuration)
    ? (() => { const h = selectedTime + selectedDuration.value; return (h >= 24 ? String(h-24).padStart(2,"0") : String(h).padStart(2,"0")) + ":00"; })()
    : "";

  const nameError  = touched.name  && !form.name.trim();
  const phoneError = touched.phone && !form.phone.trim();
  const emailError = touched.email && !form.email.trim();

  return (
    <>
    <style>{`@import url('https://fonts.googleapis.com/css2?family=Roboto+Flex:wght@400;500;600;700;800&family=Phudu:wght@400;500;600;700;800;900&display=swap');`}</style>
    <div style={{ minHeight: "100vh", fontFamily: "'Montserrat', sans-serif", color: "#fff", position: "relative", overflow: "hidden", backgroundImage: "url('https://raw.githubusercontent.com/q8sportslounge/billard-q8/main/IMG_2898.jpeg')", backgroundSize: "cover", backgroundPosition: "center", backgroundAttachment: "fixed" }}>
      {/* Dark overlay über dem Foto */}
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", zIndex: 0 }} />
      <div style={{ position: "fixed", top: -120, left: "50%", transform: "translateX(-50%)", width: 600, height: 300, background: "radial-gradient(ellipse,rgba(180,255,0,0.15) 0%,transparent 70%)", pointerEvents: "none", zIndex: 1 }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 560, margin: "0 auto", padding: "32px 20px 60px" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ display: "inline-block", background: "#4a9c2f", color: "#000", fontSize: 11, fontWeight: 700, letterSpacing: "0.2em", padding: "4px 14px", marginBottom: 10, textTransform: "uppercase" }}>Q8 Sports Lounge · Mainz</div>
          <h1 style={{ fontSize: "clamp(2.2rem,8vw,3.2rem)", fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1, margin: 0, textTransform: "uppercase" }}>BILLARD<br /><span style={{ color: "#4a9c2f" }}>BUCHEN</span></h1>
        </div>

        {!submitted ? (
          <>
            {step > 1 && (
              <div style={{ display: "flex", gap: 6, marginBottom: 32 }}>
                {[2,3,4].map(s => (
                  <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: s <= step ? "#4a9c2f" : "#1e1e1e", transition: "background 0.3s" }} />
                ))}
              </div>
            )}

            <div style={{ opacity: animating ? 0 : 1, transition: "opacity 0.18s" }}>

              {/* STEP 1 */}
              {step === 1 && (
                <div>
                  <SectionLabel>Was möchtest du buchen?</SectionLabel>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <button onClick={() => handleModeSelect("normal")}
                      onMouseEnter={e => e.currentTarget.style.borderColor="#4a9c2f"}
                      onMouseLeave={e => e.currentTarget.style.borderColor="#1e1e1e"}
                      style={{ background: "#111", border: "2px solid #1e1e1e", borderRadius: 10, padding: "20px 22px", cursor: "pointer", textAlign: "left", color: "#fff", transition: "all 0.15s" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 20, fontWeight: 900 }}>🎱 Billard buchen</div>
                          <div style={{ fontSize: 12, color: "#666", fontFamily: "sans-serif", marginTop: 4 }}>Di – So · ab 12 € / Stunde</div>
                        </div>
                        <div style={{ fontSize: 22, color: "#4a9c2f" }}>→</div>
                      </div>
                    </button>

                    <button onClick={() => handleModeSelect("tag")}
                      onMouseEnter={e => e.currentTarget.style.borderColor="#4a9c2f"}
                      onMouseLeave={e => e.currentTarget.style.borderColor="#2d6b1a"}
                      style={{ background: "#0a1a07", border: "2px solid #2d6b1a", borderRadius: 10, padding: "20px 22px", cursor: "pointer", textAlign: "left", color: "#fff", transition: "all 0.15s", position: "relative", overflow: "hidden" }}>
                      <div style={{ position: "absolute", top: 0, right: 0, background: "#4a9c2f", color: "#000", fontSize: 9, fontWeight: 900, letterSpacing: "0.15em", padding: "3px 10px", borderBottomLeftRadius: 6, textTransform: "uppercase" }}>Sonderpreis</div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 20, fontWeight: 900 }}>⚡ Billard Tag</div>
                          <div style={{ fontSize: 12, color: "#3a7a22", fontFamily: "sans-serif", marginTop: 4 }}>Jeden Dienstag · nur 9 € / Stunde</div>
                        </div>
                        <div style={{ fontSize: 22, color: "#4a9c2f" }}>→</div>
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2 */}
              {step === 2 && (
                <div>
                  {isBillardTag && (
                    <div style={{ background: "#0a1a07", border: "1px solid #2d6b1a", borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 12, color: "#3a7a22", fontFamily: "sans-serif", display: "flex", alignItems: "center", gap: 8 }}>
                      ⚡ <strong>Billard Tag</strong> – Sonderpreise nur dienstags · Nur Dienstage wählbar
                    </div>
                  )}

                  <SectionLabel>Datum wählen</SectionLabel>
                  <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 10, padding: "16px 14px", marginBottom: 24 }}>
                    <Calendar mode={mode} selectedDate={selectedDate} onSelect={handleDateSelect} />
                  </div>

                  {/* Angebot-Hinweis bei Dienstag im normalen Modus */}
                  {!isBillardTag && isSelectedTuesday && (
                    <div style={{ background: "#0a1a07", border: "1px solid #2d6b1a", borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 12, color: "#3a7a22", fontFamily: "sans-serif", display: "flex", alignItems: "center", gap: 8 }}>
                      ⚡ <span><strong>Billard Tag!</strong> Aktionspreis gilt – nur 9 € / Stunde</span>
                    </div>
                  )}

                  <SectionLabel>Spielzeit wählen</SectionLabel>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
                    {durations.map(d => (
                      <button key={d.value} onClick={() => { setSelectedDuration(d); setSelectedTime(null); }}
                        style={{ background: selectedDuration?.value === d.value ? "#4a9c2f" : "#111", color: selectedDuration?.value === d.value ? "#000" : "#fff", border: selectedDuration?.value === d.value ? "2px solid #4a9c2f" : "2px solid #1e1e1e", borderRadius: 6, padding: "18px 8px", cursor: "pointer", textAlign: "center", transition: "all 0.15s" }}>
                        <div style={{ fontSize: 22, fontWeight: 900 }}>{d.value}h</div>
                        <div style={{ fontSize: 12, opacity: 0.7, fontFamily: "sans-serif", marginTop: 2 }}>{d.price} €</div>
                      </button>
                    ))}
                  </div>

                  <SectionLabel>Uhrzeit wählen</SectionLabel>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                    {selectedDate ? getSlotsForDate(selectedDate, selectedDuration?.value || 1).map(({ hour, display }) => {
                      // 3h Puffer: Slot muss mind. 3h in der Zukunft liegen
                      const now = new Date();
                      const slotDate = new Date(selectedDate + "T00:00:00");
                      const slotActualHour = hour >= 24 ? hour - 24 : hour;
                      const slotDay = hour >= 24 ? new Date(slotDate.getTime() + 86400000) : slotDate;
                      slotDay.setHours(slotActualHour, 0, 0, 0);
                      const tooSoon = (slotDay - now) < 3 * 60 * 60 * 1000;
                      const available = !tooSoon && (selectedDuration ? (dbAvailability[`${selectedDate}_${hour}_${selectedDuration.value}`] !== false) : true);
                      const active = selectedTime === hour;
                      return (
                        <button key={hour} onClick={() => available && setSelectedTime(hour)}
                          style={{ padding: "8px 14px", background: !available ? "#0d0d0d" : active ? "#4a9c2f" : "#111", color: !available ? "#2a2a2a" : active ? "#000" : "#fff", border: active ? "2px solid #4a9c2f" : "2px solid #1e1e1e", borderRadius: 4, cursor: !available ? "not-allowed" : "pointer", fontFamily: "monospace", fontSize: 14, fontWeight: 700, transition: "all 0.15s", textDecoration: !available ? "line-through" : "none" }}>{display}</button>
                      );
                    }) : <div style={{ color: "#555", fontFamily: "sans-serif", fontSize: 13 }}>Bitte zuerst ein Datum wählen.</div>}
                  </div>
                  <div style={{ fontSize: 11, color: "#444", fontFamily: "sans-serif", marginBottom: 28, display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <span>Durchgestrichen = ausgebucht</span>
                    <span style={{ color: "#333" }}>· Buchung mind. 3 Stunden im Voraus</span>
                  </div>

                  <div style={{ display: "flex", gap: 10 }}>
                    <SecondaryButton onClick={() => { setMode(null); go(-1); }}>← Zurück</SecondaryButton>
                    <PrimaryButton disabled={!selectedDate || selectedTime === null || !selectedDuration} onClick={() => go(1)}>Weiter →</PrimaryButton>
                  </div>
                </div>
              )}

              {/* STEP 3 */}
              {step === 3 && (
                <div>
                  <SectionLabel>Wie viele Personen spielen?</SectionLabel>
                  <div style={{ display: "flex", gap: 10, marginBottom: 28, flexWrap: "wrap" }}>
                    {[1,2,3,4,5,6].map(n => (
                      <button key={n} onClick={() => setPersons(n)}
                        style={{ width: 58, height: 58, background: persons === n ? "#4a9c2f" : "#111", color: persons === n ? "#000" : "#fff", border: persons === n ? "2px solid #4a9c2f" : "2px solid #1e1e1e", borderRadius: 6, cursor: "pointer", fontSize: 22, fontWeight: 900, transition: "all 0.15s" }}>{n}</button>
                    ))}
                    {/* 6+ Button */}
                    <a href="tel:+49XXXXXXXXX" style={{ textDecoration: "none" }}>
                      <button
                        style={{ width: 58, height: 58, background: "#1a0a00", color: "#ff9933", border: "2px solid #ff6600", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 900, transition: "all 0.15s", lineHeight: 1.2 }}>
                        6+<br /><span style={{ fontSize: 9, letterSpacing: "0.05em" }}>ANRUF</span>
                      </button>
                    </a>
                  </div>

                  <SectionLabel>Deine Daten</SectionLabel>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 32 }}>
                    <div>
                      <div style={{ position: "relative" }}>
                        <input placeholder="Name *" value={form.name}
                          onChange={e => setForm({ ...form, name: e.target.value })}
                          onBlur={() => setTouched(t => ({ ...t, name: true }))}
                          style={{ ...inputStyle, border: nameError ? "2px solid #ff4444" : touched.name && form.name ? "2px solid #4a9c2f" : "2px solid #1e1e1e" }} />
                        {touched.name && form.name && <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: "#4a9c2f" }}>✓</span>}
                      </div>
                      {nameError && <div style={{ color: "#ff4444", fontSize: 11, fontFamily: "sans-serif", marginTop: 4, marginLeft: 4 }}>Bitte gib deinen Namen ein.</div>}
                    </div>

                    <div>
                      <div style={{ position: "relative" }}>
                        <input placeholder="Telefon *" value={form.phone}
                          inputMode="numeric"
                          onChange={e => setForm({ ...form, phone: e.target.value.replace(/[^0-9+\s]/g,"") })}
                          onBlur={() => setTouched(t => ({ ...t, phone: true }))}
                          style={{ ...inputStyle, border: phoneError ? "2px solid #ff4444" : touched.phone && form.phone ? "2px solid #4a9c2f" : "2px solid #1e1e1e" }} />
                        {touched.phone && form.phone && <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: "#4a9c2f" }}>✓</span>}
                      </div>
                      {phoneError && <div style={{ color: "#ff4444", fontSize: 11, fontFamily: "sans-serif", marginTop: 4, marginLeft: 4 }}>Bitte gib deine Telefonnummer ein.</div>}
                    </div>

                    <div>
                      <div style={{ position: "relative" }}>
                        <input placeholder="E-Mail *" value={form.email}
                          inputMode="email"
                          onChange={e => setForm({ ...form, email: e.target.value })}
                          onBlur={() => setTouched(t => ({ ...t, email: true }))}
                          style={{ ...inputStyle, border: emailError ? "2px solid #ff4444" : touched.email && form.email ? "2px solid #4a9c2f" : "2px solid #1e1e1e" }} />
                        {touched.email && form.email && <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: "#4a9c2f" }}>✓</span>}
                      </div>
                      {emailError && <div style={{ color: "#ff4444", fontSize: 11, fontFamily: "sans-serif", marginTop: 4, marginLeft: 4 }}>Bitte gib deine E-Mail-Adresse ein.</div>}
                    </div>

                    <textarea placeholder="Anmerkungen (optional)" value={form.note}
                      onChange={e => setForm({ ...form, note: e.target.value })}
                      rows={3} style={{ ...inputStyle, resize: "vertical", fontFamily: "sans-serif" }} />
                  </div>

                  <div style={{ display: "flex", gap: 10 }}>
                    <SecondaryButton onClick={() => go(-1)}>← Zurück</SecondaryButton>
                    <PrimaryButton disabled={!form.name.trim() || !form.phone.trim() || !form.email.trim()}
                      onClick={() => { setTouched({ name: true, phone: true, email: true }); if (form.name.trim() && form.phone.trim() && form.email.trim()) go(1); }}>
                      Weiter →
                    </PrimaryButton>
                  </div>
                </div>
              )}

              {/* STEP 4 */}
              {step === 4 && (
                <div>
                  <SectionLabel>Buchungsübersicht</SectionLabel>
                  <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 10, padding: 20, marginBottom: 20 }}>
                    {[
                      ["Buchungsart", (isBillardTag || isSelectedTuesday) ? "⚡ Billard Tag" : "🎱 Billard"],
                      ["Datum", selectedDateObj ? `${DAY_NAMES[selectedDateObj.getDay()]}, ${selectedDateObj.getDate()}. ${MONTH_SHORT[selectedDateObj.getMonth()]} ${selectedDateObj.getFullYear()}` : ""],
                      ["Uhrzeit", selectedTime !== null ? `${selectedTime >= 24 ? String(selectedTime-24).padStart(2,"0") : String(selectedTime).padStart(2,"0")}:00 – ${endHour} Uhr` : ""],
                      ["Spielzeit", selectedDuration?.label],
                      ["Personen", `${persons} ${persons===1?"Person":"Personen"}`],
                      ["Name", form.name],
                      ["Kontakt", form.phone],
                      ["E-Mail", form.email],
                    ].map(([label, value]) => (
                      <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1a1a1a" }}>
                        <span style={{ color: "#555", fontSize: 12, fontFamily: "sans-serif", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, textAlign: "right", maxWidth: "60%" }}>{value}</span>
                      </div>
                    ))}
                    {form.note && <div style={{ paddingTop: 10, fontSize: 12, color: "#666", fontFamily: "sans-serif" }}>Anmerkung: {form.note}</div>}
                  </div>

                  <div style={{ background: "#4a9c2f", color: "#000", borderRadius: 8, padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: "0.1em", textTransform: "uppercase" }}>Gesamtpreis</span>
                    <span style={{ fontSize: 28, fontWeight: 900 }}>{selectedDuration?.price} €</span>
                  </div>

                  <SectionLabel>Zahlungsart wählen</SectionLabel>
                  <div style={{ marginBottom: 16 }}>
                    <button onClick={() => setPayment("paypal")}
                      style={{ width: "100%", background: "#111", border: payment==="paypal" ? "2px solid #4a9c2f" : "2px solid #1e1e1e", borderRadius: 8, padding: "18px 12px", cursor: "pointer", textAlign: "center", transition: "all 0.15s", boxSizing: "border-box" }}>
                      <span style={{ color: "#fff", fontSize: 15, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Jetzt mit PayPal bezahlen</span>
                    </button>
                  </div>

                  {/* Buchungsbedingungen */}
                  <div style={{ background: "#0d0d0d", border: "1px solid #222", borderRadius: 10, overflow: "hidden", marginBottom: 24 }}>
                    <div style={{ background: "#111", padding: "10px 16px", borderBottom: "1px solid #1e1e1e", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", color: "#4a9c2f", textTransform: "uppercase", fontFamily: "sans-serif" }}>Buchungsbedingungen</span>
                    </div>
                    <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>

                      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                        <div style={{ fontFamily: "sans-serif", fontSize: 12, lineHeight: 1.6 }}>
                          <strong style={{ color: "#fff", display: "block", marginBottom: 2 }}>Nur Vorabzahlung</strong>
                          <span style={{ color: "#666" }}>Zahlung vor Ort ist nicht möglich. Der Betrag wird direkt nach der Buchung über die gewählte Zahlungsmethode eingezogen.</span>
                        </div>
                      </div>

                      <div style={{ height: 1, background: "#1a1a1a" }} />

                      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                        <div style={{ fontFamily: "sans-serif", fontSize: 12, lineHeight: 1.6 }}>
                          <strong style={{ color: "#fff", display: "block", marginBottom: 2 }}>Keine Stornierung & keine Umbuchung</strong>
                          <span style={{ color: "#666" }}>Gebuchte Slots können weder storniert noch auf einen anderen Termin verlegt werden. Bei Nichterscheinen verfällt die Buchung ohne Rückerstattung.</span>
                        </div>
                      </div>

                      <div style={{ height: 1, background: "#1a1a1a" }} />

                      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                        <div style={{ fontFamily: "sans-serif", fontSize: 12, lineHeight: 1.6 }}>
                          <strong style={{ color: "#fff", display: "block", marginBottom: 2 }}>Pünktlichkeit & Spielzeit</strong>
                          <span style={{ color: "#666" }}>Deine gebuchte Zeit beginnt zum reservierten Startzeitpunkt. Bei verspätetem Erscheinen wird die verbleibende Restzeit gespielt – eine Verlängerung ist nicht möglich.</span>
                        </div>
                      </div>

                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexDirection: "column" }}>
                    <SecondaryButton onClick={() => go(-1)}>← Zurück</SecondaryButton>
                    {payment === "paypal" && (
                      <PayPalButton
                        amount={selectedDuration?.price}
                        onSuccess={handleSubmit}
                      />
                    )}
                    {!payment && (
                      <PrimaryButton disabled={true}>Zahlungsart wählen</PrimaryButton>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <div style={{ textAlign: "center", marginBottom: 16 }}><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAADICAYAAACtWK6eAADKV0lEQVR42uxdd3hV1fJds/c5t6X3AiEh1IROqFICiDRRUAxWLNiwdwVFQ+y9PnvvShQ7diH2AhaqNOkd0tu95+w9vz/OuckNooLP8n7veb7vfoSUW/bZa8/MmjUzwD/XH3oxM6EQxh/6pM7z0T+r+9dfxj9L8AdexRBEpAHYHunDeReenLmD16aWV2yOqrBrfH5heIQphFKKGSHNQpIpvB6DDY+GFgRp1dXX1SsVbEhKSKpqHVWw4+Hbn9sSKmu03VcgALxPb6W4WABASUmJ/ufG/P7rn1Ppj8JGMURJCfRnL3+fesu75569YcdP4ysrazqEGlS0bWtYtmq5tZmd/7JzG5jdm+HeEdMU8EXL2rT0hJUdMns8+8ydb9xNRPb+gMS9ZFFREUpLS/V+/t0/1z8A+fl6FBcXEwDMmjWLiWifT+uSkhJ95ZVX9p37/XMvrV69oU19tY34TCA5hxCdBO2NIjY9DGEAwgAgCEQAMwMarC3AtonsIBCqAzXUMJVvBpVvYsQmeNG5Xfv3Hjxm8RF5E6nO3ej8K/eU77zzxjYDhg2Tg3oNWavYanLViocV63+syj8A2a81KCoqEqUoBUqh9jx9gZ99b4+YA0QEzHt8XtyZjx//3YofN+bk9pehseeRzDsAlOwHTDCJ/VhsBmCDuMIirFjA/MpNSm1dKj0F3Xs8/Okr35+mWf3a+xKmaepOXTq9U11VObh7YfbrPbt2e+6aSfd/QG1FY9hkFRZCDvsHLP8A5Fc/exFEMygEmJVxzTVXti1vrIg78eBTN/Qa1GsH/4ZXUlgIo6wM9rAJAy7/4qtvr8sfq0JnPkZmCoCdjRqrPze4crPBwXqCZYHDZz9r5wEm5zYwA5pAAvBFM6V2ClGnQpuShMQOMN96pM27vovHtCkndLv2qruWh63W3izZnQ/e2abk8pJlFVUVUVEdJNKzopCcFLeydUrr1zok933x1uIHF9ocbAJUURGotBT/uGD/AAQAgzAMEmWwXdZJnnjWEcPWVy2fVFFTOby6vLGt1chev9e/Kzu5/QPvv1p2FRHRr7g1ZBomp3dK/qrS2ta3+AtTZSey/PxjjfeuTlRVa/yGlBJCGCA4btUvLTs1YYXBZCPQYbcad2WNOKCvgUUbbPu20YbZKbPrBV9/9O2dKIQR/gzNYC00ysrK7CGFQ6Z9teDr+yfO0VZUnaYvnldiywoIQ5hISg1wUkrsJ+nxmXMOSB//5owrr1mjEHKeoAiyCP/EK/+TACkuLhYly0oobDHm3rUy9q6vTzp6e/WGabt2V/Qs39YIK6jgi3FgVLOdKeD3oKBbr4e+/PC7060rQgIl0Hvz9+cteDb50LFnr8wrqky49F5Dr9ho07/GJyCqNoWik2UwKhC9zbKsctaqWrMOAmwBsECCiQhaa8WaNRjK8MgAgTIt2+5csTUUw3kb+cLnLWQkCPv6U5S5/aPWT+5Yv+lEpfXe3Czh9Zk6Oa71B7LDugNnfOKx46CkB4QfV7P++jXmH97Txu5NgD/ag5SUqPrU5ISPEgNpz4xNPf/9U0uOKkf4I/4Tr/xvXEVFRRKACLtRN11yT+bIY/tdlT8m5afkXl4WycS+NkL1P9OwLvrMsO8oN9Qt2wx95ruGSuuLYExqLJ961rGHRjxXC9ABwAUzT+wWSIjTk+6FfoM96uhnyM7MbsOjxg69/eqrr+7AzDGmaUKQABGBfuVcIhAMw8DZF53dtnD4oE+TOsTzyW8L+w02rUPvJE7ISH/fNCWaP1PL93Lnk5e18fnj6ifcKflZjlYzNxv6+iWGfoGFfoulfpoNdcnnhj30EmmlDABH5QnOOMDHXSckbi48sd2Dk88YPZJnc+TnlMz8T6z63wwMCRMXXnhh58FFnW/udFDSjoSuHkYicVyetA8qMeybtxr6VZb6BZb6kTqpXmBDv8amvqvCsFJ7Q2d3aPuZ12v+bFOGAVN0/Kh+3thoPvEF6DfYb426TnLbtp2/j4r2781ii4iH3Msj/H3ceGNxv5SsNHXwPVBvsGkd94zgqOT4z1yA0J6xEAD0G9Tv7ECmyVev81mzOaCHFps6PSddDZ2SGpr6sF/dvlbqOSz062zoBxoMdeorhtXjBGHHdSeO6SI5a2iAex+R8sPBp/a6tHj6DbnuW0FREeT/4j4S/1XhBTOFN21paakyhVdfMuP8IcOP6/bCG98/8f0Pi1ZfsmJhRYonoOxJ10p93bcQZ12lhTdEePFGn75pTKJ964GpdNuZkhf9pNE2XsgTHiKuqN818NiTjx4KQO9pRQBAkTQBhjeKmAEO1gpAGd/X1tRTQUGBGXECMxwfJvxQe3loZtbFxcWi/8iCn3SjqAxWQQCCTY+AUrZg/nl4UFYG5fWa2LB22+TW/Wx0yDawdlcIa97xcnJsoti5KNGcf2sr8dCRmfreaXHq/Zclo57pkIlaFj8hxBVvSX3QNNjS36hXLNnV/avvl970yspbvj/s3L73PXj52xmlpVAo/u/aL/9rV9PG9ZkBnHzulHFDjsqfmzs8nv1tJVMScc4oaZ1YaqhHWeo5LPUN33n06LNi7ewOGVZGWltum9ue8/LydFp6Fnc4Sup/VRh6DpuhAWcJzm7b6QXDEC1eJwyWSccePMQbF8VnvkPqNfaFBl1kcts2XR6Qe/z+/gDd+XdNXGJSxpbhxeA32Bs6+WWTfQnRXxpGSwsSdq+KbzuzvT82tvHIx6V+i6NCxzwrdHpG2+dPPv2EQQUDetzXe2DXTV17d+aO+Z25bad23GVIpjX+4jhr+gce9ZQl9Zss9bNs6Mu+NOzBFwkroQ849QDJ/Y/N2nTG2aeOBIBiFIt/LMj/S7aBFDPHnHzu0Sf1mtjqiw++e/Wtrz77cez6ZVXcti/ZZ78k9XXvQh58BNO6MgN3Hx+j7j0sRS+ekyQ9ImAkZ/pWJqdFXdk+P6Nn/wGdzt82P5ree0GxBOSAozUqQtvG3nnnlekAFLile+MzDQghAGIwCFoDSindlCb/3VcCiIT4LT6pZH6JAIC5Ly2c5Elp8BaMN+1K2PTjez5K9WW/9OiDT3628Msfzpwy+eSuSfEJh8XG+2bHxJjlqIkzfnwj3XjxrFbi9oOT7aeu8+t13xL69Wdxya1CXvG6obN7w/rhm42tPl3/xqszL52ZV4ISHQbk/8Jl/L/HBYANGzb4rrpq5vRuB+QdXyE25uzYUA8pSPccL/SBp0P27sHSBuGb10z+9ImA3vhNQEj2GIE4QiDZ91VySuqDN15zy4t9+vSpBwCPx1yUntF63MLna0Ydcirb+f2FTmgXjH3ykXkjADxXOKxQlqGsiWIVHg8TIcKLAtjmP4AmJSIihB001uFv7ulfQTGzyGydU5R9oI12yR4sXttgbF0Qs+n6c8/78KSH53sKUwrFBRdcUAngVSJ69aSTTspct2HVodW1VYcHQzQkuNXn++bxWHzzbFBl9KhF4Wk1ou9w0Ln3wLjrDBla+uGOqPnGm+cT6PSSkhIB4Gc5mGXLllFpaan6ByD/MTEHQARev36Rb+57b1+wY/fOmNi20iqcKsWwKRD57VjW2MCHT3r4i6ej9PZlAcNjGCIuXsAf8L+fkpB697x5H79pWUvR5+0+yM/P9yxbtkyEQlZjnwFdPnj7ky2jVv1g88DeAhndLd71em2hkPRcWVlZS99OCg0iKOXwU9IALEv9IXkEEuHcifN596TAmmQu15zTvaaxqufoCcReMH3/LiPRaL3xxPMn4uQLjFAZnPecnw+P39+bH3vssS0AHhBCPHDssUV5G7ZsObKuvvqwYNDovuM7P56aGq3Lb99KYw8jTJgOsWye4h3byruZhgchO7gnCCiCDv5N9cE/LtZfZT4IDMAYOnR8RUZS+h2Gx8TkFwVOnsWifTtg7oNe3DAomV+dniqq1sQZ8UmeUHJGzIsdO3UsXPL9j6Pee+/DNy3Lovz8fA8AWrZsWcgjfY0XzDjrqJXV317QsFPpLd+RNCFFYg6T4UGBsrXYcwNoHbTBgA45e1kKBuP3U6PNJiJegVkJ4eDCybyDIr029zTH2298dZivVZ3sPVrY5dDyh1cEr9qwYmC/yTnLDj/ngCeKb7t4DDMHli0ToYULF1oAqP2Y9t4hQ4YYTz/94vKyDz+Z9c3n3/fJbtNuXEKyr8wnvOKDx03eXK+Qky2Q3pGovkLb2EOe5rpbPKPkkgPPO++8Ye7a/NdQw//vfcni4mLNDBx3+qGPifpAffkXlsEQ/N0GjdfvMrluU5RITvfWpmXGP9Sla4++3y9YfNTrc+Z+bFmWcIHBy5YtC/mMAJ8//dSRA4/s8FZp2dPPL/lqS0ZaD1D3QqIQNBrLPez3mTHumjEAys/PZwBQBtnMQCjEEAAML0FB/REbxLJtbUnDcd2UJjBDR7BYBEAxs9y0efvh7YdZyIqSYsUPjPoaos4TQli7aX3Gex9/dsKTbzzy9pBjOy2ecvGYO++679oBfk80r35ndbCsrMwGYLRv395LROrNV998++tPvx+dlpG4utGyqbyctA+SoxMlS+370VZWE/HgWi/eVrMm7YUnS198bs7TH5x88eTTJTyKiPh/KVb5j2ewDEOgTWbuk6k9BT9im6FHbMPKP87U/foOnHtB8ZntI91KFxhhxsh78oVHHjlocqePswbFstmGOLYrqREzDXXnLo9+nQ193ntGqGNBNg8eMvB193SXkezR9OtP6eiPjbOOfgL8FnuD424yOTE+537mYlFQUGD+Svz0swczU3FxsSgqKpLMbMbEp64edyt4LvuCxzzl4UBC3McuiyXCLNrZl57cLyY9Tp/5IdQb7Ndjr/Xooz4V+hmW+o6tpjrhBWl1OxEqvi84ocDkjqOSeNjxed+cPGPi9JeefamzKXwt1pKZRe/+PZekjyK+tdy0n2LT7nqkn7vlDZkQyd4BMDxeD/Lzur4sfMQimayOE6N48kWDH+VbOMrJzxT+U3P0Z+c2fstcu0ksmnLOpF7emGj7pNdIvclm6OjniDOy2r1pGALt27f35uejGRhfcuxx50w8Y8ARHZZk9ItmIwuc3I/0obcZ1i3bDP0aS/1EUOqjbw1YuXltdPfeXXj8xDGD99ggBACfLLovwR+VsPOwe4jnsjc08V7BWW3bzfd5vXsDxD5fa5csSY9LT64+5B7ot9gXKnrQ5Jj41NImurkQBhGhe8/eN2YONPhBywg9bkfpNsM9qu/5fuu6daSeY9JvsKFfYFNfv8a0Jz0grfaToGN6g1MG+LjL+PTGUSd3f/e06Yed9NKzL+UGvNF47LEHeydlJltdToR+lk371l2CO45I3v7gae/HubEQhROHI4aMnBbfwctTV0nrtPmmSh1EduvRBh98fv6C22c+1AXAPxWRf0Z4sZfMrfwNky1Mj4HUtMx3O04kfo7N0B1VsLMHxvLJR50zxvEnJb6c+2XrY88ZO6vXoW3WJvfys5EFbjWc7KMeNex7akz9Ghv6KSX02S947V5jU0LZue24W0GeNXrsiFMirUbke2Vmio/N+G74TOI32GNNe0uqmJxoffQ5Y65a8d2KVsxs+H0++Lw++Dx++DwB+L1R8HujwgeAYGbJzAYzB2p31GbcffctIwZOzJ9HcSYf+5RUb7E3dMhtJifGZN8kZBPBQswsE1Izlg6/Evwae+wLvzZ0bKtobtemE7ft2poHTY0PnfqSx759B+lSN4P+FJv6iu8Me8wNwmo9FhzTmzhjUIDzRqfVDT0u77v2/Vqvh1/yWR9J9Sb7Qqe8ZXJWl7YPCRJAUfN9KL728t79BvWqaXNAgnXZTlIvs9Q3bzF0/hRhxQ8AD5mWWXH2JScf6Rpc+v/octF/nsUAucE3fGYAX85flNrjgHZ1hjTqlFYoKiqSe6MSw98ffejwQz/98qvXzni7UQ3tLfS9N2pzzUPdXyl988Err757xllrNq04auOGXQm11UFk9xSq8ESBARMh0uDI0xe+ZuqvnovhnUtijIDfi5g473dZ6W3OmTPnjc9+gaGR0hAqp3XeM9xl+THFbwrbriPj5hNs2vCtF23bJdcYyruxdhtXeaNB/lQhSUASk6k1E8CCGQJgYgYx4FWa46prauI3/1SB2CTwFe8S2rQW9u1nSbP61T4nLdv6yRPtR7f3rn5ndfCokyb1f+v9d7847ZU6HtLHo++aZRk/PtB2bm5+fE3lzoaJwTryBq0g/Bn1nD20xu4yrkF0GqBEekBAgLAjRLz0S9YL5ir89AMbRAAFCUOOMfjQkz2ohaXvOtKQsctGHPD5kje/KCoqkqU7SgllsCcVTZy2esPK+62gxSKmTo+ZtV0cMAKohsDzN7H+9EVbduwWh65pfW9+KvD+DCoh/Uv37x+A7MMVXjyP9OPEi8eftXLLkhO2bqhqpxs9tTmZ2R9cfen0awYOHLsORZB7KW4Kn+ZmSlrrH3Inbe102X1SLVmv5N0HRau4qFi9s3GbJxSy0WmosIefKERBISgWjM27Gd+87NXfz4nh3auijIDPg5g439rExJTb333z/UeIqPGX6MuwxHzChPGnz1/wyQNHPldljxlqyvVbGa/do/XaRVru+BFoWAeQnxDbgUGiibIFCBDSfRiAEABJQAI6tZXBE6dL0SMP+HptkJ8/rBWOKjy+xw1337AkPz/f8+OPy0Od8rrc3pD54wXF78GqayB5y1hTZFeM7P3J4je+O/G0Y/I3btxwaMXuqkMbatTAhloNm4KIza1V7Q6s4y6jG0XHPpqSIWGBsDsIDjUyx8QRomGIBljqiZttY9n9ua/u2LThMMu2I/MfJITgUaMOLNqya/NDtrLjg3bIGjBtmzHuzBB8kHjvbebSa21OTPfK/Jy89ybF3HPqCSVDNoRraP5xlPbjCgdz117wRKvhJ3Z6u82wAHtywCmDwK1GgqM7C87qlL39ypLLR+8RB0Q8iSvYG9jnrLhcH1+3SVqlbOgB5xID4O4nGtblPxjqBTb0HJb6tnVSH3lrlNVlcLqdnduO87rmcf/BvVeNG3/QBQsWLIjbg8r8xRgJAB5++M60Tnl5uzIGedSV68l+maV+lU39OJvqjMWmHUj32OMf89g3bDXsmzea9s2bncctW0379p2mfWeFad9T7bHvrzfth22PepxN/RJ79Svs0bfsQrDbxFge2HfofGYOixmJmT0Jaemrxt0CfpO9oWkfSE5qnbKUmT2IkLgYhoHJx47vO3hE/5sL+vVY2blzF85u3Zmz2mVzrwlJ1rEP+ezrN5B+jKV+gqW+t8rQJT9JNegiU7ft3C54y3XX5f+Ci0QAcOaZZ/bsP7hgcbe+HTm3U3vrwHPi1L27SL/Opr52jaHbFwkr7UDBB53XduOlMy49CHBctX9UwvsJjgvOuqBb/2MzV8d2FZx2gAid/qZh31tnqkfYVNevk6H+54MzcjMbpxdfPGqvG9eRgNDKXXNjY+KTto6+gfTr7LEv+cqjo3NNXcJSP8ukr1si1YSZMVbHvpkqJ7c9d+mexwMG9/666KiJpzJzdLNJczbivlg+AJhwxLjTu3bvyjkDE1TR42Zo1o9k3dlI9jnbSEXlSH3810I9wlBPsYh4kHqCST3OpB5RQj0YFOq+OmHfvk3YV3xtWJPv8YY6D03jPr37NV5+7QX93NfzAMDhkw8dntA+mi/4Uajn2QgNutjktKQOJeSsilFcXCz2ZJE2bNjgn3jk2LHDRw15vnefnrs7dezKWZkdOKdbht3zFL8ecY9HHzLbq5OHC7tV+1b67DOnnfuLB1LEvXv//ffjBg0d8Hj3fh25fecOque4NLt4odCvsaEfajT0sCulFX8AuP9pyWrKhWMvFPDi1573n2uPBT7zzDP79z0mbYevLXG342XonmpDv8GGfpKFftiW6iU29fNsWgdcBW6dk1Mx563nO+71VHOZnY75+del9Tb5X/Uy9DR7dd4kgwsu8OiDLo+z23VtzbntO3K3Xl14UGG/DyYdOXHCHqfZPgFjT5AIITGxaPz0gj69g+3adeJ23bO528hMbj8wnTOy0jm3Txr3OyqN+01O5b5Fadx3Uir3OTyNCw5L44KJ6dx7fAb3GJ3JXYe34k79sji7Qzbn5HTk/v37rzjtnOOHRxwKkojQ94Be/4rKNtSU5SI0bQupjJ4xavSQw3rvbeOF/66J0SCB+++/v9URR004p9+gnt906ZrPCbGZ6pAnDH0fG6rgfHDr7mmhr1e9k/VbAXb4tYQQGDNm1Pm9+uerzt07cIdebdSZc0z9Mhv6eTb1CaWGnTgIOv8YPx92YcFTX57Dsc4e+Kf91K+C49QzTirsdWRKpScLPOB8w36SDf0CS33SQ37da0KSlTvOx8fNEfYdTHrktVGhVq2zeMDQPl+6m1pGbgb3RlLxHeflBBLi645+GvoN9qpTXje0acbpDh07cPfeXRoHDunz7DHHTx5qmuaeN/rfMftOAdVlZ/cYffCwGwYc0Hder169Vvfq3WNH34G9ygv69Kru2bOgrlfvgtpevQtqevXuXd2zZ0Flz569ynv06LWrR49eO3oXFGzq06fPqoI+vb7of0DBE+MPHzll+fJPY/ZI7BIzy34H9FmbnduG2w5Ibkw7wGtn5KZ9y8y/9RnCJQEywk0Uk4+ZeHWrrGw94SGyX2FDHVdKHNMmpvH86Sfl/pabGeFqSgCYOnXqqH6De6/t0CVHZR3qV1M/NPSTtqFfYVNfschQ2ROElX2IwaMvaP/DZWdf3eM/mQqmvw8cTqB2yrQTR3yz843Xlny+O7rfUVKdfTuJUB3jmYuiednrCYgKeIQgaVV4N5nxHSwEv03V0bFRul9Bv8cef+KJS70eX1XICoY3T5MeSEqhMrNznjE6rD921jvCarSZbhgtZEp17w96D8w7/6F/PbHMzUg7XU3+OGalKZgXQuBH9ab3/gtfjlIqykxI8JlGtJK2abBhGxyI8uuGhnptqaBCLWufr0Gl5OXYJ0+4NGQYRlAp1cICROidaPbs2eKBh+67rKq6+riG2mAeQyMtM+Wa+R98fFWYONiXHNPkyZPN0tLS0Puvv97m5Blnr+03fYM44Tivev45JedeEf1TxdqKfCIKYh/7cbl6ttCjDz44dta/iud2vWK7SskzRf1PjMKRCm2iBTZUAU/PYvXT99rolJdSnecfeuajt7/6LMOm4uJi+p8v8w1bjqmnHT+q22FJtTIN3O9sw36GDf1YpdQDj0xQrVrnqvye7XnA4IIH77j36ryhQwefm53VtiY7N0v3ObBLw6jjBqzoMqTd+kFj+7x9xTXnj5JOckBEFE3RSWcePTg6LZbP+ojU62xah91PnJ2d945bkWf8Wf5vcXGx+ANORAIg3bWiX9nkxuGTDx05atyBD59xxhl5+3La7+Ve0JGHHVmU2iOOL1tG1qvsCw2baej07KyHhGhWDuzre2Zmb9vczvO6nUj8CJv2PSx1v9s9VscJ0fYFb3n0HBb6WTb1pIelnTQE3PPkGJ588ZA7uZCN//nse/jDn3zaCWO6TUyqF6nggtMM+yk29KOVUg84IkFlZeXa+T3b84iRw86T0rk3XtOHE8846o3WA/zsaweFNLC/A9ibA45tncCjxo+6zu/zNYEk/G9aZpv5PY4XPJvN0M07SGX0jOFJBx3VP8LV+CusdJOEZM+Hkyjcq+xkX63Vv23xDNNAQUH/2W0nSH6UjdD9jabdboyf+/Yd4jKG+/Y6hYWFhmFIFA4ZcVvmYA/fvMu0XmKPPuZFUml9orlTl3bcvluudeRtfv0UC/0Km/rCz6VqNZbs9kd6+JCL8+c//9Ccjv+pObq/JM/hWI6pB3Y5JLlepIB7nmzYT7LUj1VJ3b8oQWW1ybW79OzAI0cNP8n9M69BHkw+fczV7UfFhYzWpLofb+iz3zfV9WtNdfVKw5p4L+yUnj4eeuDwB/x+HyJOXgwbfcCE2DZ+vvJHYb/CRmjYlYLbtMp71vTIP2qD/e1uckRMsV+bKkxMVFZuSExvk7Vr7J3g19hrnVNmcEp+4jpesDmwr5s1fG9Pmzr14OQO8Xz2l2S9wj51xXJhx3Yw+aCDDrqy8MCBH3fv15Hbde5gFZ6aoO7c4lDBt241dPfTpJVxEHHBoTk7L77gsuNdZcH/DkjCZv+8M8/r2e3Q1CqZCu56rGE/7rpV/Y9oBseoMaOmuqJAr0EeTDptxA1thgXYbAN91ONSP8Omfp2lfpGlfolN/Tp71KwVCLbq7+eRI8dcISQ1uQ7MbCakpC0vnEH6FfZYM5ZBpXdMCd509U2d8P9U/vBHW/NJEydOTsqP5rPWkP00G6HCmQZndcj5FxFhXzrVh4mRsrKXM1KzMreMuxeqlH32ffXSanuw5JzOuY8IQdi8eXNg2IFDH+o5II87dunE3UelWzM+l/oVNvQjbOgB080gJLhTj7YbmdmL36Ff+38KDqeLx7O3vp7c49CMVZ4scO4Yw344KPUT5Ybuf3iSymqTa3ft1ZHHjh97ilsT5DXIg4knD7ul9VA/+3LJOutDQ73Chn6wWuhj7gmo/tN89kG3k33HTkO9yR41YwmszC6J6uKzZwwKB4wA0Ktvr3OSunr51gphPcoy1OMMg7t26nuHkPvlX/83XoKZxZDCQW8l5cRZo57yNhZ9Cjujv59HjBsxfB/zFATA8Pt96NCpy9tdTyJ+jD3Ws2zaQ2YSJ7ZJXsT8uR9ucZ6UEuMnjD+9V//82vxeHblDr+zQlIe9+n4mddQXwoqKi9ETjxk7dn9cu/+KGyHJwKBJXUrjukhO7GpYt++Q+ulaQw84LElltWlrd+nVkccdMu7ksOUwhReHnDD4llaD/ezNJuvs+YZ+lU198yqhux+UZKck5HDHdl04rW0G5x5GfMcOqd9k0z76eXD7jl0WM3PAZbbozUXPJsSnJG4vvBF6Zois/NOklZPdftu3Kz9OiXQ1/scuAoCtW7dGDRo6cFWXrl24bU47TmmdwtldMle52fjfPMELCwsNIQhDh464IuMAL9+4Q4bmsEed8Drs2JyY+hNOmdDTOSUh3ESuBIBjjjmmoM8BPZZ169OJO3RpH+p9Smxj2gCDC/oWXC+E+N85uMIn0JFTx49qPSiKRZKwz//M1C+x1IUnxqtWrXOtrr068iGHjDs5HHNIeHDwCYNvaTXYx2Yrsqa964DjhuVCd+iTarXOaMf9Duix9dxLp51wyYXnHBufnLKzy7Gknw6Z6lGmUNcJ8XzsxFMuBID27dt7CYS83p1ujGnt5/aFKcF2HXK5R+/ufMTkw47ax1Pyd13MTMVcLJiLBfNsyTxbzuNio/lRaDAXyXlcaDgP5/vO7xZJ5uZA/s8EybXXXt5q/GFjTxk8bNCH/Qb0aTzssMNO35d1Cf982rRpQxLbxdunf0LWHPaqWWsplNzLywVDek0LU/p7c+2effDZ5MLhg1/v0b8zd+nRmQv69Zrr5nH+3XzU/z/r0XNszptGutD9zjStOWzqKXdE6fSMtla33h358MMnXESOPsJrkAdjjht4c+ZgHxuZZJ3yuqNpun6Z0B36poays9rxwCF9Fj344IPtwi8wavIBxUaSyee+Z4ReY2mNvtaj+/cc/k1E8orOOuuszO49u9Z17pTHBX17vjt2/NhJt9xyS9QfdSMcNioMgEKD+Y+9wcwQYRDN5tl/SgDr8Xhw9dUzO+zLc7txh9iw4fPE9OzWPx10O/gF9tkPBqXVcZLknC65paZpAL/Q9yAMLo/Hg6EjBhePOnTYy67V/4+y6PQXPD8vf3V5zLgbh6xcv3p3+gVzDd2rF9H1QxJVqCLayM3Nue+j9+efZdu24ZE+e+Sxve/4bs235+/8KWgff7+Uh04Ali1jPHZ8sm3tjDYzshO/u/CcS8ZNnjx5W+sBrf1bv9reUDC+7WvffrPm0ONvJ/vwo4kevl3K1Q933bxk+VudidJqw0m2iZMOObyhsabu/bc/fldr/W8DohSlIgX30jCUqbBEP/J6fTMHMvFUsieqOtUn6xIgQnGSVSyRijFIxggpo7QiHxHZiqwapVQNWFZpQ5bblqyyKaa8qiF558Jvjt593jgK7g0081EsdqILF6FI7+s8k719lmHDhsmysjKFfW9abXi9pp3bLv8l9F486cInDDtaMj18nS2/eyhx9ZzXbu07vNdJ1czgva1N+HXD71mQgHbatuzvgKA/9fpLEjLzls8z6quV9EQBiWkMNljLhKARVdd6w7tz37+IiMDMcuKpIx75eukXJ+xcG7Kn3CsccCxxwbE72szIjv/u3Itnjp08YcL2wsJCX1lZWcORU8dPmb/oo0Pjs7TuOdKQlSC97bsADBONQGoIAEpKShgAvfryG3MiqNH9zp47J1upKEUpiCjcCRGAwIId8zKi/cvzfUZ1vqSGPA/ZHQy6sq0kO9WQiAmQBLXoLrpns0VybwcDCMH2KtSpSs7wbqrqeNDirUXBGT9ZylyjKWpFkGN/KA8NWU7UtRxozjozF0mgCNhPsLi/a4ctw29lsgsLC42PPy6zBw0oPHtZ46eTzrpZWEmS5NvvWXrBo4HQkEE9jh3e66TKoiJIIujfeF0CIDRrhtNWjPdc88mTJ4v8/Hx27yP/NwGEAdC5M8+tSO0Yv1Y1UHJDDXQUQHG9qrHpx2oLgPnq069mj53a/6GFi38YWrHVso9/IAIcU5JtqzzazGyT8O0Zp84Ye8yECTvGjBnjfeeddxrPOu/0Ye8ueemhXVvr9dSHTOSkCMybx3rH1/Gybbb/ayFECBHSj8i2pPsDjtmzi2RREVqA4tOdO2PSfHP6+I2qkYaoH+QR73WJMSjZaAKA4f6qRC0UKm27XkPtVKzLNYt6AgUZaARgEcEAi2gCAoJ0QBASCJzkMwxvHGQ8IOMBkecsZx3qUYFEY8OWrcHixY3a92W9lfDRprrTFxJRHVC6B1gm6186wfd2/RY43Jod+4LTL+jx9AdP3jrhwaDqkuGVy7aE1GtXmmbr5KyL3nr+o68LC2GUlu5TzQc3HTTU0oUrKSmBO/Ox+V79ci3Q/0sXq0lzNXR8/ws/nffdbUX/sq2jT5TGtz9q3HcCUVx9201mWl3cT6u3xngDpE64V4iDhgNLFms8NiXZVpWxZnpW3JeXXnjF+MMPP3z3mDHtve+8szp4/vnn95m79Nn3Vi3emTDmYqlPukjS9l02HpycrKg83Rg4qGDAQ/c9/tXvrWALW4vIDfZ55YbEVp63RppUMclr1PeNMnRbb1OZu0Kl3agtllsUG2tt9iwOKbHcZvMn2Im7ggjs+snqvXNiSudaQPDPD0InXDptgWWemPpFTJR/TUrAE0xkqmjlNbi9IRo7Cgp18pDd1mNwRjR5m7yReoRQb4vVIRX1RV0o9rVdesK8A+LblDd/ltkS/4YLtqdLxMwxOXk5X2ZN2ZB/2uWmCinNt52gjZpvMt/YsW77oaGQZYQt0u+8JABlShMLP/047dGXns7RIR26+5L7f6Q21LCH+f3/DZDwazCzP6dzzhfVxvrus76UVla0ML5brPFisaLKLUCbHlJNvIxEj1xg4QLGUyen2Loq2kzPivti1szrxo8ZM6Y8DI7p06f3fe27J+auWLQtecAxUp1xqxAqZOPRabH29s8zzex2af/64O2yc1xG5He4UZMFURhUBpZXPXRArHf7lIBsGB9nqNbkMpDOxqRVQeVbEGLvvPrG6G92Vg5aN7xtQSV+2bMAEaD1zyhU/u2TXuDzDZ8mxsV928Fv1PTzGsGhXhHq7Td0bsAFqoKFCltsCqrod+us1Beeu3XqRyUlpJutyuzfC5SwZMZ3yKHjnvx0+fwjxr8esvvlgV6/SYtvH0zYeuet5/Q6flLJTvd39e8EIAkS+pnZ9/e//8knL1y/Y+3IkFGf6IlmpKbEr+6a0v9fz939xl0h3fiXgeQvyBQ6Mu077r06L611q21thoPvqhChN9ijZ7PXfqTWo0rZo19lqS+ca+rsThmhtm3bc//BBWVvvvlmAgCMGdPeCwAXXTS9b/6o9J0iE1wwTdqP2YZ+loUee2lMqG1uRx48vP8XGzZs8O/h6O8LS0TOBnID7AUcWFt794k7giXzauwZinkmM8/kWp7B20JXfr++4aZbVtQ8OnLBZg780nOFKdvZsx3KlpkJv85uOXXpzMRcLGZHUMPMRZL28pezl2yPXlx9+6C1DVdfszN05YJqNZ2Zr2TmmVzHM3h78Kov19TdesZXm5YlRcYq+8sUhRUHV994dZd+A/twmzY53OXouFCPK8hKzo/m8ZMOGvXvUObh5w8EAjhp2pQrW3XPtDIPIu45DdzzLOjWk8BRQ8GdT4jmCWcMeZSZaV8L2v5/YMRdgNsenNmtdevc5ak9JJ/0Gqy7a4T1MAt1y2ahDikO6PTMVqpDhw48cEjf177//vuoFuA496K+eaPSdooMcI+p0n7EMvTzLPT4y6OtnNwOPGBon9XFxcWZka+3b+CY3XRT393KUevqbju73CpeEgYF8xW8y7pqy8bGG+9dXfPUiAUL2Gz592Ew/Kk5i6ZTdvbs8OvtOa+E5Y/VDw/a0HDtbbusmattvpyZr3Lev335ug0NN1z75a65rf8NoBAzi2OPPerg3n17bcrN7sCpmSlcMKzL1QTxuwufmrvZc8yBow58PqV3gIseh3qwwQi9wKZ6jk19T62hD3vMsGMKEepwkpcnnDHoLgHjv6vYKny6MG9J6Vsw8KXEjFTOGhjNeePiuE3XVE5LylH5XTuFxk8ccx2zswnbu+C48MILB3cenbZbpIO7n2jYDwddcEyPsXLaduCBQws2zpw5s9P+nGLhJB4AnLaAzZ/qbju9PHTlcuYrmk9g65qv19U9eO7a7bXpLZg5LvzT8hH7DRg32Rj5/S9X7opdVXPX5K3BWXOr7emhsFXZbU3ftiF47XVfbPsgbW8HxL66zNdcc03WwKH9vzjwoOGvmKYH+5vcC+eoIjRzcaNHj/oyfYiHpy+n0KvsUc+woW6rk6HbyoX9VEjq19nQU9+WOmYYQt1Oj+Ki08Yc92cmev9WS+Lze3H66VOPHTJw6Cdd83quHT5sxE/ZeRkquXViw5VXXn5w880QOPfiUw7rPDqthtLBBacb9iMhFxyXRVvZbTvwwKF91l8689K8/VmsyE2xourug3das74KA6NaT+ctwWve+6numQnFxSwiT9z/BFD8mpvouHORa0BYUfdEv82NVz9WZc2ocYByBZfbMzb8VH/tJe9udTogMkMU875Z3eaDzunltb/x7J7WnZlp8qRJj7fqlcpnfkvBV9in7yyXeuR9kvNOi+HcgancdXCamvGOT7/Bhj7iOaliR0L1Pzul/NJjb2wNgIr/m4b7uBuMAMDj9YCZU48767D3E3t4tEyHTknLUBdddPYIZk444tQDr8sZGs+UAR52pbSfYFM/x0KPuyzasRxDCtZecskl+2w5HDfIee2vtz2bu7Xxmmfr9eXMPJMbeQZvC1794U+1T46OlALxfzAofm2NnffdvHGWVD+dv7Hx6vurrMtrw0DZac1cvKrmzqImyziveN9clt+/IcPgMg89dswVB08cdfaCZWUZ3bv2VAXnBNTjbKpHak3V/TTBGf2Sto0cOvKGXt17rcxt14nbdGhtX/eVR5eyoQdcJa2MIwUfdE6HNwTM/05hY35+vkcIgbGHjnoQBjjrYGldsMlUB94ADiTENWT1Sdsa18XLMd3Axz5rqOfZ1E+z0GMvcdyqAUN6r5k+fXr7fQdH2GpIrK+76bQq64rt4Y2yPXTVD+vrHykCzIhAe7YE//8PAp1DoXl9lpc/021LY8nzNfZ0m/lKbuTpvDl4Vemiymed+vN9tyb7K0eXAHDPIzcPzOua/7UZ6+WMbomNF1521kPZWe157M0B/TIb+pJPzVDSaMmjzux1JwDc8sg12QUDuq3NadtOdx+Raj9RLfXdFYZufRRZXc+M4slnjfhTNXV/q7vFzHTk8RPHxkYn2K0PgnqQpf0cG+rkOcR9TgOPuU5Y1/9kqDls6ocbSI88JzbUNrcj9xvUa+X555+fuy8L45ymzu8srpzTblvw6rmOO3UFl1szKjfU3zbz3e+bXA2avX8++f9foNTcNXyHddWnYdey3JqxfXXdLdPC1pP/2HWQhjRwxrmnnJySntGY0g/c5QwZSj0EXHB4LrfJ6GgPvzBKv8RSX7rAa6UcRjxwatv5XOy4cGeccUZhl54drYyMtvbh10Sp11nqsz6TdvJE0gdckLL+nH5Px7pW7b9O5CiEEDh2StEJfl+MHnIp+HE2rDfZo15j036dTf0yS339WlIDjk0I5rbryAOHFCy67LLL2uwLOIq5WITp0ZU19xxTaV25nfkKtnkGbw2WvLVs98tdf2ew+v8cKC4Kilmsq7v+7Cr78t3MM9nmy3lz8Jo3vt5UlhUmI/6Ig1AIgdNOmzoztV0q978Y+l7LsO5gQ3W+SChfPjgrtzXnDU7V99eQfqDe0DnHQ3U6LpbPuGBKIZxRWxgxcvhtHfPbcZv2ra2rvzX0S2zooTcJK2eqyaPP73QHQP+1NSSSiHBo0biD4+KSd+UeTHzCq7BmrkLo4u/JmniHJ9S+Xzp3zuvCQw8cOP+uu+5K2RdwhC3BgwvY3FB/811BvoKZZ3CFfXntT3W3nxdW2jjq2/+9mpDZEbmV73c/1XVbcNbbzJcz8+W8M3TF+hW1jxwcDuB/7/qE79Hll192cIeuHbnHRbAeZ496ng190lzBifl+HnzQwFcHDO2zLiu7rT79OZ96jaU++mVpJ44nHjKt/eduN0mxctfK2IL+Pda3ycrVA4qS7GdDQt9VYaick2D3uSjWPunMSf2d1/zvBIkBOMnE7l0LPsto25qzeqRx227Z3LFjF+7Tr1fdIYeNvtYtxfzNPEc42Pxs62epW4PXfuDkM6bz9tCspauq5gxsvvH/DHmZx+HAXGJd/S0za6zLLeYZXGVPV+vqb5kZbsf1O9eKmFmMHHHgl636J+jpG6Q1h31q6mukkzrHV0wcPWmy3+fHwYeMvjSvax73HJMaeqRG6IcaDd3xdLI7nBDgY84dc1r4yaacOOXILj06ckZGjnXy4z79Ohv69PnSbnWC4JEzsr9ksPxvdbUiGQ7j4ovPOmbMqIPuHzV6+NMHHz7yoqtvcnIc+wQO94Z/t/u5LrtDs5YyX842T+dNDTfO/nxDZWLLTfHPFeF2CQBYUfPoyF3WlauYL2fNM3hD49VPzF3pHEz7A5Kw1Xnzq9np3fN6VXWaFMf3sFBP2n6ry0XEA6fmvyqdWy6ffPLJpD4DemzOzmmnjrsnYL/KUl+w0FCJh0L1m5a24+EZr6Wh2LFkI8cMf79dh1zu0CvTun2D0M+zqftfQ1bXCwJ8zMWFp/5XBuz7uPl/MxkV3vjLqh8srLSu2sY8nWv5cl5Xd+91YZfqfyXW+H3WxIk5Pt/weattwevL2HVLt4RmffjxlnCJ8my5PwC57YlrW+V36lbVaUwi38tCPRry2p0vBPc+Lnsp38Xe8GaeWDTxtG698rl9z1bWDSuFLmVTj7xHWplHSx53bo8nybl/dO/D9+b17NOlulVGW/ugc+LUSyz0NRsNu81U6MHT07cWF81OhDOU+7/WbY5sZSMLCwuNfZGOsAuOFVX3Hlxlzaxhns7l9oyGtbWPnBh2qf6Zm7cPIHHd03lr2be58bYnNM9k5st5a+iK7xeUz26zHyAJS0jMgj69V2Z1yuRZ64RdyoYedjvZbY+M4VMuOXI8ABQUwGRmc+iIgV/mtu/Aw09NsJ5TQt9dZeqcU2B3nRbHp1943EHhJz504vjpeV3bc6vsNtZl8039Cht67IPCaneWlw+f3qcYoH96/u7NcqyovuewavvyBuYZvMu6fMeKymdHNp2M/7Tb3y+XyyUZsbb+1iucZOrlvC10+YqF259qvx8gkQTCqHHDHm6d3oEn3+cLvcJSX7LIsFKPIB54Us5XPJtlQYGTgDrjjDO69+zXNZid29Y+8xWPeo0NffYX0k49Clx4fs5SPoF97ugET98BPX9o0yaX+x+eZD9rC33jDsNucwr0ARenr3/quK1RkSD93RTrfws4hlOJvarqwUPT/dteiJHs22ljw/baTqM7xR/7AXOxMZzKbPyb9RD/SxdRiXbyR1q2DVx83Zb65BNrFQfTTOqYlbj83SWVT7Unmqx+CyRFRUVgMHI7tX80NtGH75+OFZtqNLp3IdkmD2pLw/Z+R388eurChbDyi/I9999//6Lk+OTbAlFe+fEdiXrdToXBA4ToNojsTQ1b8yenDroUpaSIKNS2Te7MqDiJzd8GsORzA7kpEK3aEZfX1bZ5P+OkPu7ri/9pgDDPlsOpxF5R/fSQ1KiNz8UayrPDwrqt9fmjuiSc8B1zsUFU8s80o98FEmIiKOZCo330hU9uqkuaXKNUfYohc1Ojfnx7Yfkz2Q5IftltdYvVxCN3P/FlUnrUm3U/xcpPH/GpaKFx0NGS6kINemXt4usenvFa2rL8ZTYA49ab77wuOta/qm5TtHzvvihNUJh4vBTSF9Q/2Ssuvfici9oVzS6SL7748tuxcdGLVZ0hN6+Q2gtGdmdSQcvmCnt7ZwDYsWPH/64FYS4WRJPVom0v5Sb5V8yOlXbUThs7d9fkHdIjbsqKef+A4w8CSpm9YMFpZl7cxa9vaUw6wgEJtW8VvXzuV9vnpTvW5pdBUlxcDFvZ6Na96/TEdF/wi/sT6cfV4N55RAUHCr25dmfK7PLiW6hE6vyifNGzZ8+6djmdLohJ8NDSF5L4m68IWbGgMcdKvTtYGbU48MatpZNLVWx8jB1FiQpta5A00AJDQhhEyiKikNHovHrZ/6qP7DR9Xr58eczWxisXMM/g3fb0+mXVjxb+Q+P+OdcCPs0EgJXVN0+qsWfYzJfz5uDMz1/fzIHfSiY6pAth9CEjbmjbJo8HHx9vPcdC31XhBOGdTojjU8+eMhJwNHpSShQeeMDsjp07ce9Jydb99dDPsamH3kGq63mxfNN9M6ceMu6Qx9qNSubD3jPtR5Spn2Wf6nc92TmT4hrPP/+MfZpr8l97zZ7tLPjy+hkPMl/KNfoyXlF7//GRbNY/158HktU1t58X4iuY+XJe31A8G5D4tX5g4Y77S5Ysie43sGB1RnpbfdYrHtsJwg07eTL0oGm5y/k29rv9gMWNN97Yps/A7pXZbXPVMU/61Mss9VWrDd32HNIDT2jL2WntOf/oaH0bG/ol9qpT5iOUcYSHh0zuVkLuHMT/2RtVzBAAYWHD+XPL+UJe1XDLDf+A4y9zbQ0AWF9/613sUsBrGq6/5rcsdzjfcfypxx6al9eVO/ZNs+7e5ST6RtwjrDbHe3nS+UOvB6ipUG7CpEOuye+Wx/kj06w7K0k/y6Y+4Fahc44z7Zzc1lZ2To593Fue0PEfgLMm+PmAST0fYGbxX1WO+3tdLABYUTe71aL6+4o4PGf8Hyr3L3Jvi2RxMYtNjTe8w3w51+rpvLz6riPCxMmvgUQIgeGjBpVmZXTkcVdEW7NZ6LurTNX+HFjdTk+0rpxxQSEAFBQUmM8991xav0G9d2TlZvNZ8031Khu66CWhc0/2q4MmDLLbt2/P2d3TOXd0WsWhU8aeapAJ/IFd4f/f+mfhzhydoiZv7h44s5RATASmf6jcv2jt83nWLOLq4JRjd4S8q6KIkOzf/tDiyjntfo3Zys/PZ601jRo7/pLUrEDV908l0tdfE2fFMh1+mkE7G8qNTxpefeadW7/OWrhwoXX6tNO3R4vY3ZRZD5kCZhA8PmJlQRw4ZvhzKamJX+fndLv/itHFBa8//fbDNlvh1/1nHzSfZrP/t83p3xUHupZieeXsgkprZi3z5bwxeMX8YmbhNITY+z0Ju1rjDxt9esf2+Zx/YEronlroUjb1lLeEnT5FcOF5uUvOKTl++IGjh96S1SeVBz/uUXfWG/ol9qsDHyS7w9HJ9mP339/B6/WCwpLkPyHm+DM2FTEzZs2aRcuWLfu3nz8/P58BYNasWf9vrQMz076vRylKARShqMUauJ//P+5kDCdpV9fdMy07sO1+CcZPDf7L2geuvJl5tiSarH5h3wlm1kMPHPDeuuUVIztP3WIff22dlDAw50XF856DkLsCYLLQ8wSbxxxpIjdW8JLtjfajVwlP24YeD338zA+nK7adqcbFxfyfOPyTIobVG3+By9bUCaOoqOg/tU6cIoZ4/hksioA7gPQ/5fM7gTlhU/D6OcxXcIU9vX5ZzX1d3YB+r3siPJXqiisuyi7o12Nnq4y2+qinvdYLLPTz7NEXfGDakx4w1OXLTfs5DqhX2W9dswF21wsN7n5I+zn8OfuBP19b97sW2O2bKtCivSTBNEyErKBvzpw5CUuXLo1fs2FNXLCxPmBZlhG0bSmZyYZqih+EoOaOIZpJs6WJTPZ4PFqysHymryE7u111r069qg4/7vAKn9dfFwqFwC2b9smioiL8gWOc8UetiZQSHo8Hy5Yti3/99deTfvxxSeK2bbtiQjpkBoNBp96dwMpWEKx1SGlmthQUMZkG+00/x8XFNbZv376mT58+uw8//PCdHo/HtiyrBWCKioqotLRU/13WxQFBCS/a/WWr1nFzv0s0VPLGoJrXxnvDgbMxWUymvb+3cFvYKScePXrxoqVv7dxVJQffuNUac7Qlk2DCgNA2NG8N2fLjt7X4pjQWibUdbvz2zSUzQioY3r/8HwOQcENhuG0lmVnec8/tXb9c+HX/dRvX9qisrugUsq3cxlBDom3b0UorqbUCs9O4u+nVXI6BHIfM/Q9HfI9AIAiSMKTUpuGp93q8FT6Pf2NsVMzyrFa5iwf27P/tOedcsFAKo16zAv74eef7uDuctwq3xSkzi1mzZvVe+MPCoZs2bepdVV3ZORhqbB2yQvFaK6+tbKfNP++x+mHviQF2fyZIQEoJwzC0Ic0aj+nZFh2IWpOWmr44P6/rN5dceMnnHTp02BoGzO/tQ/zHgMRxp1bX3ndCVmDzE4IY6+tjp7WPmv7gr7haTe+56NjDDlu9/Kcndu+ujc0YvwMdDq6Dz6+xe42Bnz7zI7gl9cOC9AHXvvDkC/MVVHjX/Mf05iXXtCuP6cW1113T84OP35m8afvG8ZXVlV3rg/UUCgWhtIJW4b7MBAKa+8ASnGCKmvY/nExG+GdoDrbcz80AgZmYGCAGkYAQAqbpQZQvCvExiT9lZ+Z8OLD7Ac9ed81NZfWN9WEX568aRi8BKCklHnrontwnn37uuI2bNh5eXVvdo76hHsGgBR3UTevhLqXe92VnAOEWSe4yegkev4FAwI+4mPiKtNT09wf2O+CZRx545I3autrwe/pbrInTHvUltalx1tutvNaYXbbevnX3iB7d0kbuAIqJaO/3JAySM847OW/x90tm7tpUP5h9iBEB3uDR0R/kZ/WY/cpbT37daDU2rflf5i/vo9XQUkhMnzH9gA8+e+eSjVs2jK+qrzKsUAjMYMFCEQTALgSapn0zNQFDACRcjAgCub8jIoojKeJIaB4d0fQtBjvGSCsNpZXUYDJNEzGBWLROzfpkWL+Rd9x9+32vNDhA+bMXUgJQ3378ccq06RdfsW7d2qmV1ZUxoXrLta/SNrwCUSlE0emgqDSQPwnwxRPMACA9QJOD2XQuNO9pZRNUEAjVAI0VjLodQO02cO025oYKzYAWAAsZTYiLi0V6auZng/oMnvX4Y49/YCu7xXCav5LVOpImqzW1L/dI9n37ZYyEb12D719tA1ee44DnV61b0/1azp/GbHtrS9Swg4u2S0Gs3bOhqAii9C8cffCbAAkjm5mjho0efP2KdT+eXVFTIVhrSDIsaBKsIFi7QHDHNFLYOhBAkojCX4s9fiYi3C3RDJLmdxZ2ManFBuLwzBkmrTWzrWzBAMVHJaB9605vnDDh1Cumnn7yYoCJmfEnbBQphFATJk04+PMvPru3vHx3tlWvABi2P55EWk+izD5ASj4hphXBFw+YPkCYgJARFrPpA3PzB2fnJAi7WswAa0CHgGAtUL+LUbEG2Po9Y+vXwO7VrLVtk4hiER8fi9zsDnd/89mCS4gotC/DcP4cK1KqNjbedn9rb8W0KqUbttX37t0p5ogVv2ZFIg5j2uNgk38nQ0W/BY5br7+146MvP/Dshu3r+1i2zYY0NDSEthisEAZGMzgEAAEiSRCRwBBNP2v+msixFM2uV0Qc8jNfw/lueO9odr7WrhfCUJZlEYNEemxmfa8OA2548dnS64lI/8EbRUop1ZAhgy5c+MO3t9XW1oItw45OE7LDOCBnOCGuDWB4mt4XItaoyWISNVvRn92NsFfGDK2bQdKCxwLQWMXY9gNjxWtMmz6H0mSTL16KVqmtP3jk3seLhg8fXllcDFFSAv3XAcQJ2Ffu/jwzJW7uogQDiRsazWey/cVTZnORnEz7FCOFD7a/ndamX3Orbrrp6k4PPffoB5t2rG8tSFpCCJM1Q4cAVgDJSGAQkXQ2AEnnpBTS3RhNX1MTmJqARBFWZI8gvvlEda1GOLyJOFnZ9bZZOxtLa6hQKCRjzDi0T+36zvlnXnTc4YcfvvuPAElRUZF86aWX1LARQ8/5euE3d9fV1muhPGg3CqLbMeDoDADaeePSBKRJECYgjfA6hD8/o2UMRpE5E4faYnaAosn5nMxgDSgb0BZgWwA0gwxAKWDjZ4xvH2JUbWbbE6/M1hltPl3z9rpR1IaC4WDmrw7Y19fdXNImUHNVtbIbNlR2LuiadMKPv2VF/uM4+59/OOdw+27ed7GTLzj8i/Xb13Y2pGmD2IAGdGPTKcYRFoGEQZAy7FYBSgM2N02FYRDAYVC0sCbc7Goh0ooQpCSWBmBIwDQAQzr3WDnAoDBAWLP7L4EVAE1sWZbt5YDZMan7olOnnjFmypQpW/8dkIQt6tFTji6cO/eteVVV1VqSSb2nEnU62NmkRATT71gPaZIDDAMQsikGAyS3ICx++QgNu1jNQIH7WbVygWIDdpBhW4D0ArXbGZ/dDNr+g7Y8Sdpsl9Xh6ZWL1hxv2/ZfGtgWc7GYhRL+Ydv3KVlJLy1ONCl1Y9DzUBvflafvQyzyJ4O3ifAgoHQvd6DlJC76+UaAfPUVU/UYmP/s0p+WHEMgGxIGAVANzilNEo6WlojIAAwTkBLQ7NyokAUkpjOnpRCio4GYaCA6mhAVxeT3Efu8gNcPeA2CaTgnLMBQihBSjIYgUNcAVNYwdlUA28uBneVATS2BWSDgZXhNZ1Mq5Xxq1iBWgFYAKwYrgq1sK8pKMNsldf/yow8+GkFEod/J8ISnK3mz2rb+dvPmzZ1hm6r3yRB5hxBCjYAZRfB4mi1HGBwkCZCAENxypM+eAImwmJGORdjVCsddzC5QFDuf3wbsEGDVO38YqmXMLwZ2rrRVbJrPGND9gEnvzv1gzl9NAYeBsL7u5hvbBGovq1J2xfrKwd17JI/b5BS6/TVWJDxKbz6W0jCU6F8bKrq3y9jbKXniyUce8mbZ68dorW3DMAwIdixHBDiEdFwq0wMELaBeMeKTgcqdhKHjiJ++2YOMGIE9CH+ODCd+/evm79UGGZt2MBatUfj0B4VPfyBs2iYQ5QV8ErBtABqsteP6sU1gxZDKMINGtbW1Yv2A8YeOvw6EC4uO2P+NUlhYKMvKyuwDBvefunP3zs5sGXbb4ZCdxhCC9YAnmmB6nSBcRsZeDEAxiAEtWsZZgDMf2TWubjqlZcDlLBchTJqzG4QxEUgQJDVbXyJCqAHwRAP9zmF8eIVBdTUNvGTNoquZ+Q0isvGXjljOZ2bQkh0FD1d7550ZJ42EBN/SqQCunu8cFfrPBkUpJu8xjRhAMYuvzvw6NTFqUyZxdYIQKooVeQRIC5LVVSppYff48RWuJ/UzqQIxs8jr2/6rtZvX9DakqSFZQgOqIcKlkkTCADweoKoWyMplXHWRwX36Ec690gaboFfuFey1GDWNQH0jo64BaAwBDSFGyAKCNhCync1tKyd2kSbgMYCAB4jyEeKigeRYICXOfWF39N32Ko05nzAee9PAtp0SsX4NZbtsjwqDhKFtQCvNXOPRySqXRowc2f+2G29b+DtOU2JmMzMr/fttW3d09sWa+sCrIaJSAOF13CrTcD+DQU68ZeDnQXh4VxA5cZnRzOgxmiMFDltBHZEn+ll6pJnl0nAsqW0BoTqG9ACLnmV8/7TWsRmGzGvbdcJXHy94/a+eEBsOyjc33PhCpq/+yN02r1y3Y1qvPq1a1f8ZNHQYGJFJyW+3bEmJj32ntykrhxiioavkhmxDcisBleQ3pDABN88LhKCwpiHu7vzAZeeFLaDxM+txypSDdlbsLCAIzcRSEKAs95gLg0M64KioYYwfT3zv9R5kpTjJ5JzOAi88pTHsOE2mYNTWE4cswLIJigHt5P4caEYyOpIgBDVtMsMgeL1ATICRmsho31qjoJPC4C5ATipwxniJQw6wcdUTwEffeBAXxa4lYQccCtAWQ9uCtGFz3fYK47sF35VIKcaXlpbu840Jr8shhx0ysKauJo8V6TaDWMSkE2wFeExAuOeyIOdBoqXNBOCwUQCkHyCDYTUA9VUMq9EBddh4Sg/gjQI8UU5MpxodirfJKtHPvTJiQAqAJWD4CHYjo+0IYM17xI11Fm8v3zJFkHhdl/61sXERisBcSqtrWz3QqH88Is6gjgnRc0YAeHP+/FkS/94k3D0OsCIRthavb+ZA9/iHxnrNnYd5cf+IaFNnmHBZHPgQnkkfgkatrZlAoXrslrGGFpkysZ3zlKW8ZwwihZCqa/9OL67auKKIQIokDHCz9SDp0LdeH1BRA0yeDH76Dj9MEcK6bRaK7yWaO4/g9xMsC8zk3GQhnRilieUSDqMlJUFIghACQhBICEBQE7Oj3Y1lM8FSABMjMV5hZIGFaeNs5KRKKChc/JCB1z/zIS7AsC03YLcZ2mKwa0XsnV7E1LXWI0YN6X3HTfcu3o+A3QBg53XpdMOqn1ZPZyXsYVeQTOns/MTjJxgCMAzHApJBjmWISN1oGyCvkwrbtkxjwxeM3SuA2p1gq57B2o0aBSC9IF8cUXwbIL0HUVZf4qhEgqp3wBFev0gvVKvmYeOW5cQhwgC+uod51Xu2SMmO3XnTGXd0POmCkyr/WjfLCYpLS1kMnXj1gjRT99jaaJZm+mceuR+U72/SyuF45pP16xNyU1451WeWnxBvqHzh0qENUAhZiRUhFbfV1votUHStQmBtY5A2GYIagtSqMmC+c3mWz5pSFfJ+FO+94kDHwsGZveCaO/XmC2+knFp84kFaKTIMU5Jg6GBLsYnhAWrqgIGDNB67JQBThPDpDxZOvlzQlu2ExCRiEODzuK6D6yO0nNAaoTVxTQmjWVHBEaelYQAel+kiAdi2gdKPDcxbYuOGExsxoqvADVNtbCi3sHydB34/Q1kM7VKqLBikQEiwbau2wVz07bJjAUyfP3/+vvrB2jRNVNfWDLQbNeKzJMW3cTal6SPHYlAT5d0UE4RpaaVchqmSseBxjbUfAQ0VSrFmKQ0hpBRuAtWhdjVrVCiFzQvZXvWOpKROQnY/Etx2kIQONQfxImKbk3DcSyKXXndp5bQeoNUfkLbsUMozHzzTE8D8v1qvNh/FcvJkstfX3zUb5u6eAaNx1IIdZRl9qHDrv+tmhenkotksbzv47mmxnkcvjDN0ruMuEWqswKqQTnivMZRdKkTV+V7vmkJlJwWz/CddDYRaPNe2xmu/BcwpGqEogCCEk5U2AGDy5MkCgLrnhTsH1QfrEkgIBWLp+sNMYSpXErQGohMUHri5NQc85fhupYWjLpAUtIDUdGKlwxQuRaQ0qAlkgsgR4QnhJsscPQrBQRM1Z8wJ5FgDzc27QQhGUhzQEDRw3sMBPHJuPfq3M3DZEQpT79Yg07FMZDtA0wKAJUDRWtieetRU1R7OzMVEFNyH05QA6A0bNkR1792lAxiIbQ3yRAPKanZ7hNjDBYoAhzCA6p2MD0s0tn0Lll4tUlISjKSEJMREx+z0en1VYA4KITQRzJBlxdTW16bW1FabO8p3YMcSS32yQcq63Yq7HuKARFDzIRKOT8KkmHAIFGjFiM8heKNJWZYtdu3e2gnA/NIdpX+pRH4YZmmgBNX17V6tMXcWxxkUnxr4bgyAJ+bj97tZTowwWS2tKO2VFrjuziRPcCigUWNDN+qk9+uCGQ9V1R31bs8MqgOAxQ0XnpltcAKMupk7QleOr6gfNqlT/JCfNm8uDmRmonFTrUnwhgCGx5EAOvffAIDS0lICCJu3bSwM2UEWQjBEcxIOboxsmITK6hCuuSyDu+V6UVlbjzNKDGoIAvEJxIoBYVCzbMS9e0waDIaAUETEEExM2tlO7LwZ0hQOWIkcaa8iTQxi6Z40DvMjHDfC52XUBQVufMmLZ89vRL/2XgzsqvD5UgNRXtc4hYFKBDALFR3SjbuDHc4//6yeAL76rdPUFT3yTXfdlGYpOwkgxKSDhOFYkKaNGbFZwyy7dtdOAfjsHsa2heBAvBDZme1rOnfs/ED3nj1fO/WkU1dmZGTUuJuEAcjKysrAU089kvntt4sOXLdh7fkr1i/PLa+sUN8/IUVshkZ2XwEd3AOMEQAJA1bbgD8B8MURGmo1GnVdWwB/eZsoItIOIzRh+bbG4s9jDD3MlLWHAnh82O9gspxAnIioVK1r+NepyeaS26KkFaMhUB5M+DgU6n15q9ixnwFBAEdjLZ/gs1bFcrw65fydje9Rsm9XUYpZ11MG5r2/svrjQ1rFDl0GgDbX3OjaZk17o3mVxzRRV183UGlFUhiCyJE5uCachAQaGzXyu3px1pQkAKtx21MSi5YDmZnENju+N0nX/RYOZ8NBAQr6tLQ8JJXHMMiEJAkhJIic+MPNMoBJgQ2btccSCFiCfRa0ZhCEZuVIS8IuhhUCoryMpesNfLgUOKQ3Y1RPgY+XKZAhnESbE72B3PyBiFNK7QqJH1et6g/gq9/quheuAFy9YnWSVtoLEPsTI7RjFKkpc126sAHRgBEAVn/M2FDG7IlmymnVbu1xRx0/Yfr06YtfLn0FxVcU7/mSCo7tr3Reftlzl864ePZXiz4fUbm7Ri17VYr0Lg5jxtrxTpsPo4iH+4UZALyxRHVVGlpzlkMV898g3SiWQIkdVFGvAzXDvbJ+4KLKTxKIhlTsj5vVDA6hN9bdeHOGb/slEjYqbV95XajdVYvKjn2k4IDVWV81nvK+5JgdBb4bjiciN7V9z1ZATt5Uf/dVqf5tJYlmbS7ok7fWVy4emR3fbQ1JxDkqONHivRjhN/jSEy8lT7v25I5uLQK5nGRTaCAlobZeY+pxXk4IbMXStRYeLZWUnESsXHA0CfEkwCEBWR4DozGahWVKAQmv1/9lbCCuLCUxZXlMbMzm6OiE2lh/rAYA0zAQDIZUQ0OjKi/fZtSK7akbKlYfXGnvOEUHGj2GR2qSINIEcl0uUgBD4L0fJA7pbaNfOw/iYxthWUbTe4Er22CbQNE2lLBQX9cwiIjuLisr26cbI0hEa+e0YCMQoT9Dc/yBpnirORWpAawtY9hBhbS0FIwYOvLs6dOnL87Pz/d06dJFzZ4922V9W0pNZs2aRVu3bpX5+fm7161bd9yRxxUt+r7m26Rdy8G71jC16kqOqyVb6rPIlfmF35s0AdPvZN8hdawgCcV/S6NJDQCNwVbz6ryLrFhTpkXR0sEA3gBKxb5k+R1wTBZEQm1pvOFfGd6aswCN7aHAZ+VVo6bmp/ZfCRyHFdXPdYv3WiPrsBPrasqWrbKuyAyGAsu6vHX5A/OLhlFrOuvqDfX3Nqb7t96UaNTk2IHXSwEuMMStKYAFhtEAsOt0gI1Zs2YRAH5x7jNtQnYwngTB3YGOi+VuAMsGUjMJR4xtABCHx16pQU0NkJbuGCUhXbrWADhIMLckQ1perRSkx2OuTM9IO/P9d+Z9qOz9Sj/MLTp6wuzvK8rm1Hhq4n1RJksvkSABoQlKAV5DY+kGieqGELKTNHLTBZZuIPg9DNgOxiUICgD5tWAzBCtod9VaS5cW/E1WJxDwesMsQxNDRc2iQbhyfjQLckESaKwByleBhQciPi5h6V133fVOQkKCKCkpsZYtW8ZEtDeXJPwUurCw0MjJydl6xOTDX1q9ccW06qoGVf4TZOsejlvKLsUbdoEjpToAgYSTE2EAHo/HJ6WAsv968R+hhAFgS8KRSxOtZcuipOzhN2tGOABZuk8x0fz5s+Tw4aX2xrpbb3XAwdgajH6hvGr6qV1SEVxUc/tkv8js1d488uVv6zefE4D/0gTfV8VxRoO5RNfuXNUTjwxDWWgBn2a2obNu3lB3X2JWYNtlqWZNr40Nj5aYnJgFbADIUw1oaA1BBG2E2ZwN29Zl2coiQaRAkGEWBi5FW1MHjBoAzk73YHdNI977RFNMjGQNJ+nlStsB0jDKE2AoHwdVSJjk21U4eMTou+66ax0AgUKIQhQiNTX1Zzcq3KAh7N4sRaksff7VsoOnFE5fUvX1Q3U1IeVjSYZHwBAGBAt4TcLOKolV2xkFOUDHVgKLNhAMQ4CIoYUDYGKCFkTKrxCsCbZ+6Jk7UgFsjVCN/rIFEaL5N/ZwqSIl+5HUK0kgVMkIVkObphQ+v2+xlFJrreV+ZpEpKSFxgc/rQ5WqR8Nu2qP+ChG0lpMHaiH2DPMjhqC/rfELgZ2gmuwt9Td+AzPYw5T1AxzdDO2D9ZgtiSbb6+sevKB1YMtFgIGtwegX31hy8fGn9yFra82C4UFd0bra8+0lfqtDSi4PWRnwfZhkyp1mjR1b42vofE2HjhRkBhXgQXserzDa0HnTtzZc3yndt22i9q29kkKtawALtora6mZxCCiFEY7a6hobcjQ04ObwuDn4I4eCBIYOdAj4z3+oxsYtAolJiJCvC0eI12hANvqhyFbE0kxMSLz/rrvuWpefn+9ZtmxZCGXQZfsYKTKzplkk3jxg/nNd7s+YVU7bM5UlNYQmhgWQAcMjEQwJrNouUJCj0C5VAsQQgqDZpWHh1m4ZIBHQbFfYMd99tyQdwNawBd1nWWfE5nPEhy4gGC1aVjiBOkErDRIEaC533bT93aVsGEadEAIMhrapiR3nJoEBtaB8W7xXBkEwDBLhgZ1/i3x8PvIJABos/xfwN5ziESrvu90fZlIyNhdzsSj5BW3W7LAyuHrO4ETv97cAJnaE/B99v+GiE07vQxbPY8NiWPV6+/pqK/5fprHlBL/363gPGlBhZdZvDKlqK/D5iUsrH11OdPIHzLPEMAzTzGW0oerUqcvF9T7SGTGJsqYrIKG0XOEe104oXebu1aBqzNBNBR4Rp6HL6fuigb7dBQADX/1AUAwOM1bN6lwNavRAsIS22ZAkddvsNq8AoC5duuw3905EjGUgMVrWxXni5xumABNrKAI0QdkaVsiGZSus2+7IULKSBEyvQz+Q2Sy3J8PRSlFAK4CpfGtl68hAfL/fW7iPC0fIHyOz3C3Oa4Jlq+Dv3VxKRTyt2CPn4oohHdVvMzfJTYVo1NId/JuuMGNVT6lf1NihUJRBcXG+dV0AYBa6/GI/3yIs5QWbORDwLnsoWmpZYRm7Kxv6nzquIwUX19wx7LuBF8/fZsy9JMs3LqOt0efAeO9ncV40YreV+GN93QmDgt5N63JN7t1obJ3ouGrz3cQiIzs+viLfe+vY6IaRZ0JUBgABpWNWOq/ehZu4JgLBtlUGRx4uESeSbQPJKUC7bOdzLF2t4TEjTH2TMg8QQRMgaGYm0/Bsueii6SsBsNt1Y7+vwh0ghqZYT8LnpjTBslnmSuGCJFbYuNv5ZnoswedlaDceIjdpJqSTXRY+zRoattYZwL7Nj9Bat6R+JMHpcBlOCHLLfESThWGEQwrWysTv9HFstomhnZxRmCmUzTL6FmJgt/5MGM0CSCKCrZRiZuBv87NmMQB8tO2onywYayUMeER5d+dnvxSHTBZEJTo14e6Lkz2hvBCAmlDWxZ3ih/xUzBBBuW1Slrd60Bb5fp8q9cHRUd63uxoIUYWVVbuzIf/1GvuLHTH1BZduaWx9d7Td83YHIMPCxAgv4AdNZk3a80HvaBll1th2qCGU86P7npoAwkJIaFaJ7NxoijDRJARgayA9DUhNBBpChI3bmDxeJ0Js4YczIGyPq88GfD7/+r59+9b9O/KG1NQiBsDRnqRVEgZYaGLipiCVmWAIgV01zkskBACvqeGQ783Wo2lT+ZzgKtgYTN7X97C7vLK+KXnJbqaamiMJpj0Cd+FsVE8UwRMNKK0Q0qEcKSX/DhUr1dZUZ4asIIQg+BPgMoaO5aAmGT01LzA3M2uawUISQlawXjmm6G8BCBExM8R5HSlo2Z7VAMGgYDc34uS9SUiAUr1qd1lWvLn7AkCjIhQ/Nzv6xCcIAiVEOpUH37gx2OpfySpHRPs+HGBAo9bKW7utodXT2z1PDa2O+vSjzref9GVX/4zzOsWP/wkAIuVFP+EDTQT2SDUK8CDIcumWxQetcsLSkiaAaCklpBCJ4U3VZEDc09BWQFoqIEHYUSFQUeUkDVvIt8nZKcQCTMwEAdM0N9q2jX/HwIcD9zZxmVsFpCIJAeEg0GknBEjBqK4jWDYj1k8I+BiWVhG6jObgWngZTIz62vqofX3t+Cj/LiFIA6BgtevCRLpUFCG+lA7lzQz444G4NiTsoOa6upqBa39YmxgWQO4LrVlWVgaPx8ubt206pL6xHqZPUEL7CLdRskuQcIv4KKyRUBYQrHLqU0xhblOs/0YLAsyH0+TNhmcxAJjC6ugs2t68i2VEBI4OfH1ujEHxtUrUNdQXXLGBz/F/VTP9/AW1l18VI0aaWcHRX2V5a5J9UogdwZT6ymCv5Rmi9xqDY7ex1h/iEEhnLEPLBnPMTJOpVC3fuTPGK4ODgRAs9n4wfDjZTt4GzRaEnDlbMS1kUk1ZYoJmIDnR+fXKaqAhyJAGt6Q3hVO7QFq4Zp4ghdj075r1klkOkmODGTuJRR1JR53MEXkDQUBdiFAXYgRMRozPoXdBGkza6bTj5n+EyWDSkNKIA4Cysl8mDEpKnNc+9tipG6Vh7ACAynVgjrQcYo8snQRgOMye4QWyhxARG6qyrjLpyDOLSkzD1G72XgIwwl0iCwsLDefhdGR0mTX79NNPnrx604qhymYd2wYyvTtBuxWEJMPy4bDlcoCq3TikfgejdifD4xfwewPfA4zCQvztl83epYCCFJzz+YZFiY4Mrbn0wsnNlaqV1d+mRBk1xwNAZSjqqbYJw7/fXRmbprg6pk6u67rDnv2yL/Degx4RMnYHU7dt0JW11dH3jNsm5vUb9ObjRwyIvuss6kPWcCqz9yzQmj9/lmQGeb1vjIgxgllBXa/rQqlzI+OPppO9Mdggtba9e8YfTbw6GHGxTme3qnqGpcDCbd1DtLe6B+d4bWio3QYAhX/AXenfaWy9YRq1FB4OTdwc9wig0WbUhpzXDnjJ8b9lOEPvgAJwC4zAML1m7M8/7c8PcgBi0qRJNVH+qG/JZN6+CLp+p5sMBYGbaLKwlWKQwZA+gh0idDiYkJxHsrFaq2VrF53da1CPuz799NNMj+lVAOyysjK7tLRUlZWV2c4DthSGYmbvCadMmfbKe6WP1YYqAVtSl6PAUWnCKbQy0TQ1niQBBoMNR4qjtFOlueVLIFTH0uP1qE6p+fMBYNgw/G314DtdV8qy5JoQLEhSKcnx36W7MQo1W5pZEgD88vPjYgxvaq2y6hrsgn8xg3p6ZlmdzbOfSQtOnpfu39I72ggGauyE9d7K80YZ5HlaKp+q5Y07abJQs1n9oqXeOWwZE4ED5vZjDVJco+SPVStO+cwhVybrPaUmQmstsJcuG9SULHP2UX2jI0GhPU9OARALEAs3AS9gSm/9H8ChAwDGHti/8dKvuZ4Ml4S2icISFRJASBHqXYGm30uOmE+EA3ln42ilwC6wla33adBOYSFEWZnSWa1aP1NeWT6udruNlW8K9Dmd0FjFID9BeN1uJcIlK4Tj9mgb8MUSCq8izD1LiPoqSy9bs+jco0854ri+w3p8mpnW6vtAlH9TMGTVGtIQfr/Xa9l2yq7dO/O6D8wfuG335o6NwXrY9QY6Hs7ILzLYqnfZOPezw62tcbkKWA1OCXTFGsbqt6HMOG3EBGLmvfD8K8uAv7bDyZ5XERyXtU6nbWu0t9THGGbAS42tACxDBJM1DCWquJiFT95yJCC43g582TF2zLKKiu/iN9Ojw1rLk3Wq/+MpsbIGdSoBm0Le8vq4GdNb2Uc8uqVqyVN9QiesAhdTUXPJ2V7imxK9dMdLHaLN78cCgurtuGf69CEr3Ix7T4CgRWfQCKY3DACPJ0xXuuxIC/EPt2j65sayMAwj+IetbhcoECySzcLGsLyDBKC0U6kIAFFeAgQ7XURcX4iEy9GRkxi0bXufNkpZmZOE//yTr+ZkZmf80Fi/vcfyUmHHZrHsMJaggwxlEYTH8eLIdS8ZgDAYoXpGei/C2HsJH5eAdv8Iu7FqR+LO8p2HLvEtPtQwjWZVLhGUUggFLVghG7Ck9gQkdTuJqf/ZkrXFTX3FOPy53I4uygLsRqcEumoT46vbwQ21NmLS/eie2+PKNV+8g6IiUGnp3+lczWKgBDUbO1eqzosqCSJAVJvlWI2lrpCbBRHp1TVzugQM3RMIUkjlvg7YiI9PEovWez+KTX7mrizP5oENWqlQaNCCoHy/W5Z3Z6/19S+G+qXfclIxnyicfN4vefZdiAh6c/2qGVHSiC63rJ115d0fAkDDMEsBJWjhYjlbWja5LLzH5ne0WM6vKpfzpz0CdG7ZqofADFvboT9wdTncSSWcB4i0XhpA0HbegMcMB83s5GYkNyc0w62qeJ/rELioqEgQUXDwoCGnxcXHhmy2jC9vI/XNvUxWCPDEOUG5bTM0A1pzk2hRSiBUDaT3BCY8LXDADJLp3U3t8RoqWGfbNbsa7eqdjcp5NKj6ypBNmuzYdFN3OIRo7IPAoEskO3X2LRW8YEC5ryu8gBEDbPiMMe8KcPlPWkelmUbn1l2ufu3Z9750KiPxtzb4bgq/Q91qNYwKgCCFSnfzJGEQCQDwi00jAxLeatuubmjoMcf5WVZNdtwQX4xn1WggiGorY3utjv42Q497e33Q84iHW7/IXCy6oIh+IyuvVlU9f0C8p34KoFBnJT6U3/qg3W5VYkuxYtNSG5FuFYMj07HELZULglv2sqLmtgOORJ7BTLBs/ceac2rO3Ifp1DBQNQMh99UMkwHJTpIsTPDIyCOBwQ7U9+kqLS1VRUVF8qUXXvp6zMFjjvliwWfP1NbU+pa8YNibvmLR7VimjuMFohKdDiPKdlyscOWflICqA0wvoeB0QvfjQdWbmWq3CQSrXOm8u8CmnxBIYcS2JkSnOcgPVbunDjU3kHPq0QnSBwg/Y8ciYPHTzBvmk4bXNqIzPCI/q8edn7/9bbGGlr83D/UnUL1EJK3DGq+qAAiGtJL2Jmz0GHWDGBYalW/h5sXdt63kMV4iCq6oL54UbwZjK2xjy1arZrOOvv4M0dj9836+p48Aal12ivSvCB6xZAl74v3X3BOQ2thly81bK8bewXwRAbN/5pIZkXKZPYMPavnkLTfqHo8ma+I2OHPa+IT+OEpxluseSYeU0qJl3gHkWjcwDNksQ3fKBh2wsJsfICKw3r9KtjDz9Pabb7886ahJm7748pP7Kv1VvWu3KXxyPfGPc7TOKyLRfiwhOtOpJbfr3AImE5DCOTxCFQCZhMS2QEpnail+dLMkOtyXt6oluFk5dR5MBE+s8/l2LNFYXsr6p3cYViPLQIoQUYHYLXlZ3S57/5XPnlHa3ie17F+qzIJmkNwJR3yfEs6FuMpyPW8t+wya1YMgYGnzbYd6hc1cLFbV+reUq2DtNtu8Vkm9K0alPFWJis3MNSYwWbsC1L1eCxeebvTpU2ptrL/1rmQz1NuGierGzMv6t87f7ViWn/+t0QK4ezQFaGaxABUusaJmJpjdtqHhFJUrEW4utPozVtfVPxFFNJ9zA2NXaQER7mDobqywTkqAoJpa4dLvyc0oAPLlF17+ipkHFgzofsrm7VumNYTqu+1eH5QfX6+x+AWT248ldBgvEJ8NoDEs4nSALYVziKig04wBxC0WnZr6D0eUKWsnOag0ILwAeRlbf2CseFnT+jKNxjotY1I8SAgEtibGpD56fOFF/zr/ilO3409ur/M7Q3UCSmErUQUoEGvXgpQ2ST0z4+Z08knd1mYbrDrbS+qLr9Iq+wuiqe8z8/Ordn/18dKk/lsnE6nFlXO/7Rc3dgsRWb808g1wxlf3oYesNbW3n5LmLz8LCGBHY9SL7WKmPRuuTtzb3zVbEJI/A0Uk5t2OdGy6m69Fd8Cw5ke4LTLdKsE/erySkxwjkCaw4BZNsFuI9IRjaRxmDc117ojQJv3+SwEQRGQBuE9Ked9Jpx/Xc836VWes27T+xC07tpqLnjZoaalCZn+g7zTJqblO0z0nFiK39BhNsVHYfWpqFqcBKGcdKdxa1XZyH+u+Zix6RlP5UjB7FMclRVOXrtnvtU5uc+cLD73xHhGpb9879W+dFbKPAWUjoCCJ/WHXw+10ov3GrrY+IYxa26gMiroRWf6d40O2Xb++5u0JRPQBgE2um0lE49ZE7Fveu1s1SxKVWGuq75uU5tt8nwkPdoZ8Kyp2HnZmMZ8n9uZa7RmkMwnBLdIge9C9SkWYCUQE8GgGB6i5FWj4Sf9Y6+HIKyDY7fPbHHxjj6YQkU2yHWvSDKg/KBpij8eDaedM67No0dJJG9dtKagurxOqRkAYjIzeQIeDBUenuqSA2dybN+yKhl0qiuzkHn4QNZEf7CYgNYDodCCzL3F0KxDXCTTstHn75l0dV69de8Skkw4Zx8w+1yXUf/Z4st+XTXe0byQNp9KPtDe8DYe5kbohqzIAAQWxs6Ex9YagHdiebOhAtO+r0jXVbw8JWwQnwVgsfmkUnUPnEhGV2D/V3n98WmDLc1FSmeWW3FkfPODwrm3alM9C8a92/xcRtr1lXLEHCHjP5OHPHuxw/5qbOnrgz7AgkSyWIEdu4TZNEJEiQREhR28K6jlizMLvmu/nVl6QuvrqmT3yenR8+cWXn/t68Y8/zFy9an1Bxe5qo81ggdF3Sj74AZM7jxPw+B1rKsxmHp1cF0prAmuCVgRW5PYWpqb2ok13yADgce5BfJZAnzMlxj0iue8FAp5Uizav3ZGz5qfVU7/8/uPXuw1r9/VRp006zufxc0lJyX8gSBwUKFeD5GasIETzjhGC2zjKWl3VLWn85/WNucfUKFmbaDTEx/m+eGNF5asj+9BDFnOhAfx8uKsz+bjYICrRRKbeUPuv4nT/5iejpO2psAO7d1X3PCQndsAyJ+749dZPxl6z54ikE/fCJlOT9KrFODUnJ8dOo2UGTI/H+FNA4go1aA8rES5BVWGxnmiuj2/qJSV+fjbsBzjI4/HoUQePvPhfjzxwdVVNpd8OMrMt7Kz+puh1sqDsQoL0Eawat6F1OMB2ewE4XVrcuqYWlYjhNqPNw8XIdcOI3G76ALRihCoAbwDodqJAu4PBq14V/ONz0NWbg6K+dkO38uqdT/cc2eHoCyfPPG3yiZM3/ye6W2Kv6+9k2gU5SmsNsbG4uFjkxJz50eqauyfAt2NOkmnFGdELX11T88Q0ohOfiXQdmjsrkgJgL969Kis1+vV/pXq2HwpolFsx6yusoZM6JQ9Z+Gtj4X7BghC3yH2EARCZQdxLhrt5rJobVDod1tn92R8XhpSASUA3Ww+4VK7rUbnd5QGnNRHJ5klWzfUq3ExR8341LyAAwuv16r6D+txb9un8WyrKK3xWjbTjMiVGXCPk+AcE5Qx12CurmiEER2S8HWDYyomFjCjAE8swozUMP0P6GIYfMPwMIwowYxhmDIM8gFYEZVOTOFIaTm8yYsCuBjwBoPtUojGPQ+ZNAQll6todIXvl+uXjih+/6JPi4uL80tJS9Z9jSeaH3WXT/dd2S1ypqZsh6RRn59lbSkpKNPM53vYx5360paHVwVW23BYn7ai0wIqn19bdcdMGZv88LjYci0FMNFktWMDmprqnzsqKff6LVE/5oYDGjlD0+1trJwxtH7Xv4GiRBxGumo9+AQiR7hVFts/YI2GotQZr4YDrd55ZxcXFYv78+aKsrAxFRUVcWlqqTHi5q4zhJhbLlXyHLYWQgNcNeDWo6WfhWRvkBuxNLpbYdw6hqKhIvPzyy6r/oL7FC35YcGao3rZIG0beEWz0OU1wTDpgB52yAOkNJySdXBKTQ80Kg+CNAup2auxYCJSvdMaphWrgdlYkkAAZfoY/CRTXBpScx4hvR5Amwa5v2SDCSd46wLOqAX8Coe8lhNaFTN/eKWTlj8LaxlvavvjxY28//eDTA6acPmXb3zFx6heDdNJegKAUN4Y7Foc3HDH5nKS0cCUficxc7CE647Pvdz91UFbMT6WJZqizJ7Dl0kW1128YHlNyLwAs2MyB5NjnDov23HxekqeuL2CjRpFdY6Xfcf4bZ88onUxqf8DR0sWilpaCsXfDIQTvfdCNKx7UyskkC/G7g5DwTdRusIkmutIVA8IVLArDlZMYbgdGw5XDaG6OV1x3i+1mK0LNvNG+gEOWlpaq44478oA3P3i7OFhn2abHMPpfxOh0sGAVAoLuSS6NZqFNmFDRiuCJIdRXMBY8rLFmLlTVRi2UxSJczEUtip7ClKGAL47slO4QeUcz5QwncMi9LyLCBZaORVG2kzdJ6Q4Mu5Ox4FYYmz/0Wru8W9vc8eo1DxjCnOCON/ubIxCnF4HUlgcANMuGCPpXNzvFDCLDdGszmhQZPZOOX1I0m7veMeGaW0OCDoxSfVevqSzr5/f+OMGU101MMkP5BMeF2R0KfF4Zaj+zQ8xR84jOcduUTt6vYzsiUdhSXxXOaYSthqXIZRj2ILIis+kiIgaJcNL23XI4YroLj57ReZNaM6K6viqvS6fOz9x2211fWQgavUVKU8kpu7M3HEtBkB6C6dqEILHTXVFG1KMLbs6j0L7Xb5WWljIzU9vOOTfV1tQSaZP6nc/oNF4gVO30njK94ZiHmqZHMROUIpixwNbvNOZdrlG+muGJZyMmzQuPx1PhMY3NZMgqQIdISBJEptYqSikrLRS0MoKhkLHlG4VtC4TqOInFwEudBt/MzYSD49USJAGmAOxGgvQD/a5kfN6gjW1fSXtH9JZDDztpzEGlj77x/t8fj5S6uSqOgaO43hVmt5rlJkIDpA0iJgIvLH+4e4C90Ur46v3Sijbkk4ls56wNUGhjXOCb6wTV9Yw3DAlo2NCosrw/1IbS//X4Lac9UVJCNnORJJTq3zOTxAAAvzegs3unqbC/znvxrkIhh5oyTQHh/g79LJve7PM71X7s2Q83RpaUlKozrjyp8JOdT7/V8J0vKlQpsH3b1uPPOO+0E4y7PK921bFMhpumlBF9aA2C4WGY7iAeiyOShRxRdRcGiJPB5X21HodNPmxgReXuwXa90G2Hs2g/RjhWI8qp+RCR2jDtiG607XRy3/YDY+40jWCdpvgcDzKSM19pm9H+8fEjJn19yimn7PSYXh0OMMIHzedzP4u758Wb2q/asurgbRWbp1VVV2Ysf0FoHWIqvNrJsjM5DF6k4sGQAHxw+ikLQtczGBXLBRpqGnn1tmUXSGG8vz+d7f+ky+kMwjoJkLAsXe5YlmEAygjQ3AA7BDSICjRaq6sfH+QNfPdJFHnJ1IaWBgk/wvIDG+FsW6WydzQq/ycNdvLTP26e9s64jhQETsfs2f/eRCvRJCMhVqCWgQdHxB1BV5frN6kJIC1YrcgBneG/J0Ttm+UoFqWlpeqKU65puzD09guV2ZuiGrttCom4YKimuj62bP7Hr1xx6RXFCXEJrEm7wGAID0F4CDAArxfwuS6Wzc6Ep5a5EGrZWHofTEhpaSkRCCtWLS9qaGiE4SHd8VDnL8MNogU7DSTgiCEcKUjIcemsBsYn1zA3VGmOS/XXD8gbcsyPn2w8/LXn33nj1FNP3U5E2rJDZCmLLBWikB2ikBVEn4P6VD35SOnCz+f+cPW1J9/Qp1Vq9mf+JBarXie98k0noOcgwBaBLXJoO+XsF3K1XzoIxLUjtCqECFWCqhorCq+78trWAP426jc8lKZ4njak0KkOVgK7m22LIzIM6cSntytjc5Xl+8AQoQZmUSsFIAwWChpVthUst+xNO0Lyk82N3rvX1adMWrn7oB4Z3iuPyI0647VxHSnIPFsygyZP/vespRGOOIjIIvq5XxRuAlDb4PxewA+YZvP3I4ulnGScu/u0RnR0dDrw61V7jltVwp9OXR5zSdyol6rjt6fzDtPWHttUPbbBsyJNh7axeO2dObOMwXW2TCAWAgJeAekhSNOZi+H1EnzSeSMWheMT13XUzmkbWSZLjH1RGivTNFFTWzPEqtdIbGdQckeCshxZOYW1Z7bj7jllwE7FnxHDWPUuY/sPzNGpHtmjQ78Zb5S+9zzAZlFRkZ49u1T/ShseKi4uptLSEuOYU07ZMvup2VMuu/OcH0J15dErXzW47Uh32q+NJtcxPP5CSHdOiet+pQ0ArX1HqKBqCHy48o1eADb93k4uf0T+HCAM7vB1nCSdDEjYWmwNc1vhcQjtAmc+t3IXv9knmaoB4Iddc/MbzK2tbDTA4GgO2bE1u2p6bR3eNreyxTwuhgBmkztn8A9xIw1H/sPM0HUkqSmr28LMEFBd49yFaD/gNQkW72FBqDk3EV6KiMYIv3RaU8kykAmvvjxm4tOVSVt62xXS4kYYUgggSkP13kbelcm64UdiI1hveD2CSTkulOEFDElQguDzMzwSsBQQYg1pCAcg7AbyYQbIYUmgoer3ztO1zJa/8OLDSaeff34u20BiO7ezu4rI/Wi3bpkBKIcxUwoQCtjwGVhDybio5O3vvfbB40QkiouLVUlJif4NioDdct8QiiCPPvHotQVDu35aXVc5tmotq8q1kIltBbTFEETNY7PDjSS4uYF1TA7gixPatpWssyu7AXjjr+7w3nw5PciSYlYnCrLjGQIasdsdF6u5zNWxNFQNZ3odiMZtCstL9rRI81Eoh+EsdkGhgcl/cL4GEEppAFRDYo9aEFcNISRQWeXs87goQlSgeZNEChxJAjAdnQQzI2RbKdJJTuwdIIWQotRQw8/Jv2tX4toJVhVZqooMpRwFrGEICD9B9t9J3m61QgjBMDUML8EbIBg+OHJvL8Hvc+YVNipCULrDbGRkQtEJ5uHOVQ9ajoj8l6qBi4uLCQBeffXtdNtWCQAhppUjWYscN0C6eRZIeHwaGAjWAFUbwdIDxARi1/i8vhp34+9foFgKUlpRclz6OtM0YTUwqje5rqIKc30Rs9i4eQwCa8ATC3gTCcpiNNqh3L+xZwNK4ViuKNqdHpDCV6tsHQrFb3F+upQjNVXMTCBnSHIxF4vZs4uk85gtw/ISIrBTbz5Z/dHj3FpYEM0KYFSQFHD9hKZdzxowBFBRCdQ1asRFAYlxhB3VP2/ZSSaDvApgZxC8FQxl2ba9VxlxYSGMsjKyJ5w75IIV/q/Obai0La4RhgIjKQ2oqCUEDMDjYZAhYAypBIckTHhgGALSCNO7BEUOQIQghDSgyHG9wmp4rV0rwk4ik5jg9/vqwyj9tZkAO3bsDChlEwD2xaMpy409RqGF845hJbPVCITqwEIIGIZZo5ubV/yeG8mm9FiCBBjgUK3zeloTBNiJgZqa9UYQBpYz0s0TJVBbzWi0a52YMPXv6a6Y4nYr9JgNHQyYsDVvD4oDN7jWhSMr+SI3fMuui6VNmeO/JuNf6GACxJsj1bnh++iUzgLllYQdFc730pKd+XxEewgbJUNEK7B2dlFjMNjm5n/dnNYsA2gOysvKyD7pgiMPW4lvb28INdi6XMjqSo2Dhkq8daWBq45QsMDQgmD6CIaf4EtjmF7hWg6C4XMLhrxAjN95I40K0BEWpOnhJhO15cg+Av7m4HBvV9hPF16v2bRYxl4SppFCyaa57W7dBnO47aj+t6cOaO2whHDnHeqI0oLISZ+R3ebZ0ccJ14gLUxoE0bzH/qYsusl2L0DAYrG6e3yiO1GW/m527delJgaM3YJEiw0QRoiUTgyyYZsTCeZmSth2szIlLHcnAmSc7cb5pCzLivl83uc9AYhhw4bJMDhKSkr06RdM6fdNzXsvVFRX2cFNUgBMZAp4tEamlzF1sMS/jlcwfIAtCR6fU1wkfYD0O8CQXuf/5GPEBJy3W88KSjKkgaaRDE0gMQBulAQtoMBbAOy1ifb+CFCapmlxc6CMCLEmhSut/02AqHAtYRMYXUFXE0i4pZBThwnVsMSG/u7uoxiGMgUQfNLuDgC28iwDNOajUOI/9GpaM4/p3+j05XVq3Rktb3JjA7BiraMfyWsrHBpFR/gLrlpRplggrwaBtGVZ2Lx50zEAdFlZGRUVFUn3ZCa/EWN7VKDSqoFh1WsO1YJio4FXP2XMfMmGBjA6z8AjUxSS4hgNTPD5BaSXnIcPED7AcC1IoguQaqWhDILhCedImpusCQPQtUJCg5PS/RuAlh3l93aZBn7WKR2RREZEMVTkeGYn0gQ56RYKRIw1+F1QJLAzyEC0TOI2cY6CAI/jNOuIojWmX+Mh/kqK14kZ5lV8Gy8p1AFg2Bz1Qxg6/7EAKXJaeyLgj94kIJwhZ83tbyNuBPDDcgCw0aO9QEwUYNvUVJDknGoEI0HBTAuBlDAgtK6sqDzyqKOKJgshrNLSUhUuXb3zlnu/Pb/H9Qe2j+q0WvhZatZs1TOi/MBD8yTOflajLsTonSHx8OE22qVp1DDB5yVIj+NCGV7nIb1Ait9xwMttQLvdDYXpWpEwUAywXS1JSqOyz4jemwBg1qxZv7Fpf95St8lZFBE0a+Tu147VNfwgrTVspTqGrFCUU0y2v+qCYm2aJocsu7utbAgvSAY4wqXiljX6aFnR6SiAXNnL31hcWOoMykGm/KJbwOCMeh3SjVbyQgDYWdrlt+ZE/m0IF+HMam5Kmw2CZUO4kwwixntpxfCaoIWLCSHbRsfWAu2zCA2NETWOEfUk/l51EFE2hG1CKVv+sHTRC+MOGX3f3fff1o+ZPdKQNgAcf/7xSz5/8sfunRI6P2v6JZiY7VogKYrxxiKB02YzdtQzcmIl7j3IQt9WNqrYmZ8ufU4AKjzObPCsgLMrtiun5lsYzsMwXTB5ABLQusKEKT0/XnjMVTudWPDXfV+vV1IkApoUBGG1gEvtRkpvAOc9RaWDWLNqCNZlXnTRReOJiCdPnmzuI0jotNNOM0tKSvTTTz/dtbK6vJ9l29oTBxlIdtkq0SzWdP0wpxNURGd+rd2pe5FKzb8lQHfa+vhFXaGHPKhTWFdTN2yJq1jQv5E8YRRB7u/h8kexWAwAT503e2vWtMRNYO4AEJMAQTo2WmvA62GsXEW0aLXmPp2BYb0NfLvSRmyCbFmDrghGko2YUZUI/hBL2BVgsgVtXLvljBeeemna2699sGLSYUesjI2O25qQmKAvvvDiikNbn77p3RUv1C6xv4mhAHRjPVNCMrBoh4kz3tK4eZRGuziJmwdYuHU546PdHiR6GDAILIFYA2jnd4bDb7Q1TI/jAobzE4Z21LWqEszlPgRifZ8qW6GwsFCWlZX96kyyYLCxeawf75klcQ4PEXHOhfVRwgRS84HNX0raXb2TF3739Q3PP//8V0cfffQ6190ShYWFe92x7mg49dBDD1nMHDPhsEMf3FG12QMBFZMLikkXzsxFI2LPs6u8EM1E255vlzQ7TnER/vJAfRhKNEDwmHVDALClfAv7tGpV7wgISf+aa+ayWoqIUFQEWVqKP7Hrwd4BImQfw8oZkLKUNHUAgSncvlc5m0wKoLyaMfdjoE/nICYOlXj4DQt2iCEkNbejcTsKGkkK3pFV0JX1pHd7GTUeu6GuRjbYuzrvqBKdRY0Etjp7LxhshApCxycmsp1cRd4kwBcvER1P2Fxr4NwPNa4daqNXssTMrgop60J4ZZcHcSbQKAXyo4LI9ApU2TFYa1fCKxEx34RA5NRZVC83BFf60KZXxqv4+NcD9HBs0tBoB8N0trIjYwy3iMllkThCgxZWD2f1AVZ/AFG7yeKftq5o++DD988/8cQpl9x553UfJibmlJeVlf3axvBcfvllhePHj7tu7ZZVfWutSmUkkMjs5zTFZttRCzS1aXIHlbJ2B+uE6640wIpBBrkytb+eLAp3K/lq+0fpPvlBASAohKiPXF7rlxpLEDPTyDEjXmLYuUceffRTLzz33MNEVPNXWxCgEEKXKR3ji/2y0t490SbNCKtm3QyGUkDASzznbdAFU2zOayNx8CCB2R8xUv3UVItO4cF5yokmzVQFyqwnoM5wRz4rrTVrrVhDEzPgcXqMCMESZJiQfsd90gKI9QIN2sBlXwlMLwhiRLrA6TkKMf4QXi73AlJhbIJDHixq3IVdykS00LC1cHryulZEeFk1LA4YPkR98fTjL3z5zBMvin1RtbbJSKtZIKUNsBGscrypML2qXZaII7s8Soc0UjYQ11ogb7zi758RVFlfqVdtXppdVVs5+8ijT9lSNHnS19IwF7PizVJKW0pI21Zka53ArPPHHTymoLK6In9n9VZUWbsUolik9mPk9HM4XCEYkRX/xGFiy2loEbYgKuR0XIQJeH2Baie589f69PMxSzJDrWv4YUSclElVKli/uzrlfTc8/xk4wiLR8y8+Z0z57vLD6v3b0TBywW0FR+dOO+n8I299bMYLz1GaM//8z7YkBgAUpYJLAWQktCnbWrsJNjVKImfkl9v/HVoDfi+w/EfCi+8xTpmgcNGRhI++02hoAAKe5qZmYem8U+YqQDbc6j927i05LgK7LUubhl9GUpUGIEwCGwI+rxN4X7fEiwplYVIrwuhkwktVNgZHB9A/OhFa/4R3a00YTdNnnedW2smm120mql8Qw51z2xcTkXZvwi8uTLiz++GHH73t1ffe2AUgvXYrWCsmrZz1EBFsX2TrVeFOeNIaaD9Swqq3eeW7JKrLq7huRy1vq9yYGROInej3BiZKaTTVgWjNsG0blgqiMVSHBlWnbRFimQSR2pvRdbxAVAqBLadasXloaNMCumXPzeMZQjVAsEbDiCX4yFwN8G+kRv8M98ppFL2lsXocILhBeRf2STvhJ+YTaW8S9NLSUjZNE9//8N30yvI6HnBxgzXwjEbx6DVrO7z96fYHD7q4b2eALszPz/OkpKTo+fPn/6mZdLg+Hb19xfsLs85IXN4oG/NIO4V5kAxWTvsZZTMFPMS3PwyaMNzmnDSBm8/UOO02gvQIBGIdJsuZ28GILHByZllwc0lv+MvI2nIZ7uThToMy3VkbkmGYgMdDeGSdB2stGzsh0NbUOD1FQmAr3qshLG+UiBEM5XZlFeHYNFqryhdjjY5xvR9+4ZVn3i8oKDBLS0ut3/IMANCEQydUp+cm/wSzOr1yLdiqAwnDbeImmxuUOIVZ5FKrDBkeySyBLocbiG2leN1nhN1rlaivqebaumpNtXAn3Ub0wBJgCCbhBZkxJOJbE2X2YLQdLBCTJcGWk+OhFtbDyao7cwu5ycKRAOq2EIL1SkalGIgWSUuc3E8R/1VBiOteqS+2fZDmkx+OBkxqUP43AOL5KDaAEntv1mPaWaeMKiv7dGhU63o1dHLQFEE/KBCy/K1ZmHXe9wGmZf/X3nWHR1Ws73dmztlNL6QQQkgCJJSQhN5LQu+d5SpyFRDBCqKoVJeoCCgWlCJVASkmINiwoEIEkS5NVHoLoaTX3T3nzPf7Y3dDUEDwZ7vIPM8+V72b3T0z8379e7/Dhx0u/wSwQFAqyT8aKFdcvCQI1ohpAZ4BHyvCWcDgzPy5HxQuZx04dYrh6VecflL3xhzzn9RhEhJZuc4Msih3OcuoS109GZw7M7tcLReGVZ2hWsXspN40eXGoHgKKyiAU54UQ5ZhMPrqgwiwJkyMU+Cm5+KmkBHMveUIaHNI1n8R9SRRPQs5mFZnvm6iIchJSU1Mj9+zZoyUlJd0MoYTQdA1enr7pZm+O3FNE+Wecz2Jo5Zh7yvklZX0xnEEoziGiQgGqJgs0fZCjyQhG8RaO6p04D2/JRWgjJkIakQhpCBHSCKJiEyhVkpmI7cF43UEMTYYxxPcX8I/igHE1ONydi2WEEIzKNIjhunY5h0BSGNysmAu6BPXfDwDu+ex/lXkFAGH+P3QPVDyDCwy7rVCr/uH1zKu0tDRSFRUHfzgwqaCgFA3uLqLwII69h6VRzKVavWrFr794b9enYKBB/x3U49ExD91PRAFIg1OLWP5YOrZy5R/Obj7LoN4JW499tbdEKxGMuJNCxcFcUUIGoTAyeTLk24k9PkLS1IecBvixCxJzNjB89QNHocOZ+fb2FvDwEhAmglCl83Bd/FRUjjaU8ytjxdxUnMQBgzlfuqvo0NeDEFfBQK9KDC0rOBtmjpRITD9nRqMACQcRvs43wVsAXBJ0DeCKxPl1JmQuqSDBISqGhRzv23NA/yeffHK/S4NeP4plgUAajE7d2zbc8f2OXfnnbYi/W0GD4QyGxmDydQJXMGcQgyso4x5i7ApJibOO0GUWKU5qUd1O0O3Oi1ymbV2zPhSzq1PRy1lvJnWnNuJuwj6XUeUEpdPckwQYApBE0DUOrVhCKwG2p8Aohl1EVai2Ye/K0z0k9L+UbdFZRkK4YHtpc0Wz3jrDVvJZhOe0bkSSM3b173Brj2EP3dtp13d7Pyf/bOPh93O5yZdj/gqblLlevM6xNsnL5m7Y8tm2zwKfeeSpn202e7BHuHK6Xp34ue/Mem8hYywX5WreXBqM/r8aBK65EXztqo8P+psCNjABBubSIgqVyyAT0zRCgDcwawlnI6ZJXMqXiAkTeG0Yw/tPS0zob6BdvI5KARo4NNgdhMJShrxSIK/E9b9218sG5NqBPDtDvgMocAAlBkFCwsdkoLq/gfaVdDxW08Br9Qkz6igucGj4/LLEuJ88oBDwYKjE4xV1DKlgQ0kJwW5zgsQoZqjY04EqY3K46k36xfOXq7+3duWmp59+onO5wOj1slsGAP75x1/v9fH23SZ8CSc2ksw/65TchsPlGDNnQMHtCzAXewpjTrOSqQRFdXVCGgxcZTD7c/hU4giIZgisxhFYlSOgKod/JIN3RQaTj0sr6E7MOWvLqIwHjJzFOWXjoEklkJCQBOglBK4SMrcA+Zc15h3gwSK8YhZK6LBYLH+Zg55KqQIAfs5b2thXoRYSOivV/ZY6y0t+3bTlbm8+9vPRCUWFNtS/u4gqVyDs+dEwCksg/IoqfP7u3C++AUCvTX1lZGFeaTAF5NkinjgctVt8NKPp4Fq7/zu23yAiAqyu6LsTHOL3NomxqxEMkZYGo+/AHg12nN68q1grJkaCE4FBc14np1/ASJgAkydYgQOIiSF6ZBChTyuOCj6iLDhWqklcLJTILWbItRNKdAbNADRXZbZk5CSWZoDKGTwUwNPE4GcCAswMQR5ABTMrF60xUKIb2JlL+OSigv35KrwUp48zOMKBAWFOFG/LI7x2wgybweHBCLoD4F4S+QcUXFxUwbCdF4pfkI+jVkytR1esWLVoypQp7Lpl6C4t0jq5eef9x/Z9VpDp0KNbc9FqPIc0ANXH1ZeiwmlSuXvF2dW5ESpXCEq/LHS8BmEfK0eGwX4tlcuSHU6OOYIOguFgcBQykCQUZwDbp5LUAu2iknfE7n19zzZjA8vyDfTXaA9nu+vZkpcXR3jyYVla0YlNR2rXtdQZWOyun/ml9rh/5JCOO3fs/gL+OcZD6y5xs6+CBavtUmb7ivjj7ZLffnP9Nys+XhEwwzr10KXTxZU6vZgtOz5gZyvXS8eWuYZHTf/qX+1bc7qDAZ1zzqVhGD6MsSL3WVrjrLfUcsCudSFYGjcatK/x8qnCY2MNgzRIppIEoDlLtZzlG4y4CczsBTgAsoOhRiyhbTNCUl1CnWiOiAq8HEEYu8bX/pI7ha5KngKEUl0is4RwoojhYC7DgTyBs6UCggNeqrOMnThQIoF+lR14IIrAwXCkUGLazyZklnJ4CWf5OTMTSjM4Li8NcNhOms0Vgits2vbN9vaMlZ9Ze21fRHBhRNWuvOJ8dsYgexbTE+5hSv0hnHQ7g+IibnCXwHBXwIFzp9PM3CUpV03kukIaV2aOlSv+/NU9dude3Dz85LxdBjknfukag6MEIF1CK2LYNZOQk+cwKlTyEc28OrV6d+HabX8lYYNrihMdylkXEen3w34/xRR4ulQ+G+017vlfTnEqC/4pimzaqv7X58/ktW31zHm9/whNbPwBxtdbNCUiu9rGLyYd68zAqHPXdhOO/nRmqkd4ofb4hgIFJo6FK0qlvOCHpoU9k+fOWL4VAHr16n5Xsa1kmr+P//LWVXoveWLW/afoCsXQTQkJ5RpmhSRIsXvGjxNqjKnULMt2sRUgNMagEnP1PrvIqckANDugeoB5mokyzjIsPsuwfAMQFApEhElEhBEqVgCC/Jwl6R5mBlUhJ8u5a0Kr27G0E4PNIBTpDHkOhhw7Q5ZdRa6Do8TVoOWhErwVp1Q1HCgzOXwUIO2UCecLNDxZS6KGr8CMeAesB004WcChMkArZDAFkwx+IMtsXx57oW+th/7LGCOr1cpSUm7YXyANafAHBj/06Btvv9Iwh7Jr/rBa6Ayk1L0PRAaDZrtSuyYU14ytclOF3HQ9TkDQL4SDe6I5/YJxhV1F4+pOBrr9GkMChuTQNUC3EbiQKMll2DuHkJPt0P2rqWplW/Xx7y58f5vTOvgr2UycU5zOFJ98yE/xCMzXi3JzS+KWgMA249q+x+D77uq4e/e+tt6RxUYzi01k6wr2HHAwb4ePDM+KS2FgWLZ2WeirL84YVVTooORhJTzMj+OTg7peqpAa5R+4ft6klVsBcCIS9RomTsy9nBft28g2+WLwd6P6j+m4xNpn5muJSYln6QqN5S1qkHIO+9ixY8PWbV/2da6WVRsG0xiYQgQGycCJEeNOk0uYiDEToJhBiquYUAoGnTPAxCHMAsLkrMQti16prrCvIJA7BCwYuEJQXDxXigKoAlDdrInlEnJuBvfyxHEmBcjK54jx0zGxvoZoH4HFGQLL93H4qIChM4KHTvqeIKp1pkfX2bPnfXmzZGruPbn//vtrb9j2wZe5+dnhjmyhRbXmSqMRDH7RTiYTMGfdF1dd/eFu+qFypBZlg4CYi+29nJN+FTcZXUmuXJWghHPojm64v9OZJby4m3DoXaIiu0Z+0aoIK6k+e+fqo48ZFl3gL5wu5dYeP17+NKxS4Pf7AxQl5KxNezXSc+KTbrPrl9qDiCipffOtZ05lt2gz/rzeb7hdfPkTM77eYiiVL0d99tXEs10ldHTp0cn686ETUzwjCrQxGwoVMnMsXFdMpmI/it7bpsmKOR9/D4B69ul535GjP75TWqw5+rx3gfG6dnXdYyoCbZVymkcm/Wfe1OVf3oxG5ddOkjmZL2bOnHlhaJtRHSt6VUoXKlMll4wrMLiZCB6SlVE+GAwwnHPyNDtBswMwCCYm4cUlfAXBTyX4KwR/leAnCH4C8FcZAhXny19wBAjAnzH4APAigkkShEGQmoTmIOgOKpvgZGgchoNBdzCSBgxuhlGiE6lMw7ECBc/sMOOVn4GvjjKoksFwMDAPw9CPeYuA3Q1Gz54978ukpCTlZu3RlBRIi8UiFi9e/GPv5gPaBVcI2e8VQeqZHQZ99qSUB1dI2POckSeYnJUHmuakS9Iczn+WuvNCk+HKoxhOggfSnewkhusldQapOd/rfFY4tYTrc3TNCRJucoac844Be2cTdswxjFKzgwdEeYjKpTWn7Vx97DHDqnOk/dVlvHUYYyBv78NPBChqSIFeXJhjqzLbOULj6vYC18x4ef/IId1ys4ta+EQVGU0G2ESuIbD3kM68S72p8uUGL0robOUHCyteuHD+0eJCh2w2rERU9OXY9ZNu2HTOAwqDPlo557O9rhIVz/OZZycU5+sUlVQiWjbhimeWp4GKmqb753uYHN5ny5cT3bIGuSI2wZECSURqs+7xKZlFZ8eWUJEKCXDGdcYZd1NhMe5k6OYKA1PL5TlMDIpZOPMaZrcWobISdK5SGeMhcVau8YcAxVlOUZ6pvWyaLGfEFUjubQizr2D2AiCnsJhIMjKbORNQoTkEPASgMIB5SF3mC1X5NH7uZ8u2P9ImyVDS06Hf8tm7nPYNszb4jVr64Es5pZdGlpQ4oOUx6RfKZZWWjFdpxVhQTQaPIGe/ShmJNmNXuIzdZfK/1Bzsar1P5ULG5SfZFl8gZB0Gzu8gunTEkIZJV7wiOHyNwIxoe50nPl39bSrB4Ph13eJfoj2O5r9fLcznx72+Qvc7bcOsaE/r4zfSHm3aNf/27Oms5q0nntf7DbOLTUeY8dUWqYRfqvLBlxMy+hDT0bVHp+d/OnhikldkofbEJwWKYeJYuL6ETMU+MmZ/u8ZLX/9gPxiov6X/Az8cPrCgqMSm37c8R9RtCSz4xK4XlDA1Nq/uSytG7HnGkkoibeBva9UbJ8tSIK1W57AYBjFh6IOD0naf3PJkni2rr67YvQzmYqnmXL8SenT65dLZ/81IJ4Ab4JyXEb3BxSnLDDjHMpe3xjm70uzjLLwjV98FQYCECcRVyYQ3FJMv48j1hPlYxBLz2ZBjBVV3vugIKmClRdAFtwuzUKDbOXQFBish1bw1dvuG3VvHMAsT6b/X5EiDASt4t9HdCjjEgy3bNkk9nX/s2SL/giS7TeOHPyP8/Dk3fEIZVajKWWBVxnwjAe8QxkwBBNWTIEzl5oQwV1tuOZFFrno2knBqyRLAlk9UchkoyCAqOEsouCjJbpeK8JfMM1pwD/gVBunh73T3GDFt0tInMt1A/usL2w87J8iWHn3RVzj8cnRHbn5xo5nX0x5paWnG/Q/d1ys3p6i5T3Sx0aS/TeQZCvYccnBvm5+MymwwnXCapX6UWvFF6/MPFRXaqf39JSLEh+PD/bphN6BULAz9YOmsj/dhllN7NG5W/+miPI2qdSxl9VpK7M9kdD5fF1VYSG5Uep/XQbtZ3BQr3Uxf+83GxN1BSYNDwb1DLLGHsndbCh15vexkayDNmiqFXsa2XlZPJRgxwUiojFSTINVDQDUzKCbubmDCFX5acsKVSxAjxjiBBBhXiAuTq4vQxCBUDqYpYHkeuV75oV/4H6szZ9Hr720BDAx5sm/PY1W3vG0LzQoySrkGCUXlQjKzwT13V7804PyzTR9dOfj0H0TiXLYnqjChUeu67c8Xn77PjpLOGrRQTdOhl7o4s1xMj1wFccX5utLLQcyZeS/zscrX1jOX78EkI+cgYrOE4s1g9nESWHgy78OBMnRNPbRbNnvZnOMEib8LHG5i6FOFy9qFeh7Z6CmIny71fzba6+nnb6A9WFK7FtvOnLrcpM3k83rfoXax+bhTe1S6WOWDr8Zl9JFMR9ceHV/48cCJid5RRdoTG/IVTVGwaH2R9Cj1Z/E/9mj51owVO5zao8+Dh344OK+41KEPeTdLJLbgWPCp3SjSmBJ5Ju7F1Mf2T7Sk4qa0x29rkKs1veF0VHW8886qowBeVLnpxf+OsNQ8nvtj8yItp5GdbLV16YiS0IKIw4cxqTCFmKJyJ9mCyiCEU8UwcpaKM+NKzI00WcZvyxgD1xgYcTuI5zNmyuKaR4Zi99rvXRy6o/75QdueWfLgeWAfQOANR0K888r7H419aGy7XaWrVxdUzqgt7cxuUxyK9+EwGX++2+BHVw4+7aQ4TfkjLo+rGQBCMxzyu827vmLgX425+/Hg9EsbWxbpuW20AFsDnezVdKYHEsiHhGTEXdRB7iAD51f4xPg1xskBTu4r4prgPN/MPC6Z4XnUGwHbQ43ITWtaf7KXjeTaFvzgBEYqJNjfAQ7XBFkik5f23CueAvyixo/m5T/1KlExB6ZcNebMrT0eeHBo79ycwia+VYuMJv1sIl8q2HtI414lvrJqZqNpEqfZ8mXzw2a+/uaDxUUO6nh/iQjxFvhgn2Y4JFfC8oPXvPXS6u14CYyIvBo3qz+2KM+gmC6lrF4LiX2ZTGbm6iKCB2dV3zvwddB+lurqIft9eZCbWVZwbAbHVTY8A4eAYdVMo8+NDjxXciIw25HhA5PhwQBvKNyDK5xzXtYAQ4wRZ5wJ4sSEAKRkJA1oqqo4hCJKZSEVeRWE5Kg/RWSvODi3gEE1rqoMIXDLQAtzRyKSrElKekq6vtiyIWR1vSdWZscc7WA674eoPW2Hv/fu+4uTkpKU32qQ+t3LKbWBsqEPDAICc0fM8fow48PAi0VnAw1y+MIkvRiXnuSECjEJcvIMOzsXBReMFOICgC5JZ1IUm3RR4m0E5cVRvcuvNn81T6QoUpbHQBIUazKkqxrib1nu3MbJ4lefj/bKnVRKBjJKo/rGeo9cf52RA5yI0KZ9y+1nTlxsnGzN1PsMcYhvTsH4eptUQs9VXvvFM2cGcs5lp67tXvj50KmJPtFF2hMbChRNCFr4QRE8S/2M6vs7N3zn1bRDYKA+/fo89ONPh+YWl9r1oSsvifhmAgs/dRjFOlMqn6g5Zc3jh1JuRXv8IctqtfKkJChIggL8ycQZVvAkKxRLquW67ZeuqAhoBKk9X2i45K7x7ccAHElJUP6iLWGwQLj2g/1Z+4AkKK5n/dsZGcpKSvJXNi3UJ9uJJtCZ0hfXOPM4FnG9Mxrx0H194hPqUGKXMH12Lpdpukm2X8+MutMDjOefsSYDwKzUqSF1G8RnhQRVkQ8s9zE+JB859HuTo+4qTt1eq7rKdeX4xYsXfRo0STxeOTxaJg+voK8hVU7I8NTjV0F2Xhl08ZE+LwY5+dpubb/Yn3JBCLBOcX724cO/9R0WXLp0iSEZwGYgNDTd1RPq9Ijj4kApKVel2G+yQM7dzCLLonF/0/1xxiCsAH6xF5ZbiQ3EgXCL+/DXmVaM/fADeYXWeGF7iFpaJ1vnF7PzkxvWCOpwfgqs7GriN7iJkNCmQ4tD509eiosac9H+30dL1EAo7Ei2gV1bFcr8MvpEHHWdcfn06fg9+/aN9q9eYjzxSSG3KYwWfVgMzxI/rdrWpIbLFn50GAzUo1fXB48eOzqvpNSuD111UcQ1FVj4uaaX6lwNP1Fz8ppRB19IskJJT4GOf9Mil1S4hkZhsIK7i9burD8trKsAwNmS6QuJJlOxHE8/F8zr63baryc0iIj16NHjwcTW1S9UG2imDm8qNO2ioqWRyUglRb6QA7Ks8aVESzgF+lU27nnPS6aSSd631+Sot1pQt9erLnVrj4yMDK96jRKOVa4ULZMfcGqPcRkeesJ7kF1WBV8Y1+dNl/a4ddIHdnsck9PN//+WNt9Zv8/vOF40d3gV78yFKiROl/rMjfYa/8h16q1+tR6xDgvff3T7UxmXM4fxoBK/uA46kvowPSZIMDt0Oppl8K1pZsZCCQERRPu/MRAY6G2L2teqWUZwyY/pKel6zz49Hz3y8+E3i+0O/f7Vl0TNxsCiz3TDLoVS6ViNCWtGH5r2l/se/wTNASK2y/74i/scj27ac3l9+JVE1Z31V4R0AeDngrTW+dqzpUTj6bxjyp7dGeSVSpabouixlDU3cYx78f6Y5vfUmBfdJaA09l4TDVgh5BsFqvY+meRqUuWkI6psO9+kVXmUU+thdTf7mQIBABmU4dWwSd3T4WHRsu2ICvoaUuTTGSY9IRWy88qgzHHd5wa6WOLZv+h0nLV9mzaRctDx8HGip+iUfVL6yZPkQQT+d/An/bvAQRwADuVsibzsmHKOaDxd1iZkHcr7IOaWhRS5ghquOOjYl+5PbHFvrRXR3fyNWg+oNGi9MOaWqto6MsmVpMrxJ4TRcZa/veODrba8NWNV+17t+j8YW6sqValeRZ+y2yxXkCrbfsq1lp+YyPJ6vQnO6OZfFqD556xUV3TkZNFrQ2w0gYieoROlL6wCBOgmJdid9bt8Dk4Eti+TvC/Yn9tJNJ7y9QnySPGSnr/hd9w4MGcFdwNFQMHDKXc1bTY4Zn3VXgEU/6hCw74Q+gJd1daTKt8hTqN/BPVcUIka/ad6aZBfpNF2eJCxllQ59pyiJ66B7LoqONPa++0A0N/LzPi3HxYAnCyZ9ibRBNLoGTpWPOMVgGETJSm3GtK7s37rEls5EbgllURG6fMfEE0knSbSiZI5T7t9kpv5DIvFIiyWawsxq9VaBhSVmTAipX/7xvdU2xjdx4fqj1Vp5Cahv02q9iGZtYUEOaEQ1Hu5l5z2vY9cRqpM/oxrrTaY6T+v1xsHAJZUiNv2MIAbm0tEYKlkEVYr8bP2lA+IJpCNxtGJktcmlY+w3Fl/iFnFnCPOFJwtfe5dookkaTydKp050y2QbuI8f31ZnWBg1zt/AFC5GXeP69CtnqXK15HdfajR0wqN2iH0d8mkrSeTsYYU+RF5yKcyFL3uOsiuq0IyyrTHbSok3f3EZYfzG1KNfZ6Z6Z1pfzadaAIV0TN0pPiVx51SLUm5Y279MWYVoOCs7YV3iCYS0QQ6WfLiAoCD6Ma8ue7EIGccS1PnR45+6qE+Y8eN6ZKXdzrwF4C43t8yAFCFCX2faNGrTr+wLdH9vKn5swqN3SO0VaTqC0mVXbepWqdtHmR5pe5Tt7PvIRgYhj82+J62HdusO3f4XNCNNrC8qbXtzLYKF+zWnUQTqJCeoWPFLz3u/P/v+CT/X4fcaiXlXOkLy93gOF06dRmg4kZBEdd/5wCwYOmCGj36dnm7YeOG+bHV46l2fDw1bNrkXP/ug5+58h3XP2NLOU1jUkzoMaZ+/1q9w3ZUauVFjZ/h1OlDxV4/jetd04LPPdMw1f929T0UzjjuGTbg4eo1q1NcYg3q2LXdTiIK/i1NkprqlFJ7C74Jueh4djfRRCqmZ+hEyYxnXa2r7E4I+FbB4XS4N10kn/P25z8kmkREE+iMbfpSt8l1vTNxXXamKAqGjxj2YPPWjfJjYuKoVpMq1Pt5H+3hTYo+ZJNCSc8FUOuBzb/Ys3VPeHltczNAISLeZUjj+2LaVfw5vLuJajxpos6PN3y63PtuL3AwxjD8oftGhMQGUr3x0BO7V7LXqhNLHbq2O5SamhoG3Dgb6gbJ7oxNwZe0Z7cSTSQHjaMzthlzrVbi/58oy7/QrFKce7kx8pL9uW1lmqNk2iKX5mC/AQ4Qkdqrb/f5ifUTqEpUNeo6poJj1lnFWEdcridFvk+KsYTgGPgho3q9Yo8tem1RzZsByS8BQETeyQ/VGd3gnsiNb7+2LgDObprbSHskOcHx6Jjh9wZGBlGPN6EvJmHcf1holWuHUvM2Dc9YrdZIOOeH85uJbG29/KNvpt26wXmw4+is/YWPdpzLD7rjvP+2M+52uH/MX9Uiy/HsSaLxpNEEOlUy8zVnGP364HBf7qysLL9O3ZI31IqrTdVqR2kjlnkZacTlClLl2P2qblmiOB7fJrSVpBpppDh6LAMl9q1+fOv6L8JvFiTAlRwK4AwP33bLTQH6yNgH+gdGBBudXoGxmlRjOXlqbV4ERdQMP7t48dxqv2WjXgskI3aTetaWssgNkvOOZw8cyElLvOOXXEcDl9Oux4reHFqgTy4kGkcFxgQ6WTR7gsshv65Z5T7L1NTUsDbtm2+Pia1FNZtEOCZuMckPSMiZeapsv45rNeeC6rzoSZV7e1LHGYLeNIR8OFNxhAwCtXs0YRMRqbdy3uWAcnv5He4NfXzciE4B4cG25OdhrCDVWEmeWudXOQWFh56zjh8fd4ubdVV0C2A4XTo9pVROIKJxdFkbn3OiZO59v7Sz/91aA8ydw/h8H3mfK50xq5Sc+5WnT849Wbj87t8SKu6znPTcpNrN2zT+qVrVmpTYLtwx/bAi15Mix59WjXrLmFb3HYU6vBz547CXOj/R5aH6EyvW9zUSp3Fq8Ykwak9StNjmlahXn64f0nzy+i2T+rZe7g19cuKINgHhwYUtxkEuJ0VfTR5aj3mMAioHXRjzyCMJ5d/7e8wFtzY5UjjrnnxtYi7ReCqmcXTK9uJbG4/n+AP/7lBwaqpFuFkcf8pb3fiiLWWvU+NOpEuO5w7+kLu+vhscNzKRAeDRxx9t2aRFvcyoqBrUpG+o441zQq4lVY76UTFqL4TeZKkHdX+u9lv7KpK3W/D37Nv+ser3+BTVSlH0hI4RsmqV6o7IRhUp6fGaG2gTKXDSebB/JTjGpTzUOLBSaG6jUaB3SNFTyaT3e4dRQESFrGHDhtX//4DjaqA4D/dAzsLES/bJO9wm10XHs4eOFC7r+G/UJk7h4dwX6yZSzpa8Nr5An1hINIHsNIEybDOX7zhHQU4BckOfTQGA4SOH9m3YNLG4SkQsJQ8N1hbkcfkeqXL494pecwGMZou8qOf4BhPcXd4j5jdUAZgUZsKgEX3X1GgYQVUqVdcSOobIB75V7M3mK9Tu8QZLTMyMP7X57J8KjknTH0kIDAu5mDgctJgUPY1U/a73QAFVAnMH33VX0z8KHO7lPuT5uzO8ztqef7PYGC+JJlCe/oz9TOmLr+7OyAh2CbXbGihExDZturKvh/PfbnbR/tw37hButjbp8smiucPczaGpqTfcCwUABt83aEi9RvFGROXq1OXJAH2p3emMD9omtJoLQC3m+2q9RjcZBjAgtYxImiuKCsvdlsl1G8eVREdX1xv0qSBfPafI1aTKGZeYo8nrntRzbOsU9td2hP59yx2ZmPrGE7WCwkLP1b4HtFBXtDVk0u/9EOQX6Zffu1u3FuU3/w8OXZb5MUeK3uyR7Zh42H0xLmmTjp8oeePeK+Fg8NTbCChOjXHlefZc3hp+rmT6G4X6BBvRRNJoAp23T/3oh0ubY93PfyOzMykpSWFgGDCw7/C6DepQROVqRr+pfvoK4nIZmWS/zUKrtRDUeo5/Xv8H23QFnJltd37EbDKjZ+/ur9ZrWpuq1agukx4IlgvzFPk2qfL5IiHXk2pMyYCj3gvedM/EnvfdQmTrfxscC5a+WCOkcvjpmL6geTZFW0sm/f6NkAHVfIuTW3VI+rPAcS3TYuPx3f5nSqe8UqiPKyWaSHYaRxn2lPSf8pZ1cZcNOUOaqf+zES8rWXl5/+HwOQo6V/LGpFxtUoZTOEyiLG3y6ZNFbw698syp4mbOcsDAvvcm1q9DERHV9IGv+RiriMt3yCR7f80dcW8zajO7wsk+gzo1dIOjjC+ASO3SvfOKhEY1qVqN6o5uTwcZ79hMcjWZ5N1fKEaLWWZ9Vqki15NqPLoHesKTQXbr9DHNbluQuB/q/Q3zq4dHRpyM7Ax6o1DR1pLJeHALjMAYH3ubpm27uZxF5a+RqFcuwb7815pecjz7hUETiGgi5RnPUIbjhY+O5q3uDKhXmWnW/4FsvFtbpBLKASM/6EzJ7CezHFNOEE0mokmUr08oOVsy/Y0DF45XvCIMbvx87rMcPXp0vXqNEmxVIqsag2Z766uJOcGxiTsSlnFKfiNkT7+2/aJ+CY6MjIzgdp2SPq/TIJaq1armsEwLlKvIUy4jVQ7cJYx66xnVn+pFA9I95RJDke+RqrV/G9T40epH8j7OC7ztIlvujdlyKDWySrXoo2FtQK/kKtr7ZDJG7YYeVNvHaNO0bT/XWDHlr79IbokkcLxkxj052qSD7ihOnhxHGfYXNh4rfqfv7t1UhpRUgvgnahUiK/+lQ33gws5qZ4rfeCHLMeWUGxgF+jPaeVvKqh+KVtb/HQEKTkQ8qX3Lr6IiY6nX876O1cTlUsNL9kkXWt0Vgjq8XmnTIP9xgUBZuTkDgE8//bRm+05Jh+LqxVD1OtUcQ+b7yzXkKRcaquz5jdAS3wd1/yA4I7ljs5VNp/nTZIKxhkzyycPCEfusmf4zod1EgP2hvuk/Ahz7Mj8PrRIVfTC4EWjGJaG9TyZjzH4YoXV9qH3rLvdxJyWU+ndeLHfvyLJ9md6nbdMfz3JMOEIujVJK4ynTMWXPseLXHv8hZ0/UVWFSsgiiVPF3aBZ3GPuXvS9WKylH8lZ2zLC9vDRHezbHbUoV6M8YmfYp638umNu6fITvZoHuzkVZX5hQLzGxPiV2CzXm2JhcTV7yrm2qnrhcUNc3qnwyBmc8wdzlIMSIiE2dMTUpuX3rjNi4alSjXrTj4TQv+T6Z5GybKjt8zh1114J6vhtxcdSoB+PHD345Pq5RTRpyQOirSciU04pW803IVs9V2UNlQ7f/mvWn2vqMMeMcHQ5qWrHbxwW+p+LHfaBosSFc2XNCk2se9hX1g9o+/tU3Hy+VBikAtL8LIO5RxE56zErFAF7fcOTIkhqV0+72V0tGBqioH6bqDaBmNcgyrZ18xvb8hlJH8PvZed3TW7DIHPfEWMYAKS1i8+Y4lpwMCUyhP4pEwgkAQhoG8hDEMedoZWbANUcUUPBjTlqCj8fZnh7KC/28VFtDLxeZRZ4uS0sNrw8KHdHzavo98I2T4AIcsIKxFONm79vmzZs5AHku43S8w6FT3WEFMsxsEgfOOuShkwYPyw7f1+fx7ZaRrHKp9VnwlBTnnF/OmZHcofVjl3Iyw83B0tZx8nlzmw4SxwsZ1qcbeqkkNaYo9njt9GGWF5aMP9S0TeJbead1XFrlS+aEIpTaBWNeOiOyhV4YDE+8i2JX2zX9TwLEBQ4QkX9MTOwn+b6nG4/5Qmhx4Vw5nGUY701Wleqs2eyvt2yYpevSDMD+T9B4jKUZLgpNzliNAgDzran09uDur3TzVQqHeQpb22BFrQDFMVgznxkc6PnWmTO2lG806f9pqa3a1vgKfc9czT+bUialN+MSA5KRjDoEuCCVlgaL5WpC5zTUYW6+rM34gQGbcRmh5PxcBuAKM8eHu8mrZuySBLOa1dFDlHYy851NAhTVDAASElmaOGeXAeuKSqIX1apgOeCOTrmAIW+GvPlaSzg8NMXfYBVqaWDgOPOTJCXHi4Vl1nlhJCqXJD2bpKSklDFYSiJinXu0fXzl8rQ6ocNO1arZwdD3Xxbi0y26DhNXoy5V39rsU+vgp94ffLp5m6ajsi5dHGmzSxlUUQoFZpzLNiB8QB6lalHYWdj/yoIS5c+5aAxExGITqr13/PippjFDhBZZDYoqCXs+4Dw/PUj6V8nsMfzBB9bMe3Ne+p9ICcosFgtPS0srH55koaGhdL3BKS6J7wJKGmeMOVKA9QDW78tfUKOCenmgl1rSW2VGwxDFIxKKHAxcHpyrZuZn2scdshnmPZph3mnX/A6VlCSdaxqRmH0FNOn/H7HDdl/6LMzH42g1s1qSaGb2liqf1MRDMWJ9mBluLu0c3ZFlk+ZNdqPS2gtZfTa2iIzMcQMjLc3CnL/l5oBhtVr55s2beXJyskxJSZHJyckyPT0d9RMbHdz5424j7zI4QOTvC2Y/oqBC9dACACz0cOhVExysVvBxo1PO9evXr++R9PNbV/CCCgV26fAOVc2VzlRf1/aRzfc+yioWtWzddNzlrEvT8i/BqNauhHV+wIYTpRw/Zzqkn48ifM8EbWTpQv8rKXz+LBwyImLxdePeOld67IGSUkNvPpSLR55jOPwlx7LHQ8kkVO5p9spv2SSp65w5c777o0FyMwzuFotFpKam3nD4vNO0sXAgja6MLSb2c/6CJp7qxS5mYW9rFkZ9f6H4OeWNk9M6z7BJTaqXdOKnDGLHDRKndKmcNQx+WWe+BdJhLlGFqkF42HUydF0jrppJNRmaB4TuDyr0Y7w0QOWyisqMWMEpVsCI9lFZBTNUOEOyBuywo0jHSY2Ub+y6/1fnS6K+bhE8MKO8jwHEEWO3wGbv5Bl2DaG4ppNOScnJnzo67ug8YqKmc8mw4EUock/cJ99/8nMPu2ZXXJqOyudN0tPT9W69urX93pb+mW+8bmpQue47q57cMcxkUqlBw3pv5ORlP1ZwiYzKzYvYyCX5zCuEYfUWKc/m6CysMDg/YdN99V9Z/MoZ6xQr+wPY+f9egACAWfWgBj2qzTtXevTBjH2G3uYhLkY9C+z5XGDl2FBDZYriZfbKbdI0ufuCPxAkbgI5IuJ33zdgwLmTme3tDlsFxczzgoIq/Bxfr8G3r097/TubzVZmNVitvz39lMjKN2Mzb8vSryLt3p67tGqQcq6JWbG1MHGjoYkb1T0VhHmUXWR+xVWAhISEAxI6CLpORIwMRoxxzoTKOTzL/qb8GFwDgI583a5rxE9rJA46SP222OGzM9fe4/tWIbULy4GaA6kMsMjf6wMpioKJE5+KP/TT4e6xNWI2T3/+lR1Wq5UfPnyYpaWlGeNGjWu85qd3vusw7QJ1aqDyHy4YtOwJT1HN1mTqxvXpk2QbqeAXA4rcU5ST7koY4G0KaPb5sh1jz9Aar77NU5bl5Ob0L7hMemzXfD50TgHz9ud4f7ekH88YVNnsJ4K3N7KseOHrNX/lINI/EyDuz2YKM8lm/WPmnSk4+uDZ/Ybe9hEuRk0Gdn0usGpsqKEwRfHy8M5v1bRD99mzX//2/wsSt+b4/PPUqjOmzl9+9kJmS+5hh64BjmIOhQn4+JvgH+izM7pq1PIJT09eFRcXl30rQHESkVnZZoAnI8VgVzmLHBvPrQmq7Hu6hkkU1VC4PdqkGJGMEKEwGSYYAhgMb8aYB3OqHIUxuBJojIigAVRsAPkSyNaJXzYkP6dL9YyDTIcLS70P77a3Pj2ycqOSq8FrEU62398PCgDgnKN33x5jLl6+2N9W4mhkK9LNgYF+323dtrWViyNAWiwWsWbNWqN198YvZlXeP/7+mZoW5cOVL3cbxmeT/ZQWwckjV767fsE1z7IcT/KsBdMjli9OTc3JyW5elA2t7n/zlMEvFUE1cXz8vZQHTxos3NuH++6o88ga6665llT5l7Mj/qmuDoEYA+MKMxnNB8TOP51/ZMTZA4bebhQXj40n7PpMwaqnKhqCccXbwyc/uWWH7q+//vtB4tIcjIh8W7Vq891l30O12z5eoEXHAHAwduFHhX5MN+PEFm9BxR5cgRkBQV7nI6MilvUbeNfbgy2DjxiGAQDcYrkyVuFmwsRAHbYZc1g7nq7T9a6nlfiiuz7wrhJw1NME3ctLkIkJMilmQ+gauCcFSLsBew5YwQW9Rv69lboUX4+nmgh8M6z8Mg6TBanyD4qWMSEUSu7SYtflrIuNpMlmeMYUGUU2qSaENG2a+sZnu1wSXLrzIXV6VEkPbp/ZfOgYpnsAPHW9pANzglmPOr17zJq18NNfnqX738eOH5v49caNa3Jz82KL80hrMSpHGfhsCQwo+GSPIQ+fMXi4hx/57qh9f1rKzneSrHSbEk874/NcYWa0stSZH9lZJR7OtY4zFPkBKXLiBrOsFh+pxyZEU/2mCXkTJ05s497I35N3EYIjKantnMgOHvRCNmzrSJUryCQXOVS5hhS5mph84BCXwbW89biOoVp45SiKjqpJjZs1LO47sMc7s+a+0sxsNpd38sXvAWoqWcQmsiqbyKo4cw2/j0TbWRNlEURWxZmctP5pzJHuPbf0szyaeG+IMTaTO14nOFq8qlLzB+pMAa4whVhdpOBPTRoSG/uf4JwBa5lcTYr+Nil62wVc1u4UkTfzuefqA0DDhg1VVw5FAYDHHnusbd2G8ZcjoyKpYlikNniOl0wjIZeQSfbfIbR6H4G6f+xvu2tS0gCAIWnT7V+o6AQJTGg1sNa8yK4q8cpc6zJTkR+SkBM+Mctq8ZFabEI0NWiamD958uS2twoS90V+esyYZiE1A/WHvoO2njyM6Sc8jdp3cT28JzMaPs20fisVreYgVVbvq8hXiclnPjMbre8OcoRHRVCViBiq37Au9ezbZUPKC5O7e3p4llket9qwdT2H35ncI+askbrei9zlFLcMBDcx2+8BkfsZp46YWSveUkUbewbyfVK1AWs51RlWefcvf5N7zwc/2aNn7H3+9OB2pq0l1ZirKXrLNxWq2zXm9PsL3q/hfr+qKLh/xP1DE+rVtkVERFLlqCraw+95yPdJyLkOk+z2jdAafgrq9XGFrLse79gOwL8CHGVS1Q2SNnfHL4jqrhKP4Fr3150gGbfBLKvGR+qx8VHUqFm9ot8BEk5EIiYh9tvGoxmtJEV7q8hDxt7FKaStB8X+J4Ai+nuSd2NGzJtRYKKiDdmoGO+SkO+TkFN3mo3ODwVokbHhMjysOiXUjafO3dp9OXbc451U1VTmzP8T99Y5xCjpVz0Tv3PADiMipWG7Bnv7rhe0llTtmYNM1nrY3zF60rCa5YHkPB8oAEOvUUljaj3oTeN+Zo61pMo3HIreZpFKjXvXyRh1z9jBT7/waJOuPTosSqhfi8LDomR0rcr601+a5XpS5MxCVSZ/LhxNNzLqu77imcGDB9ctr63+NasMJMyM5EEJi6N6mohHcq3nm1dAUi2hih4TH0X1Gyfkjx8/PumXB3Ij7TFwSO+eIfV8aNxhpq0j1ei/jBvBCf6Fdz/RefT48U+1H/JU74cbdq35aWiNAD2wqSD/DqCaI7k27BPFeJucv+GVn1TZd6KfVrVOJT08rBrViY+jth1afTh16tT4Mi/8H7rMJjNefvn5qvc+8J+uRBT4y/25OTPLeSnbJXd4ttkLPrSQhGOBTTgaPmem1g/WfeSaFzcJioCCtg/Uf63WSA+acoI73idFvqEpes9NKtUdEE2xEfEUHRVLlUJjjPg2YcbU701yPany2YuqbPohd7T4ilO/1MoHHu40Lsb5HUn/TmINN0hU7oF299Z/J7qniZRorvWaq8iPSJHjNphktfgqekx8NDVoWjd/zGNjkvDbbCaciFj1elW3NhrN5GpStVmFQovsbKIWTVs8VP6NJsUDox8eXa+FJeGt2oMDsyvfpVBAD0bVhzP9vo+E/jYp8mMSctZJRfab4qtVja+kR4RXowaNEwuHjxx6L2Mcf4S5dTP7VGaOuXoorve+l19+Oc5yd7/RHbslb2rcvEFRYmJdapvc7sTDo+9/iIhMtwIU93se+88TLRIHh9PEi8xYS6qj+3JOCcMjPxVQcI2hRAwWCLNiRvOhtVJrDFdpyhEnSBaS0EdlQ2892U827h2qWab6ywU5ikwjVT5yVJGJa5gjaZNCfZZGfTWi0vxgALCkWv7dPAHlQZI8OGFxVC8TqVW51ne+U4o//ZFJxsRXsdesW5UaNq37Lef8upLbbUaMGHV3q9C6fjRmJzPWk6oPeJfJoKjgU0QnPZAEJcmapLjMECetKQTGWCZUbj6oxjN17g04EvVfE1Xox6jGI9x4YKPQlrs0yqsnhOzyhJ+jUuUqVK9hXRo6/N6+17psFotFJCU5vyMpKUmx/smTrdzf//DDI1o1b9NET0isQzE1alKtRtHUfGiIntgtjOJq1qOkNkl7hj9878DyPslvAMVNymZO7FjryD3pnNaRqj32HacaIwPzXrZaQ8sFX351pnSGPBvdXzW9+jBBT+8S9jWkyjRS5LvE5UoS8gNS5EJS5cBdil7nPWjtvjZTn3nVVz0GMt+qtvtXgETAhFaDar0V1cdEpupc67dAkauJG3d9IrTY+Oo0/JF7+v7GxgnBBWo1qbk68X5O75LimOsQjmq9TVS7Tp1JjKGMVOAXzmjZ572c+Ll30qCEIXWHBe+sNsSDKt7Dqe54ZozdI/Q0UuUa4nJEmkmLqlGFGjSqf3bR+kW++JMpZg4cOBD48ccfhy1cuLDismULY1JTU/2v5VDPeP252LpNa9kSBgZr/33XW5t5TDGWEpOvFTJ94EJPrU67KlSndj1q17bttlFjR/b18PD47Qida79aJbWZ3Xa2Fy0n4Xg9R2iJEzyp06ON/gOAXcs/cP+mFXNXBNZ/uOK31cYI6r+WO6ZlKNqcItV4vVg1xpxQ9FafcEfi+6AOn3hT35nxLzGYAIa/RDP/j4JERctBNedE9TaRRzXuqD9GaPUe86CmrZuOE1xcV3u4N/T5l5+sGlwnoHjE50x+SKr+3w+ZrFA9sHC69emI3/BhWHnwEIh1uKdh96YPhX1W4wEvqjSUU7tZQn+rQJXriMt7VqpaTI1a9J9BvSzlAwiccwwdfu+AwUPvevruIf2eGDCoz6R77runfVli7BaXoqjo2qPTpibNG+U1bNzgQtMWje3de3abd41AATOpKmq2jNze6g1Gq4lr60mVb+Wp8j1S5Vri8uVspved7a3HtYmihDoNqHOnTlvGPfdEL09Pj+tG6NzAua/XsO71R4bStGKmrybV0f4thereH7XU3Vt+ozOZ1WWWX5Oxld+r8YKJ4pcwavoBoyYfMaq7jlGLDQp1WR2caXmqxX8ADhD+0hL2/70QsNUJkqT/1n4rsI5CXDFTXLUGzyqKcuPIURIUBiCxefzU2H4qLTYUx9ukOGr/V1D1GrFLXKbZTTH0laeyZFDRZ1iLTo0eCd4XcpdCrScLY7XDQ75BcCT0C5Md23Sf5o7vA8CmTZt8GjdulFczNo5ioupQXK14atcxeYn7vt/qhqiqiubJDffE1o+kWs2i9BoNI6hxUuIGxq42Nd0Odat+jZ6r+V8PmlOiOJZpimw6TZGdFyty+hnVcJo4XE67yPUeM3302s2rUr3ExtSzd4+vU6aP7+ja46uA4jbHclJz/BO6x2Q+8D2j9aRqw77kVHNE0Nl9L+/zLm+O/RolbjNWQdLImgMaTQ34tOFs73PNF/lkdlgavKPnrOpTHmlhdTIo3q7zO/6MPIlJmJHQMG5ZvVa1XzOZVfflZjeylY8c2eAXXKtCxoDFkB+Sqj+ynRkhCf40dPDgpvgdiT6LBcJ9wK/VXRdQd3jwgbAeXM44ZdJXEHc0f9KX2jTqPA0A4uLiTADw6JPDq1atV7modq9ALenpwJLavYO0xi0avMmcP/FWAcJUoaJmy+ivui9T5NRcpbTDXCFrtovYqgoV18pDPPj0Pc0iOwTIUXu4kUaq7LNSleGjBNWaxqjvGkWbmaka75Mq3yMunz/Htc5TffWaTapS/cTG1L1nl3XTZ1lbCHGFwdNtgnLG0bxt89Vd3jXTalIcU88Kvc5Yb+r3eFKHm/JlyvwUgWFBT/mOqDbCn5Xbjv8FcPxTbD4CQA7Djp8PHL334LYjYxx2jQHXrShFUlKSAID7xzzXUwkqDm/cVRilAO37gnEfGbR9yfLluwDgVgvb0tJgIAUypgvMY/b3zYvQEtLMHirjXlISAL2YoJg9jgEA6jj/pmJkAC/1KVTqP5KrDJmRK6oOzFeKi+1e7vEmvyMPAc1hlAZXBEsM4KxiODGNkSfD1Z/nKvnAvBnv7jXpPseO7QEXYLJaosECz4cWBpaGnT/4MymLl+s8dYPUL2QLqlNZiPsmFPGB753Rg3odkccvHO/z3uINW3r17vrezLnTGnLOjZSUFBkTE6NMfnYyj/Cq9kXWAW9ckJJVieDSP9yBDPuF7gBDWlwau+GZMpDFAgEy+JLslwsXnFiQT1xHkhUKEdj/wtTZf5JTRADg0DQY0mBu0Fzvzenp6VJwgTMXzg8Mra1RVCWFzhZLyjrhiRrhsV8wxspA9HvWsc+gKULB+WP5iZVqGIgIYTifTUrOUZWiq1TcDwAhcSESACqFeJdyMIdHqYIKMMFMAHFudg8AulWASClhaLA5Sp1CWHDAkLoKzn69ZxYIzrgj1C90U8ZBBbkgIzqW4BliUKcdE3pWzamV4lMSlLv3EFMXvWvw9V+TnlegUINoJoY8X8D6vHtC9+9yjP146sjA1QvWf9e7X/fFC5e+VvvEiRP2lJQU2Ty25WbHsYDSk6ek4gvGqlQ1UKDldaJNUkHKb1/wtDQYcLYJOIMaEkhPgc7+gm7A2w0gvwLLb5hkMuv47gAHlTQLrELMBCayswlGthd8VV8JQGZkZPx/Si5owStvxmbZzveo00EnHzB+6Bti9myPC4tXzf8JAJKRLAHAZPbRiZih6xIMgDADOhmm33UFLK5wATHNMFw0LwpBUZjJ7rArv7T9LbCAQIgMi/iw8JQHTp4wRCUT14LrFfity11eZ+Mrh6e02TmyfpVLNWaqBT55O/YxdeEKg3+yjYySEoWa1WBi6Iw8dF96QvdIOqocPnZk2ILX39vdf2DPuSs+mhc7fs6YE2qe/5bTPyiQIKpaA5LMpbUe+HxgXQB0CyYs/Q5tegcgv2dZrVYGAC8teDtSmoxQXSdIGDAJcEcmpxPnjw1dsPTNGseOHbMzxigp6da4d1MOpzAAtHxd6kivWvke9VoKvQBSHtwoyNvXK10RShEAkTIlhQDAw+A6A9Ol4fQ6hErQpWai/4d0UJiiG3YCQEyogGpSzHATW1B5Ce00s2aPnbkFRV4Xj3wPYQanqvU02HyzepFV8lc2TD391Ss/PtViy70NIjKjZ1GOV+HW3UxZuFrnX+whw7Ar1Doe4v7Xc6nL4hO6aHrM68Dhnx96I2XZ94OGDHi+QdVGRy9874ksSFYthhu+lez8hO1oDwC4dGMz639+/U/HnQsLbQ7haRiZx4BcA6gaSjy4kkFZWQVRb82Zv/WuuwY+RkQ+6enpuqscXPz2fBFiSIM8c+hQhdP5J++J7VhKESbOfzhM/MKPZhYVHbrCkAYslityPNzkr0mCrhlOK0JVCcQ0E7s5bXjNZTabpe5wGvLCRABnHgBMLv3ySzyJijVrF/iZA9LP7OcoBFC1loQ5vDB5+u5P/ImINRxB6uyNs09+NfPY47U392wYlhkxT7/sY9u0E8qiNQbffIgMritIbkDi/nnZsv3847pMOOq95dtdkzZv3DIy9xjkRRsXgSbGKkZpyNNyuxMRS0/55/sR/zqApKQ4JfcgddJpTy+RcekMaNM6QgVVoOPDhUzjdnkxszBk36E9bzRu3mBvz97dn/z2229DARiuZqjrAiU5OVkAoEeeemYQVc4Ja9qVGxLAzo+kEA7vI58v27YRAEtLQ1lTVcumjaQqFEO3EwjEhAIoiuLhCjPf2rrkhB1nwq7rTh9EUQAppfrDdz+I6wQsmEEGC/ELXJd91Ixz2ZKH+3EjqE5J8NrzL7VijFG1XIu0WsGRSmLVl6uObp5+5uHYLW0ah2SGLSrJ9LR/sR3KkvUG++4oDA+psA7NpBi+JFu2nXtKR91TSv5ZyS6VShCIV60GyssorPv8S6NjANDtnOD7X30wggWixWtRpQFqYKpPCGcbZkv9468ILboYeHR1FguLL5Z5OQ4981x27M9Hf5z5yKgH93fp1mnGa3Nfq6kI4QbKL0vDWXJysiQi5efMoyOi2hdSbKhgJ7NIHtmqonJYxQWMMTuSIK7SDGF1JeeKbjgkGBhxFYBCiivM+/taXpmwGVo5gEBnJw7uv+Z5bd6cbgCgQV37btayPAuP7JeKH7gR2cBOpf6Xe3JwpCENKSmQGAgDVnCkSpH6ySeHvnk+84Gorc0bB5+ruDz/rIe+YSspSz/Wsfc0DB8orGuSIZ78UKNOT+oQFxUIQ2E1E5mucpspffveLs7v33wHIP+4lQYCiHX0HT49WAk5rgZI0+oU0he8RQhrbmD8hjx277zLIrJJsVFU5NAvZuaHHTt+9Ol3Fi36vn2ntstTUiY3N5tMMi0tzXCbXzFdYkwpKSly2OBhfRzBWQlNe0Oawdi29VKxX/bKGta5/1IAoPRfmRUaY7AbmhNnQgXAyfQ7o1hOTBG3k+Y0pxSVgcjgB7NOMaeHfvXnuiJCfMTwiRe8hf/2k/s4HACqxhuMQvI6GI8ZZqTBKDMKXUCxuoDywQdfHvwm5cK9kTvrNg26ELIy+4wnfbiVlHe/0OmHTGYEgKF/DwNta3GYBAE+jClV7MguudxbFSrS09PlHYD885aEFWz68gnZ9UWnbqFeIQf8qzB18wrJUu6SxscfEeJ7aXhqbR4f8e5lEdelUNoNh3bxfKHnkaPHBqetS9vWvHXTT0Y/MboPEXkyxoxjnx2zE1HI/hP7plbunEfx1QQyS8nY9zlnwQEBy0eOTMmCBYL9WisYBLLrhlviEwiGB65oEHaL8ICmazZDdzkYJgYDBjt79kd2dQzrKjOLa4aGCl6BH1z8yYRMu2SRlZj0rV5Ute2uXo0AwGKx8KtN1auB8uHq775Pn3Dpnuj98S0DzoWsv3DSg6/dIpVVmw25PwPywBkHVn6k462nGcs6JnVHxayG816fFw4X99UdgPzjnBFIWMGXv7f8yIDjk1qHyMozwqt6ljh0KGmvSGa9j4wPP2YU1drAqMUFbNS6y0rjQfmSeTj0y5kldPLEmW5ffvXZuqR2Lff9556Bcx4aM/y5zu06pedXPlWj1d0gH3C+7QOpFJz11No2aL4AAKxxV4HDGcUyeRAkaYYBEMAUlcAEPGya7XfnYUgjm+vzoAiAMUMpKbE7o1jWX0MkOdkZcq4f0/CL4gyz4/hhUoLA9SoNbbisnOrOAKRdunbE6ZdAWbdo5/ZvxmX1jdid0D7gXOiX5854iDUbpVi+DMb2fZCFmiEUfyjSUwv46GBqEwAYOHAgvwOQfzBIUnaOLti7+uy42OwWjSJ9wpdWqeplt9mYsvZ1gz93nzRS14H8a0s88EoRe/LTy6LtqBx4htj1rIslxtGfz9bYu3fPw+mfbZ98KOtQ7WZPFMn4ypxl2YWxbS2xkAqBn86bnvYTrOApKfilOcGIJLgQmqE540uKiYFxUvDDrZdSuOc/cKE4CBwSgOAExpjwCzGbnPi4ZuBCAmDzXl1yVLF57zmx32k3Vks0oAXkdJJEDOk3jjhdBRQy+EeLdn6d/mR2xyr743sGFFT41i9CKIEVVBHIAk4FaZXnVymI61UxMHpT+XDzHYD8U0ECMFhIbNjw5Y87l54fUjO3TeMo7/C5kVV98g0SykcLJX9+iJTvLIfUfAmDJpTimS+zRP8Z2TwmucTwDi/R/BIuaN3fyDbaN5fMB2b6aJHGCi96oEFM3DSDdFgOX69pCRBcGLpGTp/BzGBwXZxdfPZ3axAPs0m6M+eMAYwzBSYvF5uE9drgSoLQDA0VfII+zzikIAdAlaogryrFib1bD659sxGnlBRIMEiLBYJIY+tf3fXx1tH5rUJ2JVjCfmjcY8LebxIOpJ1/cOOq7R8tmLEgH/+PcPY/fd1ObY2ENFeE5rBkH6R9ehBgj1h6DpiZEbJ7aIXo3GEFjpLKm9dq2PYxZHxLTkm9ibW718463mvnhQ7GVRPBAwylEFi/TjO2fmioEcHBaave3LgdVvC0a8f8GQikqKquGQwSDIoqoZq5zxa2z9tqtdoxBZiCKb/6wylTpvwKcDt2rBDAMcOAhOrjKkYjgEBCh37D8woNtRCQhuqR1T7dcfSU9eSxIqVuDNNDom3qqR0/dwNwePPmFA7gpqS9q0zESfi2RjM+m7tnDQBsQDxggbA43yNvV3DcbgApr02cJdeHiaWlpZ0E8Ox/G4+bdSo+7a6AyjkjiozSxAPbNOz7RiKqFtPrtWGIqgWmKpzlZBHt2mgYB7cYpgo+AWebUZfRB7Dghg4oSYB78FJDJ0hIePgyqfjKoIMXd1Wd/urzWUgBUq7Nh3uti2U3m8wwmXg7n8oSCohpNkA3pGRCM258odMMAGzlm+v2RjYK++mnb4tqN4nhekQdO06y3J5m1TQzPd1xy4m9NFcEzGJxWhxpaZBIg5GG23/dvo3xVwEFbHna9Gzswpz5oAXv3ZfQPaDipWFFelGXy5ma+uHbEkJICAXQNALnXAR5+p2Oyq7bZ8HGBZnl2QB/tSxgMs0AmHZJ1xkckPAL5qSE2vmWHZteeXPJq48/OnTMCTjHOzDXniuZmZns1KlTppycHKWwsJAVOgpNF05f8D5x+kRwxulTg0/nZ3SrX92QAiRyLzHoJB12yi5xPtoNyacF51yPa1Tr65++zq198j4DLBrQvPMbvfn87IgR40acuxne4muB2QWUf9W6/ZkjrlxsZrGAj0xjGpZiPcDXd+7fsE5R+Pledv/SJIemxWgaeXMzv2wq8fkq5njLGWm70i7cEBwAcAlMQkLlIqOwgFNeMRDiDR5Sy0E/v3+x9eJ5i3anLl9zXlUVBxEJAIo0DEXTdUGQKkkISTojgkKSTAZ05GdqMMUVyJpROjNgohM/SaieanEjo3XBEmwAUq5v0lgsFkpLS0PV2IhP9p4888jytwyQL+y8ZqHXugMrewOY457zgTvrN9e/sc2RWSzgaXGgKxefw5q02CMz9Dvz/LT5BQwuGs/fAofTMVbS06G3H1z3np+Mn97t9aimd2whxJEMAyuGBMvMPWauejKmmhSnt+3mJWXsqgwJYwQmGAmVpHdoKfWYelk0bsFx7IJqzJteInwKw3btX3y+mSv5eH2bn4iBMdq+/IjfvaktzpRUzvIPa+AB2yHzhbBLdZ79cvW2hS72duPO9b8DkBsvK3gSwNMBeRUQbkz//6vPQArk8L7DIzb5pB4xhReZhzzFUCOIscs5wO51Zso+pYIMRsIEcDMxoRAUE0HxABSzhKoCqgkweRPzDdYRWU+Hr4nhdCFD6hLSLl1kpsrnazzzzdIfXnID8reikxxCNh9Y+6UiJadaSGDQsoQ9/ba+tv25nNvYn74DkL9wL27tFlkgkMaNxvdGzs4OPfeIpyfZk3sxNbEeWLBCZfQndI2XAfdgAwYHAJsDlHWZ4dRxon07oZc4DLPf5eCTnY6mNJz+ycN5RGWlJTfxQBwMDPKKsmC4g5A7APlb9tEK9nCa1Wt78ryPS4LzkorzDPj6QwaEMOnpDXIX9kpiMIggDYKugekGg64TdI0xTSem6+AGAeCAtw+HV3bgsaijyQNSU1P3W6+dqPzN32U5XFZ9fAccdwDyt+4ljcB8r8OPTZtsD8wdbIMWoUM6byUngDldD84YGGfOBKDrL7mzDhhMQle4yPUgzxOe+cGfNPtm6JyU7U/m3Iw/dGfdAcj/BEgAYETDZ/zPtPw0gXxKYwxpBECRRCBOGpMKVGlWvHUTU+yMmL3EZi9lGreZdd8ic7HnpQqHYy/P27UgW7oH/94Bx511W4Hkj6CzoTL2wjtC7I4GuT331mIBvxR3E3u8GQgNBQEWxMWlUUrK/ybBwe24/g8d70zgEGAeOQAAAABJRU5ErkJggg==" alt="Q8 Logo" style={{ width: 80, height: 80, objectFit: "contain" }} /></div><div style={{ width: 80, height: 80, borderRadius: "50%", background: "#4a9c2f", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", fontSize: 36 }}>✓</div>
            <h2 style={{ fontSize: "2rem", fontWeight: 900, margin: "0 0 12px", textTransform: "uppercase" }}>Buchung<br /><span style={{ color: "#4a9c2f" }}>Bestätigt!</span></h2>
            <p style={{ color: "#888", fontFamily: "sans-serif", fontSize: 14, lineHeight: 1.7, marginBottom: 32 }}>
              Hey {form.name}! Zahlung via <strong style={{ color: "#fff" }}>{payment==="paypal"?"PayPal":"Kreditkarte"}</strong> wird verarbeitet.<br />
              Wir freuen uns auf dich im Q8 Sports Lounge! 🎱
            </p>
            <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 8, padding: 16, marginBottom: 32, fontSize: 13, color: "#aaa", fontFamily: "sans-serif", lineHeight: 1.8 }}>
              {(isBillardTag||isSelectedTuesday) && <div style={{ color: "#3a7a22", fontWeight: 700, marginBottom: 4 }}>⚡ Billard Tag Aktionspreis</div>}
              {selectedDateObj && `${DAY_NAMES[selectedDateObj.getDay()]}, ${selectedDateObj.getDate()}. ${MONTH_SHORT[selectedDateObj.getMonth()]} ${selectedDateObj.getFullYear()}`} · {selectedTime !== null ? (selectedTime >= 24 ? String(selectedTime-24).padStart(2,'0') : String(selectedTime).padStart(2,'0')) + ':00' : ''} – {endHour} Uhr<br />
              {persons} {persons===1?"Person":"Personen"} · {selectedDuration?.price} €
            </div>
            <button onClick={() => { setStep(1); setSubmitted(false); setMode(null); setSelectedDate(null); setSelectedTime(null); setSelectedDuration(null); setPersons(2); setForm({ name:"",phone:"",email:"",note:"" }); setTouched({ name:false,phone:false,email:false }); setPayment(null); }}
              style={{ background: "transparent", border: "2px solid #333", color: "#fff", padding: "12px 28px", borderRadius: 6, cursor: "pointer", fontSize: 14, fontWeight: 700, letterSpacing: "0.1em" }}>
              Weitere Buchung
            </button>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

function SectionLabel({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.2em", color: "#4a9c2f", textTransform: "uppercase", marginBottom: 12, fontFamily: "sans-serif" }}>{children}</div>;
}
function PrimaryButton({ children, onClick, disabled }) {
  return <button onClick={onClick} disabled={disabled} style={{ flex: 1, width: "100%", background: disabled?"#1a1a1a":"#4a9c2f", color: disabled?"#333":"#000", border: "none", borderRadius: 6, padding: "16px 24px", fontSize: 15, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", cursor: disabled?"not-allowed":"pointer", transition: "all 0.15s" }}>{children}</button>;
}
function SecondaryButton({ children, onClick }) {
  return <button onClick={onClick} style={{ background: "transparent", border: "2px solid #1e1e1e", color: "#fff", borderRadius: 6, padding: "16px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", letterSpacing: "0.05em" }}>{children}</button>;
}
const inputStyle = { background: "#111", border: "2px solid #1e1e1e", color: "#fff", borderRadius: 6, padding: "13px 16px", fontSize: 15, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "'Montserrat', sans-serif", letterSpacing: "0.03em" };
