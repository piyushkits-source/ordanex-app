import React, { useEffect, useState } from "react";

export default function UserManagementPage() {
  const [users, setUsers] = useState([]);

  async function loadUsers() {
    const res = await fetch("/users");
    const data = await res.json();
    setUsers(data);
  }

  useEffect(() => {
    loadUsers();
  }, []);

  return (
    <div>
      <h2>User Management</h2>
      <table>
        <thead>
          <tr>
            <th>Email</th>
            <th>Role</th>
            <th>Client</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u: any) => (
            <tr key={u.user_id}>
              <td>{u.email}</td>
              <td>{u.role}</td>
              <td>{u.client_id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
