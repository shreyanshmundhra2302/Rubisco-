require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const apiRoutes = require("./routes/api");

const app = express();

app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// API routes (AI generation, transform, PDF extraction — all server-side, keys never exposed)
app.use("/api", apiRoutes);

// Serve the frontend (PWA shell). IndexedDB (client-side) is the actual
// project store — this server never persists personal study projects.
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

// Centralized error handler — never let one failed request crash the app.
app.use((err, req, res, next) => {
  console.error("Unhandled server error:", err);
  res.status(500).json({ error: "Internal server error." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Rubisco Smart Study Notes server running on port ${PORT}`);
  console.log(`AI provider: ${process.env.AI_PROVIDER || "gemini (default)"}`);
});
