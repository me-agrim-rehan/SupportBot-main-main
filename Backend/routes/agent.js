// backend/routes/agent.js
import express from "express";
import { sendMessage } from "../services/whatsapp.js";
import { humanSessions, addMessage } from "../store/conversations.js";
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
    // 🔥 include assigned_to
    const convoRes = await pool.query(
      `SELECT c.id, c.department_id, c.country_id, c.assigned_to,
              d.name AS department_name
       FROM conversations c
       LEFT JOIN departments d ON c.department_id = d.id
       WHERE c.phone = $1
       ORDER BY c.created_at DESC
       LIMIT 1`,
      [to]
    );

    const conversation = convoRes.rows[0];

    if (!conversation) {
      return res.status(404).json({
        error: "No conversation found",
      });
    }

    // 🚫 no department yet
    if (!conversation.department_id) {
      return res.status(403).json({
        error: "Department not assigned yet",
      });
    }

    // 🚫 no human session
    if (!humanSessions.get(to)) {
      return res.status(403).json({
        error: "Human session not active",
      });
    }

    // 🚫 no country detected
    if (!conversation.country_id) {
      return res.status(403).json({
        error: "Country not assigned yet",
      });
    }

    // =========================
    // 🔐 ROLE-BASED RESTRICTIONS
    // =========================

    // 👨‍💻 SUPPORT → must be assigned + match dept + country
    if (user.role === "support") {

      // 🔥 NEW: assignment check
      if (!conversation.assigned_to) {
        return res.status(403).json({
          error: "Chat is not assigned yet",
        });
      }

      if (conversation.assigned_to !== user.id) {
        return res.status(403).json({
          error: "This chat is assigned to another agent",
        });
      }

      // existing checks
      if (
        user.department_id !== conversation.department_id ||
        user.country_id !== conversation.country_id
      ) {
        return res.status(403).json({
          error: "You can only reply to your country chats",
        });
      }
    }

    // 🧑‍💼 ADMIN → department only (can override assignment if needed)
    if (user.role === "admin") {
      if (user.department_id !== conversation.department_id) {
        return res.status(403).json({
          error: "You can only reply to your department chats",
        });
      }
    }

    // 👑 superadmin → no restriction

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
 * 🟢 ASSIGN CHAT (NEW)
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
    const result = await pool.query(
      `UPDATE conversations
       SET assigned_to = $1
       WHERE id = $2
       RETURNING id, assigned_to`,
      [user.id, conversation_id]
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
 * 🔚 END SESSION
 */
router.post("/end", (req, res) => {
  const { user } = req.body;

  if (!user) {
    return res.status(400).json({
      error: "User is required",
    });
  }

  if (!humanSessions.get(user)) {
    return res.status(400).json({
      error: "No active human session",
    });
  }

  humanSessions.delete(user);

  res.json({
    success: true,
    message: "Conversation returned to bot",
  });
});

export default router;