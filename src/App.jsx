import { useState, useEffect } from "react";

const PAYPAL_CLIENT_ID = "BAAdPHxH-oXU5vZypM2htB9c18ltzEnSm51jyV1chNpAPxQ5lVcWHLyoF4KXh67CJc4XCrxlT-YIDDK9h8";

const TABLES = [{ id: 1 }, { id: 2 }, { id: 3 }];

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
const PAYMENT_METHODS  = [{ id: "paypal", label: "PayPal", icon: "🅿️" }, { id: "card", label: "Kreditkarte", icon: "💳" }];

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
          style={{ background: "none", border: "none", color: canPrev ? "#b4ff00" : "#333", fontSize: 20, cursor: canPrev ? "pointer" : "default", padding: "4px 10px" }}>‹</button>
        <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: "0.05em" }}>
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button onClick={nextMonth} disabled={!canNext}
          style={{ background: "none", border: "none", color: canNext ? "#b4ff00" : "#333", fontSize: 20, cursor: canNext ? "pointer" : "default", padding: "4px 10px" }}>›</button>
      </div>

      {/* Wochentag-Header Mo–So */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3, marginBottom: 6 }}>
        {["Mo","Di","Mi","Do","Fr","Sa","So"].map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: 10, color: d === "Di" ? "#7ab000" : "#444", fontFamily: "sans-serif", fontWeight: 700, padding: "4px 0" }}>{d}</div>
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
          else if (isActive) { bg = isTue ? "#3a5a00" : "#b4ff00"; color = isTue ? "#b4ff00" : "#000"; border = "2px solid #b4ff00"; }
          else if (isAngebot) { bg = "#0f1a00"; color = "#7ab000"; border = "1px solid #2a4400"; }
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
                  width: 5, height: 5, borderRadius: "50%", background: "#b4ff00",
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
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#b4ff00" }} />
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
        onApprove: (data, actions) => actions.order.capture().then(() => onSuccess()),
        onError: (err) => alert("PayPal Fehler. Bitte erneut versuchen.")
      }).render("#paypal-button-container");
    }
  }, [amount]);

  return <div id="paypal-button-container" style={{ marginTop: 8 }} />;
}

export default function App() {
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

  const handleSubmit = () => {
    assignTable(selectedDate, selectedTime, selectedDuration.value);
    setSubmitted(true);
  };

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
          <div style={{ display: "inline-block", background: "#b4ff00", color: "#000", fontSize: 11, fontWeight: 700, letterSpacing: "0.2em", padding: "4px 14px", marginBottom: 10, textTransform: "uppercase" }}>Q8 Sports Lounge · Mainz</div>
          <h1 style={{ fontSize: "clamp(2.2rem,8vw,3.2rem)", fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1, margin: 0, textTransform: "uppercase" }}>BILLARD<br /><span style={{ color: "#b4ff00" }}>BUCHEN</span></h1>
        </div>

        {!submitted ? (
          <>
            {step > 1 && (
              <div style={{ display: "flex", gap: 6, marginBottom: 32 }}>
                {[2,3,4].map(s => (
                  <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: s <= step ? "#b4ff00" : "#1e1e1e", transition: "background 0.3s" }} />
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
                      onMouseEnter={e => e.currentTarget.style.borderColor="#b4ff00"}
                      onMouseLeave={e => e.currentTarget.style.borderColor="#1e1e1e"}
                      style={{ background: "#111", border: "2px solid #1e1e1e", borderRadius: 10, padding: "20px 22px", cursor: "pointer", textAlign: "left", color: "#fff", transition: "all 0.15s" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 20, fontWeight: 900 }}>🎱 Billard buchen</div>
                          <div style={{ fontSize: 12, color: "#666", fontFamily: "sans-serif", marginTop: 4 }}>Di – So · ab 12 € / Stunde</div>
                        </div>
                        <div style={{ fontSize: 22, color: "#b4ff00" }}>→</div>
                      </div>
                    </button>

                    <button onClick={() => handleModeSelect("tag")}
                      onMouseEnter={e => e.currentTarget.style.borderColor="#b4ff00"}
                      onMouseLeave={e => e.currentTarget.style.borderColor="#3a5a00"}
                      style={{ background: "#0f1a00", border: "2px solid #3a5a00", borderRadius: 10, padding: "20px 22px", cursor: "pointer", textAlign: "left", color: "#fff", transition: "all 0.15s", position: "relative", overflow: "hidden" }}>
                      <div style={{ position: "absolute", top: 0, right: 0, background: "#b4ff00", color: "#000", fontSize: 9, fontWeight: 900, letterSpacing: "0.15em", padding: "3px 10px", borderBottomLeftRadius: 6, textTransform: "uppercase" }}>Sonderpreis</div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 20, fontWeight: 900 }}>⚡ Billard Tag</div>
                          <div style={{ fontSize: 12, color: "#7ab000", fontFamily: "sans-serif", marginTop: 4 }}>Jeden Dienstag · nur 9 € / Stunde</div>
                        </div>
                        <div style={{ fontSize: 22, color: "#b4ff00" }}>→</div>
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2 */}
              {step === 2 && (
                <div>
                  {isBillardTag && (
                    <div style={{ background: "#0f1a00", border: "1px solid #3a5a00", borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 12, color: "#7ab000", fontFamily: "sans-serif", display: "flex", alignItems: "center", gap: 8 }}>
                      ⚡ <strong>Billard Tag</strong> – Sonderpreise nur dienstags · Nur Dienstage wählbar
                    </div>
                  )}

                  <SectionLabel>Datum wählen</SectionLabel>
                  <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 10, padding: "16px 14px", marginBottom: 24 }}>
                    <Calendar mode={mode} selectedDate={selectedDate} onSelect={handleDateSelect} />
                  </div>

                  {/* Angebot-Hinweis bei Dienstag im normalen Modus */}
                  {!isBillardTag && isSelectedTuesday && (
                    <div style={{ background: "#0f1a00", border: "1px solid #3a5a00", borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 12, color: "#7ab000", fontFamily: "sans-serif", display: "flex", alignItems: "center", gap: 8 }}>
                      ⚡ <span><strong>Billard Tag!</strong> Aktionspreis gilt – nur 9 € / Stunde</span>
                    </div>
                  )}

                  <SectionLabel>Spielzeit wählen</SectionLabel>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
                    {durations.map(d => (
                      <button key={d.value} onClick={() => { setSelectedDuration(d); setSelectedTime(null); }}
                        style={{ background: selectedDuration?.value === d.value ? "#b4ff00" : "#111", color: selectedDuration?.value === d.value ? "#000" : "#fff", border: selectedDuration?.value === d.value ? "2px solid #b4ff00" : "2px solid #1e1e1e", borderRadius: 6, padding: "18px 8px", cursor: "pointer", textAlign: "center", transition: "all 0.15s" }}>
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
                      const available = !tooSoon && (selectedDuration ? isSlotAvailable(selectedDate, hour, selectedDuration.value) : true);
                      const active = selectedTime === hour;
                      return (
                        <button key={hour} onClick={() => available && setSelectedTime(hour)}
                          style={{ padding: "8px 14px", background: !available ? "#0d0d0d" : active ? "#b4ff00" : "#111", color: !available ? "#2a2a2a" : active ? "#000" : "#fff", border: active ? "2px solid #b4ff00" : "2px solid #1e1e1e", borderRadius: 4, cursor: !available ? "not-allowed" : "pointer", fontFamily: "monospace", fontSize: 14, fontWeight: 700, transition: "all 0.15s", textDecoration: !available ? "line-through" : "none" }}>{display}</button>
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
                        style={{ width: 58, height: 58, background: persons === n ? "#b4ff00" : "#111", color: persons === n ? "#000" : "#fff", border: persons === n ? "2px solid #b4ff00" : "2px solid #1e1e1e", borderRadius: 6, cursor: "pointer", fontSize: 22, fontWeight: 900, transition: "all 0.15s" }}>{n}</button>
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
                          style={{ ...inputStyle, border: nameError ? "2px solid #ff4444" : touched.name && form.name ? "2px solid #b4ff00" : "2px solid #1e1e1e" }} />
                        {touched.name && form.name && <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: "#b4ff00" }}>✓</span>}
                      </div>
                      {nameError && <div style={{ color: "#ff4444", fontSize: 11, fontFamily: "sans-serif", marginTop: 4, marginLeft: 4 }}>Bitte gib deinen Namen ein.</div>}
                    </div>

                    <div>
                      <div style={{ position: "relative" }}>
                        <input placeholder="Telefon *" value={form.phone}
                          inputMode="numeric"
                          onChange={e => setForm({ ...form, phone: e.target.value.replace(/[^0-9+\s]/g,"") })}
                          onBlur={() => setTouched(t => ({ ...t, phone: true }))}
                          style={{ ...inputStyle, border: phoneError ? "2px solid #ff4444" : touched.phone && form.phone ? "2px solid #b4ff00" : "2px solid #1e1e1e" }} />
                        {touched.phone && form.phone && <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: "#b4ff00" }}>✓</span>}
                      </div>
                      {phoneError && <div style={{ color: "#ff4444", fontSize: 11, fontFamily: "sans-serif", marginTop: 4, marginLeft: 4 }}>Bitte gib deine Telefonnummer ein.</div>}
                    </div>

                    <div>
                      <div style={{ position: "relative" }}>
                        <input placeholder="E-Mail *" value={form.email}
                          inputMode="email"
                          onChange={e => setForm({ ...form, email: e.target.value })}
                          onBlur={() => setTouched(t => ({ ...t, email: true }))}
                          style={{ ...inputStyle, border: emailError ? "2px solid #ff4444" : touched.email && form.email ? "2px solid #b4ff00" : "2px solid #1e1e1e" }} />
                        {touched.email && form.email && <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", color: "#b4ff00" }}>✓</span>}
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

                  <div style={{ background: "#b4ff00", color: "#000", borderRadius: 8, padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: "0.1em", textTransform: "uppercase" }}>Gesamtpreis</span>
                    <span style={{ fontSize: 28, fontWeight: 900 }}>{selectedDuration?.price} €</span>
                  </div>

                  <SectionLabel>Zahlungsart wählen</SectionLabel>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                    {PAYMENT_METHODS.map(pm => (
                      <button key={pm.id} onClick={() => setPayment(pm.id)}
                        style={{ background: payment===pm.id?"#b4ff00":"#111", color: payment===pm.id?"#000":"#fff", border: payment===pm.id?"2px solid #b4ff00":"2px solid #1e1e1e", borderRadius: 8, padding: "18px 12px", cursor: "pointer", textAlign: "center", transition: "all 0.15s" }}>
                        <div style={{ fontSize: 26, marginBottom: 6 }}>{pm.icon}</div>
                        <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: "0.05em" }}>{pm.label}</div>
                      </button>
                    ))}
                  </div>

                  {/* Buchungsbedingungen */}
                  <div style={{ background: "#0d0d0d", border: "1px solid #222", borderRadius: 10, overflow: "hidden", marginBottom: 24 }}>
                    <div style={{ background: "#111", padding: "10px 16px", borderBottom: "1px solid #1e1e1e", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13 }}>📋</span>
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", color: "#b4ff00", textTransform: "uppercase", fontFamily: "sans-serif" }}>Buchungsbedingungen</span>
                    </div>
                    <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>

                      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                        <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>💳</span>
                        <div style={{ fontFamily: "sans-serif", fontSize: 12, lineHeight: 1.6 }}>
                          <strong style={{ color: "#fff", display: "block", marginBottom: 2 }}>Nur Vorabzahlung</strong>
                          <span style={{ color: "#666" }}>Zahlung vor Ort ist nicht möglich. Der Betrag wird direkt nach der Buchung über die gewählte Zahlungsmethode eingezogen.</span>
                        </div>
                      </div>

                      <div style={{ height: 1, background: "#1a1a1a" }} />

                      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                        <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>🚫</span>
                        <div style={{ fontFamily: "sans-serif", fontSize: 12, lineHeight: 1.6 }}>
                          <strong style={{ color: "#fff", display: "block", marginBottom: 2 }}>Keine Stornierung & keine Umbuchung</strong>
                          <span style={{ color: "#666" }}>Gebuchte Slots können weder storniert noch auf einen anderen Termin verlegt werden. Bei Nichterscheinen verfällt die Buchung ohne Rückerstattung.</span>
                        </div>
                      </div>

                      <div style={{ height: 1, background: "#1a1a1a" }} />

                      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                        <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>⏱️</span>
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
                    {payment === "card" && (
                      <PrimaryButton onClick={handleSubmit}>Jetzt bezahlen ✓</PrimaryButton>
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
            <div style={{ width: 80, height: 80, borderRadius: "50%", background: "#b4ff00", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", fontSize: 36 }}>✓</div>
            <h2 style={{ fontSize: "2rem", fontWeight: 900, margin: "0 0 12px", textTransform: "uppercase" }}>Buchung<br /><span style={{ color: "#b4ff00" }}>Bestätigt!</span></h2>
            <p style={{ color: "#888", fontFamily: "sans-serif", fontSize: 14, lineHeight: 1.7, marginBottom: 32 }}>
              Hey {form.name}! Zahlung via <strong style={{ color: "#fff" }}>{payment==="paypal"?"PayPal":"Kreditkarte"}</strong> wird verarbeitet.<br />
              Wir freuen uns auf dich im Q8 Sports Lounge! 🎱
            </p>
            <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 8, padding: 16, marginBottom: 32, fontSize: 13, color: "#aaa", fontFamily: "sans-serif", lineHeight: 1.8 }}>
              {(isBillardTag||isSelectedTuesday) && <div style={{ color: "#7ab000", fontWeight: 700, marginBottom: 4 }}>⚡ Billard Tag Aktionspreis</div>}
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
  return <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.2em", color: "#b4ff00", textTransform: "uppercase", marginBottom: 12, fontFamily: "sans-serif" }}>{children}</div>;
}
function PrimaryButton({ children, onClick, disabled }) {
  return <button onClick={onClick} disabled={disabled} style={{ flex: 1, width: "100%", background: disabled?"#1a1a1a":"#b4ff00", color: disabled?"#333":"#000", border: "none", borderRadius: 6, padding: "16px 24px", fontSize: 15, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", cursor: disabled?"not-allowed":"pointer", transition: "all 0.15s" }}>{children}</button>;
}
function SecondaryButton({ children, onClick }) {
  return <button onClick={onClick} style={{ background: "transparent", border: "2px solid #1e1e1e", color: "#fff", borderRadius: 6, padding: "16px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", letterSpacing: "0.05em" }}>{children}</button>;
}
const inputStyle = { background: "#111", border: "2px solid #1e1e1e", color: "#fff", borderRadius: 6, padding: "13px 16px", fontSize: 15, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "'Montserrat', sans-serif", letterSpacing: "0.03em" };
