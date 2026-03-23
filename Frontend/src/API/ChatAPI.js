import axios from "axios";

const API = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_URL,
  headers: {
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
  },
  timeout: 10000,
});


/* ========================
   SEND AGENT MESSAGE
======================== */

export const sendReply = async (user, message) => {
  try {
    const res = await API.post("/agent/reply", {
      to: user,
      message,
    });

    return res.data;
  } catch (err) {
    console.error("sendReply error:", err.response?.data || err.message);
    throw err.response?.data || err;
  }
};


/* ========================
   END HUMAN SESSION
======================== */

export const endSession = async (user) => {
  try {
    const res = await API.post("/agent/end", {
      user,
    });

    return res.data;
  } catch (err) {
    console.error("endSession error:", err.response?.data || err.message);
    throw err.response?.data || err;
  }
};


/* ========================
   FETCH CONVERSATIONS
======================== */

// Frontend/src/API/ChatAPI.js

const BASE_URL = import.meta.env.VITE_BACKEND_URL;

export async function fetchConversations() {
  try {
    const res = await fetch(`${BASE_URL}/webhook/conversations`, {
      method: "GET",
      credentials: "include", // 🔥 THIS FIXES YOUR ISSUE
    });

    return await res.json();

  } catch (err) {
    console.error("fetchConversations error:", err);
  }
}