import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DemoApp } from "./demo-app";
import "./demo.css";

const root = document.getElementById("root");
if (!root) throw new Error("ActionMail could not find its application root.");

createRoot(root).render(
  <StrictMode>
    <DemoApp />
  </StrictMode>,
);
