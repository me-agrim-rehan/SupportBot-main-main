import { useState, useEffect } from "react";
import {
  createAdmin,
  createSupport,
  getCurrentUser,
} from "../../../API/LoginAPI";

const BASE = import.meta.env.VITE_BACKEND_URL;

export default function CreateUser() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    department_id: "",
    country_id: "",
  });

  const [departments, setDepartments] = useState([]);
  const [countries, setCountries] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [roleToCreate, setRoleToCreate] = useState("support");

  // 🔥 get logged-in user
  useEffect(() => {
    getCurrentUser().then((data) => {
      setCurrentUser(data);

      // admin → fixed to support
      if (data.role === "admin") {
        setRoleToCreate("support");
        setForm((prev) => ({
          ...prev,
          department_id: data.department_id,
        }));
      }
    });
  }, []);

  // 🔥 fetch dropdowns
  useEffect(() => {
    fetch(`${BASE}/meta/departments`)
      .then((res) => res.json())
      .then(setDepartments);

    fetch(`${BASE}/meta/countries`)
      .then((res) => res.json())
      .then(setCountries);
  }, []);

  const handleSubmit = async () => {
    let res;

    if (roleToCreate === "admin") {
      res = await createAdmin(form);
    } else {
      res = await createSupport(form);
    }

    if (res.id) {
      alert("User created ✅");
    } else {
      alert(res.error || "Failed");
    }
  };

  return (
    <div style={{ padding: 40 }}>
      <h2>Create User</h2>

      <input
        placeholder="Name"
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />

      <input
        placeholder="Email"
        onChange={(e) => setForm({ ...form, email: e.target.value })}
      />

      <input
        placeholder="Password"
        type="password"
        onChange={(e) => setForm({ ...form, password: e.target.value })}
      />

      {/* 👑 only superadmin chooses role */}
      {currentUser?.role === "superadmin" && (
        <select
          value={roleToCreate}
          onChange={(e) => setRoleToCreate(e.target.value)}
        >
          <option value="support">Support</option>
          <option value="admin">Admin</option>
        </select>
      )}

      {/* 🏢 department */}
      {currentUser?.role === "superadmin" && (
        <select
          onChange={(e) =>
            setForm({ ...form, department_id: Number(e.target.value) })
          }
        >
          <option value="">Select Department</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      )}

      {/* 🌍 country */}
      <select
        onChange={(e) =>
          setForm({ ...form, country_id: Number(e.target.value) })
        }
      >
        <option value="">Select Country</option>
        {countries.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <br />
      <br />

      <button onClick={handleSubmit}>Create</button>
    </div>
  );
}
