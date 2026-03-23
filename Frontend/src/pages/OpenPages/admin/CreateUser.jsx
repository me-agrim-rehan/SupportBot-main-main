import { useState, useEffect } from "react";
import {
  createAdmin,
  createSupport,
  getCurrentUser,
} from "../../../API/LoginAPI";
import styles from "./styles/CreateUser.module.css";

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
  const [loading, setLoading] = useState(false);

  // 🔥 current user
  useEffect(() => {
    getCurrentUser().then((data) => {
      setCurrentUser(data);

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
    const fetchMeta = async () => {
      try {
        const [depRes, countryRes] = await Promise.all([
          fetch(`${BASE}/meta/departments`),
          fetch(`${BASE}/meta/countries`),
        ]);

        setDepartments(await depRes.json());
        setCountries(await countryRes.json());
      } catch (err) {
        console.error("Failed to fetch meta", err);
      }
    };

    fetchMeta();
  }, []);

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const isValid = form.name && form.email && form.password && form.country_id;

  const handleSubmit = async () => {
    if (!isValid) return alert("Please fill all required fields");

    setLoading(true);
    let res;

    try {
      res =
        roleToCreate === "admin"
          ? await createAdmin(form)
          : await createSupport(form);

      if (res?.id) {
        alert("User created ✅");
        setForm({
          name: "",
          email: "",
          password: "",
          department_id: "",
          country_id: "",
        });
      } else {
        alert(res?.error || "Failed");
      }
    } catch {
      alert("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <h2>Create User</h2>

      <div className={styles.form}>
        <input
          value={form.name}
          placeholder="Name"
          onChange={(e) => handleChange("name", e.target.value)}
        />

        <input
          value={form.email}
          placeholder="Email"
          onChange={(e) => handleChange("email", e.target.value)}
        />

        <input
          value={form.password}
          placeholder="Password"
          type="password"
          onChange={(e) => handleChange("password", e.target.value)}
        />

        {currentUser?.role === "superadmin" && (
          <>
            <select
              value={roleToCreate}
              onChange={(e) => setRoleToCreate(e.target.value)}
            >
              <option value="support">Support</option>
              <option value="admin">Admin</option>
            </select>

            <select
              value={form.department_id}
              onChange={(e) =>
                handleChange("department_id", Number(e.target.value))
              }
            >
              <option value="">Select Department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </>
        )}

        <select
          value={form.country_id}
          onChange={(e) => handleChange("country_id", Number(e.target.value))}
        >
          <option value="">Select Country</option>
          {countries.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <button
          className={styles.button}
          disabled={!isValid || loading}
          onClick={handleSubmit}
        >
          {loading ? "Creating..." : "Create User"}
        </button>
      </div>
    </div>
  );
}
