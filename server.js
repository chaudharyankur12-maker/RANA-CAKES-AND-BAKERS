// RANA CAKE & BAKERY – order server
// Chalane ke liye:  npm install   phir   npm start
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/* ---------- .env file padho (agar hai) ---------- */
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith("#") && process.env[m[1]] === undefined)
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TG_CHAT = process.env.TELEGRAM_CHAT_ID || "";
const WA_TOKEN = process.env.WA_TOKEN || "";
const WA_PHONE_ID = process.env.WA_PHONE_NUMBER_ID || "";
const WA_OWNER = process.env.WA_OWNER_NUMBER || "";            // 91XXXXXXXXXX
const WA_ORDER_TEMPLATE = process.env.WA_ORDER_TEMPLATE || "new_order";
const WA_OFFER_TEMPLATE = process.env.WA_OFFER_TEMPLATE || "bakery_offer";
const WA_LANG = process.env.WA_TEMPLATE_LANG || "en";
const WA_VERSION = process.env.WA_API_VERSION || "v23.0";
const PUBLIC_URL = (process.env.PUBLIC_URL || "").replace(/\/+$/, "");   // jaise https://rana-bakery.onrender.com

if (!ADMIN_PASSWORD) console.warn("⚠️  ADMIN_PASSWORD set nahi hai – admin page band rahega.");

fs.mkdirSync(DATA_DIR, { recursive: true });
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const CUSTOMERS_FILE = path.join(DATA_DIR, "customers.json");

const loadJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
const saveJSON = (f, v) => { const t = f + ".tmp"; fs.writeFileSync(t, JSON.stringify(v, null, 2)); fs.renameSync(t, f); };
const loadMenu = () => JSON.parse(fs.readFileSync(path.join(__dirname, "menu.json"), "utf8"));

let orders = loadJSON(ORDERS_FILE, []);
let customers = loadJSON(CUSTOMERS_FILE, {});   // phone -> customer

/* ---------- Supabase (free online database) ----------
   SUPABASE_URL aur SUPABASE_KEY set hain to data wahan save hota hai,
   warna data/ folder ki files mein. */
const SB_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SB_KEY = process.env.SUPABASE_KEY || "";
const useDB = !!(SB_URL && SB_KEY);
function sbHeaders(extra = {}) {
  const h = { apikey: SB_KEY, "Content-Type": "application/json", ...extra };
  if (SB_KEY.startsWith("eyJ")) h.Authorization = `Bearer ${SB_KEY}`;
  return h;
}
async function sb(pathq, opts = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${pathq}`, { ...opts, headers: sbHeaders(opts.headers) });
  const t = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}
async function loadFromDB() {
  const o = await sb("orders?select=data&order=created_at.asc");
  const c = await sb("customers?select=data");
  orders = o.map(r => r.data);
  customers = Object.fromEntries(c.map(r => [r.data.phone, r.data]));
  console.log(`🗄️  Supabase se ${orders.length} orders aur ${c.length} customers load hue`);
}
async function saveOrder(o) {
  if (!useDB) return saveJSON(ORDERS_FILE, orders);
  await sb("orders", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id: o.id, data: o, created_at: o.createdAt }) });
}
async function saveCustomer(c) {
  if (!useDB) return saveJSON(CUSTOMERS_FILE, customers);
  await sb("customers", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ phone: c.phone, data: c }) });
}

const rs = n => "₹" + Number(n).toLocaleString("en-IN");
const clean = (s, max = 300) => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

/* ---------- Notifications ---------- */
async function sendTelegram(text) {
  if (!TG_TOKEN || !TG_CHAT) return false;
  const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TG_CHAT, text })
  });
  if (!r.ok) throw new Error("Telegram: " + (await r.text()));
  return true;
}

// WhatsApp template params mein newline/tab allowed nahi
const waParam = (s, max = 400) => clean(String(s).replace(/\s*\n\s*/g, " | ").replace(/\s{4,}/g, "   "), max) || "-";

async function sendWhatsAppTemplate(to, template, params) {
  if (!WA_TOKEN || !WA_PHONE_ID) return false;
  const r = await fetch(`https://graph.facebook.com/${WA_VERSION}/${WA_PHONE_ID}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${WA_TOKEN}` },
    body: JSON.stringify({
      messaging_product: "whatsapp", to, type: "template",
      template: {
        name: template, language: { code: WA_LANG },
        components: [{ type: "body", parameters: params.map(p => ({ type: "text", text: waParam(p) })) }]
      }
    })
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("WhatsApp: " + JSON.stringify(body.error || body));
  return true;
}

function orderText(o, shopName) {
  let s = `🧁 NEW ORDER ${o.id} – ${shopName}\n\n`;
  for (const l of o.lines) s += `• ${l.name} (${l.size}) × ${l.qty} = ${rs(l.amount)}\n`;
  s += `\nTotal: ${rs(o.total)}\n\n👤 ${o.name}\n📞 ${o.phone}\n${o.mode === "Pickup" ? "🏪 Pickup" : "🛵 Delivery"}: ${o.whenText}\n`;
  if (o.address) s += `📍 ${o.address}\n`;
  if (o.note) s += `📝 ${o.note}\n`;
  if (PUBLIC_URL) s += `\n👉 Order manage karein: ${PUBLIC_URL}/admin\n`;
  return s;
}

// CallMeBot: apne hi WhatsApp number pe alert (aasaan setup)
const CMB_PHONE = process.env.CALLMEBOT_PHONE || "";   // jaise 919873562718
const CMB_KEY = process.env.CALLMEBOT_APIKEY || "";
async function sendCallMeBot(text) {
  if (!CMB_PHONE || !CMB_KEY) return false;
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent("+" + CMB_PHONE.replace(/\D/g, ""))}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(CMB_KEY)}`;
  const r = await fetch(url);
  const body = await r.text();
  if (!r.ok || /error|invalid/i.test(body.slice(0, 300))) throw new Error("CallMeBot: " + body.replace(/<[^>]+>/g, " ").slice(0, 200));
  return true;
}

async function notifyOwner(o, shopName) {
  const results = [];
  try { if (await sendCallMeBot(orderText(o, shopName))) results.push("callmebot"); }
  catch (e) { console.error(e.message); }
  try { if (await sendTelegram(orderText(o, shopName))) results.push("telegram"); }
  catch (e) { console.error(e.message); }
  try {
    if (WA_OWNER && await sendWhatsAppTemplate(WA_OWNER, WA_ORDER_TEMPLATE, [
      o.id, o.name, o.phone,
      o.lines.map(l => `${l.name} ${l.size} x${l.qty}`).join(", "),
      rs(o.total),
      `${o.mode} ${o.whenText}`,
      [o.address, o.note].filter(Boolean).join(" / ") || "-"
    ])) results.push("whatsapp");
  } catch (e) { console.error(e.message); }
  if (!results.length) console.log("ℹ️  Koi notification set nahi hai. Order:\n" + orderText(o, shopName));
  return results;
}

/* ---------- App ---------- */
const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "50kb" }));

app.get("/api/menu", (req, res) => res.json(loadMenu()));

// UptimeRobot isse har 5 minute check karega – server bhi jaagta rahega aur database bhi
app.get("/api/health", async (req, res) => {
  try { if (useDB) await sb("customers?select=phone&limit=1"); res.json({ ok: true, db: useDB }); }
  catch (e) { res.status(500).json({ ok: false }); }
});

// spam rokne ke liye: ek IP se 10 minute mein max 8 order
const hits = new Map();
function rateLimit(req, res, next) {
  const now = Date.now(), ip = req.ip;
  const arr = (hits.get(ip) || []).filter(t => now - t < 10 * 60e3);
  if (arr.length >= 8) return res.status(429).json({ error: "Bahut zyada orders. Thodi der baad try karein." });
  arr.push(now); hits.set(ip, arr); next();
}

app.post("/api/order", rateLimit, async (req, res) => {
  const menu = loadMenu();
  const b = req.body || {};
  const name = clean(b.name, 60), phone = clean(b.phone, 10), mode = b.mode === "Home Delivery" ? "Home Delivery" : "Pickup";
  const address = mode === "Pickup" ? "" : clean(b.address, 300), note = clean(b.note, 300);

  if (!name) return res.status(400).json({ error: "Naam likhein." });
  if (!/^[6-9]\d{9}$/.test(phone)) return res.status(400).json({ error: "Sahi 10-digit mobile number daalein." });
  if (mode !== "Pickup" && !address) return res.status(400).json({ error: "Delivery address likhein." });

  // Date/time India time (IST) mein
  const when = new Date(`${b.date}T${b.time}:00+05:30`);
  if (isNaN(when)) return res.status(400).json({ error: "Date aur time chunein." });
  if (when < Date.now() - 5 * 60e3) return res.status(400).json({ error: "Yeh time nikal chuka hai." });

  // Price hamesha server pe calculate – customer badal nahi sakta
  const lines = [];
  if (!Array.isArray(b.items) || !b.items.length || b.items.length > 40) return res.status(400).json({ error: "Cart khaali hai." });
  for (const it of b.items) {
    const item = menu.items.find(m => m.id === it.id);
    const size = item && item.sizes.find(s => s[0] === it.size);
    const qty = Math.floor(Number(it.qty));
    if (!item || !size || item.stock === false || !(qty >= 1 && qty <= 50)) return res.status(400).json({ error: "Menu badal gaya hai, page refresh karein." });
    lines.push({ id: item.id, name: item.name, size: size[0], price: size[1], qty, amount: size[1] * qty, advance: !!item.advance });
  }
  const adv = menu.shop.minAdvanceHours || 0;
  if (lines.some(l => l.advance) && when - Date.now() < adv * 3600e3)
    return res.status(400).json({ error: `Cake ke liye kam se kam ${adv} ghante pehle book karein.` });

  const total = lines.reduce((a, l) => a + l.amount, 0);
  const whenText = when.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const id = "R-" + (1001 + orders.length);
  const order = { id, createdAt: new Date().toISOString(), status: "New", name, phone, mode, address, note, when: when.toISOString(), whenText, lines: lines.map(({ advance, ...l }) => l), total };

  orders.push(order);
  try { await saveOrder(order); }
  catch (e) { orders.pop(); console.error(e.message); return res.status(500).json({ error: "Order save nahi hua, dobara try karein." }); }

  // Customer list update
  const c = customers[phone] || { phone, firstOrder: order.createdAt, orders: 0, spent: 0, offers: false };
  c.name = name; c.orders += 1; c.spent += total; c.lastOrder = order.createdAt;
  if (b.offers === true) { c.offers = true; c.optInAt = c.optInAt || order.createdAt; }
  customers[phone] = c;
  try { await saveCustomer(c); } catch (e) { console.error(e.message); }

  const sent = await notifyOwner(order, menu.shop.name);
  res.json({ ok: true, id, total, notified: sent });
});

/* ---------- Admin ---------- */
function admin(req, res, next) {
  const key = req.get("x-admin-key") || "";
  const a = Buffer.from(key), b = Buffer.from(ADMIN_PASSWORD);
  if (!ADMIN_PASSWORD || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: "Galat password" });
  next();
}
app.get("/api/admin/orders", admin, (req, res) => res.json(orders.slice().reverse()));
app.post("/api/admin/orders/:id/status", admin, async (req, res) => {
  const o = orders.find(x => x.id === req.params.id);
  if (!o) return res.status(404).json({ error: "Order nahi mila" });
  if (!["New", "Accepted", "Ready", "Completed", "Cancelled"].includes(req.body.status)) return res.status(400).json({ error: "Galat status" });
  o.status = req.body.status;
  try { await saveOrder(o); } catch (e) { return res.status(500).json({ error: e.message }); }
  res.json(o);
});
app.get("/api/admin/customers", admin, (req, res) =>
  res.json(Object.values(customers).sort((a, b) => (b.lastOrder || "").localeCompare(a.lastOrder || ""))));
app.post("/api/admin/customers/:phone/offers", admin, async (req, res) => {
  const c = customers[req.params.phone]; if (!c) return res.status(404).json({ error: "Customer nahi mila" });
  c.offers = !!req.body.offers; if (!c.offers) c.optOutAt = new Date().toISOString();
  try { await saveCustomer(c); } catch (e) { return res.status(500).json({ error: e.message }); }
  res.json(c);
});
app.get("/api/admin/customers.csv", (req, res, next) => { req.headers["x-admin-key"] = req.query.key || ""; next(); }, admin, (req, res) => {
  const rows = [["Name", "Phone", "Orders", "Total Spent", "Offers OK", "First Order", "Last Order"]];
  for (const c of Object.values(customers)) rows.push([c.name, c.phone, c.orders, c.spent, c.offers ? "Yes" : "No", c.firstOrder, c.lastOrder]);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=customers.csv");
  res.send("﻿" + rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"));
});

// Offer bhejna – sirf unhe jinhone "offers chahiye" tick kiya
app.post("/api/admin/broadcast", admin, async (req, res) => {
  const msg = clean(req.body.message, 500);
  if (!msg) return res.status(400).json({ error: "Offer ka message likhein." });
  if (!WA_TOKEN || !WA_PHONE_ID) return res.status(400).json({ error: "WhatsApp API set nahi hai. README dekhein, ya har customer ko ek-ek karke WhatsApp button se bhejein." });
  const list = Object.values(customers).filter(c => c.offers);
  let ok = 0, fail = 0;
  for (const c of list) {
    try { await sendWhatsAppTemplate("91" + c.phone, WA_OFFER_TEMPLATE, [c.name, msg]); ok++; }
    catch (e) { fail++; console.error(c.phone, e.message); }
    await new Promise(r => setTimeout(r, 300));
  }
  res.json({ ok, fail, total: list.length });
});

app.use(express.static(path.join(__dirname, "public")));
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));

(async () => {
  if (useDB) {
    try { await loadFromDB(); }
    catch (e) { console.error("❌ Supabase se connect nahi hua:", e.message); process.exit(1); }
  } else console.log("ℹ️  Supabase set nahi hai – data, data/ folder mein save hoga.");
  app.listen(PORT, () => console.log(`✅ Server chal raha hai: http://localhost:${PORT}   (admin: /admin)`));
})();
