import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";

const navItems = [
  { to: "/", label: "📊 Overview" },
  { to: "/topics", label: "📋 Topics" },
  { to: "/connections", label: "🔌 Connections" },
  { to: "/dlq", label: "💀 Dead Letters" },
  { to: "/api-keys", label: "🔑 API Keys" },
  { to: "/test", label: "🧪 Test" },
  { to: "/docs", label: "📖 Documentation" },
  { to: "/settings", label: "⚙️ Settings" },
];

export function Layout() {
  const { username, logout } = useAuth();

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <nav
        style={{
          width: 220,
          background: "#1a1a2e",
          color: "#eee",
          padding: "20px 0",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: "0 20px 20px", borderBottom: "1px solid #333", marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>🐇 EchoBus</h2>
          <small style={{ color: "#888" }}>Dashboard</small>
        </div>
        <div style={{ flex: 1 }}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              style={({ isActive }) => ({
                display: "block",
                padding: "10px 20px",
                color: isActive ? "#fff" : "#aaa",
                textDecoration: "none",
                background: isActive ? "#16213e" : "transparent",
                borderLeft: isActive ? "3px solid #0f3460" : "3px solid transparent",
                fontSize: 14,
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </div>
        <div style={{ padding: "14px 20px", borderTop: "1px solid #333" }}>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
            Logged in as <strong style={{ color: "#ccc" }}>{username}</strong>
          </div>
          <button
            onClick={logout}
            style={{
              width: "100%",
              padding: "7px 0",
              background: "transparent",
              color: "#aaa",
              border: "1px solid #444",
              borderRadius: 5,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            🚪 Log Out
          </button>
        </div>
      </nav>
      <main style={{ flex: 1, padding: 30, background: "#f5f5f5" }}>
        <Outlet />
      </main>
    </div>
  );
}
