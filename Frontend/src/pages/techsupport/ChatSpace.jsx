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
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const currentUser = JSON.parse(localStorage.getItem("user"));

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
      const data = await fetchMessages(chat.id);
      setMessages(data);
    } catch (err) {
      console.error("Failed to load messages", err);
    }
  };

  // 🧠 Chat state logic
  const getChatState = () => {
    if (!selectedChat) return {};

    const isMine = selectedChat.assigned_to === currentUser?.id;
    const isUnassigned = !selectedChat.assigned_to;

    return {
      isMine,
      isUnassigned,
      canReply:
        !isEnded && (isUnassigned || isMine || currentUser?.role !== "support"),
      isBlocked:
        selectedChat.assigned_to && !isMine && currentUser?.role === "support",
    };
  };

  // 📤 Send reply (with takeover support)
  const handleSendReply = async () => {
    if (!selectedChat || !message.trim()) return;

    try {
      setLoading(true);

      await sendReply(selectedChat.sender_id, message);

      setMessage("");

      const data = await fetchMessages(selectedChat.id);
      setMessages(data);
    } catch (error) {
      if (error?.takeover) {
        const confirmTakeover = window.confirm(
          `Chat assigned to ${error.assigned_to} (${error.assigned_role}). Take over?`,
        );

        if (confirmTakeover) {
          await sendReply(selectedChat.sender_id, message, true);
        }
      } else {
        alert(error?.error || "Failed to send reply");
      }
    } finally {
      setLoading(false);
    }
  };

  // 🔚 End chat
  const handleEnd = async () => {
    if (!selectedChat) return;

    try {
      await endSession(selectedChat.id);
      alert("Chat ended");
    } catch (error) {
      alert(error?.error || "Failed to end chat");
    }
  };

  // 🟢 Assign chat (with takeover)
  const handleAssign = async () => {
    if (!selectedChat) return;

    try {
      await assignChat(selectedChat.id);
      alert("Assigned to you");
    } catch (err) {
      if (err?.takeover) {
        const confirmTakeover = window.confirm(
          `Chat assigned to ${err.assigned_to} (${err.assigned_role}). Take over?`,
        );

        if (confirmTakeover) {
          await assignChat(selectedChat.id, true);
          alert("Taken over");
        }
      } else {
        alert(err?.error || "Assign failed");
      }
    }
  };

  // 🔁 Reopen chat
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
  const chatState = getChatState();

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
            <div>
              {chat.sender_id}

              {chat.assigned_role && (
                <small style={{ display: "block", fontSize: 12 }}>
                  {chat.assigned_role}
                </small>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Chat Section */}
      <div className={styles.chat}>
        <div className={styles.chatHeader}>
          {selectedChat ? (
            <>
              <h3>{selectedChat.sender_id}</h3>

              <div className={styles.metaInfo}>
                <span className={styles.deptBadge}>
                  Dept: {selectedChat.department_id}
                </span>

                {selectedChat.assigned_to ? (
                  <span className={styles.assignedBadge}>
                    Assigned to: {selectedChat.assigned_name} (
                    {selectedChat.assigned_role})
                  </span>
                ) : (
                  <span className={styles.unassigned}>Unassigned</span>
                )}
              </div>

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

        {/* ⚠️ Warning for blocked support */}
        {selectedChat && chatState.isBlocked && (
          <div className={styles.warning}>
            ⚠️ This chat is handled by {selectedChat.assigned_role} (
            {selectedChat.assigned_email}). Contact your admin.
          </div>
        )}

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
            disabled={
              !selectedChat || loading || isEnded || !chatState.canReply
            }
          />

          <button
            className={styles.sendBtn}
            onClick={handleSendReply}
            disabled={loading || isEnded || !chatState.canReply}
          >
            {loading ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChatSpace;
