import React from "react";
import { createRoot } from "react-dom/client";
import { BatchPlaceDemo } from "./BatchPlaceDemo.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BatchPlaceDemo />
  </React.StrictMode>,
);
