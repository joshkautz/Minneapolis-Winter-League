import React from "react";
import GamesTable from "../components/GamesTable";

export default function AdminDashboard() {
  return (
    <div style={{ padding: 32 }}>
      <h1>Admin Dashboard</h1>
      <p>Enter and edit game results below:</p>
      <GamesTable />
    </div>
  );
}
