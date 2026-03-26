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
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  const [modal, setModal] = useState(null); // 🔥 custom modal

  const currentUser = JSON.parse(localStorage.getItem("user"));

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000);

    return () => clearInterval(interval);
  }, []);
  // 🔁 Load conversations
  useEffect(() => {
    const loadConversations = async () => {
      const data = await fetchConversations();
      setConversations(Array.isArray(data) ? data : []);
    };

    loadConversations();
    const interval = setInterval(loadConversations, 3000);
    return () => clearInterval(interval);
  }, []);

  // 🔥 Load messages
  const handleSelectChat = async (chat) => {
    setSelectedChat(chat);
    const data = await fetchMessages(chat.id);
    setMessages(data);
  };

  // 🧠 RULE ENGINE
  const getChatState = () => {
    if (!selectedChat) return {};

    const isMine = selectedChat.assigned_to === currentUser?.id;
    const isUnassigned = !selectedChat.assigned_to;

    const isSuperadminChat = selectedChat.assigned_role === "superadmin";

    const lastReply = selectedChat.last_agent_reply_at;
    const minutesSinceReply = lastReply
      ? Math.floor((currentTime - new Date(lastReply)) / 60000)
      : null;

    return {
      isMine,
      isUnassigned,
      isSuperadminChat,
      minutesSinceReply,

      // ❌ block takeover of superadmin chats
      cannotTakeover: isSuperadminChat && !isMine,

      // 👨‍💻 support rule
      supportCanTakeover:
        currentUser.role === "support" &&
        selectedChat.assigned_to &&
        !isMine &&
        minutesSinceReply >= 20,

      canReply:
        !isEnded && (isUnassigned || isMine || currentUser.role !== "support"),

      disableAssign: isSuperadminChat && !isMine, // 🔥 important
    };
  };

  const isEnded = selectedChat?.status === "ended";
  const chatState = getChatState();

  // 🔥 MODAL HELPER
  const openModal = (text, action) => {
    setModal({ text, action });
  };

  const closeModal = () => setModal(null);

  // 📤 SEND
  const handleSendReply = async (force = false) => {
    if (!message.trim()) return;

    try {
      await sendReply(selectedChat.sender_id, message, force);
      setMessage("");

      const data = await fetchMessages(selectedChat.id);
      setMessages(data);
    } catch (error) {
      if (error?.takeover) {
        openModal(`Take over chat from ${error.assigned_role}?`, () =>
          handleSendReply(true),
        );
      }
    }
  };

  // 🟢 ASSIGN
  const handleAssign = async () => {
    if (!selectedChat) return;

    const isAssigned = selectedChat.assigned_to;

    // ❌ block superadmin chat
    if (chatState.cannotTakeover) {
      openModal("❌ Cannot take over a Superadmin chat");
      return;
    }

    // 🧑‍💼 ADMIN / 👑 SUPERADMIN CONFIRMATION
    if (isAssigned && !chatState.isMine) {
      openModal(
        `Take over chat from ${selectedChat.assigned_role}?`,
        async () => {
          await assignChat(selectedChat.id);
        },
      );
      return;
    }

    // 🟢 normal assign
    await assignChat(selectedChat.id);
  };

  // 🔚 END
  const handleEnd = () => {
    openModal("⚠️ Are you sure you want to END this chat?", async () => {
      await endSession(selectedChat.id);
    });
  };

  // 🔁 REOPEN
  const handleReopen = () => {
    openModal("Reopen this chat?", async () => {
      await reopenChat(selectedChat.id);
    });
  };

  return (
    <div className={styles.container}>
      {/* Sidebar */}
      <div className={styles.sidebar}>
        <h3 className={styles.sidebarTitle}>Conversations</h3>

        {conversations.map((chat) => {
          const isOwnedByOther =
            chat.assigned_to && chat.assigned_to !== currentUser?.id;

          return (
            <div
              key={chat.id}
              className={`${styles.userItem} ${
                selectedChat?.id === chat.id ? styles.activeUser : ""
              } ${isOwnedByOther ? styles.lockedChat : ""}`}
              onClick={() => handleSelectChat(chat)}
            >
              <div>
                {chat.sender_id}

                {chat.unread && <span className={styles.unreadDot}></span>}

                {chat.assigned_role && (
                  <small className={styles.roleTag}>{chat.assigned_role}</small>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Chat */}
      <div className={styles.chat}>
        <div className={styles.chatHeader}>
          {selectedChat ? (
            <>
              <h3>{selectedChat.sender_id}</h3>

              <div className={styles.metaInfo}>
                {selectedChat.assigned_to &&
                  selectedChat.assigned_role === "support" &&
                  !chatState.isMine && (
                    <span className={styles.timer}>
                      ⏱️ {chatState.minutesSinceReply ?? 0} min since last reply
                    </span>
                  )}
                <span className={styles.deptBadge}>
                  Dept: {selectedChat.department_id}
                </span>

                {selectedChat.assigned_to ? (
                  <span className={styles.assignedBadge}>
                    {selectedChat.assigned_role}
                  </span>
                ) : (
                  <span className={styles.unassigned}>Unassigned</span>
                )}
              </div>
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

                  {isAgent && (
                    <span className={styles.status}>
                      {msg.status === "sent" && "✓"}
                      {msg.status === "delivered" && "✓✓"}
                      {msg.status === "read" && (
                        <span style={{ color: "#53bdeb" }}>✓✓</span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Warning */}
        {chatState.cannotTakeover && (
          <div className={styles.warning}>
            🚫 Superadmin chat cannot be taken over
          </div>
        )}
        {selectedChat && chatState.isBlocked && (
          <div className={styles.warning}>
            ⚠️ Chat handled by {selectedChat.assigned_role}
          </div>
        )}

        {/* Actions */}
        <div className={styles.actions}>
          <button onClick={handleAssign} disabled={chatState.disableAssign}>
            Assign
          </button>

          <button
            onClick={handleReopen}
            disabled={!isEnded || chatState.disableAll}
          >
            Reopen
          </button>

          <button
            onClick={handleEnd}
            disabled={isEnded || chatState.disableAll}
          >
            End
          </button>
        </div>

        {/* Input */}
        <div className={styles.inputBox}>
          <input
            className={styles.input}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={!chatState.canReply}
          />

          <button
            className={styles.sendBtn}
            onClick={() => handleSendReply()}
            disabled={!chatState.canReply}
          >
            Send
          </button>
        </div>
      </div>

      {/* 🔥 MODAL */}
      {modal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalBox}>
            <p>{modal.text}</p>
            <div className={styles.modalActions}>
              <button
                onClick={() => {
                  modal.action();
                  closeModal();
                }}
              >
                Confirm
              </button>
              <button onClick={closeModal}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatSpace;
