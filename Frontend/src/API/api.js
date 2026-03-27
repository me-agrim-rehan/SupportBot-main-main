// Frontend/src/API/api.js
import axios from "axios";

const API = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_URL,
  withCredentials: true, // 🔥 REQUIRED for sessions
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 10000,
});

export default API;