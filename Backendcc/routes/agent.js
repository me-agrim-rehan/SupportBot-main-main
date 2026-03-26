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

  // =========================
  // ✅ VALIDATION
  // =========================
  if (!to || typeof to !== "string") {
    return res.status(400).json({ error: "Invalid recipient" });
  }

  if (!message || !message.trim()) {
    return res.status(400).json({ error: "Message required" });
  }

  const user = req.session.user;
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // =========================
    // 📥 GET CONVERSATION
    // =========================
    const convoRes = await pool.query(
      `SELECT c.*, 
              u.role AS assigned_role
       FROM conversations c
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
    // 👨‍💻 SUPPORT RULES
    // =========================
    if (user.role === "support") {
      // dept + country
      if (
        user.department_id !== conversation.department_id ||
        user.country_id !== conversation.country_id
      ) {
        return res.status(403).json({
          error: "Unauthorized for this chat",
        });
      }

      // ❌ cannot override admin/superadmin
      if (
        conversation.assigned_role === "admin" ||
        conversation.assigned_role === "superadmin"
      ) {
        return res.status(403).json({
          error: `Chat handled by ${conversation.assigned_role}`,
        });
      }

      // 🟢 assign if unassigned
      if (!conversation.assigned_to) {
        await pool.query(
          `UPDATE conversations
           SET assigned_to = $1,
               assigned_role = $2
           WHERE id = $3 AND assigned_to IS NULL`,
          [user.id, user.role, conversation.id],
        );
      }

      // 🔁 takeover support chat (after 20 min)
      if (conversation.assigned_to && conversation.assigned_to !== user.id) {
        const lastReply = conversation.last_agent_reply_at;

        if (!lastReply) {
          return res.status(403).json({
            error: "Chat just started, cannot take over yet",
          });
        }

        const isInactive =
          new Date(lastReply) < new Date(Date.now() - 20 * 60 * 1000);

        if (!isInactive) {
          return res.status(403).json({
            error: "Another support agent is active",
          });
        }

        // ✅ race-safe takeover
        const result = await pool.query(
          `UPDATE conversations
           SET assigned_to = $1,
               assigned_role = $2
           WHERE id = $3
           AND last_agent_reply_at < NOW() - INTERVAL '20 minutes'
           RETURNING id`,
          [user.id, user.role, conversation.id],
        );

        if (result.rowCount === 0) {
          return res.status(409).json({
            error: "Chat was taken by another agent",
          });
        }
      }
    }

    // =========================
    // 🧑‍💼 ADMIN RULES
    // =========================
    if (user.role === "admin") {
      if (user.department_id !== conversation.department_id) {
        return res.status(403).json({
          error: "Wrong department",
        });
      }

      // ❌ cannot override superadmin
      if (conversation.assigned_role === "superadmin") {
        return res.status(403).json({
          error: "Handled by superadmin",
        });
      }

      // always take over
      if (conversation.assigned_to !== user.id) {
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
    // 👑 SUPERADMIN RULES
    // =========================
    if (user.role === "superadmin") {
      if (conversation.assigned_to !== user.id) {
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

    await addMessage(to, "outgoing", cleanMessage, messageId, "sent");

    // =========================
    // ⏱️ TRACK ACTIVITY
    // =========================
    await pool.query(
      `UPDATE conversations
       SET last_agent_reply_at = NOW(),
           last_agent_id = $1
       WHERE id = $2`,
      [user.id, conversation.id],
    );

    return res.json({
      success: true,
      conversationId: conversation.id,
    });
  } catch (err) {
    console.error("Agent reply error:", err.message);

    return res.status(500).json({
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

  // =========================
  // ✅ VALIDATION
  // =========================
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!conversation_id) {
    return res.status(400).json({
      error: "conversation_id required",
    });
  }

  try {
    // =========================
    // 📥 GET CONVERSATION
    // =========================
    const convRes = await pool.query(
      `SELECT * FROM conversations WHERE id = $1`,
      [conversation_id],
    );

    const convo = convRes.rows[0];

    if (!convo) {
      return res.status(404).json({ error: "Not found" });
    }

    // 🔒 prevent reopening active chat
    if (convo.status === "active") {
      return res.status(400).json({
        error: "Chat already active",
      });
    }

    // =========================
    // 👨‍💻 SUPPORT RULES
    // =========================
    if (user.role === "support") {
      // 🔒 block if another active chat exists (exclude this convo)
      const active = await pool.query(
        `SELECT id FROM conversations
         WHERE sender_id = $1
         AND status = 'active'
         AND id != $2
         LIMIT 1`,
        [convo.sender_id, conversation_id],
      );

      if (active.rows.length > 0) {
        return res.status(403).json({
          error: "User already has an active chat",
        });
      }

      // ⏱️ within 48h
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

    // =========================
    // 🧑‍💼 ADMIN RULES
    // =========================
    if (user.role === "admin") {
      if (user.department_id !== convo.department_id) {
        return res.status(403).json({
          error: "Wrong department",
        });
      }
    }

    // 👑 SUPERADMIN → always allowed

    // =========================
    // 🔁 REOPEN (RACE SAFE)
    // =========================
    const result = await pool.query(
      `UPDATE conversations
       SET status = 'active',
           ended_at = NULL,
           assigned_to = NULL,
           assigned_role = NULL
       WHERE id = $1
       AND status = 'ended'
       RETURNING id`,
      [conversation_id],
    );

    if (result.rowCount === 0) {
      return res.status(409).json({
        error: "Chat already reopened",
      });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("Reopen error:", err.message);

    return res.status(500).json({
      error: "Failed to reopen chat",
    });
  }
});

/**
 * 🟢 ASSIGN CHAT
 */
router.post("/assign", async (req, res) => {
  const user = req.session.user;
  const { conversation_id } = req.body;

  // ========================
  // ✅ VALIDATION
  // =========================
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!conversation_id) {
    return res.status(400).json({ error: "conversation_id required" });
  }

  try {
    // =========================
    // 📥 GET CONVERSATION
    // =========================
    const convo = await pool.query(
      `SELECT c.*, u.role AS assigned_role
       FROM conversations c
       LEFT JOIN users u ON c.assigned_to = u.id
       WHERE c.id = $1`,
      [conversation_id],
    );

    const c = convo.rows[0];

    if (!c) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    if (c.status !== "active") {
      return res.status(403).json({
        error: "Cannot assign ended chat",
      });
    }

    // =========================
    // 👨‍💻 SUPPORT RULES
    // =========================
    if (user.role === "support") {
      if (
        user.department_id !== c.department_id ||
        user.country_id !== c.country_id
      ) {
        return res.status(403).json({
          error: "Cannot assign this chat",
        });
      }

      // ❌ cannot override admin/superadmin
      if (c.assigned_role === "admin" || c.assigned_role === "superadmin") {
        return res.status(403).json({
          error: `Chat handled by ${c.assigned_role}`,
        });
      }

      // 🟢 assign if unassigned
      if (!c.assigned_to) {
        const result = await pool.query(
          `UPDATE conversations
           SET assigned_to = $1,
               assigned_role = $2
           WHERE id = $3 AND assigned_to IS NULL
           RETURNING id, assigned_to, assigned_role`,
          [user.id, user.role, conversation_id],
        );

        if (result.rowCount === 0) {
          return res.status(409).json({
            error: "Chat already taken",
          });
        }

        return res.json({
          success: true,
          conversation: result.rows[0],
        });
      }

      // 🔁 takeover support chat after 20 min
      const lastReply = c.last_agent_reply_at;

      if (!lastReply) {
        return res.status(403).json({
          error: "Chat just started, cannot take over yet",
        });
      }

      const isInactive =
        new Date(lastReply) < new Date(Date.now() - 20 * 60 * 1000);

      if (!isInactive) {
        return res.status(403).json({
          error: "Another support agent is active",
        });
      }

      // ✅ race-safe takeover
      const result = await pool.query(
        `UPDATE conversations
         SET assigned_to = $1,
             assigned_role = $2
         WHERE id = $3
         AND last_agent_reply_at < NOW() - INTERVAL '20 minutes'
         RETURNING id, assigned_to, assigned_role`,
        [user.id, user.role, conversation_id],
      );

      if (result.rowCount === 0) {
        return res.status(409).json({
          error: "Chat already taken",
        });
      }

      return res.json({
        success: true,
        conversation: result.rows[0],
      });
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

      // ❌ cannot override superadmin
      if (c.assigned_role === "superadmin") {
        return res.status(403).json({
          error: "Handled by superadmin",
        });
      }

      const result = await pool.query(
        `UPDATE conversations
         SET assigned_to = $1,
             assigned_role = $2
         WHERE id = $3
         RETURNING id, assigned_to, assigned_role`,
        [user.id, user.role, conversation_id],
      );

      return res.json({
        success: true,
        conversation: result.rows[0],
      });
    }

    // =========================
    // 👑 SUPERADMIN RULES
    // =========================
    if (user.role === "superadmin") {
      const result = await pool.query(
        `UPDATE conversations
         SET assigned_to = $1,
             assigned_role = $2
         WHERE id = $3
         RETURNING id, assigned_to, assigned_role`,
        [user.id, user.role, conversation_id],
      );

      return res.json({
        success: true,
        conversation: result.rows[0],
      });
    }

    return res.status(403).json({
      error: "Invalid role",
    });
  } catch (err) {
    console.error("Assign error:", err.message);

    return res.status(500).json({
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

  // =========================
  // ✅ VALIDATION
  // =========================
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!conversation_id) {
    return res.status(400).json({
      error: "conversation_id required",
    });
  }

  try {
    // =========================
    // 📥 GET CONVERSATION
    // =========================
    const convo = await pool.query(
      `SELECT * FROM conversations WHERE id = $1`,
      [conversation_id],
    );

    const c = convo.rows[0];

    if (!c) {
      return res.status(404).json({ error: "Not found" });
    }

    // 🔒 already ended
    if (c.status === "ended") {
      return res.status(400).json({
        error: "Chat already ended",
      });
    }

    // =========================
    // 👨‍💻 SUPPORT RULES
    // =========================
    if (user.role === "support") {
      if (c.assigned_to !== user.id) {
        return res.status(403).json({
          error: "Not your chat",
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

    // 👑 SUPERADMIN → always allowed

    // =========================
    // 🔚 END CHAT (RACE SAFE)
    // =========================
    const result = await pool.query(
      `UPDATE conversations
       SET status = 'ended',
           ended_at = NOW(),
           assigned_to = NULL,
           assigned_role = NULL
       WHERE id = $1
       AND status = 'active'
       RETURNING id`,
      [conversation_id],
    );

    if (result.rowCount === 0) {
      return res.status(409).json({
        error: "Chat already ended",
      });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("End chat error:", err.message);

    return res.status(500).json({
      error: "Failed to end chat",
    });
  }
});

export default router;
