# FlyRank Internship - Week 4 Assignment A7: Your First Background Job

A resilient asynchronous API built with Node.js, Express, and Inngest. This project implements the asynchronous processing pattern: fast HTTP ingress (`202 Accepted`), durable background workflows with step execution and automatic backoff retries, and scheduled cron execution without incoming HTTP requests.

---

## Architecture Overview

1. **Request/Response (`GET /health`)**: Direct, synchronous health probe.
2. **Accept Now, Work Later (`POST /reports` + `GET /reports/:id`)**: Client requests return immediate `202 Accepted` tokens within milliseconds. An 8-second slow worker executes in an isolated Inngest background job. Clients poll the status endpoint until eventual consistency transitions the status from `pending` to `done`.
3. **Cron Job (`heartbeat`)**: Autonomous clock-driven schedule (`* * * * *`) executing outside of any client HTTP request context.

---

## Project Structure

```text
flyrank-background-jobs-a7/
├── inngestClient.js   # Inngest client initialization, step definitions, and cron functions
├── index.js           # Express API, in-memory datastore, Inngest serve handler
├── package.json       # Project dependencies (express, inngest)
├── .gitignore         # node_modules and environment variables
└── README.md          # Project documentation and stage verification
```

---

## How to Run Locally

### Prerequisites
* **Node.js**: v18+ (verified on v24+)
* **Terminal 1**: Express API Server
* **Terminal 2**: Inngest Local Dev Server

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Start the Express API (Terminal 1)
```powershell
$env:INNGEST_DEV="1"
node index.js
```
*Expected log:*
```text
Server running on http://localhost:3000
Inngest endpoint served at http://localhost:3000/api/inngest
```

### Step 3: Start Inngest Dev Server (Terminal 2)
```powershell
.\inngest.exe dev -u http://localhost:3000/api/inngest
```
*(Alternatively, via npx: `npx inngest-cli dev -u http://localhost:3000/api/inngest`)*

*Expected log:*
```text
Inngest Dev Server running at: http://127.0.0.1:8288
Connected to http://localhost:3000/api/inngest
```

Open the visual dashboard at: `http://localhost:8288`

---

## API Endpoints & Background Functions

### HTTP Endpoints

| Method | Endpoint | Status | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | `200 OK` | Immediate healthcheck verification. |
| `POST` | `/reports` | `202 Accepted` | Validates payload, stores `pending` record, dispatches `report/requested`, returns immediate receipt. |
| `POST` | `/reports` | `400 Bad Request`| Rejects missing or empty `topic` payloads before touching the job system. |
| `GET` | `/reports/:id` | `200 OK` | Returns report object (`pending` initially, `done` with payload after processing). |
| `GET` | `/reports/:id` | `404 Not Found` | Returned when queried with an invalid or non-existent report ID. |
| `GET` | `/reports` | `200 OK` | Control panel route listing all reports in the store. |
| `ALL` | `/api/inngest` | `200/206` | Inngest serve handler communication gateway. |

### Inngest Functions

| Function ID | Trigger Type | Trigger Spec | Details |
| :--- | :--- | :--- | :--- |
| `say-hello` | Event | `test/hello` | Stage 1 verification function. Sleeps 5s via `step.sleep`, returns static greeting. |
| `make-report` | Event | `report/requested` | Durable 2-step workflow: `do-the-slow-work` (8s sleep) $\rightarrow$ `build-report` (commits result). Max retries configured to 2 (total 3 attempts). |
| `heartbeat` | Cron | `* * * * *` | Scheduled function executing every minute to aggregate and log report statistics. |

---

## Verification & Execution Proofs

### 1. Stage 2 Proof: Instant 202 Accepted + Polling Eventual Consistency

#### Request Submission (Terminal 3):
```powershell
$resp = Invoke-RestMethod -Uri "http://localhost:3000/reports" -Method Post -ContentType "application/json" -Body '{"topic": "cats"}'
Write-Host "Created ID:" $resp.id "Status:" $resp.status
```
**Output (Response in < 40ms):**
```json
{
  "id": "rep_1773264582910_8f2a1",
  "status": "pending"
}
```

#### Polling Immediate Status (< 1 second):
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/reports/rep_1773264582910_8f2a1"
```
**Output:**
```json
{
  "id": "rep_1773264582910_8f2a1",
  "topic": "cats",
  "status": "pending",
  "createdAt": "2026-03-11T21:40:02.910Z"
}
```

#### Polling Final Status (~10 seconds later):
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/reports/rep_1773264582910_8f2a1"
```
**Output:**
```json
{
  "id": "rep_1773264582910_8f2a1",
  "topic": "cats",
  "status": "done",
  "result": "Detailed analysis for topic: cats",
  "completedAt": "2026-03-11T21:40:10.925Z"
}
```

---

## Conceptual Questions & Stage Answers

### Stage 3: Retries vs. Bad Input Validation
> **Question:** What is the difference between rejecting bad input and retrying a failed job?

**Answer:** A request with bad input (e.g., missing topic) represents a deterministic, permanent client error that must be rejected immediately at the HTTP boundary with a `400 Bad Request` to avoid consuming background worker resources. In contrast, background job retries with backoff are designed exclusively for transient operational failures (such as temporary network downtime, rate limits, or external service outages), where executing the job again at a later moment has a realistic probability of succeeding.

---

### Stage 4: Scheduled Cron Expressions
> **Question:** Which cron expression would run this every day at 08:00? Which would run it every Sunday at 22:00?

1. **Every day at 08:00 UTC:**  
   `0 8 * * *`  
   *(Minute: 0, Hour: 8, Day of Month: \*, Month: \*, Day of Week: \*)*

2. **Every Sunday at 22:00 UTC:**  
   `0 22 * * 0` (or `0 22 * * SUN`)  
   *(Minute: 0, Hour: 22, Day of Month: \*, Month: \*, Day of Week: 0 [Sunday])*

---

## Dashboard Verification

![Inngest Dashboard Runs](screenshot.png)

*The dashboard at `http://localhost:8288` demonstrates:*
1. **Completed `make-report` run:** Successful progression across both `do-the-slow-work` (8s) and `build-report` steps.
2. **Failed `make-report` run (`topic: "fail"`):** Exhaustion of 3 total attempts (initial attempt + 2 retries) with progressive backoff delays, ending in `Failed`.
3. **Autonomous `heartbeat` cron runs:** Consecutive executions scheduled exactly 60 seconds apart without inbound HTTP triggers.