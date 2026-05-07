import React, { useEffect, useState } from "react";
import { apiFetch, parseApiError } from "../utils/api";

export default function UserManagementPage() {
  const [users, setUsers] = useState([]);

  async function loadUsers() {
    const res = await apiFetch("/users", { method: "GET" });
    if (!res.ok) {
      throw new Error(await parseApiError(res));
    }
    const data = await res.json();
    setUsers(data);
  }

  useEffect(() => {
    void loadUsers().catch(console.error);
  }, []);

  return (
    <div>
      <h2>User Management</h2>
      <table>
        <thead>
          <tr>
            <th>Email</th>
            <th>Role</th>
            <th>Environment</th>
            <th>Client</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u: any) => (
            <tr key={u.user_id}>
              <td>{u.email}</td>
              <td>{u.role}</td>
              <td>{u.environment || "-"}</td>
              <td>{u.client_id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
