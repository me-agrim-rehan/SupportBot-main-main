// Backend/store/conversations.js

import { pool } from "../db.js";
import { randomUUID } from "crypto";

/* ==============================
   In-memory stores
============================== */

export const humanSessions = new Map(); // phone → true/false
export const userDepartments = new Map(); // phone → department

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

    activeConversations.set(phone, id);

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
      `SELECT id FROM conversations WHERE sender_id = $1 LIMIT 1`,
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

export function isHumanActive(phone) {
  return humanSessions.get(phone) || false;
}

export function startHumanSession(phone, department = null) {
  humanSessions.set(phone, true);

  if (department) {
    userDepartments.set(phone, department);
    assignDepartment(phone, department);
  }
}

export function endHumanSession(phone) {
  humanSessions.delete(phone);
}

/* ==============================
   Assign Department
============================== */

export async function assignDepartment(phone, department) {
  try {
    const conv = await pool.query(
      `SELECT id FROM conversations WHERE sender_id = $1 LIMIT 1`,
      [phone],
    );

    if (conv.rows.length === 0) return;

    const conversationId = conv.rows[0].id;

    await pool.query(
      `UPDATE conversations
       SET department = $1
       WHERE id = $2`,
      [department, conversationId],
    );

    userDepartments.set(phone, department);

    console.log("🏷️ Department assigned:", department, "→", conversationId);
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

export function getAllConversations() {
  const result = {};

  for (const [user, messages] of conversations.entries()) {
    result[user] = {
      department: userDepartments.get(user) || null,
      messages,
    };
  }

  return result;
}
export async function getMessages(phone) {
  try {
    const res = await pool.query(
      `SELECT id FROM conversations WHERE sender_id = $1 LIMIT 1`,
      [phone]
    );

    if (res.rows.length === 0) return [];

    const conversationId = res.rows[0].id;

    return await getMessagesByConversationId(conversationId);
  } catch (err) {
    console.error(err);
    return [];
  }
}