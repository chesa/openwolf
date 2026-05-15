import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
import "./styles/globals.css";

// Bootstrap auth: read token from ?token= URL param, store in sessionStorage,
// then strip the param from the URL so it does not appear in browser history
// entries or outbound Referer headers. All subsequent API calls use the
// X-Api-Token header (see useWolfData.ts) rather than the URL.
const _bootstrapParams = new URLSearchParams(location.search);
const _bootstrapToken = _bootstrapParams.get("token");
if (_bootstrapToken) {
  sessionStorage.setItem("wolf_token", _bootstrapToken);
  _bootstrapParams.delete("token");
  const newSearch = _bootstrapParams.toString();
  history.replaceState(null, "", location.pathname + (newSearch ? `?${newSearch}` : ""));
}

const root = createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
