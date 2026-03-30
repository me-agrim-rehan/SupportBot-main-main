import { useState } from "react";
import styles from "./styles/Compose.module.css";
import API from "../../API/api";

function Compose() {
  const [numbers, setNumbers] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // 🔒 allow only digits, comma, space, newline
  const cleanNumbers = (value) => {
    return value.replace(/[^\d\n, ]/g, "");
  };

  // 🔥 format numbers list
  const formatNumbers = () => {
    return numbers
      .split(/[\n, ]+/)
      .map((n) => n.replace(/\D/g, ""))
      .filter(Boolean);
  };

  const numberList = formatNumbers();

  const handleSend = async () => {
    if (!numberList.length || !message) {
      return alert("Add numbers + message");
    }

    try {
      setLoading(true);

      await API.post("/compose/send", {
        to: numberList,
        message,
      });

      alert(`Sent to ${numberList.length} users ✅`);
      setNumbers("");
      setMessage("");
    } catch {
      alert("Failed ❌");
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
            placeholder={`Example:
91949501021
14155552671`}
          />
        </div>

        <div className={styles.count}>{numberList.length} recipients</div>
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
            {loading ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Compose;
