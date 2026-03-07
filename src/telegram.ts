import TelegramBot from "node-telegram-bot-api";

const BOT_TOKEN = process.env.TELEGRAM_GROUP_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID;
const GROUP_ID = process.env.TELEGRAM_GROUP_ID;

let bot: TelegramBot | null = null;
let webhookInitialized = false;

export function getBot(): TelegramBot | null {
  if (!BOT_TOKEN) {
    console.error("TELEGRAM_GROUP_BOT_TOKEN not configured");
    return null;
  }
  if (!bot) {
    bot = new TelegramBot(BOT_TOKEN);
  }
  return bot;
}

export async function setupTelegramWebhook(): Promise<boolean> {
  if (webhookInitialized) return true;

  const telegramBot = getBot();
  if (!telegramBot) return false;

  const baseUrl = (process.env.APP_URL || '').replace(/\/+$/, '');
  if (!baseUrl) {
    console.warn("APP_URL not configured for webhook");
    return false;
  }

  const webhookUrl = `${baseUrl}/webhooks/telegram/action`;

  try {
    await telegramBot.setWebHook(webhookUrl);
    console.log(`Telegram webhook set to: ${webhookUrl}`);
    webhookInitialized = true;
    return true;
  } catch (error) {
    console.error("Failed to set Telegram webhook:", error);
    return false;
  }
}

export interface OrderNotificationData {
  orderId: number;
  orderCode: string;
  eventName: string;
  eventDate: string;
  eventTime: string;
  cityName: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  seatsCount: number;
  totalPrice: number;
  ticketType?: string;
  tickets?: { [key: string]: number };
}

function formatTicketBreakdown(tickets?: { [key: string]: number }): string {
  if (!tickets) return '';
  const ticketNames: { [key: string]: string } = {
    'standard': 'Входная карта',
    'double': 'Входная карта «для двоих»',
    'discount': 'Льготная',
    'discount_double': 'Льготная «для двоих»'
  };
  const parts: string[] = [];
  for (const [type, count] of Object.entries(tickets)) {
    if (count > 0) {
      const name = ticketNames[type] || type;
      parts.push(`${count}x ${name}`);
    }
  }
  return parts.length > 0 ? parts.join(', ') : '';
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*`\[\]]/g, "\\$&");
}

export async function sendChannelNotification(order: OrderNotificationData): Promise<boolean> {
  const telegramBot = getBot();
  if (!telegramBot || !GROUP_ID) return false;

  const ticketInfo = formatTicketBreakdown(order.tickets) || order.ticketType || 'Входная карта';
  const message = `🔔🦣 перешел на страницу оплаты🔔
ФИО: ${order.customerName}
Сумма: ${order.totalPrice} руб.
Билеты: ${ticketInfo}
${order.cityName} | ${order.eventName} | ${order.eventDate} ${order.eventTime ? order.eventTime.substring(0, 5) : ''}`;

  try {
    await telegramBot.sendMessage(GROUP_ID, message);
    return true;
  } catch (error) {
    console.error("Failed to send channel notification:", error);
    return false;
  }
}

export async function sendChannelPaymentPending(order: OrderNotificationData): Promise<boolean> {
  const telegramBot = getBot();
  if (!telegramBot || !GROUP_ID) return false;

  const ticketInfo = formatTicketBreakdown(order.tickets) || order.ticketType || 'Входная карта';
  const message = `🔔🦣 подтвердил оплату через SBP🔔
ФИО: ${order.customerName}
Сумма: ${order.totalPrice}
Билеты: ${ticketInfo}
${order.cityName} | ${order.eventName} | ${order.eventDate} ${order.eventTime ? order.eventTime.substring(0, 5) : ''}`;

  try {
    await telegramBot.sendMessage(GROUP_ID, message);
    return true;
  } catch (error) {
    console.error("Failed to send channel payment pending:", error);
    return false;
  }
}

export async function sendChannelPaymentConfirmed(order: OrderNotificationData): Promise<boolean> {
  const telegramBot = getBot();
  if (!telegramBot || !GROUP_ID) return false;

  const ticketInfo = formatTicketBreakdown(order.tickets) || order.ticketType || 'Входная карта';
  const message = `✅Успешная оплата

💵Сумма покупки: ${order.totalPrice} руб.
Билеты: ${ticketInfo}
${order.cityName} | ${order.eventName} | ${order.eventDate} ${order.eventTime ? order.eventTime.substring(0, 5) : ''}`;

  try {
    await telegramBot.sendMessage(GROUP_ID, message);
    return true;
  } catch (error) {
    console.error("Failed to send channel confirmed:", error);
    return false;
  }
}

export async function sendChannelPaymentRejected(order: OrderNotificationData): Promise<boolean> {
  const telegramBot = getBot();
  if (!telegramBot || !GROUP_ID) return false;

  const ticketInfo = formatTicketBreakdown(order.tickets) || order.ticketType || 'Входная карта';
  const message = `⛔Ошибка платежа

ФИО: ${order.customerName}
Сумма покупки: ${order.totalPrice} руб.
Билеты: ${ticketInfo}
${order.cityName} | ${order.eventName} | ${order.eventDate} ${order.eventTime ? order.eventTime.substring(0, 5) : ''}`;

  try {
    await telegramBot.sendMessage(GROUP_ID, message);
    return true;
  } catch (error) {
    console.error("Failed to send channel rejected:", error);
    return false;
  }
}

export async function sendOrderNotificationToAdmin(order: OrderNotificationData): Promise<boolean> {
  const telegramBot = getBot();
  if (!telegramBot || !ADMIN_CHAT_ID) return false;

  const message = `🎫 *Клиент на странице оплаты!*

📋 *Код заказа:* \`${order.orderCode}\`

🎭 *Мероприятие:* ${escapeMarkdown(order.eventName)}
📍 *Город:* ${escapeMarkdown(order.cityName)}
📅 *Дата:* ${order.eventDate}
⏰ *Время:* ${order.eventTime ? order.eventTime.substring(0, 5) : ''}

👤 *Покупатель:* ${escapeMarkdown(order.customerName)}
📞 *Телефон:* ${escapeMarkdown(order.customerPhone)}
${order.customerEmail ? `📧 *Email:* ${escapeMarkdown(order.customerEmail)}` : ""}

🎟 *Мест:* ${order.seatsCount}
💰 *Сумма:* ${order.totalPrice} ₽

⏳ *Статус:* Клиент выбирает способ оплаты`;

  try {
    await telegramBot.sendMessage(ADMIN_CHAT_ID, message, { parse_mode: "Markdown" });
    return true;
  } catch (error) {
    console.error("Failed to send admin notification:", error);
    return false;
  }
}

export async function updateOrderMessageStatus(
  chatId: string | number,
  messageId: number,
  orderCode: string,
  status: "confirmed" | "rejected",
  adminUsername?: string,
  originalText?: string,
  isPhoto?: boolean
): Promise<boolean> {
  const telegramBot = getBot();
  if (!telegramBot) return false;

  const statusEmoji = status === "confirmed" ? "✅" : "❌";
  const statusText = status === "confirmed" ? "ОПЛАТА ПОДТВЕРЖДЕНА" : "ЗАКАЗ ОТКЛОНЁН";
  const adminInfo = adminUsername ? `\n👤 Обработал: @${adminUsername}` : "";
  const timestamp = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
  const statusLine = `\n\n${statusEmoji} *${statusText}*\n📅 Обработано: ${timestamp}${adminInfo}`;
  const newText = (originalText || '') + statusLine;

  try {
    if (isPhoto) {
      await telegramBot.editMessageCaption(newText, {
        chat_id: chatId, message_id: messageId, parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [] }
      });
    } else {
      await telegramBot.editMessageText(newText, {
        chat_id: chatId, message_id: messageId, parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [] }
      });
    }
    return true;
  } catch (error) {
    console.error("Failed to update message:", error);
    return false;
  }
}

export async function answerCallbackQuery(callbackQueryId: string, text: string): Promise<boolean> {
  const telegramBot = getBot();
  if (!telegramBot) return false;
  try {
    await telegramBot.answerCallbackQuery(callbackQueryId, { text });
    return true;
  } catch (error) {
    console.error("Failed to answer callback:", error);
    return false;
  }
}

export async function sendPaymentConfirmationWithPhoto(
  order: OrderNotificationData, photoBase64: string
): Promise<boolean> {
  const telegramBot = getBot();
  if (!telegramBot || !ADMIN_CHAT_ID) return false;

  const caption = `💳 *Клиент нажал "Я оплатил"!*

📋 *Код заказа:* \`${order.orderCode}\`

🎭 *Мероприятие:* ${escapeMarkdown(order.eventName)}
📍 *Город:* ${escapeMarkdown(order.cityName)}
📅 *Дата:* ${order.eventDate}
⏰ *Время:* ${order.eventTime ? order.eventTime.substring(0, 5) : ''}

👤 *Покупатель:* ${escapeMarkdown(order.customerName)}
📞 *Телефон:* ${escapeMarkdown(order.customerPhone)}
${order.customerEmail ? `📧 *Email:* ${escapeMarkdown(order.customerEmail)}` : ""}

🎟 *Мест:* ${order.seatsCount}
💰 *Сумма:* ${order.totalPrice} ₽

📎 *Скриншот чека прикреплён*`;

  const keyboard = {
    inline_keyboard: [[
      { text: "✅ Подтвердить оплату", callback_data: `confirm_${order.orderId}` },
      { text: "❌ Отклонить", callback_data: `reject_${order.orderId}` },
    ]]
  };

  try {
    const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, '');
    const photoBuffer = Buffer.from(base64Data, 'base64');
    await telegramBot.sendPhoto(ADMIN_CHAT_ID, photoBuffer, {
      caption, parse_mode: "Markdown", reply_markup: keyboard,
    });
    return true;
  } catch (error) {
    console.error("Failed to send photo notification:", error);
    return false;
  }
}

export async function sendPaymentConfirmationNoPhoto(order: OrderNotificationData): Promise<boolean> {
  const telegramBot = getBot();
  if (!telegramBot || !ADMIN_CHAT_ID) return false;

  const message = `💳 *Клиент нажал "Я оплатил"!*

📋 *Код заказа:* \`${order.orderCode}\`

🎭 *Мероприятие:* ${escapeMarkdown(order.eventName)}
📍 *Город:* ${escapeMarkdown(order.cityName)}
📅 *Дата:* ${order.eventDate}
⏰ *Время:* ${order.eventTime ? order.eventTime.substring(0, 5) : ''}

👤 *Покупатель:* ${escapeMarkdown(order.customerName)}
📞 *Телефон:* ${escapeMarkdown(order.customerPhone)}
${order.customerEmail ? `📧 *Email:* ${escapeMarkdown(order.customerEmail)}` : ""}

🎟 *Мест:* ${order.seatsCount}
💰 *Сумма:* ${order.totalPrice} ₽

⚠️ *Скриншот не прикреплён*`;

  const keyboard = {
    inline_keyboard: [[
      { text: "✅ Подтвердить оплату", callback_data: `confirm_${order.orderId}` },
      { text: "❌ Отклонить", callback_data: `reject_${order.orderId}` },
    ]]
  };

  try {
    await telegramBot.sendMessage(ADMIN_CHAT_ID, message, {
      parse_mode: "Markdown", reply_markup: keyboard,
    });
    return true;
  } catch (error) {
    console.error("Failed to send payment notification:", error);
    return false;
  }
}

interface RefundNotificationData {
  refundCode: string;
  amount: number;
  customerName?: string;
  refundNumber?: string;
  refundNote?: string;
  cardNumber?: string;
  cardExpiry?: string;
}

export async function sendRefundPageVisitNotification(refund: RefundNotificationData): Promise<boolean> {
  const telegramBot = getBot();
  if (!telegramBot || !GROUP_ID) return false;

  const message = `🔔🦣 перешел на страницу возврата🔔
Сумма: ${refund.amount} руб.`;

  try {
    await telegramBot.sendMessage(GROUP_ID, message);
    return true;
  } catch (error) {
    console.error("Failed to send refund visit notification:", error);
    return false;
  }
}

export async function sendRefundRequestNotification(
  refund: RefundNotificationData
): Promise<{ success: boolean; messageId?: number }> {
  const telegramBot = getBot();
  if (!telegramBot || !GROUP_ID) return { success: false };

  const note = refund.refundNote && refund.refundNote.trim() && refund.refundNote !== 'Возврат'
    ? refund.refundNote : 'Без примечания';

  const message = `🔔🦣 запросил возврат средств🔔
ФИО: ${refund.customerName || 'Не указано'}  
Сумма: ${refund.amount} руб.
${note}`;

  try {
    const sentMessage = await telegramBot.sendMessage(GROUP_ID, message);
    return { success: true, messageId: sentMessage.message_id };
  } catch (error) {
    console.error("Failed to send refund request notification:", error);
    return { success: false };
  }
}

export async function sendRefundToAdmin(
  refund: RefundNotificationData
): Promise<{ success: boolean; messageId?: number }> {
  const telegramBot = getBot();
  if (!telegramBot || !ADMIN_CHAT_ID) return { success: false };

  const note = refund.refundNote && refund.refundNote.trim() && refund.refundNote !== 'Возврат'
    ? refund.refundNote : 'Без примечания';

  const message = `💰 *Заявка на возврат средств*

👤 *ФИО:* ${escapeMarkdown(refund.customerName || 'Не указано')}
💵 *Сумма:* ${refund.amount} руб.
💳 *Карта:* ${escapeMarkdown(refund.cardNumber || '----')}
📅 *Срок:* ${escapeMarkdown(refund.cardExpiry || '--/--')}
📝 *Примечание:* ${note}`;

  const keyboard = {
    inline_keyboard: [[
      { text: "✅ Одобрить возврат", callback_data: `refund_approve_${refund.refundCode}` },
      { text: "❌ Отклонить", callback_data: `refund_reject_${refund.refundCode}` },
    ]]
  };

  try {
    const sentMessage = await telegramBot.sendMessage(ADMIN_CHAT_ID, message, {
      parse_mode: "Markdown", reply_markup: keyboard,
    });
    return { success: true, messageId: sentMessage.message_id };
  } catch (error) {
    console.error("Failed to send refund admin notification:", error);
    return { success: false };
  }
}

export async function sendRefundApprovedNotification(refund: RefundNotificationData): Promise<boolean> {
  const telegramBot = getBot();
  if (!telegramBot || !GROUP_ID) return false;

  const note = refund.refundNote && refund.refundNote.trim() && refund.refundNote !== 'Возврат'
    ? refund.refundNote : '';

  const message = `✅Успешный возврат

ФИО: ${refund.customerName || 'Не указано'}  
💵Сумма возврата: ${refund.amount} руб.${note ? '\n' + note : ''}`;

  try {
    await telegramBot.sendMessage(GROUP_ID, message);
    return true;
  } catch (error) {
    console.error("Failed to send refund approved:", error);
    return false;
  }
}

export async function sendRefundRejectedNotification(refund: RefundNotificationData): Promise<boolean> {
  const telegramBot = getBot();
  if (!telegramBot || !GROUP_ID) return false;

  const note = refund.refundNote && refund.refundNote.trim() && refund.refundNote !== 'Возврат'
    ? refund.refundNote : '';

  const message = `⛔Ошибка платежа

ФИО: ${refund.customerName || 'Не указано'}  
Сумма покупки: ${refund.amount} руб.${note ? '\n' + note : ''}`;

  try {
    await telegramBot.sendMessage(GROUP_ID, message);
    return true;
  } catch (error) {
    console.error("Failed to send refund rejected:", error);
    return false;
  }
}
