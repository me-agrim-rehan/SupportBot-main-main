import express from "express";

import { sendMessage } from "../../services/whatsapp.js";
import { addMessage } from "../../store/conversations.js";
import { requireAdmin } from "../../middleware/auth.js";

const router = express.Router();

/**
 * 🔥 SEND (single OR multiple numbers)
 */
router.post("/send", requireAdmin, async (req, res) => {
  let { to, message } = req.body;

  if (!to || !message) {
    return res.status(400).json({ error: "to and message required" });
  }

  // 👉 normalize numbers
  let numbers = [];

  if (Array.isArray(to)) {
    numbers = to;
  } else {
    numbers = to
      .split(/[\n, ]+/)
      .map((n) => n.trim())
      .filter(Boolean);
  }

  const results = [];

  try {
    for (const number of numbers) {
      try {
        const messageId = await sendMessage(number, message);

        await addMessage(
          number,
          "outgoing",
          message,
          messageId,
          "sent"
        );

        results.push({ number, status: "sent" });
      } catch (err) {
        results.push({ number, status: "failed" });
      }
    }

    res.json({
      success: true,
      total: numbers.length,
      results,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send" });
  }
});

export default router;