import { useState } from "react";
import styles from "./styles/Compose.module.css";
import API from "../../API/api"; // ✅ use your axios instance

function Compose() {
  const [message, setMessage] = useState("");
  const [number, setNumber] = useState("");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const sendSingle = async () => {
    if (!number || !message) return alert("Fill all fields");

    try {
      setLoading(true);

      await API.post("/compose/send", {
        to: number,
        message,
      });

      alert("Message sent");
      setMessage("");
      setNumber("");
    } catch (err) {
      console.error(err);
      alert("Failed to send");
    } finally {
      setLoading(false);
    }
  };

  const sendBulk = async () => {
    if (!file) return alert("Upload CSV");
    if (!message) return alert("Enter message");

    try {
      setLoading(true);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("message", message);

      await API.post("/compose/bulk", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      alert("Bulk messages sent");
      setFile(null);
      setMessage("");
    } catch (err) {
      console.error(err);
      alert("Bulk failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <h2>📢 Compose Message</h2>

      <div className={styles.card}>
        <h3>Send to One</h3>

        <input
          placeholder="Phone number (e.g. 9198...)"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
        />

        <textarea
          placeholder="Type your message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />

        <button onClick={sendSingle} disabled={loading}>
          Send
        </button>
      </div>

      <div className={styles.card}>
        <h3>Bulk (CSV Upload)</h3>

        <input
          type="file"
          accept=".csv"
          onChange={(e) => setFile(e.target.files[0])}
        />

        <textarea
          placeholder="Message for all users..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />

        <button onClick={sendBulk} disabled={loading}>
          Send Bulk
        </button>
      </div>
    </div>
  );
}

export default Compose;
