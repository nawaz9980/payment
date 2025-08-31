require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const express = require("express");
const bodyParser = require("body-parser");
const db = require("./db");

// Initialize Telegram bot
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// Escape function for Telegram MarkdownV2
function escapeMarkdown(text) {
  if (!text) return "";
  return String(text).replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

// Function to request TRX (TRON) deposit address from OxaPay
async function getDepositAddress(orderId) {
  try {
    const response = await axios.post(
      "https://api.oxapay.com/v1/payment/static-address",
      {
        network: "TRON",
        to_currency: "USDT",
        auto_withdrawal: false,
        order_id: orderId,
        description: `Deposit for ${orderId}`,
      },
      {
        headers: {
          merchant_api_key: process.env.OXAPAY_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("OxaPay response:", response.data);

    if (response.data.status === 200 && response.data.data?.address) {
      return response.data.data;
    } else {
      throw new Error(response.data.message || "No address returned");
    }
  } catch (err) {
    console.error("OxaPay API Error:", err.response?.data || err.message);
    return null;
  }
}

// ---------------- BOT COMMANDS ----------------

// Command: /deposit
bot.onText(/\/deposit/, async (msg) => {
  const chatId = msg.chat.id;

  bot.sendMessage(chatId, "⏳ Generating your TRX deposit address...");

  const orderId = `TG-${chatId}-${Date.now()}`;
  const depositData = await getDepositAddress(orderId);

  if (!depositData) {
    return bot.sendMessage(
      chatId,
      "⚠️ Failed to generate deposit address\\. Please try again later\\.",
      { parse_mode: "MarkdownV2" }
    );
  }

  const { address, qr_code, track_id } = depositData;

  // Save to MySQL (amount=0 initially)
  await db.saveDeposit(chatId, orderId, track_id, address, 0);

  // Send to user
  bot.sendMessage(
    chatId,
    `✅ *Deposit Address Generated*\n\n💳 Address:\n\`${escapeMarkdown(
      address
    )}\`\n\n⚡ Send TRX \\(TRON\\) to this address\n🆔 Order ID: \`${escapeMarkdown(
      orderId
    )}\`\n🔍 Track ID: \`${escapeMarkdown(track_id)}\``,
    { parse_mode: "MarkdownV2" }
  );

  if (qr_code) {
    bot.sendPhoto(chatId, qr_code, { caption: "📷 Scan QR to pay" });
  }
});

// Command: /balance
bot.onText(/\/balance/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    const sql = `
      SELECT COALESCE(SUM(paid_amount),0) as total 
      FROM deposits 
      WHERE chat_id = ? AND status = 'paid'
    `;
    const [rows] = await db.pool.query(sql, [chatId]);
    const total = rows[0].total;

    bot.sendMessage(
      chatId,
      `💰 *Your Total Balance*: \`${escapeMarkdown(total)}\` USDT`,
      { parse_mode: "MarkdownV2" }
    );
  } catch (err) {
    console.error("Balance error:", err.message);
    bot.sendMessage(chatId, "⚠️ Error fetching your balance.");
  }
});

// ---------------- WEBHOOK SERVER ----------------
const app = express();
app.use(bodyParser.json());

// Webhook endpoint for OxaPay callbacks
app.post("/webhook", async (req, res) => {
  try {
    console.log("Webhook received:", req.body);

    const track_id = req.body.track_id || req.body.data?.track_id;
    const status = req.body.status || req.body.data?.status;

    // Safely extract amount
    let amount = 0;

    if (req.body.paid_amount) {
      amount = req.body.paid_amount;
    } else if (req.body.amount) {
      amount = req.body.amount;
    } else if (req.body.data?.paid_amount) {
      amount = req.body.data.paid_amount;
    } else if (req.body.data?.amount) {
      amount = req.body.data.amount;
    } else if (req.body.txs && req.body.txs.length > 0) {
      // ✅ Fallback to the received_amount from first transaction
      amount = req.body.txs[0].received_amount;
    }

    console.log("Parsed webhook:", { track_id, status, amount });

    if (!track_id) {
      throw new Error("Missing track_id in webhook payload");
    }

    // Update DB
    await db.updateDeposit(track_id, status, amount);

    // Fetch deposit record
    const deposit = await db.getDepositByTrackId(track_id);

    if (deposit) {
      bot.sendMessage(
        deposit.chat_id,
        `💰 *Deposit Update*\n\n🆔 Order ID: \`${escapeMarkdown(
          deposit.order_id
        )}\`\n🔍 Track ID: \`${escapeMarkdown(
          track_id
        )}\`\n💵 Amount: ${escapeMarkdown(amount)}\n📌 Status: *${escapeMarkdown(
          status
        )}*`,
        { parse_mode: "MarkdownV2" }
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err.message);
    res.status(500).json({ error: "Webhook failed" });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🚀 Webhook server running on port ${PORT}`)
);
