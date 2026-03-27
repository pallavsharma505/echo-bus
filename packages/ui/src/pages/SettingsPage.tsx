import React, { useState } from "react";
import { useAuth } from "../components/AuthContext";

const API_BASE = import.meta.env.DEV ? "/api" : "";

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 10,
  padding: "24px 28px",
  marginBottom: 20,
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
};

const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 6,
  border: "1px solid #ddd",
  fontSize: 14,
  width: "100%",
  maxWidth: 350,
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "#888",
  textTransform: "uppercase",
  letterSpacing: 1,
  marginBottom: 5,
};

const btnStyle: React.CSSProperties = {
  padding: "9px 20px",
  background: "#0f3460",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const successStyle: React.CSSProperties = {
  background: "#e8f5e9",
  border: "1px solid #a5d6a7",
  borderRadius: 8,
  padding: "10px 14px",
  fontSize: 13,
  color: "#2e7d32",
  marginBottom: 14,
};

const errorStyle: React.CSSProperties = {
  background: "#ffebee",
  border: "1px solid #ef9a9a",
  borderRadius: 8,
  padding: "10px 14px",
  fontSize: 13,
  color: "#c62828",
  marginBottom: 14,
};

export function SettingsPage() {
  const { username, token, logout, setUsername: setAuthUsername } = useAuth();

  // Username form
  const [newUsername, setNewUsername] = useState(username || "");
  const [usernameMsg, setUsernameMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [usernameLoading, setUsernameLoading] = useState(false);

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);

  const handleUsernameUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setUsernameMsg(null);

    if (!newUsername.trim() || newUsername.trim().length < 3) {
      setUsernameMsg({ type: "error", text: "Username must be at least 3 characters" });
      return;
    }
    if (newUsername.trim() === username) {
      setUsernameMsg({ type: "error", text: "New username is the same as the current one" });
      return;
    }

    setUsernameLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/credentials/username`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newUsername: newUsername.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update username");
      setAuthUsername(data.username);
      setUsernameMsg({ type: "success", text: "Username updated successfully" });
    } catch (err: any) {
      setUsernameMsg({ type: "error", text: err.message });
    }
    setUsernameLoading(false);
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);

    if (!currentPassword) {
      setPasswordMsg({ type: "error", text: "Current password is required" });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMsg({ type: "error", text: "New password must be at least 6 characters" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: "error", text: "Passwords do not match" });
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/credentials/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update password");
      setPasswordMsg({ type: "success", text: "Password updated successfully" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPasswordMsg({ type: "error", text: err.message });
    }
    setPasswordLoading(false);
  };

  return (
    <div>
      <h1 style={{ margin: "0 0 6px", fontSize: 22 }}>⚙️ Settings</h1>
      <p style={{ color: "#888", marginTop: 0, marginBottom: 24, fontSize: 14 }}>
        Manage your dashboard login credentials
      </p>

      {/* Username Section */}
      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>👤 Username</h3>

        {usernameMsg && (
          <div style={usernameMsg.type === "success" ? successStyle : errorStyle}>
            {usernameMsg.text}
          </div>
        )}

        <form onSubmit={handleUsernameUpdate}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Current Username</label>
            <input type="text" value={username || ""} disabled style={{ ...inputStyle, opacity: 0.6, background: "#f5f5f5" }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>New Username</label>
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              style={inputStyle}
            />
          </div>
          <button type="submit" disabled={usernameLoading} style={{ ...btnStyle, opacity: usernameLoading ? 0.7 : 1 }}>
            {usernameLoading ? "Updating..." : "Update Username"}
          </button>
        </form>
      </div>

      {/* Password Section */}
      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>🔒 Password</h3>

        {passwordMsg && (
          <div style={passwordMsg.type === "success" ? successStyle : errorStyle}>
            {passwordMsg.text}
          </div>
        )}

        <form onSubmit={handlePasswordUpdate}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 6 characters"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              style={inputStyle}
            />
          </div>
          <button type="submit" disabled={passwordLoading} style={{ ...btnStyle, opacity: passwordLoading ? 0.7 : 1 }}>
            {passwordLoading ? "Updating..." : "Update Password"}
          </button>
        </form>
      </div>

      {/* Logout Section */}
      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 10px", fontSize: 16 }}>🚪 Session</h3>
        <p style={{ color: "#888", fontSize: 13, margin: "0 0 14px" }}>
          Logged in as <strong>{username}</strong>. Sessions expire after 24 hours.
        </p>
        <button onClick={logout} style={{ ...btnStyle, background: "#f44336" }}>
          Log Out
        </button>
      </div>
    </div>
  );
}
