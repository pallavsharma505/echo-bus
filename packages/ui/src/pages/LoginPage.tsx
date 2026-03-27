import React, { useState } from "react";
import { useAuth } from "../components/AuthContext";

const containerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  minHeight: "100vh",
  background: "#1a1a2e",
  fontFamily: "system-ui, -apple-system, sans-serif",
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  padding: "40px 36px",
  width: 400,
  boxShadow: "0 8px 30px rgba(0,0,0,0.3)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 6,
  border: "1px solid #ddd",
  fontSize: 14,
  marginBottom: 14,
  boxSizing: "border-box",
};

const btnStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 16px",
  background: "#0f3460",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "#888",
  textTransform: "uppercase",
  letterSpacing: 1,
  marginBottom: 5,
};

export function LoginPage() {
  const { needsSetup, login, setup } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isSetup = needsSetup;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username.trim() || !password) {
      setError("Username and password are required");
      return;
    }

    if (isSetup) {
      if (username.trim().length < 3) {
        setError("Username must be at least 3 characters");
        return;
      }
      if (password.length < 6) {
        setError("Password must be at least 6 characters");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }
    }

    setLoading(true);
    const err = isSetup
      ? await setup(username.trim(), password)
      : await login(username.trim(), password);

    if (err) {
      setError(err);
      setLoading(false);
    }
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h1 style={{ margin: "0 0 4px", fontSize: 26, color: "#1a1a2e" }}>🐇 EchoBus</h1>
          <p style={{ margin: 0, color: "#888", fontSize: 14 }}>
            {isSetup ? "Create your admin account" : "Log in to the dashboard"}
          </p>
        </div>

        {isSetup && (
          <div style={{
            background: "#e3f2fd",
            border: "1px solid #90caf9",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 18,
            fontSize: 13,
            color: "#1565c0",
          }}>
            👋 Welcome! Set up your admin credentials to secure the dashboard.
          </div>
        )}

        {error && (
          <div style={{
            background: "#ffebee",
            border: "1px solid #ef9a9a",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 14,
            fontSize: 13,
            color: "#c62828",
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label style={labelStyle}>Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="admin"
            autoFocus
            style={inputStyle}
          />

          <label style={labelStyle}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            style={inputStyle}
          />

          {isSetup && (
            <>
              <label style={labelStyle}>Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                style={inputStyle}
              />
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ ...btnStyle, opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Please wait..." : isSetup ? "Create Account & Enter" : "Log In"}
          </button>
        </form>
      </div>
    </div>
  );
}
