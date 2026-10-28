import React from "react";
import { createRoot } from "react-dom/client";
import Atlas from "../app/atlas";
import "../app/globals.css";
import { setApiBase } from "../lib/client-api";

setApiBase("https://county-report-atlas.regaleel259.chatgpt.site");

createRoot(document.getElementById("root")!).render(
  <Atlas geoBase="./public/geo/" homeHref="./" />,
);
