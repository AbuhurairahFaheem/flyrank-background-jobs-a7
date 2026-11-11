const express = require("express");
const { serve } = require("inngest/express");
const {
  inngest,
  reportsDb,
  sayHello,
  makeReport,
  heartbeat
} = require("./inngestClient");

const app = express();
app.use(express.json());

const PORT = 3000;

// Register Inngest endpoint
app.use(
  "/api/inngest",
  serve({
    client: inngest,
    functions: [sayHello, makeReport, heartbeat]
  })
);

// Stage 0: Healthcheck
app.get("/health", (req, res) => {
  return res.status(200).json({ status: "ok" });
});

// Stage 2 & 3: Fast Door (Accept now, return 202, process in background)
app.post("/reports", async (req, res) => {
  const { topic } = req.body;

  // Stage 3 Validation: Bad input is rejected immediately
  if (!topic || typeof topic !== "string" || topic.trim() === "") {
    return res.status(400).json({ error: "Topic is required" });
  }

  const id = `rep_${Date.now()}`;
  reportsDb.set(id, {
    id,
    topic,
    status: "pending",
    createdAt: new Date().toISOString()
  });

  // Dispatches event to local Inngest Dev Server
  await inngest.send({
    name: "report/requested",
    data: { id, topic }
  });

  return res.status(202).json({ id, status: "pending" });
});

// Stage 2: Polling status endpoint
app.get("/reports/:id", (req, res) => {
  const report = reportsDb.get(req.params.id);
  if (!report) {
    return res.status(404).json({ error: "Report not found" });
  }
  return res.status(200).json(report);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Inngest endpoint served at http://localhost:${PORT}/api/inngest`);
});