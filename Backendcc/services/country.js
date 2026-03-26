import { pool } from "../db.js";

let cachedCountries = [];

// 🔁 Load once (or refresh every X mins if needed)
export async function loadCountries() {
  try {
    console.log("📡 Connecting to DB...");

    const res = await pool.query(`SELECT id, name, phone_code FROM countries`);

    console.log("✅ Countries fetched:", res.rows.length);

    cachedCountries = res.rows.sort(
      (a, b) => b.phone_code.length - a.phone_code.length,
    );
  } catch (err) {
    console.error("❌ DB ERROR:", err.message);
  }
}
// 🔍 Detect from phone
export function detectCountry(phone) {
  for (let c of cachedCountries) {
    if (phone.startsWith(c.phone_code)) {
      return c;
    }
  }
  return null;
}