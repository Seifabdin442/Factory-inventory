import React from "react";
import ReactDOM from "react-dom/client";
// Fonts are bundled with the app so Arabic text looks right offline and in printed/PDF documents.
import "@fontsource/cairo/400.css";
import "@fontsource/cairo/600.css";
import "@fontsource/cairo/700.css";
import "@fontsource/cairo/800.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import App from "./App.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
