import { useState, useEffect } from "react";
import styles from "./styles/ChatSpace.module.css";

import {
  sendReply,
  endSession,
  fetchConversations,
  fetchMessages,
  assignChat,
  reopenChat,
} from "../../API/ChatAPI";

function ChatSpace() {
  const [conversations, setConversations] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null); // ✅ store full object
  const [messages, setMessages] = useState([]);
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

  // 🔥 Load messages
  const handleSelectChat = async (chat) => {
    setSelectedChat(chat);

    try {
      const data = await fetchMessages(chat.id); // ✅ correct
      setMessages(data);
    } catch (err) {
      console.error("Failed to load messages", err);
    }
  };

  const handleSendReply = async () => {
    if (!selectedChat || !message.trim()) return;

    try {
      setLoading(true);
      await sendReply(selectedChat.sender_id, message);
      setMessage("");

      const data = await fetchMessages(selectedChat.id);
      setMessages(data);
    } catch (error) {
      alert(error?.error || "Failed to send reply");
    } finally {
      setLoading(false);
    }
  };

  const handleEnd = async () => {
    if (!selectedChat) return;

    try {
      await endSession(selectedChat.id); // ✅ FIXED
      alert("Chat ended");
    } catch (error) {
      alert(error?.error || "Failed to end chat");
    }
  };

  const handleAssign = async () => {
    if (!selectedChat) return;

    try {
      await assignChat(selectedChat.id);
      alert("Assigned to you");
    } catch (err) {
      alert(err?.error || "Assign failed");
    }
  };

  const handleReopen = async () => {
    if (!selectedChat) return;

    try {
      await reopenChat(selectedChat.id);
      alert("Chat reopened");
    } catch (err) {
      alert(err?.error || "Reopen failed");
    }
  };

  const isEnded = selectedChat?.status === "ended";

  return (
    <div className={styles.container}>
      {/* Sidebar */}
      <div className={styles.sidebar}>
        <h3 className={styles.sidebarTitle}>Conversations</h3>

        {conversations.map((chat) => (
          <div
            key={chat.id}
            className={`${styles.userItem} ${
              selectedChat?.id === chat.id ? styles.activeUser : ""
            }`}
            onClick={() => handleSelectChat(chat)}
          >
            <div>{chat.sender_id}</div>
          </div>
        ))}
      </div>

      {/* Chat Section */}
      <div className={styles.chat}>
        <div className={styles.chatHeader}>
          {selectedChat ? (
            <>
              <h3>{selectedChat.sender_id}</h3>

              <span className={styles.deptBadge}>
                {selectedChat.department_id}
              </span>

              {isEnded && <span> (Ended)</span>}
            </>
          ) : (
            <h3>Select conversation</h3>
          )}
        </div>

        {/* Messages */}
        <div className={styles.messages}>
          {messages.map((msg, index) => {
            const isAgent = msg.direction === "outgoing";

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

        {/* Actions */}
        <div className={styles.actions}>
          <button onClick={handleAssign}>Assign</button>
          <button onClick={handleReopen} disabled={!isEnded}>
            Reopen
          </button>
          <button onClick={handleEnd} disabled={isEnded}>
            End
          </button>
        </div>

        {/* Input */}
        <div className={styles.inputBox}>
          <input
            className={styles.input}
            placeholder="Type message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={!selectedChat || loading || isEnded}
          />

          <button
            className={styles.sendBtn}
            onClick={handleSendReply}
            disabled={loading || isEnded}
          >
            {loading ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChatSpace;
