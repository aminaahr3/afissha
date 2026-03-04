import dotenv from "dotenv";
dotenv.config();

import express, { Request, Response } from "express";
import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";
import { Pool } from "pg";
import { initDatabase, getPool, tryGetPool, isDbAvailable } from "./database";
import { CATEGORIES, CITIES, EVENT_TEMPLATES, EVENT_TEMPLATE_IMAGES } from "./seedData";
import {
  setupTelegramWebhook,
  sendChannelNotification,
  sendOrderNotificationToAdmin,
  sendChannelPaymentPending,
  sendChannelPaymentConfirmed,
  sendChannelPaymentRejected,
  sendPaymentConfirmationWithPhoto,
  sendPaymentConfirmationNoPhoto,
  updateOrderMessageStatus,
  answerCallbackQuery,
  sendRefundPageVisitNotification,
  sendRefundRequestNotification,
  sendRefundToAdmin,
  sendRefundApprovedNotification,
  sendRefundRejectedNotification,
  getBot,
} from "./telegram";

const app = express();
const PORT = parseInt(process.env.PORT || "5000");

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

const publicDir = path.join(__dirname, "..", "public");

function generateRefundCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = 'RFD-';
  for (let i = 0; i < 6; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

function generateLinkCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = 'LNK-';
  for (let i = 0; i < 6; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

function generateOrderCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return `ORD-${code}`;
}

const adminSessionTokens = new Map<string, number>();

interface InMemoryLink {
  id: number;
  link_code: string;
  event_template_id: number;
  city_id: number;
  event_date: string;
  event_time: string;
  venue_address: string | null;
  available_seats: number;
  is_active: boolean;
  created_at: string;
  event_name: string;
  city_name: string;
}
const inMemoryLinks: InMemoryLink[] = [];
let inMemoryLinkIdCounter = 1;

function generateAdminToken(): string {
  const token = crypto.randomBytes(48).toString('base64url');
  adminSessionTokens.set(token, Date.now() + 24 * 60 * 60 * 1000);
  return token;
}

function isValidAdminToken(token: string): boolean {
  const expiry = adminSessionTokens.get(token);
  if (!expiry) return false;
  if (Date.now() > expiry) { adminSessionTokens.delete(token); return false; }
  return true;
}

function transliterateCityName(name: string): string {
  let result = name.toLowerCase();
  const replacements: [RegExp, string][] = [
    [/а/g, 'a'], [/б/g, 'b'], [/в/g, 'v'], [/г/g, 'g'], [/д/g, 'd'],
    [/е/g, 'e'], [/ё/g, 'yo'], [/ж/g, 'zh'], [/з/g, 'z'], [/и/g, 'i'],
    [/й/g, 'y'], [/к/g, 'k'], [/л/g, 'l'], [/м/g, 'm'], [/н/g, 'n'],
    [/о/g, 'o'], [/п/g, 'p'], [/р/g, 'r'], [/с/g, 's'], [/т/g, 't'],
    [/у/g, 'u'], [/ф/g, 'f'], [/х/g, 'kh'], [/ц/g, 'ts'], [/ч/g, 'ch'],
    [/ш/g, 'sh'], [/щ/g, 'sch'], [/ъ/g, ''], [/ы/g, 'y'], [/ь/g, ''],
    [/э/g, 'e'], [/ю/g, 'yu'], [/я/g, 'ya'], [/ /g, '-']
  ];
  for (const [pattern, replacement] of replacements) result = result.replace(pattern, replacement);
  return result.replace(/--+/g, '-');
}

function getAdminAuth(req: Request): string {
  const authToken = req.headers["x-admin-token"] as string;
  const authPassword = req.headers["x-admin-password"] as string;
  if (authPassword) return authPassword;
  if (authToken && isValidAdminToken(authToken)) return process.env.ADMIN_PASSWORD || "";
  return "";
}

function checkAdmin(req: Request, res: Response): boolean {
  const authHeader = req.headers["authorization"] as string;
  const xAdminToken = req.headers["x-admin-token"] as string;
  let token = xAdminToken;
  if (authHeader && authHeader.startsWith("Bearer ")) token = authHeader.substring(7);
  if (token && isValidAdminToken(token)) return true;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminPassword) {
    const authResult = getAdminAuth(req);
    if (authResult === adminPassword) return true;
  }
  res.status(401).json({ success: false, message: "Unauthorized" });
  return false;
}

function checkAdminToken(req: Request, res: Response): boolean {
  const authHeader = req.headers["authorization"] as string;
  const xAdminToken = req.headers["x-admin-token"] as string;
  let token = xAdminToken;
  if (authHeader && authHeader.startsWith("Bearer ")) token = authHeader.substring(7);
  if (!token || !isValidAdminToken(token)) { res.status(401).json({ success: false, message: "Unauthorized" }); return false; }
  return true;
}

function serveHtml(filename: string) {
  return (_req: Request, res: Response) => {
    try {
      const html = fs.readFileSync(path.join(publicDir, filename), "utf-8");
      res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");
      res.type("html").send(html);
    } catch {
      res.status(404).send("Page not found");
    }
  };
}

const defaultChatHtml = `<!-- Start of LiveChat (www.livechat.com) code -->
<script>
    window.__lc = window.__lc || {};
    window.__lc.license = 19416545;
    window.__lc.integration_name = "manual_onboarding";
    window.__lc.product_name = "livechat";
    ;(function(n,t,c){function i(n){return e._h?e._h.apply(null,n):e._q.push(n)}var e={_q:[],_h:null,_v:"2.0",on:function(){i(["on",c.call(arguments)])},once:function(){i(["once",c.call(arguments)])},off:function(){i(["off",c.call(arguments)])},get:function(){if(!e._h)throw new Error("[LiveChatWidget] You can't use getters before load.");return i(["get",c.call(arguments)])},call:function(){i(["call",c.call(arguments)])},init:function(){var n=t.createElement("script");n.async=!0,n.type="text/javascript",n.src="https://cdn.livechatinc.com/tracking.js",t.head.appendChild(n)}};!n.__lc.asyncInit&&e.init(),n.LiveChatWidget=n.LiveChatWidget||e}(window,document,[].slice))
</script>
<noscript><a href="https://www.livechat.com/chat-with/19416545/" rel="nofollow">Chat with us</a>, powered by <a href="https://www.livechat.com/?welcome" rel="noopener nofollow" target="_blank">LiveChat</a></noscript>
<!-- End of LiveChat code -->`;

// ==================== HEALTH ====================
app.get("/health", async (_req, res) => {
  const pool = tryGetPool();
  let dbStatus = "unavailable";
  let dbDetails = "";
  if (pool) {
    try {
      const r = await pool.query("SELECT COUNT(*) as c FROM categories");
      const c = await pool.query("SELECT COUNT(*) as c FROM cities");
      const t = await pool.query("SELECT COUNT(*) as c FROM event_templates");
      const l = await pool.query("SELECT COUNT(*) as c FROM generated_links");
      dbStatus = "connected";
      dbDetails = `categories:${r.rows[0].c} cities:${c.rows[0].c} templates:${t.rows[0].c} links:${l.rows[0].c}`;
    } catch (e: any) { dbStatus = "error: " + e.message; }
  }
  res.json({ status: "ok", timestamp: new Date().toISOString(), database: dbStatus, data: dbDetails, adminPasswordSet: !!process.env.ADMIN_PASSWORD });
});

// ==================== HTML PAGES ====================
app.get("/", serveHtml("index.html"));
app.get("/admin-login", serveHtml("admin-login.html"));
app.get("/admin", serveHtml("admin.html"));
app.get("/admin-events", serveHtml("admin-events.html"));
app.get("/generator", serveHtml("generator.html"));
app.get("/ticket", serveHtml("ticket.html"));
app.get("/payment", serveHtml("payment.html"));
app.get("/pay", serveHtml("pay.html"));
app.get("/show/:id/:lid", serveHtml("event.html"));
app.get("/show/:city/:id/:lid", serveHtml("event.html"));
app.get("/show/:city/:id", serveHtml("event.html"));
app.get("/event/:id", serveHtml("event.html"));
app.get("/e/:code", serveHtml("event.html"));
app.get("/booking/:id", serveHtml("booking.html"));
app.get("/booking-link/:code", serveHtml("booking.html"));
app.get("/refund/:code", serveHtml("refund.html"));

// ==================== ADMIN AUTH ====================
app.post("/api/admin/verify-password", async (req, res) => {
  try {
    const { password } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) return res.status(500).json({ success: false, message: "Admin password not configured" });
    if (password === adminPassword) {
      const token = generateAdminToken();
      return res.json({ success: true, token });
    }
    return res.status(401).json({ success: false, message: "Неверный пароль" });
  } catch { return res.status(500).json({ success: false, message: "Server error" }); }
});

app.post("/api/admin/validate-session", async (req, res) => {
  const authHeader = req.headers["authorization"] as string;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return res.status(401).json({ valid: false });
  const token = authHeader.substring(7);
  return res.json({ valid: isValidAdminToken(token) });
});

app.post("/api/admin/verify", async (req, res) => {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return res.status(500).json({ error: "Admin password not configured" });
  if (req.body.password === adminPassword) return res.json({ success: true });
  return res.status(401).json({ success: false, message: "Неверный пароль" });
});

// ==================== TICKET DATA ====================
app.get("/api/ticket-data", async (_req, res) => {
  try {
    const pool = tryGetPool();
    if (pool) {
      const eventsResult = await pool.query(`
        SELECT e.id, e.name, e.description, c.name_ru as category_name, ci.name as city_name,
               e.date::text, e.time::text, e.price::numeric as price, e.available_seats
        FROM events e JOIN categories c ON e.category_id = c.id JOIN cities ci ON e.city_id = ci.id
        WHERE e.available_seats > 0 ORDER BY e.date ASC
      `);
      const events = eventsResult.rows.map(r => ({
        id: r.id, name: r.name, description: r.description, categoryName: r.category_name,
        cityName: r.city_name, date: r.date, time: r.time, price: parseFloat(r.price) || 0,
        availableSeats: r.available_seats,
      }));
      const catResult = await pool.query("SELECT id, name, name_ru FROM categories ORDER BY name_ru");
      const categories = catResult.rows.map(r => ({ id: r.id, name: r.name, nameRu: r.name_ru }));
      const cityResult = await pool.query("SELECT id, name FROM cities ORDER BY name");
      const cities = cityResult.rows.map(r => ({ id: r.id, name: r.name }));
      return res.json({ events, categories, cities });
    }
    const categories = CATEGORIES.map(c => ({ id: c.id, name: c.name, nameRu: c.name_ru }));
    const cities = [...CITIES].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    res.json({ events: [], categories, cities });
  } catch (error) {
    const categories = CATEGORIES.map(c => ({ id: c.id, name: c.name, nameRu: c.name_ru }));
    const cities = [...CITIES].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    res.json({ events: [], categories, cities });
  }
});

// ==================== CREATE ORDER (regular events) ====================
app.post("/api/create-order", async (req, res) => {
  try {
    const body = req.body;
    if (!body.eventId || typeof body.eventId !== "number") return res.status(400).json({ success: false, message: "Не указано мероприятие" });
    if (!body.customerName || body.customerName.trim().length < 2) return res.status(400).json({ success: false, message: "Укажите ваше имя" });
    if (!body.customerPhone || body.customerPhone.trim().length < 5) return res.status(400).json({ success: false, message: "Укажите номер телефона" });
    const seatsCount = parseInt(body.seatsCount);
    if (isNaN(seatsCount) || seatsCount < 1 || seatsCount > 10) return res.status(400).json({ success: false, message: "Количество мест должно быть от 1 до 10" });

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const eventResult = await client.query(
        `SELECT e.*, c.name_ru as category_name, ci.name as city_name FROM events e
         JOIN categories c ON e.category_id = c.id JOIN cities ci ON e.city_id = ci.id WHERE e.id = $1 FOR UPDATE`, [body.eventId]);
      if (eventResult.rows.length === 0) { await client.query("ROLLBACK"); return res.status(400).json({ success: false, message: "Мероприятие не найдено" }); }
      const event = eventResult.rows[0];
      if (event.available_seats < seatsCount) { await client.query("ROLLBACK"); return res.status(400).json({ success: false, message: `Недостаточно мест. Доступно: ${event.available_seats}` }); }

      const orderCode = generateOrderCode();
      const totalPrice = body.totalPrice ? parseInt(body.totalPrice) : (parseFloat(event.price) * seatsCount);
      const ticketsJson = body.tickets ? JSON.stringify(body.tickets) : null;
      const orderResult = await client.query(
        `INSERT INTO orders (order_code, event_id, customer_name, customer_phone, customer_email, seats_count, total_price, status, payment_status, tickets_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', 'pending', $8) RETURNING id`,
        [orderCode, body.eventId, body.customerName.trim(), body.customerPhone.trim(), body.customerEmail?.trim() || null, seatsCount, totalPrice, ticketsJson]);
      await client.query("UPDATE events SET available_seats = available_seats - $1 WHERE id = $2", [seatsCount, body.eventId]);
      await client.query("COMMIT");

      const result = {
        success: true, orderCode, orderId: orderResult.rows[0].id, eventName: event.name,
        eventDate: event.date?.toISOString?.()?.split("T")[0] || String(event.date),
        eventTime: event.time || "00:00", cityName: event.city_name,
        customerName: body.customerName.trim(), customerPhone: body.customerPhone.trim(),
        customerEmail: body.customerEmail?.trim(), seatsCount, totalPrice,
        message: `Заказ ${orderCode} успешно создан!`
      };
      const notificationData = { ...result, orderId: orderResult.rows[0].id, tickets: body.tickets };
      Promise.all([sendChannelNotification(notificationData), sendOrderNotificationToAdmin(notificationData)]).catch(() => {});
      res.json(result);
    } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ success: false, message: "Ошибка при создании заказа" });
  }
});

// ==================== CREATE LINK ORDER ====================
app.post("/api/create-link-order", async (req, res) => {
  try {
    const body = req.body;
    if (!body.linkCode) return res.status(400).json({ success: false, message: "Не указан код ссылки" });
    if (!body.customerName || body.customerName.trim().length < 2) return res.status(400).json({ success: false, message: "Укажите ваше имя" });
    if (!body.customerPhone || body.customerPhone.trim().length < 5) return res.status(400).json({ success: false, message: "Укажите номер телефона" });
    const seatsCount = parseInt(body.seatsCount) || 1;

    const pool = getPool();
    const linkResult = await pool.query(`
      SELECT gl.*, et.name as event_name, et.id as template_id, c.name as city_name
      FROM generated_links gl JOIN event_templates et ON gl.event_template_id = et.id
      JOIN cities c ON gl.city_id = c.id WHERE gl.link_code = $1 AND gl.is_active = true`, [body.linkCode]);
    if (linkResult.rows.length === 0) return res.status(400).json({ success: false, message: "Ссылка не найдена или неактивна" });

    const link = linkResult.rows[0];
    const totalPrice = body.totalPrice || 2990 * seatsCount;
    const orderCode = `LNK-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
    const ticketsJson = body.tickets ? JSON.stringify(body.tickets) : null;
    const orderResult = await pool.query(
      `INSERT INTO orders (event_id, event_template_id, link_code, customer_name, customer_phone, customer_email,
        seats_count, total_price, order_code, status, payment_status, tickets_json, event_date, event_time, city_id)
       VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8, 'pending', 'pending', $9, $10, $11, $12) RETURNING id`,
      [link.template_id, body.linkCode, body.customerName.trim(), body.customerPhone.trim(),
       body.customerEmail?.trim() || null, seatsCount, totalPrice, orderCode, ticketsJson,
       link.event_date || null, link.event_time || null, link.city_id || null]);

    const notificationData = {
      orderId: orderResult.rows[0].id, orderCode, eventName: link.event_name,
      eventDate: link.event_date?.toISOString?.()?.split("T")[0] || body.selectedDate || "",
      eventTime: link.event_time || body.selectedTime || "", cityName: link.city_name,
      customerName: body.customerName.trim(), customerPhone: body.customerPhone.trim(),
      customerEmail: body.customerEmail?.trim(), seatsCount, totalPrice, tickets: body.tickets,
    };
    Promise.all([sendChannelNotification(notificationData), sendOrderNotificationToAdmin(notificationData)]).catch(() => {});

    res.json({ success: true, orderCode, orderId: orderResult.rows[0].id, eventName: link.event_name, cityName: link.city_name, message: `Заказ ${orderCode} успешно создан!` });
  } catch (error) {
    console.error("Error creating link order:", error);
    res.status(500).json({ success: false, message: "Ошибка при создании заказа" });
  }
});

// ==================== CREATE TEMPLATE ORDER ====================
app.post("/api/create-template-order", async (req, res) => {
  try {
    const body = req.body;
    if (!body.eventTemplateId) return res.status(400).json({ success: false, message: "Не указан шаблон мероприятия" });
    if (!body.customerName || body.customerName.trim().length < 2) return res.status(400).json({ success: false, message: "Укажите ваше имя" });
    if (!body.customerPhone || body.customerPhone.trim().length < 5) return res.status(400).json({ success: false, message: "Укажите номер телефона" });
    const seatsCount = parseInt(body.seatsCount) || 1;
    const totalPrice = body.totalPrice || 2990 * seatsCount;

    const pool = getPool();
    const templateResult = await pool.query(
      `SELECT et.*, cat.name_ru as category_name FROM event_templates et JOIN categories cat ON et.category_id = cat.id WHERE et.id = $1 AND et.is_active = true`, [body.eventTemplateId]);
    if (templateResult.rows.length === 0) return res.status(400).json({ success: false, message: "Шаблон мероприятия не найден" });

    const template = templateResult.rows[0];
    const orderCode = `TPL-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
    const ticketsJson = body.tickets ? JSON.stringify(body.tickets) : null;
    const orderResult = await pool.query(
      `INSERT INTO orders (event_id, event_template_id, customer_name, customer_phone, customer_email,
        seats_count, total_price, order_code, status, payment_status, tickets_json, event_date, event_time, city_id)
       VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, 'pending', 'pending', $8, $9, $10, $11) RETURNING id`,
      [body.eventTemplateId, body.customerName.trim(), body.customerPhone.trim(), body.customerEmail?.trim() || null,
       seatsCount, totalPrice, orderCode, ticketsJson, body.selectedDate || null, body.selectedTime || null, body.cityId || null]);

    const notificationData = {
      orderId: orderResult.rows[0].id, orderCode, eventName: template.name,
      eventDate: body.selectedDate || "", eventTime: body.selectedTime || "",
      cityName: body.cityName || "Москва", customerName: body.customerName.trim(),
      customerPhone: body.customerPhone.trim(), customerEmail: body.customerEmail?.trim(),
      seatsCount, totalPrice, tickets: body.tickets,
    };
    Promise.all([sendChannelNotification(notificationData), sendOrderNotificationToAdmin(notificationData)]).catch(() => {});

    res.json({ success: true, orderCode, orderId: orderResult.rows[0].id, eventName: template.name, totalPrice });
  } catch (error) {
    console.error("Error creating template order:", error);
    res.status(500).json({ success: false, message: "Ошибка при создании заказа" });
  }
});

// ==================== TELEGRAM WEBHOOK ====================
app.post("/webhooks/telegram/action", async (req, res) => {
  try {
    const payload = req.body;

    if (payload.callback_query) {
      const callbackQuery = payload.callback_query;
      const data = callbackQuery.data as string;
      const messageId = callbackQuery.message?.message_id;
      const chatId = callbackQuery.message?.chat?.id;
      const adminUsername = callbackQuery.from?.username;

      if (data.startsWith("refund_")) {
        const parts = data.split("_");
        const refundAction = parts[1];
        const refundCode = parts[2];
        const pool = getPool();

        try {
          const refundResult = await pool.query("SELECT * FROM refund_links WHERE refund_code = $1", [refundCode]);
          if (refundResult.rows.length === 0) { await answerCallbackQuery(callbackQuery.id, "❌ Ссылка не найдена"); return res.send("OK"); }
          const refund = refundResult.rows[0];
          if (refund.status === "approved" || refund.status === "rejected") {
            await answerCallbackQuery(callbackQuery.id, `ℹ️ Уже обработано: ${refund.status === 'approved' ? 'одобрен' : 'отклонён'}`);
            return res.send("OK");
          }
          const newStatus = refundAction === "approve" ? "approved" : "rejected";
          await pool.query("UPDATE refund_links SET status = $1, processed_at = CURRENT_TIMESTAMP WHERE refund_code = $2", [newStatus, refundCode]);

          const refundData = { refundCode: refund.refund_code, amount: refund.amount, customerName: refund.customer_name, refundNumber: refund.refund_number };
          if (refundAction === "approve") { await sendRefundApprovedNotification(refundData); await answerCallbackQuery(callbackQuery.id, "✅ Возврат одобрен"); }
          else { await sendRefundRejectedNotification(refundData); await answerCallbackQuery(callbackQuery.id, "❌ Возврат отклонён"); }

          const timestamp = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
          const statusEmoji = refundAction === "approve" ? "✅" : "❌";
          const statusText = refundAction === "approve" ? "ВОЗВРАТ ОДОБРЕН" : "ВОЗВРАТ ОТКЛОНЁН";
          const originalText = callbackQuery.message?.text || '';
          const newText = originalText + `\n\n${statusEmoji} *${statusText}*\n📅 Обработано: ${timestamp}`;

          const telegramBot = getBot();
          if (telegramBot) {
            await telegramBot.editMessageText(newText, { chat_id: chatId, message_id: messageId, parse_mode: "Markdown", reply_markup: { inline_keyboard: [] } });
          }
        } catch (err) { console.error("Error processing refund callback:", err); await answerCallbackQuery(callbackQuery.id, "❌ Ошибка обработки"); }
        return res.send("OK");
      }

      const [action, orderIdStr] = data.split("_");
      const orderId = parseInt(orderIdStr);
      if (isNaN(orderId)) { await answerCallbackQuery(callbackQuery.id, "❌ Ошибка: неверный ID заказа"); return res.send("OK"); }

      const pool = getPool();
      let whereClause = "o.id = $1";

      let orderResult = await pool.query(
        `SELECT o.*, e.name as event_name, e.date::text as event_date, e.time::text as event_time,
                c.name_ru as category_name, ci.name as city_name
         FROM orders o JOIN events e ON o.event_id = e.id JOIN categories c ON e.category_id = c.id
         JOIN cities ci ON e.city_id = ci.id WHERE ${whereClause}`, [orderId]);

      if (orderResult.rows.length === 0) {
        orderResult = await pool.query(
          `SELECT o.*, et.name as event_name, gl.event_date::text as event_date, gl.event_time::text as event_time,
                  cat.name_ru as category_name, ci.name as city_name
           FROM orders o JOIN event_templates et ON o.event_template_id = et.id
           JOIN categories cat ON et.category_id = cat.id
           LEFT JOIN generated_links gl ON gl.link_code = o.link_code
           LEFT JOIN cities ci ON COALESCE(o.city_id, gl.city_id) = ci.id WHERE ${whereClause}`, [orderId]);
      }

      if (orderResult.rows.length === 0) { await answerCallbackQuery(callbackQuery.id, "❌ Заказ не найден"); return res.send("OK"); }

      const row = orderResult.rows[0];
      let ticketsData: Record<string, number> | undefined;
      if (row.tickets_json) { try { ticketsData = JSON.parse(row.tickets_json); } catch {} }

      const order = {
        id: row.id, orderCode: row.order_code, eventName: row.event_name,
        categoryName: row.category_name, cityName: row.city_name,
        eventDate: row.event_date, eventTime: row.event_time,
        customerName: row.customer_name, customerPhone: row.customer_phone,
        seatsCount: row.seats_count, totalPrice: parseFloat(row.total_price),
        status: row.status, paymentStatus: row.payment_status, tickets: ticketsData,
      };

      if (action === "confirm") {
        await pool.query("UPDATE orders SET payment_status = 'confirmed', status = 'confirmed', updated_at = NOW() WHERE id = $1", [orderId]);
      } else if (action === "reject") {
        await pool.query("UPDATE orders SET payment_status = 'rejected', status = 'rejected', updated_at = NOW() WHERE id = $1", [orderId]);
        if (row.event_id) await pool.query("UPDATE events SET available_seats = available_seats + $1 WHERE id = $2", [row.seats_count, row.event_id]);
      } else { await answerCallbackQuery(callbackQuery.id, "❌ Неизвестное действие"); return res.send("OK"); }

      const status = action === "confirm" ? "confirmed" : "rejected";
      const originalText = callbackQuery.message?.caption || callbackQuery.message?.text || '';
      const isPhoto = !!callbackQuery.message?.photo;
      await updateOrderMessageStatus(chatId, messageId, order.orderCode, status, adminUsername, originalText, isPhoto);
      await answerCallbackQuery(callbackQuery.id, action === "confirm" ? "✅ Оплата подтверждена!" : "❌ Заказ отклонён");

      const channelData = {
        orderId: order.id, orderCode: order.orderCode, eventName: order.eventName,
        eventDate: order.eventDate || "", eventTime: order.eventTime || "",
        cityName: order.cityName || "Москва", customerName: order.customerName,
        customerPhone: order.customerPhone, seatsCount: order.seatsCount,
        totalPrice: order.totalPrice, tickets: order.tickets,
      };
      if (action === "confirm") await sendChannelPaymentConfirmed(channelData);
      else await sendChannelPaymentRejected(channelData);
    }

    return res.send("OK");
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return res.send("OK");
  }
});

// ==================== EVENT API ====================
app.get("/api/event/:id", async (req, res) => {
  const eventId = parseInt(req.params.id);
  if (isNaN(eventId)) return res.status(400).json({ error: "Invalid event ID" });
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT e.*, c.name_ru as category_name, ci.name as city_name FROM events e
       JOIN categories c ON e.category_id = c.id JOIN cities ci ON e.city_id = ci.id WHERE e.id = $1`, [eventId]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Event not found" });
    const event = result.rows[0];
    res.json({
      id: event.id, name: event.name, description: event.description,
      categoryName: event.category_name, cityName: event.city_name,
      date: event.date?.toISOString?.()?.split("T")[0] || event.date,
      time: event.time, price: parseFloat(event.price) || 0,
      availableSeats: event.available_seats, coverImageUrl: event.cover_image_url, slug: event.slug,
    });
  } catch (error) { res.status(500).json({ error: "Failed to fetch event" }); }
});

app.get("/api/e/:slug", async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT e.*, c.name as city_name, cat.name_ru as category_name FROM events e
       LEFT JOIN cities c ON e.city_id = c.id LEFT JOIN categories cat ON e.category_id = cat.id
       WHERE e.slug = $1 AND e.is_published = true`, [req.params.slug]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Event not found" });
    const e = result.rows[0];
    res.json({
      id: e.id, adminId: e.admin_id, name: e.name, description: e.description,
      categoryName: e.category_name, cityName: e.city_name,
      date: e.date?.toISOString?.()?.split("T")[0] || e.date,
      time: e.time, price: parseFloat(e.price) || 0,
      availableSeats: e.available_seats, coverImageUrl: e.cover_image_url, slug: e.slug,
    });
  } catch { res.status(500).json({ error: "Failed to fetch event" }); }
});

// ==================== ORDER API ====================
app.get("/api/order/:code", async (req, res) => {
  try {
    const pool = getPool();
    let result = await pool.query(`SELECT o.*, e.name as event_name, e.price FROM orders o JOIN events e ON o.event_id = e.id WHERE o.order_code = $1`, [req.params.code]);
    if (result.rows.length === 0) result = await pool.query(`SELECT o.*, et.name as event_name, 2990 as price FROM orders o JOIN event_templates et ON o.event_template_id = et.id WHERE o.order_code = $1`, [req.params.code]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Order not found" });
    const order = result.rows[0];
    res.json({ id: order.id, orderCode: order.order_code, eventName: order.event_name, customerName: order.customer_name, seatsCount: order.seats_count, totalPrice: parseFloat(order.total_price) || order.seats_count * parseFloat(order.price), status: order.status });
  } catch { res.status(500).json({ error: "Failed to fetch order" }); }
});

// ==================== TICKET API ====================
app.get("/api/ticket/:orderCode", async (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  try {
    const pool = getPool();
    let result = await pool.query(`
      SELECT o.*, et.name as event_name, et.ticket_image_url, et.image_url,
             COALESCE(o.event_date, gl.event_date) as event_date, COALESCE(o.event_time, gl.event_time) as event_time,
             COALESCE(o.city_id, gl.city_id) as city_id, c.name as city_name
      FROM orders o JOIN event_templates et ON o.event_template_id = et.id
      LEFT JOIN generated_links gl ON o.link_code = gl.link_code
      LEFT JOIN cities c ON COALESCE(o.city_id, gl.city_id) = c.id
      WHERE o.order_code = $1 AND o.event_template_id IS NOT NULL`, [req.params.orderCode]);
    let eventTemplateId = null;
    if (result.rows.length === 0) {
      result = await pool.query(`SELECT o.*, e.name as event_name, e.date as event_date, e.time as event_time, NULL as ticket_image_url, e.image_url as image_url, ci.name as city_name FROM orders o JOIN events e ON o.event_id = e.id LEFT JOIN cities ci ON e.city_id = ci.id WHERE o.order_code = $1`, [req.params.orderCode]);
    } else { eventTemplateId = result.rows[0].event_template_id; }

    if (result.rows.length === 0) return res.status(404).json({ success: false, message: "Order not found" });
    const order = result.rows[0];
    let finalImageUrl = order.ticket_image_url || order.image_url;
    if (!finalImageUrl && eventTemplateId) {
      const imgResult = await pool.query("SELECT image_url FROM event_template_images WHERE event_template_id = $1 ORDER BY sort_order LIMIT 1", [eventTemplateId]);
      if (imgResult.rows.length > 0) finalImageUrl = imgResult.rows[0].image_url;
    }
    if (order.payment_status !== 'confirmed') return res.json({ success: true, pending: true, message: "Payment pending confirmation" });
    let ticketsData = null;
    if (order.tickets_json) { try { ticketsData = JSON.parse(order.tickets_json); } catch {} }
    res.json({
      success: true, ticket: {
        order_code: order.order_code, orderId: order.id, event_name: order.event_name || 'Мероприятие',
        event_date: order.event_date, event_time: order.event_time, city_name: order.city_name || 'Москва',
        customer_name: order.customer_name, total_price: order.total_price,
        ticket_image_url: order.ticket_image_url, image_url: finalImageUrl, tickets: ticketsData,
      }
    });
  } catch (error) { console.error("Error fetching ticket:", error); res.status(500).json({ success: false, message: "Error fetching ticket" }); }
});

// ==================== TICKET ORDER API ====================
app.get("/api/ticket-order/:code", async (req, res) => {
  try {
    const pool = getPool();
    let result = await pool.query(`SELECT o.*, e.name as event_name, e.date, e.time, e.price FROM orders o JOIN events e ON o.event_id = e.id WHERE o.order_code = $1`, [req.params.code]);
    if (result.rows.length === 0) {
      result = await pool.query(`SELECT o.*, et.name as event_name, COALESCE(o.event_date, gl.event_date) as date, COALESCE(o.event_time, gl.event_time) as time, c.name as city_name, 2990 as price FROM orders o JOIN event_templates et ON o.event_template_id = et.id LEFT JOIN generated_links gl ON gl.link_code = o.link_code LEFT JOIN cities c ON COALESCE(o.city_id, gl.city_id) = c.id WHERE o.order_code = $1`, [req.params.code]);
    }
    if (result.rows.length === 0) return res.status(404).json({ error: "Order not found" });
    const o = result.rows[0];
    res.json({ id: o.id, orderCode: o.order_code, eventName: o.event_name, customerName: o.customer_name, seatsCount: o.seats_count, totalPrice: parseFloat(o.total_price), status: o.status, eventDate: o.date, eventTime: o.time });
  } catch { res.status(500).json({ error: "Failed to fetch order" }); }
});

app.get("/api/ticket-order/:code/payment-settings", async (req, res) => {
  try {
    const pool = getPool();
    const orderCheck = await pool.query("SELECT event_template_id FROM orders WHERE order_code = $1", [req.params.code]);
    let result;
    if (orderCheck.rows.length > 0 && orderCheck.rows[0].event_template_id) {
      result = await pool.query("SELECT * FROM payment_settings ORDER BY id DESC LIMIT 1");
    } else {
      result = await pool.query(`SELECT aps.* FROM admin_payment_settings aps JOIN orders o ON o.admin_id = aps.admin_id WHERE o.order_code = $1`, [req.params.code]);
    }
    if (result.rows.length === 0) return res.json({ cardNumber: "", cardHolderName: "", bankName: "" });
    const row = result.rows[0];
    res.json({ cardNumber: row.card_number, cardHolderName: row.card_holder_name, bankName: row.bank_name });
  } catch { res.json({ cardNumber: "", cardHolderName: "", bankName: "" }); }
});

app.post("/api/ticket-order/:code/mark-paid", async (req, res) => {
  try {
    const orderCode = req.params.code;
    const screenshot = req.body.screenshot || null;
    const pool = getPool();

    let orderResult = await pool.query(`SELECT o.*, e.name as event_name, e.date as event_date, e.time as event_time, ci.name as city_name FROM orders o JOIN events e ON o.event_id = e.id JOIN cities ci ON e.city_id = ci.id WHERE o.order_code = $1`, [orderCode]);
    if (orderResult.rows.length === 0) {
      orderResult = await pool.query(`SELECT o.*, et.name as event_name, COALESCE(o.event_date, gl.event_date) as event_date, COALESCE(o.event_time, gl.event_time) as event_time, c.name as city_name FROM orders o JOIN event_templates et ON o.event_template_id = et.id LEFT JOIN generated_links gl ON gl.link_code = o.link_code LEFT JOIN cities c ON COALESCE(o.city_id, gl.city_id) = c.id WHERE o.order_code = $1`, [orderCode]);
    }
    if (orderResult.rows.length === 0) return res.status(404).json({ success: false, message: "Заказ не найден" });
    const order = orderResult.rows[0];
    await pool.query("UPDATE orders SET status='waiting_confirmation' WHERE order_code=$1", [orderCode]);

    let tickets: Record<string, number> | undefined;
    if (order.tickets_json) { try { tickets = JSON.parse(order.tickets_json); } catch {} }

    const notificationData = {
      orderId: order.id, orderCode: order.order_code, eventName: order.event_name,
      eventDate: order.event_date?.toISOString?.()?.split("T")[0] || String(order.event_date),
      eventTime: order.event_time || "00:00", cityName: order.city_name || "Москва",
      customerName: order.customer_name, customerPhone: order.customer_phone,
      customerEmail: order.customer_email, seatsCount: order.seats_count,
      totalPrice: parseFloat(order.total_price), tickets,
    };
    try {
      await sendChannelPaymentPending(notificationData);
      if (screenshot) await sendPaymentConfirmationWithPhoto(notificationData, screenshot);
      else await sendPaymentConfirmationNoPhoto(notificationData);
    } catch {}
    res.json({ success: true });
  } catch (error) { console.error("Mark paid error:", error); res.status(500).json({ success: false, message: "Ошибка" }); }
});

app.post("/api/create-ticket-order", async (req, res) => {
  try {
    const body = req.body;
    const pool = getPool();
    const eventResult = await pool.query(`SELECT e.id, e.price, e.available_seats, e.admin_id, e.name, e.date, e.time, c.name as city_name FROM events e LEFT JOIN cities c ON e.city_id = c.id WHERE e.slug=$1`, [body.eventSlug]);
    if (eventResult.rows.length === 0) return res.json({ success: false, message: "Мероприятие не найдено" });
    const event = eventResult.rows[0];
    if (event.available_seats < body.seatsCount) return res.json({ success: false, message: "Недостаточно мест" });

    const orderCode = `TK${Date.now().toString(36).toUpperCase()}`;
    const totalPrice = parseFloat(event.price) * body.seatsCount;
    const orderResult = await pool.query(
      `INSERT INTO orders (event_id, admin_id, customer_name, customer_phone, customer_email, seats_count, total_price, order_code, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending') RETURNING id`,
      [event.id, event.admin_id, body.customerName, body.customerPhone, body.customerEmail, body.seatsCount, totalPrice, orderCode]);
    await pool.query("UPDATE events SET available_seats = available_seats - $1 WHERE id = $2", [body.seatsCount, event.id]);

    const notificationData = {
      orderId: orderResult.rows[0].id, orderCode, eventName: event.name,
      eventDate: event.date?.toISOString?.()?.split("T")[0] || String(event.date),
      eventTime: event.time || "", cityName: event.city_name || "",
      customerName: body.customerName, customerPhone: body.customerPhone,
      customerEmail: body.customerEmail, seatsCount: body.seatsCount, totalPrice,
    };
    Promise.all([sendChannelNotification(notificationData), sendOrderNotificationToAdmin(notificationData)]).catch(() => {});
    res.json({ success: true, orderCode });
  } catch (error) { console.error("Create order error:", error); res.status(500).json({ success: false, message: "Ошибка создания заказа" }); }
});

// ==================== SITE SETTINGS ====================
app.get("/api/site-settings", async (_req, res) => {
  try {
    const pool = tryGetPool();
    if (pool) {
      const result = await pool.query("SELECT * FROM site_settings ORDER BY id DESC LIMIT 1");
      if (result.rows.length > 0) {
        const row = result.rows[0];
        return res.json({ supportContact: row.support_contact || "https://t.me/support", supportLabel: row.support_label || "Тех. поддержка", chatScript: row.chat_script || defaultChatHtml });
      }
    }
    res.json({ supportContact: "https://t.me/support", supportLabel: "Тех. поддержка", chatScript: "" });
  } catch { res.json({ supportContact: "https://t.me/support", supportLabel: "Тех. поддержка", chatScript: "" }); }
});

app.post("/api/admin/site-settings", async (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    const body = req.body;
    const pool = getPool();
    const check = await pool.query("SELECT id FROM site_settings LIMIT 1");
    if (check.rows.length === 0) {
      await pool.query("INSERT INTO site_settings (support_contact, support_label, chat_script) VALUES ($1, $2, $3)", [body.supportContact || "https://t.me/support", body.supportLabel || "Тех. поддержка", body.chatScript || ""]);
    } else {
      await pool.query("UPDATE site_settings SET support_contact=$1, support_label=$2, chat_script=$3, updated_at=CURRENT_TIMESTAMP WHERE id=$4", [body.supportContact, body.supportLabel, body.chatScript, check.rows[0].id]);
    }
    res.json({ success: true });
  } catch { res.status(500).json({ success: false, message: "Ошибка сохранения" }); }
});

app.get("/api/admin/chat-status", async (_req, res) => {
  try {
    const pool = tryGetPool();
    if (pool) {
      const result = await pool.query("SELECT chat_script FROM site_settings ORDER BY id DESC LIMIT 1");
      if (result.rows.length === 0 || !result.rows[0].chat_script) return res.json({ active: false, provider: null });
      const script = result.rows[0].chat_script;
      let provider = "Неизвестный";
      if (script.includes("livechat") || script.includes("LiveChat")) provider = "LiveChat";
      else if (script.includes("tidio")) provider = "Tidio";
      else if (script.includes("tawk")) provider = "Tawk.to";
      else if (script.includes("jivosite") || script.includes("jivo")) provider = "JivoSite";
      else if (script.includes("crisp")) provider = "Crisp";
      return res.json({ active: true, provider });
    }
    res.json({ active: false, provider: null });
  } catch { res.json({ active: false, provider: null }); }
});

app.post("/api/admin/chat-script", async (req, res) => {
  try {
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword || req.body.password !== adminPassword) return res.status(401).json({ success: false, message: "Неверный пароль" });
    const pool = getPool();
    const result = await pool.query("SELECT chat_script FROM site_settings ORDER BY id DESC LIMIT 1");
    res.json({ success: true, chatScript: result.rows.length > 0 ? result.rows[0].chat_script : "" });
  } catch { res.status(500).json({ success: false, message: "Ошибка" }); }
});

// ==================== PAYMENT SETTINGS ====================
app.get("/api/payment-settings", async (_req, res) => {
  try {
    const pool = tryGetPool();
    if (pool) {
      const result = await pool.query("SELECT * FROM payment_settings ORDER BY id DESC LIMIT 1");
      if (result.rows.length > 0) {
        const row = result.rows[0];
        return res.json({ cardNumber: row.card_number, cardHolderName: row.card_holder_name, bankName: row.bank_name, sbpEnabled: row.sbp_enabled !== false });
      }
    }
    res.json({ cardNumber: "", cardHolderName: "", bankName: "", sbpEnabled: true });
  } catch { res.json({ cardNumber: "", cardHolderName: "", bankName: "", sbpEnabled: true }); }
});

app.post("/api/admin/payment-settings", async (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    const body = req.body;
    const pool = getPool();
    await pool.query("UPDATE payment_settings SET card_number=$1, card_holder_name=$2, bank_name=$3, sbp_enabled=$4, updated_at=CURRENT_TIMESTAMP WHERE id=1", [body.cardNumber, body.cardHolderName, body.bankName, body.sbpEnabled !== false]);
    res.json({ success: true });
  } catch { res.status(500).json({ success: false, message: "Ошибка сохранения" }); }
});

// ==================== ADMIN EVENTS ====================
app.post("/api/admin/events", async (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    const body = req.body;
    const slug = body.name.toLowerCase().replace(/[^\w\sа-яё-]/gi, '').replace(/\s+/g, '-').replace(/--+/g, '-');
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO events (name, description, category_id, city_id, date, time, price, available_seats, cover_image_url, slug, is_published) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true) RETURNING id`,
      [body.name, body.description, body.categoryId, body.cityId, body.date, body.time, body.price, body.availableSeats, body.coverImageUrl, slug]);
    res.json({ success: true, eventId: result.rows[0].id, slug });
  } catch { res.status(500).json({ success: false, message: "Ошибка создания мероприятия" }); }
});

app.put("/api/admin/events/:id", async (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    const body = req.body;
    const slug = body.name.toLowerCase().replace(/[^\w\sа-яё-]/gi, '').replace(/\s+/g, '-').replace(/--+/g, '-');
    const pool = getPool();
    await pool.query("UPDATE events SET name=$1, description=$2, category_id=$3, city_id=$4, date=$5, time=$6, price=$7, available_seats=$8, cover_image_url=$9, slug=$10 WHERE id=$11",
      [body.name, body.description, body.categoryId, body.cityId, body.date, body.time, body.price, body.availableSeats, body.coverImageUrl, slug, req.params.id]);
    res.json({ success: true });
  } catch { res.status(500).json({ success: false, message: "Ошибка обновления мероприятия" }); }
});

app.delete("/api/admin/events/:id", async (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    const pool = getPool();
    await pool.query("DELETE FROM events WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch { res.status(500).json({ success: false, message: "Ошибка удаления мероприятия" }); }
});

// ==================== CITIES API ====================
app.post("/api/admin/cities", async (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    if (!req.body.name || req.body.name.trim().length < 2) return res.status(400).json({ success: false, message: "Название города должно быть не менее 2 символов" });
    const pool = tryGetPool();
    if (!pool) return res.status(500).json({ success: false, message: "База данных недоступна" });
    const existing = await pool.query("SELECT id FROM cities WHERE name = $1", [req.body.name.trim()]);
    if (existing.rows.length > 0) return res.status(400).json({ success: false, message: "Город уже существует" });
    await pool.query("INSERT INTO cities (name) VALUES ($1)", [req.body.name.trim()]);
    res.json({ success: true });
  } catch (error) { console.error("Error adding city:", error); res.status(500).json({ success: false, message: "Ошибка добавления города" }); }
});

app.delete("/api/admin/cities/:id", async (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    const pool = tryGetPool();
    if (!pool) return res.status(500).json({ success: false, message: "База данных недоступна" });
    await pool.query("DELETE FROM generated_links WHERE city_id = $1", [req.params.id]);
    await pool.query("DELETE FROM event_template_addresses WHERE city_id = $1", [req.params.id]);
    await pool.query("DELETE FROM cities WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (error) { console.error("Error deleting city:", error); res.status(500).json({ success: false, message: "Ошибка удаления города" }); }
});

// ==================== MULTI-ADMIN ====================
app.post("/api/admin/register", async (req, res) => {
  try {
    const { username, displayName, password } = req.body;
    const pool = getPool();
    const existing = await pool.query("SELECT id FROM admins WHERE username=$1", [username]);
    if (existing.rows.length > 0) return res.json({ success: false, message: "Логин уже занят" });
    const result = await pool.query("INSERT INTO admins (username, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id, username, display_name", [username, password, displayName]);
    const admin = result.rows[0];
    const token = `${admin.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    res.json({ success: true, token, admin: { id: admin.id, username: admin.username, displayName: admin.display_name } });
  } catch { res.status(500).json({ success: false, message: "Ошибка регистрации" }); }
});

app.post("/api/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const pool = getPool();
    const result = await pool.query("SELECT id, username, display_name, password_hash FROM admins WHERE username=$1", [username]);
    if (result.rows.length === 0 || result.rows[0].password_hash !== password) return res.json({ success: false, message: "Неверный логин или пароль" });
    const admin = result.rows[0];
    const token = `${admin.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    res.json({ success: true, token, admin: { id: admin.id, username: admin.username, displayName: admin.display_name } });
  } catch { res.status(500).json({ success: false, message: "Ошибка входа" }); }
});

app.post("/api/admin/generate-event", async (req, res) => {
  try {
    const authHeader = req.headers["authorization"] as string;
    if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ success: false, message: "Unauthorized" });
    const adminId = parseInt(authHeader.split(" ")[1].split("_")[0]);
    const body = req.body;
    const slug = `${body.name.toLowerCase().replace(/[^\w\sа-яё-]/gi, '').replace(/\s+/g, '-').replace(/--+/g, '-')}-${Math.random().toString(36).slice(2, 8)}`;
    const pool = getPool();
    await pool.query(`INSERT INTO events (name, description, category_id, city_id, date, time, price, available_seats, cover_image_url, slug, is_published, admin_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11)`,
      [body.name, body.description, body.categoryId, body.cityId, body.date, body.time, body.price, body.availableSeats, body.coverImageUrl, slug, adminId]);
    res.json({ success: true, slug });
  } catch { res.status(500).json({ success: false, message: "Ошибка генерации" }); }
});

app.get("/api/admin/my-events", async (req, res) => {
  try {
    const authHeader = req.headers["authorization"] as string;
    if (!authHeader?.startsWith("Bearer ")) return res.json({ events: [] });
    const adminId = parseInt(authHeader.split(" ")[1].split("_")[0]);
    const pool = getPool();
    const result = await pool.query(`SELECT e.*, c.name as city_name, cat.name_ru as category_name FROM events e LEFT JOIN cities c ON e.city_id = c.id LEFT JOIN categories cat ON e.category_id = cat.id WHERE e.admin_id = $1 ORDER BY e.created_at DESC`, [adminId]);
    const events = result.rows.map(e => ({ id: e.id, name: e.name, slug: e.slug, cityName: e.city_name, categoryName: e.category_name, date: e.date?.toISOString?.()?.split("T")[0] || e.date, time: e.time, price: parseFloat(e.price) || 0, availableSeats: e.available_seats }));
    res.json({ events });
  } catch { res.json({ events: [] }); }
});

app.get("/api/admin/my-payment-settings", async (req, res) => {
  try {
    const authHeader = req.headers["authorization"] as string;
    if (!authHeader?.startsWith("Bearer ")) return res.json({ cardNumber: "", cardHolderName: "", bankName: "" });
    const adminId = parseInt(authHeader.split(" ")[1].split("_")[0]);
    const pool = getPool();
    const result = await pool.query("SELECT * FROM admin_payment_settings WHERE admin_id=$1", [adminId]);
    if (result.rows.length === 0) return res.json({ cardNumber: "", cardHolderName: "", bankName: "" });
    const row = result.rows[0];
    res.json({ cardNumber: row.card_number, cardHolderName: row.card_holder_name, bankName: row.bank_name });
  } catch { res.json({ cardNumber: "", cardHolderName: "", bankName: "" }); }
});

app.post("/api/admin/my-payment-settings", async (req, res) => {
  try {
    const authHeader = req.headers["authorization"] as string;
    if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ success: false, message: "Unauthorized" });
    const adminId = parseInt(authHeader.split(" ")[1].split("_")[0]);
    const pool = getPool();
    await pool.query(`INSERT INTO admin_payment_settings (admin_id, card_number, card_holder_name, bank_name) VALUES ($1, $2, $3, $4) ON CONFLICT (admin_id) DO UPDATE SET card_number = $2, card_holder_name = $3, bank_name = $4, updated_at = CURRENT_TIMESTAMP`, [adminId, req.body.cardNumber, req.body.cardHolderName, req.body.bankName]);
    res.json({ success: true });
  } catch { res.status(500).json({ success: false, message: "Ошибка сохранения" }); }
});

// ==================== GENERATOR API ====================
app.get("/api/generator/categories", async (_req, res) => {
  try {
    const pool = tryGetPool();
    if (pool) {
      const result = await pool.query("SELECT id, name, name_ru FROM categories WHERE id IN (6,7,8,9,10,11,12,13) ORDER BY id");
      if (result.rows.length > 0) return res.json({ categories: result.rows });
    }
    res.json({ categories: CATEGORIES.filter(c => [6,7,8,9,10,11,12,13].includes(c.id)) });
  } catch { res.json({ categories: CATEGORIES.filter(c => [6,7,8,9,10,11,12,13].includes(c.id)) }); }
});

app.get("/api/generator/cities", async (_req, res) => {
  try {
    const pool = tryGetPool();
    if (pool) {
      const result = await pool.query("SELECT id, name FROM cities ORDER BY name");
      if (result.rows.length > 0) return res.json({ cities: result.rows });
    }
    const sorted = [...CITIES].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    res.json({ cities: sorted });
  } catch { res.json({ cities: [...CITIES].sort((a, b) => a.name.localeCompare(b.name, 'ru')) }); }
});

app.get("/api/generator/event-templates", async (req, res) => {
  try {
    const categoryId = req.query.category_id as string;
    const cityId = req.query.city_id as string;
    const pool = tryGetPool();
    if (pool) {
      let result;
      if (categoryId) result = await pool.query("SELECT id, name, description, is_active, ticket_image_url FROM event_templates WHERE category_id = $1 AND is_active = true ORDER BY name", [categoryId]);
      else result = await pool.query("SELECT id, name, description, is_active, ticket_image_url FROM event_templates WHERE is_active = true ORDER BY name");
      if (result.rows.length > 0) {
        const templates = [];
        for (const row of result.rows) {
          const imgRes = await pool.query("SELECT image_url FROM event_template_images WHERE event_template_id = $1 ORDER BY sort_order LIMIT 1", [row.id]);
          let linkCode = null;
          if (cityId) {
            const linkRes = await pool.query("SELECT link_code FROM generated_links WHERE event_template_id = $1 AND city_id = $2 AND is_active = true ORDER BY created_at DESC LIMIT 1", [row.id, cityId]);
            if (linkRes.rows.length > 0) linkCode = linkRes.rows[0].link_code;
          }
          templates.push({ id: row.id, name: row.name, description: row.description, is_active: row.is_active, image_url: imgRes.rows[0]?.image_url || null, ticket_image_url: row.ticket_image_url, link_code: linkCode });
        }
        return res.json({ templates });
      }
    }
    let filtered = EVENT_TEMPLATES.filter(t => t.is_active);
    if (categoryId) filtered = filtered.filter(t => t.category_id === parseInt(categoryId));
    const templates = filtered.sort((a, b) => a.name.localeCompare(b.name, 'ru')).map(t => ({
      id: t.id, name: t.name, description: t.description, is_active: t.is_active,
      image_url: EVENT_TEMPLATE_IMAGES[t.id] || null, ticket_image_url: t.ticket_image_url, link_code: null
    }));
    res.json({ templates });
  } catch {
    let filtered = EVENT_TEMPLATES.filter(t => t.is_active);
    const categoryId = req.query.category_id as string;
    if (categoryId) filtered = filtered.filter(t => t.category_id === parseInt(categoryId));
    res.json({ templates: filtered.map(t => ({ id: t.id, name: t.name, description: t.description, is_active: t.is_active, image_url: EVENT_TEMPLATE_IMAGES[t.id] || null, ticket_image_url: t.ticket_image_url, link_code: null })) });
  }
});

app.get("/api/generator/event-templates/:id", async (req, res) => {
  try {
    const pool = tryGetPool();
    if (pool) {
      const result = await pool.query(`SELECT et.*, cat.name_ru as category_name FROM event_templates et JOIN categories cat ON et.category_id = cat.id WHERE et.id = $1`, [req.params.id]);
      if (result.rows.length > 0) {
        const imagesResult = await pool.query("SELECT image_url FROM event_template_images WHERE event_template_id = $1 ORDER BY sort_order LIMIT 5", [req.params.id]);
        const images = imagesResult.rows.map(r => r.image_url);
        const template = result.rows[0];
        return res.json({ success: true, template: { id: template.id, name: template.name, description: template.description, images, image_url: images[0] || template.image_url, ticket_image_url: template.ticket_image_url, categoryName: template.category_name, isActive: template.is_active } });
      }
    }
    const tmpl = EVENT_TEMPLATES.find(t => t.id === parseInt(req.params.id));
    if (!tmpl) return res.status(404).json({ success: false, error: "Template not found" });
    const cat = CATEGORIES.find(c => c.id === tmpl.category_id);
    const img = EVENT_TEMPLATE_IMAGES[tmpl.id] || null;
    res.json({ success: true, template: { id: tmpl.id, name: tmpl.name, description: tmpl.description, images: img ? [img] : [], image_url: img, ticket_image_url: tmpl.ticket_image_url, categoryName: cat?.name_ru || '', isActive: tmpl.is_active } });
  } catch {
    const tmpl = EVENT_TEMPLATES.find(t => t.id === parseInt(req.params.id));
    if (!tmpl) return res.status(404).json({ success: false, error: "Template not found" });
    const cat = CATEGORIES.find(c => c.id === tmpl.category_id);
    const img = EVENT_TEMPLATE_IMAGES[tmpl.id] || null;
    res.json({ success: true, template: { id: tmpl.id, name: tmpl.name, description: tmpl.description, images: img ? [img] : [], image_url: img, ticket_image_url: tmpl.ticket_image_url, categoryName: cat?.name_ru || '', isActive: tmpl.is_active } });
  }
});

app.get("/api/generator/event-template/:id", async (req, res) => {
  try {
    const pool = tryGetPool();
    if (pool) {
      const result = await pool.query(`SELECT et.*, cat.name_ru as category_name FROM event_templates et JOIN categories cat ON et.category_id = cat.id WHERE et.id = $1`, [req.params.id]);
      if (result.rows.length > 0) {
        const imagesResult = await pool.query("SELECT image_url FROM event_template_images WHERE event_template_id = $1 ORDER BY sort_order LIMIT 5", [req.params.id]);
        const images = imagesResult.rows.map(r => r.image_url);
        const template = result.rows[0];
        return res.json({ success: true, template: { id: template.id, name: template.name, description: template.description, images, image_url: images[0] || template.image_url, ticket_image_url: template.ticket_image_url, categoryName: template.category_name, isActive: template.is_active } });
      }
    }
    const tmpl = EVENT_TEMPLATES.find(t => t.id === parseInt(req.params.id));
    if (!tmpl) return res.status(404).json({ success: false, error: "Template not found" });
    const cat = CATEGORIES.find(c => c.id === tmpl.category_id);
    const img = EVENT_TEMPLATE_IMAGES[tmpl.id] || null;
    res.json({ success: true, template: { id: tmpl.id, name: tmpl.name, description: tmpl.description, images: img ? [img] : [], image_url: img, ticket_image_url: tmpl.ticket_image_url, categoryName: cat?.name_ru || '', isActive: tmpl.is_active } });
  } catch (error) { console.error("Error fetching template:", error); res.status(500).json({ success: false, error: "Failed to fetch template" }); }
});

app.put("/api/generator/event-templates/:id/update", async (req, res) => {
  try {
    const { name, description, image_url, ticket_image_url } = req.body;
    const pool = tryGetPool();
    if (!pool) return res.status(500).json({ success: false, message: "База данных недоступна" });
    await pool.query("UPDATE event_templates SET name = $1, description = $2, image_url = $3, ticket_image_url = $4 WHERE id = $5", [name, description, image_url, ticket_image_url || null, req.params.id]);
    res.json({ success: true });
  } catch (error) { console.error("Error updating template:", error); res.status(500).json({ success: false }); }
});

app.post("/api/generator/event-templates/:id/toggle", async (req, res) => {
  try {
    const pool = tryGetPool();
    if (!pool) return res.status(500).json({ success: false, message: "База данных недоступна" });
    await pool.query("UPDATE event_templates SET is_active = $1 WHERE id = $2", [req.body.is_active, req.params.id]);
    res.json({ success: true });
  } catch (error) { console.error("Error toggling template:", error); res.status(500).json({ success: false }); }
});

app.get("/api/generator/event-templates/:id/images", async (req, res) => {
  try {
    const pool = tryGetPool();
    if (!pool) return res.json({ images: [] });
    const result = await pool.query("SELECT id, image_url, sort_order FROM event_template_images WHERE event_template_id = $1 ORDER BY sort_order", [req.params.id]);
    res.json({ images: result.rows });
  } catch (error) { console.error("Error fetching images:", error); res.json({ images: [] }); }
});

app.post("/api/generator/event-templates/:id/images", async (req, res) => {
  try {
    if (!req.body.image_url) return res.status(400).json({ success: false, message: "URL обязателен" });
    const pool = tryGetPool();
    if (!pool) return res.status(500).json({ success: false, message: "База данных недоступна" });
    const maxRes = await pool.query("SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM event_template_images WHERE event_template_id = $1", [req.params.id]);
    const result = await pool.query("INSERT INTO event_template_images (event_template_id, image_url, sort_order) VALUES ($1, $2, $3) RETURNING id", [req.params.id, req.body.image_url, maxRes.rows[0].next_order]);
    res.json({ success: true, id: result.rows[0].id });
  } catch (error) { console.error("Error adding image:", error); res.status(500).json({ success: false, message: "Ошибка" }); }
});

app.delete("/api/generator/event-templates/:id/images/:imageId", async (req, res) => {
  try {
    const pool = tryGetPool();
    if (!pool) return res.status(500).json({ success: false, message: "База данных недоступна" });
    await pool.query("DELETE FROM event_template_images WHERE id = $1", [req.params.imageId]);
    res.json({ success: true });
  } catch (error) { console.error("Error deleting image:", error); res.status(500).json({ success: false }); }
});

app.get("/api/generator/event-templates/:id/addresses", async (req, res) => {
  try {
    const pool = tryGetPool();
    if (!pool) return res.json({ addresses: [] });
    const result = await pool.query("SELECT city_id, venue_address FROM event_template_addresses WHERE event_template_id = $1", [req.params.id]);
    res.json({ addresses: result.rows });
  } catch (error) { console.error("Error fetching addresses:", error); res.json({ addresses: [] }); }
});

app.put("/api/generator/event-templates/:id/addresses", async (req, res) => {
  try {
    const pool = tryGetPool();
    if (!pool) return res.status(500).json({ success: false, message: "База данных недоступна" });
    await pool.query("DELETE FROM event_template_addresses WHERE event_template_id = $1", [req.params.id]);
    for (const addr of req.body.addresses) {
      await pool.query("INSERT INTO event_template_addresses (event_template_id, city_id, venue_address) VALUES ($1, $2, $3)", [req.params.id, addr.city_id, addr.venue_address]);
    }
    res.json({ success: true });
  } catch (error) { console.error("Error updating addresses:", error); res.status(500).json({ success: false }); }
});

app.get("/api/generator/links", async (_req, res) => {
  try {
    const pool = tryGetPool();
    if (pool) {
      const result = await pool.query(`SELECT gl.*, et.name as event_name, c.name as city_name FROM generated_links gl JOIN event_templates et ON gl.event_template_id = et.id JOIN cities c ON gl.city_id = c.id ORDER BY gl.created_at DESC LIMIT 50`);
      return res.json({ links: result.rows });
    }
    res.json({ links: inMemoryLinks.slice().reverse().slice(0, 50) });
  } catch { res.json({ links: inMemoryLinks.slice().reverse().slice(0, 50) }); }
});

app.post("/api/generator/create-link", async (req, res) => {
  try {
    const { event_template_id, city_id, event_date, event_time, available_seats } = req.body;
    const linkCode = generateLinkCode();
    const pool = tryGetPool();
    if (pool) {
      const addrResult = await pool.query("SELECT venue_address FROM event_template_addresses WHERE event_template_id = $1 AND city_id = $2", [event_template_id, city_id]);
      const venueAddress = addrResult.rows[0]?.venue_address || null;
      const insertResult = await pool.query(`INSERT INTO generated_links (link_code, event_template_id, city_id, event_date, event_time, available_seats, venue_address, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, true) RETURNING id`, [linkCode, event_template_id, city_id, event_date, event_time, available_seats || 100, venueAddress]);
      return res.json({ success: true, link_code: linkCode, link_id: insertResult.rows[0].id });
    }
    const tmpl = EVENT_TEMPLATES.find(t => t.id === parseInt(event_template_id));
    const city = CITIES.find(c => c.id === parseInt(city_id));
    const newLink: InMemoryLink = {
      id: inMemoryLinkIdCounter++,
      link_code: linkCode,
      event_template_id: parseInt(event_template_id),
      city_id: parseInt(city_id),
      event_date: event_date || new Date().toISOString().split('T')[0],
      event_time: event_time || '12:00',
      venue_address: null,
      available_seats: available_seats || 100,
      is_active: true,
      created_at: new Date().toISOString(),
      event_name: tmpl?.name || 'Мероприятие',
      city_name: city?.name || 'Город',
    };
    inMemoryLinks.push(newLink);
    res.json({ success: true, link_code: linkCode, link_id: newLink.id });
  } catch { res.status(500).json({ success: false, message: "Ошибка создания ссылки" }); }
});

app.get("/api/generator/link-info/:id", async (req, res) => {
  try {
    const pool = tryGetPool();
    if (pool) {
      const result = await pool.query(`SELECT gl.*, et.name as event_name, c.name as city_name FROM generated_links gl LEFT JOIN event_templates et ON gl.event_template_id = et.id LEFT JOIN cities c ON gl.city_id = c.id WHERE gl.id = $1`, [req.params.id]);
      if (result.rows.length > 0) return res.json(result.rows[0]);
    }
    const link = inMemoryLinks.find(l => l.id === parseInt(req.params.id));
    if (!link) return res.status(404).json({ error: "Link not found" });
    res.json(link);
  } catch { res.status(500).json({ error: "Server error" }); }
});

app.post("/api/generator/links/:id/toggle", async (req, res) => {
  try {
    const pool = tryGetPool();
    if (pool) {
      await pool.query("UPDATE generated_links SET is_active = $1 WHERE id = $2", [req.body.is_active, req.params.id]);
      return res.json({ success: true });
    }
    const link = inMemoryLinks.find(l => l.id === parseInt(req.params.id));
    if (link) link.is_active = req.body.is_active;
    res.json({ success: true });
  } catch { res.status(500).json({ success: false }); }
});

app.put("/api/generator/links/:id", async (req, res) => {
  try {
    const pool = tryGetPool();
    if (pool) {
      await pool.query("UPDATE generated_links SET venue_address = $1, available_seats = $2 WHERE id = $3", [req.body.venue_address, req.body.available_seats, req.params.id]);
      return res.json({ success: true });
    }
    const link = inMemoryLinks.find(l => l.id === parseInt(req.params.id));
    if (link) { link.venue_address = req.body.venue_address; link.available_seats = req.body.available_seats; }
    res.json({ success: true });
  } catch { res.status(500).json({ success: false }); }
});

app.delete("/api/generator/links/:id", async (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    const pool = tryGetPool();
    if (pool) {
      await pool.query("DELETE FROM generated_links WHERE id = $1", [req.params.id]);
      return res.json({ success: true });
    }
    const idx = inMemoryLinks.findIndex(l => l.id === parseInt(req.params.id));
    if (idx >= 0) inMemoryLinks.splice(idx, 1);
    res.json({ success: true });
  } catch { res.status(500).json({ success: false }); }
});

// ==================== LINK VALIDATION ====================
app.get("/api/links/validate", async (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  try {
    const linkCode = req.query.code as string;
    if (!linkCode) return res.status(400).json({ active: false, error: "No link code provided" });
    const pool = tryGetPool();
    if (pool) {
      const result = await pool.query(`SELECT gl.id, gl.is_active, gl.city_id, c.name as city_name FROM generated_links gl JOIN cities c ON gl.city_id = c.id WHERE gl.link_code = $1`, [linkCode]);
      if (result.rows.length > 0) {
        const link = result.rows[0];
        if (!link.is_active) return res.status(404).json({ active: false, error: "Link is disabled" });
        return res.json({ active: true, cityId: link.city_id, cityName: link.city_name });
      }
    }
    const memLink = inMemoryLinks.find(l => l.link_code === linkCode);
    if (!memLink) return res.status(404).json({ active: false, error: "Link not found" });
    if (!memLink.is_active) return res.status(404).json({ active: false, error: "Link is disabled" });
    res.json({ active: true, cityId: memLink.city_id, cityName: memLink.city_name });
  } catch { res.status(500).json({ active: false, error: "Server error" }); }
});

// ==================== EVENT LINK API ====================
app.get("/api/event-link/:code", async (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  try {
    const pool = tryGetPool();
    if (pool) {
      const result = await pool.query(`
        SELECT gl.*, et.name, et.description, et.category_id, et.id as template_id, c.name as city_name, cat.name_ru as category_name
        FROM generated_links gl JOIN event_templates et ON gl.event_template_id = et.id
        JOIN cities c ON gl.city_id = c.id JOIN categories cat ON et.category_id = cat.id
        WHERE gl.link_code = $1 AND gl.is_active = true`, [req.params.code]);
      if (result.rows.length > 0) {
        const row = result.rows[0];
        const imagesResult = await pool.query("SELECT image_url FROM event_template_images WHERE event_template_id = $1 ORDER BY sort_order LIMIT 5", [row.template_id]);
        const images = imagesResult.rows.map(r => r.image_url);
        return res.json({
          id: row.id, templateId: row.template_id, linkCode: row.link_code, name: row.name, description: row.description,
          images, imageUrl: images[0] || null, categoryId: row.category_id, categoryName: row.category_name,
          cityId: row.city_id, cityName: row.city_name, eventDate: row.event_date, eventTime: row.event_time,
          venueAddress: row.venue_address, availableSeats: row.available_seats, price: 2490
        });
      }
    }
    const memLink = inMemoryLinks.find(l => l.link_code === req.params.code && l.is_active);
    if (!memLink) return res.status(404).json({ error: "Link not found or inactive" });
    const tmpl = EVENT_TEMPLATES.find(t => t.id === memLink.event_template_id);
    const cat = CATEGORIES.find(c => c.id === tmpl?.category_id);
    const img = EVENT_TEMPLATE_IMAGES[memLink.event_template_id] || null;
    res.json({
      id: memLink.id, templateId: memLink.event_template_id, linkCode: memLink.link_code,
      name: tmpl?.name || memLink.event_name, description: tmpl?.description || '',
      images: img ? [img] : [], imageUrl: img, categoryId: tmpl?.category_id || 0,
      categoryName: cat?.name_ru || '', cityId: memLink.city_id, cityName: memLink.city_name,
      eventDate: memLink.event_date, eventTime: memLink.event_time,
      venueAddress: memLink.venue_address, availableSeats: memLink.available_seats, price: 2490
    });
  } catch { res.status(500).json({ error: "Server error" }); }
});

// ==================== EVENT BY CITY (NEW URL FORMAT) ====================
app.get("/api/event-by-city/:citySlug/:templateId", async (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  try {
    const { citySlug, templateId } = req.params;
    const linkIdParam = req.query.lid as string;
    if (!linkIdParam) return res.status(404).json({ error: "Link not found" });

    const pool = tryGetPool();
    if (pool) {
      const linkResult = await pool.query(`
        SELECT gl.*, et.name as event_name, et.description, et.is_active as template_active,
               cat.name_ru as category_name, cities.name as city_name
        FROM generated_links gl LEFT JOIN event_templates et ON gl.event_template_id = et.id
        LEFT JOIN categories cat ON et.category_id = cat.id LEFT JOIN cities ON gl.city_id = cities.id
        WHERE gl.id = $1`, [linkIdParam]);

      if (linkResult.rows.length > 0) {
        const link = linkResult.rows[0];
        const expectedCitySlug = transliterateCityName(link.city_name || '');
        if (link.city_name && (citySlug !== expectedCitySlug || parseInt(templateId) !== link.event_template_id)) return res.status(404).json({ error: "Link not found" });
        if (!link.is_active) return res.status(404).json({ error: "Link is disabled" });
        if (!link.template_active) return res.status(404).json({ error: "Event not found" });

        const imagesResult = await pool.query("SELECT image_url FROM event_template_images WHERE event_template_id = $1 ORDER BY sort_order LIMIT 5", [link.event_template_id]);
        const images = imagesResult.rows.map(r => r.image_url);
        const eventDate = link.event_date ? new Date(link.event_date) : new Date();

        return res.json({
          id: link.event_template_id, linkId: link.id, linkCode: link.link_code, name: link.event_name || 'Мероприятие',
          description: link.description || '', images, imageUrl: images[0] || null, categoryId: link.category_id || 0,
          categoryName: link.category_name || '', cityId: link.city_id, cityName: link.city_name || '',
          citySlug: transliterateCityName(link.city_name || ''),
          eventDate: eventDate.toISOString().split('T')[0], eventTime: link.event_time || "12:00",
          venueAddress: link.venue_address || '', availableSeats: link.available_seats || 2, price: 2490,
        });
      }
    }
    const memLink = inMemoryLinks.find(l => l.id === parseInt(linkIdParam));
    if (!memLink) return res.status(404).json({ error: "Link not found" });
    if (!memLink.is_active) return res.status(404).json({ error: "Link is disabled" });
    const tmpl = EVENT_TEMPLATES.find(t => t.id === memLink.event_template_id);
    const cat = CATEGORIES.find(c => c.id === tmpl?.category_id);
    const img = EVENT_TEMPLATE_IMAGES[memLink.event_template_id] || null;
    const eventDate = memLink.event_date ? new Date(memLink.event_date) : new Date();
    res.json({
      id: memLink.event_template_id, linkId: memLink.id, linkCode: memLink.link_code,
      name: tmpl?.name || memLink.event_name, description: tmpl?.description || '',
      images: img ? [img] : [], imageUrl: img, categoryId: tmpl?.category_id || 0,
      categoryName: cat?.name_ru || '', cityId: memLink.city_id, cityName: memLink.city_name,
      citySlug: transliterateCityName(memLink.city_name || ''),
      eventDate: eventDate.toISOString().split('T')[0], eventTime: memLink.event_time || "12:00",
      venueAddress: memLink.venue_address || '', availableSeats: memLink.available_seats || 2, price: 2490,
    });
  } catch (error) { console.error("Error in event-by-city:", error); res.status(500).json({ error: "Server error" }); }
});

// ==================== EVENT BY LINK ID ====================
app.get("/api/event-by-link/:linkId", async (req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  try {
    const pool = tryGetPool();
    if (pool) {
      try {
        const result = await pool.query(`
          SELECT gl.*, et.name as event_name, et.description, et.category_id,
                 cat.name_ru as category_name, cities.name as city_name,
                 COALESCE(gl.venue_address, eta.venue_address, '') as final_venue_address
          FROM generated_links gl LEFT JOIN event_templates et ON gl.event_template_id = et.id
          LEFT JOIN categories cat ON et.category_id = cat.id LEFT JOIN cities ON gl.city_id = cities.id
          LEFT JOIN event_template_addresses eta ON eta.event_template_id = et.id AND eta.city_id = gl.city_id
          WHERE gl.id = $1`, [req.params.linkId]);
        if (result.rows.length > 0) {
          const link = result.rows[0];
          if (!link.is_active) return res.status(404).json({ error: "Link is disabled" });

          const imagesResult = await pool.query("SELECT image_url FROM event_template_images WHERE event_template_id = $1 ORDER BY sort_order LIMIT 5", [link.event_template_id]);
          const images = imagesResult.rows.map(r => r.image_url);
          const eventDate = link.event_date ? new Date(link.event_date) : new Date();

          return res.json({
            id: link.event_template_id, templateId: link.event_template_id, linkId: link.id,
            linkCode: link.link_code, name: link.event_name || 'Мероприятие', description: link.description || '',
            images, imageUrl: images[0] || null, categoryName: link.category_name || '',
            cityId: link.city_id, cityName: link.city_name || '', citySlug: transliterateCityName(link.city_name || ''),
            eventDate: eventDate.toISOString().split('T')[0], eventTime: link.event_time || "12:00",
            venueAddress: link.final_venue_address || '', availableSeats: link.available_seats || 2, price: 2490,
          });
        }
        console.error("event-by-link: link not found in DB for id:", req.params.linkId);

        const simpleLinkResult = await pool.query("SELECT * FROM generated_links WHERE id = $1", [req.params.linkId]);
        if (simpleLinkResult.rows.length > 0) {
          const gl = simpleLinkResult.rows[0];
          console.log("event-by-link: link exists but JOIN failed. template_id:", gl.event_template_id, "city_id:", gl.city_id);
          const tmpl = EVENT_TEMPLATES.find(t => t.id === gl.event_template_id);
          const city = CITIES.find(c => c.id === gl.city_id);
          const cat = CATEGORIES.find(c => c.id === tmpl?.category_id);
          const img = EVENT_TEMPLATE_IMAGES[gl.event_template_id] || null;
          if (!gl.is_active) return res.status(404).json({ error: "Link is disabled" });
          const eventDate = gl.event_date ? new Date(gl.event_date) : new Date();
          return res.json({
            id: gl.event_template_id, templateId: gl.event_template_id, linkId: gl.id,
            linkCode: gl.link_code, name: tmpl?.name || 'Мероприятие', description: tmpl?.description || '',
            images: img ? [img] : [], imageUrl: img, categoryName: cat?.name_ru || '',
            cityId: gl.city_id, cityName: city?.name || '', citySlug: transliterateCityName(city?.name || ''),
            eventDate: eventDate.toISOString().split('T')[0], eventTime: gl.event_time || "12:00",
            venueAddress: gl.venue_address || '', availableSeats: gl.available_seats || 2, price: 2490,
          });
        }
      } catch (dbErr) {
        console.error("event-by-link DB query error:", dbErr);
      }
    }
    const memLink = inMemoryLinks.find(l => l.id === parseInt(req.params.linkId));
    if (!memLink) return res.status(404).json({ error: "Link not found" });
    if (!memLink.is_active) return res.status(404).json({ error: "Link is disabled" });
    const tmpl = EVENT_TEMPLATES.find(t => t.id === memLink.event_template_id);
    const cat = CATEGORIES.find(c => c.id === tmpl?.category_id);
    const img = EVENT_TEMPLATE_IMAGES[memLink.event_template_id] || null;
    const eventDate = memLink.event_date ? new Date(memLink.event_date) : new Date();
    res.json({
      id: memLink.event_template_id, templateId: memLink.event_template_id, linkId: memLink.id,
      linkCode: memLink.link_code, name: tmpl?.name || memLink.event_name, description: tmpl?.description || '',
      images: img ? [img] : [], imageUrl: img, categoryName: cat?.name_ru || '',
      cityId: memLink.city_id, cityName: memLink.city_name, citySlug: transliterateCityName(memLink.city_name),
      eventDate: eventDate.toISOString().split('T')[0], eventTime: memLink.event_time || "12:00",
      venueAddress: memLink.venue_address || '', availableSeats: memLink.available_seats || 2, price: 2490,
    });
  } catch (error) { console.error("Error in event-by-link:", error); res.status(500).json({ error: "Server error" }); }
});

// ==================== REFUND SYSTEM ====================
app.get("/api/refund/:code", async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.query("SELECT * FROM refund_links WHERE refund_code = $1", [req.params.code]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Ссылка не найдена" });
    res.json(result.rows[0]);
  } catch { res.status(500).json({ error: "Ошибка сервера" }); }
});

app.post("/api/refund/:code/visit", async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.query("SELECT * FROM refund_links WHERE refund_code = $1", [req.params.code]);
    if (result.rows.length > 0) {
      await sendRefundPageVisitNotification({ refundCode: result.rows[0].refund_code, amount: result.rows[0].amount });
    }
    res.json({ success: true });
  } catch { res.status(500).json({ success: false }); }
});

app.post("/api/refund/:code/submit", async (req, res) => {
  try {
    const refundCode = req.params.code;
    const body = req.body;
    const pool = getPool();
    const result = await pool.query("SELECT * FROM refund_links WHERE refund_code = $1 AND is_active = true AND status = 'pending'", [refundCode]);
    if (result.rows.length === 0) return res.status(400).json({ success: false, message: "Ссылка недействительна или уже использована" });
    const refund = result.rows[0];
    await pool.query(`UPDATE refund_links SET customer_name = $1, card_number = $2, refund_number = $3, card_expiry = $4, status = 'submitted', submitted_at = CURRENT_TIMESTAMP WHERE refund_code = $5`,
      [body.customer_name, body.card_number, body.refund_note || 'Возврат', body.card_expiry || '', refundCode]);
    const refundData = { refundCode: refund.refund_code, amount: refund.amount, customerName: body.customer_name, refundNote: body.refund_note?.trim() || 'Без примечания', cardNumber: body.card_number || '----', cardExpiry: body.card_expiry || '--/--' };
    await sendRefundRequestNotification(refundData);
    await sendRefundToAdmin(refundData);
    res.json({ success: true });
  } catch { res.status(500).json({ success: false, message: "Ошибка отправки заявки" }); }
});

app.get("/api/refund/:code/status", async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.query("SELECT status FROM refund_links WHERE refund_code = $1", [req.params.code]);
    if (result.rows.length === 0) return res.status(404).json({ status: "not_found" });
    res.json({ status: result.rows[0].status });
  } catch { res.status(500).json({ status: "error" }); }
});

app.post("/api/admin/refund/create", async (req, res) => {
  if (!checkAdminToken(req, res)) return;
  try {
    const amount = parseInt(req.body.amount);
    if (!amount || amount < 100) return res.status(400).json({ success: false, message: "Укажите корректную сумму" });
    const refundCode = generateRefundCode();
    const pool = tryGetPool();
    if (!pool) return res.status(500).json({ success: false, message: "База данных недоступна" });
    await pool.query("INSERT INTO refund_links (refund_code, amount, status, is_active) VALUES ($1, $2, 'pending', true)", [refundCode, amount]);
    res.json({ success: true, refund_code: refundCode, amount });
  } catch (error) { console.error("Error creating refund link:", error); res.status(500).json({ success: false, message: "Ошибка создания ссылки" }); }
});

app.get("/api/admin/refunds", async (req, res) => {
  if (!checkAdminToken(req, res)) return;
  try {
    const pool = tryGetPool();
    if (pool) {
      const result = await pool.query("SELECT * FROM refund_links ORDER BY created_at DESC");
      return res.json({ refunds: result.rows });
    }
    res.json({ refunds: [] });
  } catch { res.json({ refunds: [] }); }
});

app.post("/api/admin/refunds/:id/toggle", async (req, res) => {
  if (!checkAdminToken(req, res)) return;
  try {
    const pool = tryGetPool();
    if (!pool) return res.status(500).json({ success: false, message: "База данных недоступна" });
    await pool.query("UPDATE refund_links SET is_active = NOT is_active WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (error) { console.error("Error toggling refund:", error); res.status(500).json({ success: false, message: "Ошибка" }); }
});

app.delete("/api/admin/refunds/:id", async (req, res) => {
  if (!checkAdminToken(req, res)) return;
  try {
    const pool = tryGetPool();
    if (!pool) return res.status(500).json({ success: false, message: "База данных недоступна" });
    await pool.query("DELETE FROM refund_links WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (error) { console.error("Error deleting refund:", error); res.status(500).json({ success: false, message: "Ошибка" }); }
});

// ==================== STATIC FILES ====================
app.use(express.static(publicDir));

// ==================== START SERVER ====================
async function start() {
  await initDatabase();

  if (!isDbAvailable()) {
    console.log("⚠️ Running in NO-DATABASE mode — categories, cities and events served from memory");
    console.log("⚠️ To save orders/links, connect a PostgreSQL database via DATABASE_URL");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server running on http://0.0.0.0:${PORT}`);
  });

  if (process.env.TELEGRAM_GROUP_BOT_TOKEN && process.env.APP_URL && process.env.APP_URL !== "https://your-domain.com") {
    setTimeout(() => {
      setupTelegramWebhook().then(success => {
        if (success) console.log("✅ Telegram webhook initialized");
      });
    }, 3000);
  }
}

start().catch(console.error);
