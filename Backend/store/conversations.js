// Backend/store/conversations.js

import { pool } from "../db.js";
import { randomUUID } from "crypto";

/* ==============================
   In-memory stores
============================== */

/* ==============================
   Departments
============================== */

export const departments = [
  "admin",
  "business development",
  "ceo office",
  "contact centre",
  "deployment department",
  "finance & accounts",
  "government relations department",
  "hr",
  "information technology",
  "learning & development",
  "marketing & training",
  "pm team",
  "project management",
  "pscm",
  "qhse",
  "relationship department",
  "research & characterization",
  "seo",
  "technical office",
  "technology",
];

/* ==============================
   Conversation Creation
============================== */

export async function createConversation(phone) {
  const id = randomUUID();

  try {
    await pool.query(
      `INSERT INTO conversations (id, sender_id, message)
       VALUES ($1, $2, $3)`,
      [id, phone, "New conversation"],
    );

    console.log("🆕 New conversation:", id);

    return id;
  } catch (err) {
    console.error("❌ Conversation create error:", err.message);
    throw err;
  }
}

/* ==============================
   Get or Create Conversation
============================== */
export async function getOrCreateConversation(phone) {
  try {
    // 🔍 check existing conversation
    const existing = await pool.query(
      `SELECT id FROM conversations
   WHERE sender_id = $1
   ORDER BY created_at DESC
   LIMIT 1`,
      [phone],
    );

    if (existing.rows.length > 0) {
      return existing.rows[0].id;
    }

    // ➕ create new
    const id = randomUUID();

    await pool.query(
      `INSERT INTO conversations (id, sender_id, message)
       VALUES ($1, $2, $3)`,
      [id, phone, "New conversation"],
    );

    console.log("🆕 New conversation:", id);

    return id;
  } catch (err) {
    console.error("❌ getOrCreateConversation error:", err.message);
    throw err;
  }
}

/* ==============================
   Add Message
============================== */

export async function addMessage(phone, direction, text) {
  try {
    const conversationId = await getOrCreateConversation(phone);

    await pool.query(
      `INSERT INTO messages (conversation_id, direction, text)
       VALUES ($1, $2, $3)`,
      [conversationId, direction, text],
    );

    console.log("✅ Saved:", phone, direction, "→", conversationId);
  } catch (err) {
    console.error("❌ DB insert error:", err.message);
  }
}

/* ==============================
   Get Messages (memory)
============================== */
export async function getMessagesByConversationId(conversationId) {
  try {
    const result = await pool.query(
      `
      SELECT direction, text, created_at
      FROM messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC
      `,
      [conversationId],
    );

    return result.rows;
  } catch (err) {
    console.error(err);
    return [];
  }
}

/* ==============================
   Human Session
============================== */

export function startHumanSession(phone, department_id) {
  if (department_id) {
    assignDepartment(phone, department_id);
  }
}

/* ==============================
   Assign Department
============================== */
export async function assignDepartment(phone, department_id) {
  try {
    // 🔒 END all previous active chats
    await pool.query(
      `UPDATE conversations
       SET status = 'ended',
           ended_at = NOW()
       WHERE sender_id = $1
       AND status = 'active'`,
      [phone],
    );

    // 🎯 get latest conversation
    const conv = await pool.query(
      `SELECT id FROM conversations
       WHERE sender_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [phone],
    );

    if (conv.rows.length === 0) return;

    const conversationId = conv.rows[0].id;

    // 🟢 START NEW HUMAN CHAT
    await pool.query(
      `UPDATE conversations
       SET department_id = $1,
           status = 'active',
           started_at = NOW(),
           ended_at = NULL
       WHERE id = $2`,
      [department_id, conversationId],
    );

    console.log("🏷️ Department assigned:", department_id, "→", conversationId);
  } catch (err) {
    console.error("❌ Department update error:", err.message);
  }
}

/* ==============================
   Validate Department
============================== */

export function isValidDepartment(input) {
  if (!input) return false;
  return departments.includes(input.toLowerCase());
}

/* ==============================
   Get All Conversations (memory)
============================== */

export async function getMessages(phone) {
  try {
    const res = await pool.query(
      `SELECT id FROM conversations
   WHERE sender_id = $1
   ORDER BY created_at DESC
   LIMIT 1`,
      [phone],
    );

    if (res.rows.length === 0) return [];

    const conversationId = res.rows[0].id;

    return await getMessagesByConversationId(conversationId);
  } catch (err) {
    console.error(err);
    return [];
  }
}
