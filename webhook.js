const express = require("express");
const bodyParser = require("body-parser");
const db = require("./db");

const app = express();
app.use(bodyParser.json());

app.post("/webhook", async (req, res) => {
  try {
    const data = req.body;

    if (data.status === "success") {
      const telegramId = data.merchant_order_id.split("_")[1]; // example mapping
      const amount = parseFloat(data.pay_amount);

      // update balance
      await db.query("UPDATE users SET balance = balance + ? WHERE telegram_id = ?", [amount, telegramId]);

      console.log(`✅ Deposit confirmed: ${amount} credited to ${telegramId}`);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.listen(3000, () => console.log("🚀 Webhook running on port 43434000"));
