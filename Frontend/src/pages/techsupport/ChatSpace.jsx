// Frontend/src/pages/techsupport/ChatSpace.jsx
import { useState, useEffect } from "react";
import styles from "./styles/ChatSpace.module.css";
import { sendReply, endSession, fetchConversations } from "../../API/ChatAPI";

const BASE = import.meta.env.VITE_BACKEND_URL;

function ChatSpace() {
  const [conversations, setConversations] = useState([]); // ✅ FIXED
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]); // ✅ NEW
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // 🔁 Load conversations
  useEffect(() => {
    const loadConversations = async () => {
      try {
        const data = await fetchConversations();
        setConversations(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Failed to load conversations:", err);
      }
    };

    loadConversations();
    const interval = setInterval(loadConversations, 3000);

    return () => clearInterval(interval);
  }, []);

  // 🔥 Load messages when selecting chat
  const handleSelectUser = async (senderId) => {
    setSelectedUser(senderId);

    try {
      const res = await fetch(
        `${BASE}/webhook/conversations/${senderId}/messages`,
        { credentials: "include" },
      );

      const data = await res.json();
      setMessages(data);
    } catch (err) {
      console.error("Failed to load messages", err);
    }
  };

  const handleSendReply = async () => {
    if (!selectedUser || !message.trim()) return;

    try {
      setLoading(true);
      await sendReply(selectedUser, message);
      setMessage("");

      // 🔄 reload messages after sending
      handleSelectUser(selectedUser);
    } catch (error) {
      alert(error.response?.data?.error || "Failed to send reply");
    } finally {
      setLoading(false);
    }
  };

  const handleEndSession = async () => {
    if (!selectedUser) return;

    try {
      await endSession(selectedUser);
      alert("Session ended");
    } catch (error) {
      alert(error.response?.data?.error || "Failed to end session");
    }
  };

  const currentChat = conversations.find((c) => c.sender_id === selectedUser);

  return (
    <div className={styles.container}>
      {/* Sidebar */}
      <div className={styles.sidebar}>
        <h3 className={styles.sidebarTitle}>Conversations</h3>

        {conversations.map((chat) => (
          <div
            key={chat.id}
            className={`${styles.userItem} ${
              selectedUser === chat.sender_id ? styles.activeUser : ""
            }`}
            onClick={() => handleSelectUser(chat.sender_id)}
          >
            <div>{chat.sender_id}</div>
          </div>
        ))}
      </div>

      {/* Chat Section */}
      <div className={styles.chat}>
        <div className={styles.chatHeader}>
          {selectedUser ? (
            <>
              <h3>{selectedUser}</h3>
              <span className={styles.deptBadge}>
                {currentChat?.department?.toUpperCase()}
              </span>
            </>
          ) : (
            <h3>Select conversation</h3>
          )}
        </div>

        {/* Messages */}
        <div className={styles.messages}>
          {messages.map((msg, index) => {
            const isAgent =
              msg.direction === "bot";

            return (
              <div
                key={index}
                className={isAgent ? styles.agentWrapper : styles.userWrapper}
              >
                <div
                  className={isAgent ? styles.agentMessage : styles.userMessage}
                >
                  {msg.text}
                </div>
              </div>
            );
          })}
        </div>

        {/* Input */}
        <div className={styles.inputBox}>
          <input
            className={styles.input}
            placeholder="Type message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={!selectedUser || loading}
          />

          <button
            className={styles.sendBtn}
            onClick={handleSendReply}
            disabled={loading}
          >
            {loading ? "Sending..." : "Send"}
          </button>

          <button
            className={styles.endBtn}
            onClick={handleEndSession}
            disabled={!selectedUser}
          >
            End
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChatSpace;
