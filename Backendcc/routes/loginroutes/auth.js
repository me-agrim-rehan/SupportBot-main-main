// Backend/routes/loginroutes/auth.js
import express from "express";
import { pool } from "../../db.js";
import bcrypt from "bcrypt";

const router = express.Router();

/**
 * 🔐 LOGIN
 */
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // 🔥 JOIN departments to get name
    const result = await pool.query(
      `SELECT u.*, d.name AS department_name
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.email = $1`,
      [email],
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // 🔥 CREATE SESSION (UPDATED)
    req.session.user = {
      id: user.id,
      name: user.name,
      role: user.role,
      department_id: user.department_id, // ✅ ID
      department: user.department_name, // ✅ readable name
      country_id: user.country_id,
    };

    console.log("✅ Session created:", req.session.user);

    res.json({
      success: true,
      user: req.session.user,
    });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ error: "Login failed" });
  }
});

/**
 * 👤 GET CURRENT USER
 */
router.get("/me", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.role, u.department_id, u.country_id,
              d.name AS department_name
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.id = $1`,
      [req.session.user.id],
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // 🔥 keep session fresh
    req.session.user.department = user.department_name;

    res.json({
      ...req.session.user,
      department: user.department_name,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

/**
 * 🚪 LOGOUT
 */
router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

export default router;