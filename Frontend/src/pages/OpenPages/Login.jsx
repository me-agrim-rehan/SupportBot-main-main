import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginUser } from "../../API/LoginAPI";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleLogin = async () => {
    const res = await loginUser({ email, password });

    if (res.success) {
      // ✅ store user
      localStorage.setItem("user", JSON.stringify(res.user));

      // ✅ redirect
      navigate("/chat");
    } else {
      alert(res.error || "Login failed");
    }
  };

  return (
    <div style={{ padding: 40 }}>
      <h2>Login</h2>

      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <br />

      <input
        placeholder="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <br />

      <button onClick={handleLogin}>Login</button>
    </div>
  );
}
