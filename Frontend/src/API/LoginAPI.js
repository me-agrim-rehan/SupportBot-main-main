// Frontend/src/API/LoginAPI.js
const BASE_URL = import.meta.env.VITE_BACKEND_URL;

// 🔐 LOGIN
export async function loginUser(data) {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include", // 🔥 VERY IMPORTANT
    body: JSON.stringify(data),
  });

  return res.json();
}

// 👤 GET CURRENT USER
export async function getCurrentUser() {
  const res = await fetch(`${BASE_URL}/auth/me`, {
    credentials: "include",
  });

  return res.json();
}

// 🚪 LOGOUT
export async function logoutUser() {
  const res = await fetch(`${BASE_URL}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });

  return res.json();
}

// ➕ CREATE Admin (SUPERADMIN ONLY)
// create admin
export async function createAdmin(data) {
  const res = await fetch(`${BASE_URL}/superadmin/create-admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });

  return res.json();
}

// 👥 create support (admin + superadmin)

export async function createSupport(data) {
  const res = await fetch(`${BASE_URL}/superadmin/create-support`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });

  return res.json();
}
