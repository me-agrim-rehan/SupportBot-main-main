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
import { resolveCountry } from "../services/country.js";

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
  // ✅ respond immediately (Meta requires fast response)
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    if (!value) return;

    /* =========================
       ✅ STATUS UPDATES (SAFE)
    ========================= */
    if (Array.isArray(value.statuses)) {
      for (const status of value.statuses) {
        const messageId = status?.id;
        const state = status?.status;

        // ✅ strict validation
        if (!messageId || !["delivered", "read"].includes(state)) continue;

        if (state === "delivered") {
          await pool.query(
            `UPDATE messages
             SET status = 'delivered',
                 delivered_at = NOW()
             WHERE whatsapp_message_id = $1`,
            [messageId],
          );
        }

        if (state === "read") {
          await pool.query(
            `UPDATE messages
             SET status = 'read',
                 read_at = NOW()
             WHERE whatsapp_message_id = $1`,
            [messageId],
          );
        }
      }
      return;
    }

    /* =========================
       ✅ MESSAGE VALIDATION
    ========================= */
    const message = value.messages?.[0];

    if (!message) return;

    const from = message.from;
    const text = message.text?.body || null;

    // ✅ reject invalid sender
    if (!from || typeof from !== "string") return;

    // ✅ optional: ignore non-text safely
    if (!text) {
      console.log("⚠️ Non-text message ignored:", message.type);
      return;
    }

    /* =========================
       🌍 COUNTRY (SAFE + ONCE)
    ========================= */
    const country = await resolveCountry(from);

    if (country?.id) {
      await pool.query(
        `UPDATE conversations
         SET country_id = $1
         WHERE sender_id = $2
         AND country_id IS NULL`,
        [country.id, from],
      );
    }

    /* =========================
       💾 SAVE INCOMING
    ========================= */
    await addMessage(from, "incoming", text);

    /* =========================
       🤖 ASYNC RESPONSE (NON-BLOCKING)
    ========================= */
    setImmediate(async () => {
      try {
        // ✅ CHECK IF HUMAN CHAT IS ACTIVE
        const convoCheck = await pool.query(
          `SELECT department_id, status 
   FROM conversations
   WHERE sender_id = $1
   AND status = 'active'
   ORDER BY created_at DESC
   LIMIT 1`,
          [from]
        );

        const convo = convoCheck.rows[0];

        // 🚫 If assigned to department → HUMAN MODE → STOP AI
        if (convo?.department_id) {
          const lower = text.toLowerCase();

          // ✅ allow re-entry trigger
          const triggerWords = ["hr", "finance", "support", "department"];

          const wantsNewDept = triggerWords.some(word =>
            lower.includes(word)
          );

          if (!wantsNewDept) {
            console.log("🤫 AI blocked (human active)");
            return;
          }

          // 🔁 user wants new dept → reset conversation
          await pool.query(
            `UPDATE conversations
     SET status = 'ended',
         ended_at = NOW()
     WHERE sender_id = $1
     AND status = 'active'`,
            [from]
          );

          console.log("🔁 Switching back to AI routing");
        }
        const reply = await processMessage(from, text);
        if (!reply) return;

        const messageId = await sendMessage(from, reply);

        await addMessage(from, "outgoing", reply, messageId, "sent");
      } catch (err) {
        console.error("Async reply error:", err);
      }
    });
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
