import express from "express";
import pool from "../db.js";
import { processMessage } from "../services/ai.js";
import { sendMessage } from "../services/whatsapp.js";
import { addMessage } from "../services/messages.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const from = message.from;
    const text = message.text?.body || "";

    setImmediate(async () => {
      try {
        const lowerText = text.toLowerCase();

        const deptTriggers = ["finance", "hr", "support", "sales"];
        const endTriggers = ["end", "end chat", "end conversation", "stop", "bye"];

        const wantsDept = deptTriggers.some(word =>
          lowerText.includes(word)
        );

        const wantsToEnd = endTriggers.some(word =>
          lowerText.includes(word)
        );

        if (wantsDept || wantsToEnd) {
          await pool.query(
            `UPDATE conversations
             SET status = 'ended',
                 ended_at = NOW()
             WHERE sender_id = $1
             AND status = 'active'`,
            [from]
          );

          console.log("🔁 Resetting conversation flow");

          const { resetUserState } = await import("../services/ai.js");
          resetUserState(from);

          if (wantsToEnd) {
            const reply = "Your conversation has been ended. You can start again anytime.";

            const messageId = await sendMessage(from, reply);
            await addMessage(from, "outgoing", reply, messageId, "sent");

            return;
          }
        }

        const reply = await processMessage(from, text);

        if (!reply) return;

        const messageId = await sendMessage(from, reply);

        await addMessage(from, "outgoing", reply, messageId, "sent");

      } catch (err) {
        console.error("Async reply error:", err);
      }
    });

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(500);
  }
});

export default router;