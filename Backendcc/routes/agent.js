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
  const { to, message } = req.body; // ❌ removed force

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
    const convoRes = await pool.query(
      `SELECT c.*, d.name AS department_name,
              u.role AS assigned_role,
              u.email AS assigned_email
       FROM conversations c
       LEFT JOIN departments d ON c.department_id = d.id
       LEFT JOIN users u ON c.assigned_to = u.id
       WHERE c.sender_id = $1
       ORDER BY c.created_at DESC
       LIMIT 1`,
      [to],
    );

    const conversation = convoRes.rows[0];

    if (!conversation) {
      return res.status(404).json({ error: "No conversation found" });
    }

  
    if (!conversation.department_id) {
      return res.status(403).json({
        error: "Department not assigned yet",
      });
    }

  
    if (conversation.status !== "active") {
      return res.status(403).json({
        error: "Chat is ended. Please reopen to continue.",
      });
    }

    // =========================
    // support
    // =========================

    // 👨‍💻 SUPPORT
    if (user.role === "support") {
      // dept + country restriction
      if (
        user.department_id !== conversation.department_id ||
        user.country_id !== conversation.country_id
      ) {
        return res.status(403).json({
          error: "Unauthorized for this chat",
        });
      }

      // ❌ if assigned to admin/superadmin → hard block
      if (
        conversation.assigned_role === "admin" ||
        conversation.assigned_role === "superadmin"
      ) {
        return res.status(403).json({
          error: `Chat is handled by ${conversation.assigned_role}`,
        });
      }

      // 🟢 if unassigned → auto assign
      if (!conversation.assigned_to) {
        await pool.query(
          `UPDATE conversations
           SET assigned_to = $1,
               assigned_role = $2
           WHERE id = $3`,
          [user.id, user.role, conversation.id],
        );
      }

      // 🔁 if assigned to another support
      if (conversation.assigned_to && conversation.assigned_to !== user.id) {
        const lastReply = conversation.last_agent_reply_at;

        const isInactive =
          !lastReply ||
          new Date(lastReply) < new Date(Date.now() - 20 * 60 * 1000);

        if (!isInactive) {
          return res.status(403).json({
            error: "Another support agent is active on this chat",
          });
        }

        // ✅ takeover after inactivity
        await pool.query(
          `UPDATE conversations
           SET assigned_to = $1,
               assigned_role = $2
           WHERE id = $3`,
          [user.id, user.role, conversation.id],
        );
      }
    }

    // 🧑‍💼 ADMIN
    if (user.role === "admin") {
      if (user.department_id !== conversation.department_id) {
        return res.status(403).json({
          error: "Wrong department",
        });
      }

      if (conversation.assigned_to !== user.id)  {
        await pool.query(
          `UPDATE conversations
           SET assigned_to = $1,
               assigned_role = $2
           WHERE id = $3`,
          [user.id, user.role, conversation.id],
        );
      }
    }

    // 👑 SUPERADMIN
    if (user.role === "superadmin") {
      if (conversation.assigned_to !== user.id){
        await pool.query(
          `UPDATE conversations
           SET assigned_to = $1,
               assigned_role = $2
           WHERE id = $3`,
          [user.id, user.role, conversation.id],
        );
      }
    }

    // =========================
    // 📤 SEND MESSAGE
    // =========================

    const cleanMessage = message.trim();

const messageId = await sendMessage(to, cleanMessage);

await addMessage(
  to,
  "outgoing",
  cleanMessage,
  messageId,
  "sent"
);

    // ⏱️ update activity tracking
    await pool.query(
      `UPDATE conversations
       SET last_agent_reply_at = NOW(),
           last_agent_id = $1
       WHERE id = $2`,
      [user.id, conversation.id],
    );

    res.json({
      success: true,
      conversationId: conversation.id,
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

  // =========================
  // 👨‍💻 SUPPORT → STRICT RULES
  // =========================
  if (user.role === "support") {
    // 🔒 block if another active chat exists (ONLY for support)
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
         assigned_role = NULL
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

    // =========================
    // 👨‍💻 SUPPORT RULES
    // =========================
    if (user.role === "support") {
      // dept + country check
      if (
        user.department_id !== c.department_id ||
        user.country_id !== c.country_id
      ) {
        return res.status(403).json({
          error: "Cannot assign this chat",
        });
      }

      // ❌ if already assigned
      if (c.assigned_to) {
        return res.status(403).json({
          error: "Chat already assigned",
        });
      }
    }

    // =========================
    // 🧑‍💼 ADMIN RULES
    // =========================
    if (user.role === "admin") {
      if (user.department_id !== c.department_id) {
        return res.status(403).json({
          error: "Wrong department",
        });
      }
    }

    // =========================
    // ✅ ASSIGN CHAT
    // =========================

    const result = await pool.query(
      `UPDATE conversations
       SET assigned_to = $1,
           assigned_role = $2
       WHERE id = $3
       RETURNING id, assigned_to, assigned_role`,
      [user.id, user.role, conversation_id],
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