const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Service worker must be served from the root with no aggressive caching,
// so it can be updated reliably.
app.get("/sw.js", (req, res) => {
  res.set("Cache-Control", "no-cache");
  res.sendFile(path.join(__dirname, "public", "sw.js"));
});

app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: "1d",
  })
);

// SPA fallback — everything not matched above serves index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`ESC Jadwal running on http://localhost:${PORT}`);
});
