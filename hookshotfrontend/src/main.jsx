import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import AppShell from "./components/AppShell";
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import EndpointsPage from "./pages/EndpointsPage";
import EventsPage from "./pages/EventsPage";
import NotFoundPage from "./pages/NotFoundPage";
import SettingsPage from "./pages/SettingsPage";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/endpoints" element={<EndpointsPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          {/* Catch-all, inside AppShell so the nav stays usable. Without it an
              unknown URL renders an empty <Outlet/> — a blank page. */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);