const { Inngest } = require("inngest");

// In-memory data store for reports
const reportsDb = new Map();

// Initialize Inngest client
const inngest = new Inngest({
  id: "report-api",
  isDev: true
});

// Stage 1: say-hello function
const sayHello = inngest.createFunction(
  {
    id: "say-hello",
    trigger: { event: "test/hello" }
  },
  async ({ step }) => {
    await step.sleep("wait-a-bit", "5s");
    return "Hello from the background!";
  }
);

// Stage 2 & 3: make-report function
const makeReport = inngest.createFunction(
  {
    id: "make-report",
    retries: 2,
    trigger: { event: "report/requested" }
  },
  async ({ event, step }) => {
    const { id, topic } = event.data;

    // Simulate 8s heavy work
    await step.sleep("do-the-slow-work", "8s");

    await step.run("build-report", async () => {
      // Stage 3 Check: Simulating intentional failure for testing
      if (topic === "fail") {
        throw new Error("The report oven is broken!");
      }

      if (reportsDb.has(id)) {
        reportsDb.set(id, {
          id,
          topic,
          status: "done",
          result: `Detailed analysis for topic: ${topic}`,
          completedAt: new Date().toISOString()
        });
      }

      return { success: true };
    });
  }
);

// Stage 4: heartbeat cron function (runs every minute)
const heartbeat = inngest.createFunction(
  {
    id: "heartbeat",
    trigger: { cron: "* * * * *" }
  },
  async ({ step }) => {
    await step.run("log-summary", async () => {
      let pending = 0;
      let done = 0;

      for (const r of reportsDb.values()) {
        if (r.status === "pending") pending++;
        if (r.status === "done") done++;
      }

      const summary = `[CRON HEARTBEAT] Reports -> Pending: ${pending}, Done: ${done}, Total: ${reportsDb.size}`;
      console.log(summary);
      return { summary };
    });
  }
);

module.exports = {
  inngest,
  reportsDb,
  sayHello,
  makeReport,
  heartbeat
};