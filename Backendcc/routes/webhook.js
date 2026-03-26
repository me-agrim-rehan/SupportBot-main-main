// Backend/routes/webhook.js
import express from "express";
import { pool } from "../db.js";

import { sendMessage } from "../services/whatsapp.js";
import { processMessage } from "../services/ai.js";

import {
  getMessagesByConversationId,
  addMessage,
  getOrCreateConversation,
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


router.post("/", async (req, res) => {
  res.sendStatus(200);

  try {

    const value = req.body?.entry?.[0]?.changes?.[0]?.value;

    if (value?.statuses) {
      for (const status of value.statuses) {

        const messageId = status.id;
        const state = status.status;

        if (state === "delivered") {
          await pool.query(
            `
            UPDATE messages
            SET status = 'delivered',
                delivered_at = NOW()
            WHERE whatsapp_message_id = $1
            `,
            [messageId]
          );
        }

        if (state === "read") {
          await pool.query(
            `
            UPDATE messages
            SET status = 'read',
                read_at = NOW()
            WHERE whatsapp_message_id = $1
            `,
            [messageId]
          );
        }
      }

      return; // stop processing after status update
    }

    const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message || !message.text) return;

    const from = message.from;
    const text = message.text.body;

    // ✅ ensure conversation exists
    await getOrCreateConversation(from);

    // 🌍 Detect country
    const country = detectCountry(from);

    if (country) {
      await pool.query(
        `UPDATE conversations
         SET country_id = $1
         WHERE sender_id = $2`,
        [country.id, from],
      );
    }

    // 💾 Save incoming
    await addMessage(from, "incoming", text);

    // 🤖 AI response
    const reply = await processMessage(from, text);
    if (!reply) return;

const messageId = await sendMessage(from, reply);

await addMessage(
  from,
  "outgoing",
  reply,
  messageId,
  "sent"
);

  } catch (err) {
    console.error("Webhook error:", err);
  }
});

/**
 * ✅ GET CONVERSATIONS (HIERARCHY VERSION)
 */
router.get("/conversations", async (req, res) => {
  const user = req.session.user;

  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    let query;
    let params = [];

    // 👑 SUPERADMIN → EVERYTHING
    if (user.role === "superadmin") {
      query = `
        SELECT 
          c.*,
          u.name AS assigned_name,
          u.role AS assigned_role,
          u.email AS assigned_email
        FROM conversations c
        LEFT JOIN users u ON c.assigned_to = u.id
        ORDER BY c.created_at DESC
      `;
    }

    // 🧑‍💼 ADMIN → ALL in department
    else if (user.role === "admin") {
      query = `
        SELECT 
          c.*,
          u.name AS assigned_name,
          u.role AS assigned_role,
          u.email AS assigned_email
        FROM conversations c
        LEFT JOIN users u ON c.assigned_to = u.id
        WHERE c.department_id = $1
        ORDER BY c.created_at DESC
      `;
      params = [user.department_id];
    }

    // 👨‍💻 SUPPORT → hierarchy visibility
    else if (user.role === "support") {
      query = `
        SELECT 
          c.*,
          u.name AS assigned_name,
          u.role AS assigned_role,
          u.email AS assigned_email
        FROM conversations c
        LEFT JOIN users u ON c.assigned_to = u.id
        WHERE c.department_id = $1
        AND c.country_id = $2
        AND (
          c.status = 'active'
          OR (
            c.status = 'ended'
            AND c.ended_at > NOW() - INTERVAL '48 hours'
          )
        )
        ORDER BY c.created_at DESC
      `;
      params = [user.department_id, user.country_id];
    }

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

/**
 * ✅ GET MESSAGES
 */
router.get("/conversations/:id/messages", async (req, res) => {
  const { id } = req.params;

  try {
    const messages = await pool.query(
      `
      SELECT direction, text, status, created_at
      FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC
      `,
      [id],
    );

    res.json(messages.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

export default router;