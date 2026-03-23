// backend/routes/agent.js
import express from "express";
import { sendMessage } from "../services/whatsapp.js";
import { addMessage } from "../store/conversations.js";
import { pool } from "../db.js";

const router = express.Router();

/**
 * 📤 REPLY TO USER
 */
router.post("/reply", async (req, res) => {
  const { to, message } = req.body;

  if (!to || !message || !message.trim()) {
    return res.status(400).json({
      error: "Missing or invalid fields",
    });
  }

  const user = req.session.user;
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // ✅ get latest conversation
    const convoRes = await pool.query(
      `SELECT c.*, d.name AS department_name
       FROM conversations c
       LEFT JOIN departments d ON c.department_id = d.id
       WHERE c.sender_id = $1
       ORDER BY c.created_at DESC
       LIMIT 1`,
      [to],
    );

    const conversation = convoRes.rows[0];

    if (!conversation) {
      return res.status(404).json({ error: "No conversation found" });
    }

    // 🚫 must be human chat
    if (!conversation.department_id) {
      return res.status(403).json({
        error: "Department not assigned yet",
      });
    }

    // 🚫 must be ACTIVE chat
    if (conversation.status !== "active") {
      return res.status(403).json({
        error: "Chat is ended. Please reopen to continue.",
      });
    }

    // 🔒 GLOBAL RULE: only ONE active chat per user
    const active = await pool.query(
      `SELECT id FROM conversations
       WHERE sender_id = $1
       AND status = 'active'
       LIMIT 1`,
      [to],
    );

    if (active.rows.length > 0 && active.rows[0].id !== conversation.id) {
      return res.status(403).json({
        error: "User is active in another department",
      });
    }

    // =========================
    // 🔐 ROLE LOGIC
    // =========================

    // 👨‍💻 SUPPORT
    if (user.role === "support") {
      if (!conversation.assigned_to) {
        return res.status(403).json({
          error: "Chat is not assigned yet",
        });
      }

      if (conversation.assigned_to !== user.id) {
        return res.status(403).json({
          error: "Assigned to another agent",
        });
      }

      if (
        user.department_id !== conversation.department_id ||
        user.country_id !== conversation.country_id
      ) {
        return res.status(403).json({
          error: "Unauthorized for this chat",
        });
      }
    }

    // 🧑‍💼 ADMIN
    if (user.role === "admin") {
      if (user.department_id !== conversation.department_id) {
        return res.status(403).json({
          error: "Wrong department",
        });
      }
    }

    // 👑 SUPERADMIN → no restriction

    // =========================

    const cleanMessage = message.trim();

    await sendMessage(to, cleanMessage);
    await addMessage(to, "outgoing", cleanMessage);

    res.json({
      success: true,
      conversationId: conversation.id,
      department: conversation.department_name,
    });
  } catch (err) {
    console.error("Agent reply error:", err.message);

    res.status(500).json({
      error: "Failed to send message",
    });
  }
});

/**
 * 🔁 REOPEN CHAT
 */
router.post("/reopen", async (req, res) => {
  const user = req.session.user;
  const { conversation_id } = req.body;

  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const convRes = await pool.query(
    `SELECT * FROM conversations WHERE id = $1`,
    [conversation_id],
  );

  const convo = convRes.rows[0];
  if (!convo) return res.status(404).json({ error: "Not found" });

  // 🔒 block if another active chat exists
  const active = await pool.query(
    `SELECT id FROM conversations
     WHERE sender_id = $1
     AND status = 'active'
     LIMIT 1`,
    [convo.sender_id],
  );

  if (active.rows.length > 0) {
    return res.status(403).json({
      error: "User already has an active chat",
    });
  }

  // 👨‍💻 SUPPORT → 48h + dept + country
  if (user.role === "support") {
    const isWithin48h =
      convo.ended_at &&
      new Date(convo.ended_at) > new Date(Date.now() - 48 * 60 * 60 * 1000);

    const allowed =
      user.department_id === convo.department_id &&
      user.country_id === convo.country_id &&
      isWithin48h;

    if (!allowed) {
      return res.status(403).json({
        error: "Cannot reopen this chat",
      });
    }
  }

  // 🧑‍💼 ADMIN → dept only
  if (user.role === "admin") {
    if (user.department_id !== convo.department_id) {
      return res.status(403).json({
        error: "Wrong department",
      });
    }
  }

  // 👑 SUPERADMIN → allowed

  await pool.query(
    `UPDATE conversations
     SET status = 'active',
         ended_at = NULL,
         assigned_to = NULL
     WHERE id = $1`,
    [conversation_id],
  );

  res.json({ success: true });
});

/**
 * 🟢 ASSIGN CHAT
 */
router.post("/assign", async (req, res) => {
  const user = req.session.user;
  const { conversation_id } = req.body;

  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!conversation_id) {
    return res.status(400).json({ error: "conversation_id required" });
  }

  try {
    const convo = await pool.query(
      `SELECT * FROM conversations WHERE id = $1`,
      [conversation_id],
    );

    const c = convo.rows[0];
    if (!c) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // 🔒 prevent assigning ended chat
    if (c.status !== "active") {
      return res.status(403).json({
        error: "Cannot assign ended chat",
      });
    }

    // 👨‍💻 SUPPORT → dept + country
    if (user.role === "support") {
      if (
        user.department_id !== c.department_id ||
        user.country_id !== c.country_id
      ) {
        return res.status(403).json({
          error: "Cannot assign this chat",
        });
      }
    }

    // 🧑‍💼 ADMIN → dept only
    if (user.role === "admin") {
      if (user.department_id !== c.department_id) {
        return res.status(403).json({
          error: "Wrong department",
        });
      }
    }

    const result = await pool.query(
      `UPDATE conversations
       SET assigned_to = $1
       WHERE id = $2
       RETURNING id, assigned_to`,
      [user.id, conversation_id],
    );

    res.json({
      success: true,
      conversation: result.rows[0],
    });
  } catch (err) {
    console.error("Assign error:", err.message);

    res.status(500).json({
      error: "Failed to assign conversation",
    });
  }
});

/**
 * 🔚 END CHAT
 */
router.post("/end", async (req, res) => {
  const user = req.session.user;
  const { conversation_id } = req.body;

  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const convo = await pool.query(`SELECT * FROM conversations WHERE id = $1`, [
    conversation_id,
  ]);

  const c = convo.rows[0];
  if (!c) return res.status(404).json({ error: "Not found" });

  // 🔒 prevent ending already ended chat
  if (c.status === "ended") {
    return res.status(400).json({
      error: "Chat already ended",
    });
  }

  // 👨‍💻 SUPPORT → only own assigned chat
  if (user.role === "support") {
    if (c.assigned_to !== user.id) {
      return res.status(403).json({
        error: "Not your chat",
      });
    }
  }

  // 🧑‍💼 ADMIN → dept only
  if (user.role === "admin") {
    if (user.department_id !== c.department_id) {
      return res.status(403).json({
        error: "Wrong department",
      });
    }
  }

  await pool.query(
    `UPDATE conversations
     SET status = 'ended',
         ended_at = NOW()
     WHERE id = $1`,
    [conversation_id],
  );

  res.json({ success: true });
});

export default router;
