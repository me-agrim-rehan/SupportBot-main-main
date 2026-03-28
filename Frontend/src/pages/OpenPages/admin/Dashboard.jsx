import { useNavigate } from "react-router-dom";
import styles from "./styles/Dashboard.module.css";

function Dashboard() {
  const navigate = useNavigate();

  return (
    <div className={styles.container}>
      {/* Sidebar */}
      <div className={styles.sidebar}>
        <h2 className={styles.logo}>Support Panel</h2>

        <div
          className={styles.menuItem}
          onClick={() => navigate("/chat")}
        >
          💬 Chat
        </div>

        <div
          className={styles.menuItem}
          onClick={() => navigate("/create-user")}
        >
          👑 Create User
        </div>
      </div>

      {/* Main Content */}
      <div className={styles.main}>
        <h1 className={styles.heading}>Dashboard</h1>

        <div className={styles.cards}>
          <div
            className={styles.card}
            onClick={() => navigate("/chat")}
          >
            <h3>Live Chat</h3>
            <p>Handle user conversations in real-time</p>
          </div>

          <div
            className={styles.card}
            onClick={() => navigate("/create-user")}
          >
            <h3>Create User</h3>
            <p>Add support agents or admins</p>
          </div>
          <div
            className={styles.card}
            onClick={() => navigate("/compose")}
          >
            <h3>Compose Message</h3>
            <p>Send single or bulk messages</p>
          </div>

        </div>
      </div>
    </div>
  );
}

export default Dashboard;