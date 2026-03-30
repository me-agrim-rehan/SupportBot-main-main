import { useState } from "react";
import styles from "./styles/Compose.module.css";
import API from "../../API/api";

function Compose() {
  const [numbers, setNumbers] = useState("");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  // 🔒 only digits, comma, space, newline
  const cleanNumbers = (value) => {
    return value.replace(/[^\d\n, ]/g, "");
  };

  // 🔥 IMPORTANT: assume user gives FULL number (with country code)
  const formatNumbers = () => {
    return numbers
      .split(/[\n, ]+/)
      .map((n) => n.replace(/\D/g, "")) // only digits
      .filter(Boolean);
  };

  const numberList = formatNumbers();

  const handleSend = async () => {
    if (!numberList.length || !message) return alert("Add numbers + message");

    try {
      setLoading(true);

      await API.post("/compose/send", {
        to: numberList,
        message,
      });

      alert(`Sent to ${numberList.length} users ✅`);
      setMessage("");
    } catch {
      alert("Failed ❌");
    } finally {
      setLoading(false);
    }
  };

  const handleBulk = async () => {
    if (!file || !message) return alert("Upload CSV + message");

    try {
      setLoading(true);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("message", message);

      await API.post("/compose/bulk", formData);

      alert("CSV sent ✅");
      setFile(null);
      setMessage("");
    } catch {
      alert("CSV failed ❌");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* SIDEBAR */}
      <div className={styles.sidebar}>
        <h2>Recipients</h2>

        <div className={styles.section}>
          <label>Numbers (with country code)</label>
          <textarea
            value={numbers}
            onChange={(e) => setNumbers(cleanNumbers(e.target.value))}
            placeholder="Example:
91949501021
14155552671"
          />
        </div>

        <div className={styles.count}>{numberList.length} recipients</div>

        <div className={styles.section}>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setFile(e.target.files[0])}
          />

          <button onClick={handleBulk} disabled={loading}>
            Send CSV
          </button>
        </div>
      </div>

      {/* CHAT */}
      <div className={styles.chat}>
        <div className={styles.header}>
          <h2>Compose Message</h2>
          <span>{numberList.length} selected</span>
        </div>

        <div className={styles.empty}>
          <p>Start typing your message below</p>
        </div>

        <div className={styles.inputBar}>
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your message..."
          />

          <button onClick={handleSend} disabled={loading}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

export default Compose;
