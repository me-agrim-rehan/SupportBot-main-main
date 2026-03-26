// Backend/routes/webhook.js
import express from "express";
import { pool } from "../db.js";

import { sendMessage } from "../services/whatsapp.js";
import { processMessage } from "../services/ai.js";

import {
  getMessagesByConversationId,
  addMessage,
  getOrCreateConversation, // ✅ ADD THIS
} from "../store/conversations.js";
import { detectCountry } from "../services/country.js";

const router = express.Router();

/**
 * ✅ VERIFY WEBHOOK
 */
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  res.sendStatus(403);
});

/**
 * ✅ INCOMING MESSAGE
 */
router.post("/", async (req, res) => {
  res.sendStatus(200);

  try {
    const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message || !message.text) return;

    const from = message.from;
    const text = message.text.body;

    // ✅ ensure single conversation
    await getOrCreateConversation(from);

    // 🌍 Detect country
    const country = detectCountry(from);

    if (country) {
      await pool.query(
        `UPDATE conversations
         SET country_id = $1
         WHERE sender_id = $2`, // ✅ FIXED
        [country.id, from],
      );
    }

    // 💾 Save user message
    await addMessage(from, "incoming", text);

    // 🤖 AI response
    const reply = await processMessage(from, text);
    if (!reply) return;

    // 💾 Save bot reply
    await addMessage(from, "outgoing", reply);

    // 📤 Send message
    await sendMessage(from, reply);
  } catch (err) {
    console.error("Webhook error:", err);
  }
});

/**
 * ✅ GET CONVERSATIONS (FINAL)
 */
router.get("/conversations", async (req, res) => {
  const user = req.session.user;

  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    let query;
    let params = [];

    // 👑 SUPERADMIN → ALL
    if (user.role === "superadmin") {
      query = `
        SELECT c.*, MAX(c.created_at) as last_time
        FROM conversations c
        GROUP BY c.id
        ORDER BY last_time DESC
      `;
    }

    // 🧑‍💼 ADMIN → department only (all chats)
    else if (user.role === "admin") {
      query = `
        SELECT c.*, MAX(c.created_at) as last_time
        FROM conversations c
        WHERE c.department_id = $1
        GROUP BY c.id
        ORDER BY last_time DESC
      `;
      params = [user.department_id];
    }

    // 👨‍💻 SUPPORT → strict filtering
    else if (user.role === "support") {
      query = `
        SELECT c.*, MAX(c.created_at) as last_time
        FROM conversations c
        WHERE c.department_id = $1
AND c.country_id = $2
AND (
  c.status = 'active'
  OR (
    c.status = 'ended'
    AND c.assigned_to = $3
    AND c.ended_at > NOW() - INTERVAL '48 hours'
  )
)
AND (
  c.assigned_to = $3
  OR c.assigned_to IS NULL
)
        GROUP BY c.id
        ORDER BY last_time DESC
      `;
      params = [user.department_id, user.country_id, user.id];
    }

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});
router.get("/conversations/:id/messages", async (req, res) => {
  const { id } = req.params;

  const messages = await pool.query(
    `
    SELECT direction, text, created_at
    FROM messages
    WHERE conversation_id = $1
    ORDER BY created_at ASC
    `,
    [id],
  );

  res.json(messages.rows);
});
export default router;
