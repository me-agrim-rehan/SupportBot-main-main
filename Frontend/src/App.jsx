import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import ChatSpace from "./pages/techsupport/ChatSpace";
import Login from "./pages/OpenPages/Login";
import CreateUser from "./pages/OpenPages/admin/CreateUser";
import ProtectedRoute from "./ProtectedRoute";
import Dashboard from "./pages/OpenPages/admin/Dashboard";
function App() {
  return (
    <Router>
      <Routes>
        {/* LOGIN */}
        <Route path="/login" element={<Login />} />

        {/* DASHBOARD → admin + superadmin */}
        <Route
          path="/"
          element={
            <ProtectedRoute allowedRoles={["admin", "superadmin"]}>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        {/* CREATE USER → admin + superadmin */}
        <Route
          path="/create-user"
          element={
            <ProtectedRoute allowedRoles={["admin", "superadmin"]}>
              <CreateUser />
            </ProtectedRoute>
          }
        />

        {/* CHAT → ALL */}
        <Route
          path="/chat"
          element={
            <ProtectedRoute allowedRoles={["support", "admin", "superadmin"]}>
              <ChatSpace />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
