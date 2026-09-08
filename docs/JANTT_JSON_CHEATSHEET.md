# Jantt JSON Specification & Benchmark Cheatsheet

> **Version**: 1.4.0  
> **Schema Definition**: `https://jantt.dev/schema/v1.json`  
> **Target Standard**: Swiss Modernism 2.0 / Enterprise Project Management Standard

This document is the official, comprehensive reference guide and prompt benchmark for authoring, validating, and generating **Jantt JSON** datasets. It includes concrete sample representations for every single functionality supported by the Jantt engine.

---

## AI Agent Workbench & System Prompt

### AI-Native Ideology: Stop Asking AI to Write Fragile Timeline Code

Having LLMs generate hundreds of lines of React JSX, SVG coordinate math, and canvas listeners produces brittle, hallucination-prone results. With Jantt, the AI outputs **pure declarative JSON**, and Jantt delivers deterministic, interactive execution.

| 10x | 0 | 100% | 2-Way |
| :---: | :---: | :---: | :---: |
| **Fewer LLM Tokens vs JSX** | **Runtime Dependencies** | **Deterministic DAG Solver** | **Bidirectional State Sync** |

*Schema Contract: `https://jantt.dev/schema/v1.json` (v1.4.0)*

#### The 4-Step Bidirectional Loop

1. **Step 1: Feed Cheatsheet to LLM** — Provide the AI model with the compact schema contract (WBS, dates, DAG dependencies, milestones, budget, people, notes, documents).
2. **Step 2: AI Outputs Pure JSON** — Uses 10x fewer tokens than JSX. Machine-checkable, type-safe, and zero UI hallucinations.
3. **Step 3: Instant Interactive Suite** — Jantt resolves topological DAG schedules, routes orthogonal wires, and renders Gantt, Kanban, Notes & PM Analytics.
4. **Step 4: Bidirectional Loop** — Humans drag and adjust visually. Jantt syncs clean JSON back to local storage, cloud room, or disk for the AI agent.

---

### LLM System Prompt

Hand this prompt directly to ChatGPT, Claude, Gemini, Cursor, or your autonomous AI agent pipelines:

```text
You are a precision project management schedule generator.
Output ONLY raw, valid JSON conforming strictly to the Jantt JSON Schema (https://jantt.dev/schema/v1.json).

# JANTT JSON SCHEMA BENCHMARK & SPECIFICATION CHEATSHEET (v1.4.0)

## 1. Top-Level Root Structure
{
  "$schema": "https://jantt.dev/schema/v1.json",
  "meta": {
    "title": "<Project Title>",
    "description": "<Project narrative and objectives>",
    "person": "<Lead Program Manager / Owner>",
    "organization": "<Enterprise / Organization Name>",
    "start": "YYYY-MM-DD",
    "end": "YYYY-MM-DD",
    "defaultGapDays": 2,
    "scale": "day" | "week" | "month" | "quarter" | "year",
    "linkRouting": "orthogonal" | "curved" | "direct",
    "showCriticalPath": true,
    "showBaselines": true,
    "autoCascade": true,
    "currency": "USD",
    "budget": 450000,
    "version": "1.4.0"
  },
  "categories": {
    "<category_id>": {
      "label": "<Category Display Name>",
      "color": "#HEX_COLOR",
      "soft": "#BG_TINT_HEX",
      "icon": "<lucide_icon_name>"
    }
  },
  "people": [
    {
      "id": "@alex",
      "name": "Alex Mercer",
      "username": "@alex",
      "role": "Lead Architect",
      "email": "alex@org.com",
      "teamId": "core-team",
      "color": "#3B82F6"
    },
    {
      "id": "person-contractor",
      "name": "Sarah Miller",
      "role": "External Specialist",
      "teamId": "core-team",
      "color": "#10B981"
    }
  ],
  "teams": [
    {
      "id": "core-team",
      "name": "Core Platform Squad",
      "color": "#3B82F6",
      "description": "Backend services and architecture"
    }
  ],
  "notes": [
    {
      "id": "note-unique-id",
      "title": "Architecture RFC & Specs",
      "content": "Detailed markdown requirements, meeting minutes, and acceptance criteria.",
      "color": "#3B82F6",
      "pinned": true,
      "category": "Architecture",
      "tags": ["RFC", "Architecture"],
      "task_ids": ["task-1"],
      "updatedBy": "@alex",
      "createdAt": "YYYY-MM-DDTHH:mm:ssZ",
      "updatedAt": "YYYY-MM-DDTHH:mm:ssZ"
    }
  ],
  "documents": [
    {
      "id": "doc-unique-id",
      "label": "<Document or Deliverable Title>",
      "status": "have" | "pending" | "missing",
      "owner": "<Owner Name>",
      "url": "<Documentation Link>",
      "note": "<Review notes / status>"
    }
  ],
  "tasks": [
    {
      "id": "task-unique-id",
      "wbs": "1.1",
      "label": "Task Name / Title",
      "category": "<matching_category_id>",
      "start": "YYYY-MM-DD",
      "end": "YYYY-MM-DD",
      "assignee": "@alex",
      "phase": "Phase 1: Foundation",
      "priority": "low" | "medium" | "high" | "urgent",
      "estimatedCost": 28000,
      "actualCost": 15000,
      "dependsOn": "prereq-id" | ["prereq-1", "prereq-2"] | null,
      "gapDays": 2,
      "locked": false,
      "progress": 0.75,
      "milestone": false,
      "status": "not-started" | "in-progress" | "submitted" | "completed" | "blocked",
      "urgent": false,
      "color": "#EC4899",
      "baseline": {
        "start": "YYYY-MM-DD",
        "end": "YYYY-MM-DD"
      },
      "notes": "Detailed task description, acceptance criteria, and technical specs.",
      "fields": {
        "jira": "JANTT-101",
        "storyPoints": 13,
        "repo": "github.com/org/repo",
        "deliverable": "schemas/v1.json"
      }
    }
  ]
}

## 2. Critical Constraints & Validation Rules:
1. DATES: All dates must be ISO "YYYY-MM-DD" format. "end" must be >= "start".
2. CATEGORIES: Every task "category" must match an existing key in the "categories" dictionary.
3. DEPENDENCIES (DAG):
   - "dependsOn" can be a single task ID string, an array of strings ["t1", "t2"], or null.
   - All referenced dependency IDs must exist in the "tasks" list (no dangling references).
   - Strict Directed Acyclic Graph: NO circular dependency loops (e.g. A -> B -> C -> A).
   - Timing Sanity: A task's "start" must be on or after prerequisite "end" + gapDays.
4. MILESTONES: For zero-duration milestone gates, set "milestone": true and "start" equal to "end".
5. PROGRESS: Must be a decimal float from 0.0 (0%) to 1.0 (100%).
6. BASELINES: Optional planned timeframe object { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } for baseline variance tracking.
7. LOCKED: Set "locked": true on fixed gates or hard-deadline milestones to prevent accidental drag shifts.
8. SINGLE SOURCE OF TRUTH & NO DATABASE IDS IN JSON:
   - Real registered accounts use "@username" for both "id" and "username".
   - Non-account individuals are defined as offline personas with local ID (e.g. "person-contractor", without "username").
   - Tasks assigned to registered accounts reference the mention in "assignee": "@username".
   - Zero internal database IDs (no Firebase UIDs, auth tokens, or secret keys) in JSON. The only exception is public "@username" mentions.
```

---

## Complete Master Kitchen-Sink Benchmark Dataset

Below is an exhaustive, production-grade Jantt dataset showcasing **every supported feature, attribute, and edge case simultaneously**:

```json
{
  "$schema": "https://jantt.dev/schema/v1.json",
  "meta": {
    "title": "Autonomous Edge OS & Quantum Crypto Mesh",
    "description": "High-assurance distributed operating platform with real-time verification and zero-trust orchestration.",
    "person": "@ahmadhassan",
    "organization": "Fractal Compute Orchestrations",
    "start": "2026-09-01",
    "end": "2027-02-28",
    "defaultGapDays": 2,
    "scale": "week",
    "linkRouting": "orthogonal",
    "showCriticalPath": true,
    "showBaselines": true,
    "autoCascade": true,
    "currency": "USD",
    "budget": 650000,
    "version": "1.4.0",
    "generatedAt": "2026-09-08T00:00:00.000Z"
  },
  "categories": {
    "specs": {
      "label": "Architecture & Formal Specs",
      "color": "#38BDF8",
      "soft": "#0C4A6E",
      "icon": "file-text"
    },
    "kernel": {
      "label": "Microkernel Core",
      "color": "#10B981",
      "soft": "#064E3B",
      "icon": "cpu"
    },
    "crypto": {
      "label": "Post-Quantum Cryptography",
      "color": "#8B5CF6",
      "soft": "#312E81",
      "icon": "shield-check"
    },
    "network": {
      "label": "P2P Mesh Network",
      "color": "#06B6D4",
      "soft": "#083344",
      "icon": "cloud"
    },
    "security": {
      "label": "Formal Audit & Compliance",
      "color": "#F59E0B",
      "soft": "#78350F",
      "icon": "alert-triangle"
    },
    "release": {
      "label": "Mainnet Deployment & GA",
      "color": "#EC4899",
      "soft": "#831843",
      "icon": "rocket"
    }
  },
  "people": [
    {
      "id": "@ahmadhassan",
      "name": "Ahmad Hassan",
      "username": "@ahmadhassan",
      "role": "Principal Architect & Program Director",
      "avatar": "https://avatars.githubusercontent.com/u/104278065?v=4",
      "teamId": "team-core",
      "color": "#38BDF8",
      "email": "ahmad@fractal.org"
    },
    {
      "id": "@elena-dev",
      "name": "Elena Rostova",
      "username": "@elena-dev",
      "role": "Systems Kernel Engineer",
      "teamId": "team-core",
      "color": "#10B981",
      "email": "elena@fractal.org"
    },
    {
      "id": "person-auditor",
      "name": "Dr. Marcus Vance",
      "role": "External Cryptographic Auditor",
      "teamId": "team-security",
      "color": "#F59E0B",
      "email": "vance@crypto-eval.ch"
    }
  ],
  "teams": [
    {
      "id": "team-core",
      "name": "Platform Core Squad",
      "color": "#38BDF8",
      "description": "Kernel services, zero-runtime scheduler, and system primitives"
    },
    {
      "id": "team-security",
      "name": "Formal Verification & Audit Squad",
      "color": "#F59E0B",
      "description": "Formal TLA+ proofs, penetration testing, and security assurance"
    }
  ],
  "notes": [
    {
      "id": "note-rfc-mesh",
      "title": "RFC-402: Zero-Allocation Microkernel Architecture",
      "content": "### Scope\nDefines memory isolation contracts between peer nodes.\n\n- Zero unsafe Rust blocks in kernel hot paths.\n- Formal verification completed by @ahmadhassan.\n- Linked to task /task-kernel-core.",
      "color": "#38BDF8",
      "pinned": true,
      "category": "Architecture",
      "tags": ["RFC", "Kernel", "Zero-Copy"],
      "task_ids": ["task-arch-spec", "task-kernel-core"],
      "updatedBy": "@ahmadhassan",
      "createdAt": "2026-09-01T09:00:00.000Z",
      "updatedAt": "2026-09-08T18:00:00.000Z"
    },
    {
      "id": "note-crypto-brief",
      "title": "Kyber-1024 Key Exchange Security Baseline",
      "content": "Audit checklist and threshold signature parameters verified against NIST Round 4 recommendations.",
      "color": "#8B5CF6",
      "pinned": false,
      "category": "Security",
      "tags": ["Crypto", "NIST", "Audit"],
      "task_ids": ["task-pqc-engine", "task-formal-audit"],
      "updatedBy": "@elena-dev",
      "createdAt": "2026-09-04T11:30:00.000Z",
      "updatedAt": "2026-09-07T16:15:00.000Z"
    }
  ],
  "documents": [
    {
      "id": "doc-tla-spec",
      "label": "TLA+ Formal Mathematical Specification",
      "status": "have",
      "owner": "@ahmadhassan",
      "url": "https://specs.fractal.org/tla/mesh.pdf",
      "note": "Unanimously certified with TLC model checker"
    },
    {
      "id": "doc-soc2-attest",
      "label": "SOC-2 Type II Independent Audit Report",
      "status": "pending",
      "owner": "Dr. Marcus Vance",
      "url": "https://compliance.fractal.org/soc2",
      "note": "Field testing commenced; completion targeted before GA"
    },
    {
      "id": "doc-legal-licensing",
      "label": "Dual Apache-2.0 / Commercial EULA Contract",
      "status": "missing",
      "owner": "Legal Counsel",
      "url": "https://legal.fractal.org/license",
      "note": "Required regulatory deliverable before international release"
    }
  ],
  "tasks": [
    {
      "id": "task-arch-spec",
      "wbs": "1.1",
      "label": "Formal System Specification & Protocol RFC",
      "category": "specs",
      "start": "2026-09-01",
      "end": "2026-09-22",
      "assignee": "@ahmadhassan",
      "teamId": "team-core",
      "phase": "Phase 1: Foundations",
      "priority": "high",
      "status": "completed",
      "progress": 1.0,
      "estimatedCost": 40000,
      "actualCost": 38500,
      "locked": true,
      "notes": "Completed formal protocol spec with complete mathematical proofs.",
      "fields": {
        "repo": "github.com/Fractal-Compute-Orchestrations/mesh-spec",
        "rfcNumber": 402,
        "storyPoints": 13
      }
    },
    {
      "id": "gate-spec-approved",
      "wbs": "1.2",
      "label": "Milestone 1: Architecture Sign-Off Gate",
      "category": "specs",
      "start": "2026-09-24",
      "end": "2026-09-24",
      "milestone": true,
      "dependsOn": "task-arch-spec",
      "gapDays": 2,
      "locked": true,
      "status": "completed",
      "progress": 1.0,
      "assignee": "@ahmadhassan"
    },
    {
      "id": "task-kernel-core",
      "wbs": "2.1",
      "label": "Zero-Copy Microkernel Primitive Implementation",
      "category": "kernel",
      "start": "2026-09-26",
      "end": "2026-11-05",
      "assignee": "@elena-dev",
      "teamId": "team-core",
      "phase": "Phase 2: Execution",
      "priority": "urgent",
      "urgent": true,
      "status": "in-progress",
      "progress": 0.65,
      "estimatedCost": 125000,
      "actualCost": 88000,
      "dependsOn": "gate-spec-approved",
      "gapDays": 2,
      "locked": false,
      "baseline": {
        "start": "2026-09-25",
        "end": "2026-10-31"
      },
      "notes": "Zero runtime dependencies, strict static memory quotas, microsecond context switching.",
      "fields": {
        "jira": "KERN-104",
        "coverage": "98.4%",
        "storyPoints": 21
      }
    },
    {
      "id": "task-pqc-engine",
      "wbs": "2.2",
      "label": "Post-Quantum Cryptography & ML-KEM Suite",
      "category": "crypto",
      "start": "2026-10-01",
      "end": "2026-11-15",
      "assignee": "@ahmadhassan",
      "teamId": "team-core",
      "phase": "Phase 2: Execution",
      "priority": "high",
      "status": "in-progress",
      "progress": 0.40,
      "estimatedCost": 95000,
      "actualCost": 42000,
      "dependsOn": "gate-spec-approved",
      "gapDays": 5,
      "color": "#8B5CF6",
      "baseline": {
        "start": "2026-10-01",
        "end": "2026-11-10"
      },
      "notes": "Hardware-accelerated Kyber and Dilithium implementations."
    },
    {
      "id": "task-mesh-p2p",
      "wbs": "2.3",
      "label": "Decentralized Wire Protocol & Kademlia DHT",
      "category": "network",
      "start": "2026-11-07",
      "end": "2026-12-10",
      "assignee": "@elena-dev",
      "teamId": "team-core",
      "phase": "Phase 2: Execution",
      "priority": "medium",
      "status": "not-started",
      "progress": 0.0,
      "estimatedCost": 70000,
      "actualCost": 0,
      "dependsOn": "task-kernel-core",
      "gapDays": 2
    },
    {
      "id": "task-formal-audit",
      "wbs": "3.1",
      "label": "Comprehensive Cryptographic Penetration & Formal Audit",
      "category": "security",
      "start": "2026-12-12",
      "end": "2027-01-15",
      "assignee": "Dr. Marcus Vance",
      "teamId": "team-security",
      "phase": "Phase 3: Verification",
      "priority": "urgent",
      "urgent": true,
      "status": "not-started",
      "progress": 0.0,
      "estimatedCost": 150000,
      "actualCost": 0,
      "dependsOn": ["task-kernel-core", "task-pqc-engine", "task-mesh-p2p"],
      "gapDays": 2,
      "baseline": {
        "start": "2026-12-10",
        "end": "2027-01-10"
      },
      "notes": "External independent security verification with full fuzz testing harness."
    },
    {
      "id": "task-blocked-hardware",
      "wbs": "3.2",
      "label": "Hardware Enclave HSM Integration (TPM 2.0)",
      "category": "crypto",
      "start": "2026-12-15",
      "end": "2027-01-20",
      "assignee": "@elena-dev",
      "status": "blocked",
      "progress": 0.1,
      "priority": "medium",
      "dependsOn": "task-pqc-engine",
      "notes": "Awaiting physical silicon development boards from vendor fab."
    },
    {
      "id": "gate-production-ga",
      "wbs": "4.0",
      "label": "Milestone 2: Mainnet Production GA Launch",
      "category": "release",
      "start": "2027-02-15",
      "end": "2027-02-15",
      "milestone": true,
      "locked": true,
      "priority": "urgent",
      "status": "not-started",
      "progress": 0.0,
      "assignee": "@ahmadhassan",
      "dependsOn": "task-formal-audit",
      "gapDays": 30,
      "color": "#EC4899",
      "notes": "Global deployment to edge nodes worldwide."
    }
  ]
}
```

---

## 1. Top-Level Root Structure

```json
{
  "$schema": "https://jantt.dev/schema/v1.json",
  "meta": {},
  "categories": {},
  "people": [],
  "teams": [],
  "notes": [],
  "documents": [],
  "tasks": []
}
```

| Key | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `$schema` | `string` | No | Schema URI identifier (`https://jantt.dev/schema/v1.json`) |
| `meta` | `object` | No | Project-wide parameters, scale, wire routing, budget, and rendering options |
| `categories` | `object` | Yes | Map of category IDs to display labels, brand hex colors, soft tints, and icons |
| `people` | `array` | No | Team members with avatar colors, contact emails, and squad mappings |
| `teams` | `array` | No | Department or squad registries with distinct theme badge colors |
| `notes` | `array` | No | Collaborative project documentation, architecture RFCs, meeting notes, and task attachments |
| `documents` | `array` | No | List of project artifacts, compliance checklists, or deliverables |
| `tasks` | `array` | **Yes** | Array of tasks, milestones, baselines, and dependency definitions |

---

## 2. Meta Object Configuration (`meta`)

The `meta` block configures global project properties, timeline bounds, and visual presentation:

```json
{
  "meta": {
    "title": "Quantum Mesh Operating Platform",
    "description": "High-assurance distributed operating platform with real-time verification.",
    "person": "@ahmadhassan",
    "organization": "Fractal Compute Orchestrations",
    "start": "2026-09-01",
    "end": "2027-02-28",
    "defaultGapDays": 2,
    "scale": "week",
    "linkRouting": "orthogonal",
    "showCriticalPath": true,
    "showBaselines": true,
    "autoCascade": true,
    "currency": "USD",
    "budget": 650000,
    "version": "1.4.0",
    "generatedAt": "2026-09-08T00:00:00.000Z"
  }
}
```

### Meta Field Reference

| Field | Type | Default | Options / Valid Values | Description |
| :--- | :--- | :--- | :--- | :--- |
| `title` | `string` | `""` | Any text | Main project name displayed in header |
| `description` | `string` | `""` | Any text | Project scope narrative and objectives |
| `person` | `string` | `""` | Any text / `@username` | Project director or lead owner |
| `organization` | `string` | `""` | Any text | Organization or enterprise name |
| `start` / `chartStart` | `string` | Dynamic | `YYYY-MM-DD` | Explicit timeline start date |
| `end` / `chartEnd` | `string` | Dynamic | `YYYY-MM-DD` | Explicit timeline end date |
| `defaultGapDays` | `number` | `2` | Integer `>= 0` | Buffer days between sequential dependent tasks |
| `scale` | `string` | `"day"` | `"day"`, `"week"`, `"month"`, `"quarter"`, `"year"` | Timeline zoom level |
| `linkRouting` | `string` | `"orthogonal"` | `"orthogonal"`, `"curved"`, `"direct"` | Dependency wire connector geometry |
| `showCriticalPath` | `boolean` | `false` | `true`, `false` | Highlight critical path tasks & connection lines |
| `showBaselines` | `boolean` | `true` | `true`, `false` | Render planned vs actual ghost bars |
| `autoCascade` | `boolean` | `false` | `true`, `false` | Automatically shift downstream tasks when upstream slips |
| `currency` | `string` | `"USD"` | `"USD"`, `"EUR"`, `"GBP"`, etc. | Currency symbol for EVM & cost metrics |
| `budget` | `number` | `0` | Number e.g. `650000` | Total approved project baseline budget |
| `version` | `string` | `"1.4.0"` | String | Schema specification version |

---

## 3. Categories Dictionary (`categories`)

Every task must link to a valid key defined in the `categories` dictionary:

```json
{
  "categories": {
    "specs": {
      "label": "Architecture & Formal Specs",
      "color": "#38BDF8",
      "soft": "#0C4A6E",
      "icon": "file-text"
    },
    "kernel": {
      "label": "Microkernel Core",
      "color": "#10B981",
      "soft": "#064E3B",
      "icon": "cpu"
    },
    "crypto": {
      "label": "Post-Quantum Cryptography",
      "color": "#8B5CF6",
      "soft": "#312E81",
      "icon": "shield-check"
    },
    "release": {
      "label": "Mainnet Deployment & GA",
      "color": "#EC4899",
      "soft": "#831843",
      "icon": "rocket"
    }
  }
}
```

| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `label` | `string` | Yes | Human-readable category display title |
| `color` | `string` | Yes | Primary hex brand color for task bars and badges |
| `soft` | `string` | No | Subtle background tint color for theme contrast |
| `icon` | `string` | No | Lucide icon identifier (e.g. `cpu`, `shield-check`, `file-text`, `cloud`, `rocket`) |

---

## 4. People & Squads Management (`people`, `teams`)

The Jantt engine manages human resources, squad allocations, and avatar presentation with a dual-mode member architecture:

### Canonical Account Mentions vs Offline Personas

1. **Registered Collaborators**: Use their verified GitHub handle mention for both `id` and `username` (e.g. `"id": "@ahmadhassan"`, `"username": "@ahmadhassan"`).
2. **Offline Stakeholders / Contractors**: Use a local identifier (e.g. `"id": "person-auditor"`) and omit the `username` field.
3. **Task Assignment**: Tasks assign responsible owners via `assignee: "@username"` or persona name.
4. **No Internal Database IDs**: Never place Firebase UIDs, auth tokens, or private keys into JSON.

```json
{
  "people": [
    {
      "id": "@ahmadhassan",
      "name": "Ahmad Hassan",
      "username": "@ahmadhassan",
      "role": "Principal Architect",
      "avatar": "https://avatars.githubusercontent.com/u/104278065?v=4",
      "teamId": "team-core",
      "color": "#38BDF8",
      "email": "ahmad@fractal.org"
    },
    {
      "id": "person-auditor",
      "name": "Dr. Marcus Vance",
      "role": "External Cryptographic Auditor",
      "teamId": "team-security",
      "color": "#F59E0B"
    }
  ],
  "teams": [
    {
      "id": "team-core",
      "name": "Platform Core Squad",
      "color": "#38BDF8",
      "description": "Kernel services and low-level primitives"
    },
    {
      "id": "team-security",
      "name": "Security & Audit Squad",
      "color": "#F59E0B",
      "description": "Formal proofs and independent auditing"
    }
  ]
}
```

---

## 5. Collaborative Notes System (`notes`)

The `notes` array stores persistent markdown documentation, architecture RFCs, meeting minutes, and acceptance checklists. Notes can be attached to one or more tasks and are synchronized across cloud rooms with full role-based permissions:

```json
{
  "notes": [
    {
      "id": "note-arch-rfc",
      "title": "RFC-402: Zero-Allocation Microkernel Architecture",
      "content": "### Scope\nDefines memory isolation contracts between peer nodes.\n\n- Zero unsafe Rust blocks in kernel hot paths.\n- Formal verification completed by @ahmadhassan.\n- Linked to task /task-kernel-core.",
      "color": "#38BDF8",
      "pinned": true,
      "category": "Architecture",
      "tags": ["RFC", "Kernel", "Zero-Copy"],
      "task_ids": ["task-arch-spec", "task-kernel-core"],
      "updatedBy": "@ahmadhassan",
      "createdAt": "2026-09-01T09:00:00.000Z",
      "updatedAt": "2026-09-08T18:00:00.000Z"
    }
  ]
}
```

### Notes Field Reference

| Field | Type | Required | Description | Example |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `string` | **Yes** | Unique note identifier | `"note-arch-rfc"` |
| `title` | `string` | **Yes** | Note headline | `"RFC-402 Architecture"` |
| `content` | `string` | **Yes** | Markdown body with `@mention` handles & `/task` links | `"### Scope\n..."` |
| `color` | `string` | No | Accent color tint for card and badges | `"#38BDF8"` |
| `pinned` | `boolean` | No | Keep note pinned to the top of the sidebar | `true` |
| `category` | `string` | No | Categorical grouping | `"Architecture"` |
| `tags` | `string[]` | No | Array of searchable keywords | `["RFC", "Kernel"]` |
| `task_ids` | `string[]` | No | Array of attached task IDs | `["task-arch-spec", "task-kernel-core"]` |
| `updatedBy` | `string` | No | Canonical `@username` handle of last editor | `"@ahmadhassan"` |
| `createdAt` | `string` | No | ISO 8601 creation timestamp | `"2026-09-01T09:00:00.000Z"` |
| `updatedAt` | `string` | No | ISO 8601 last modified timestamp | `"2026-09-08T18:00:00.000Z"` |

---

## 6. Documents & Deliverables Checklist (`documents`)

```json
{
  "documents": [
    {
      "id": "doc-tla-spec",
      "label": "TLA+ Formal Mathematical Specification",
      "status": "have",
      "owner": "@ahmadhassan",
      "url": "https://specs.fractal.org/tla/mesh.pdf",
      "note": "Unanimously certified with TLC model checker"
    },
    {
      "id": "doc-soc2-attest",
      "label": "SOC-2 Type II Independent Audit Report",
      "status": "pending",
      "owner": "Dr. Marcus Vance",
      "url": "https://compliance.fractal.org/soc2",
      "note": "Field audit commenced; completion targeted before GA"
    },
    {
      "id": "doc-legal-licensing",
      "label": "Dual Apache-2.0 / Commercial EULA Contract",
      "status": "missing",
      "owner": "Legal Counsel",
      "url": "https://legal.fractal.org/license",
      "note": "Required regulatory deliverable before international release"
    }
  ]
}
```

| Field | Type | Options / Valid Values | Description |
| :--- | :--- | :--- | :--- |
| `id` | `string` | Unique string | Unique document identifier |
| `label` | `string` | Any text | Document or deliverable title |
| `status` | `string` | `"have"`, `"pending"`, `"missing"` | Fulfillment / compliance status |
| `owner` | `string` | Any text / `@username` | Responsible owner or reviewer |
| `url` | `string` | URL string | Link to repository, ticket, or artifact |
| `note` | `string` | Any text | Audit status notes or review criteria |

---

## 7. Tasks Collection (`tasks`)

Each task represents a planned work package, deliverable, or milestone gate:

```json
{
  "id": "task-kernel-core",
  "wbs": "2.1",
  "label": "Zero-Copy Microkernel Primitive Implementation",
  "category": "kernel",
  "start": "2026-09-26",
  "end": "2026-11-05",
  "assignee": "@elena-dev",
  "teamId": "team-core",
  "phase": "Phase 2: Execution",
  "priority": "urgent",
  "urgent": true,
  "status": "in-progress",
  "progress": 0.65,
  "estimatedCost": 125000,
  "actualCost": 88000,
  "dependsOn": "gate-spec-approved",
  "gapDays": 2,
  "locked": false,
  "color": "#10B981",
  "baseline": {
    "start": "2026-09-25",
    "end": "2026-10-31"
  },
  "notes": "Zero runtime dependencies, strict static memory quotas, microsecond context switching.",
  "fields": {
    "jira": "KERN-104",
    "coverage": "98.4%",
    "storyPoints": 21
  }
}
```

### Complete Task Field Reference

| Field | Type | Required | Description | Example |
| :--- | :--- | :---: | :--- | :--- |
| `id` | `string` | **Yes** | Unique task identifier | `"task-kernel-core"` |
| `label` / `name` | `string` | **Yes** | Display name of the task | `"Zero-Copy Microkernel"` |
| `category` | `string` | **Yes** | Key matching an entry in `categories` | `"kernel"` |
| `start` | `string` | **Yes** | ISO start date (`YYYY-MM-DD`) | `"2026-09-26"` |
| `end` | `string` | **Yes** | ISO end date (`YYYY-MM-DD` >= `start`) | `"2026-11-05"` |
| `wbs` | `string` | No | Work Breakdown Structure numbering | `"2.1"`, `"1.2.3"` |
| `assignee` | `string` | No | Responsible handle (`@username`) or persona | `"@elena-dev"` |
| `teamId` | `string` | No | Explicit or inherited squad reference | `"team-core"` |
| `phase` | `string` | No | Project phase or milestone cycle | `"Phase 2: Execution"` |
| `priority` | `string` | No | `"low"`, `"medium"`, `"high"`, `"urgent"` | `"urgent"` |
| `urgent` | `boolean` | No | Triggers high-visibility pulsing red badge | `true` |
| `status` | `string` | No | `"not-started"`, `"in-progress"`, `"submitted"`, `"completed"`, `"blocked"` | `"in-progress"` |
| `progress` | `number` | No | Float completion ratio (`0.0` to `1.0`) | `0.65` (65%) |
| `milestone` | `boolean` | No | `true` for zero-duration diamond checkpoints | `true` (with `start === end`) |
| `dependsOn` | `string` \| `string[]` \| `null` | No | Single prerequisite ID or array of IDs | `"gate-spec-approved"` or `["t1", "t2"]` |
| `gapDays` | `number` | No | Buffer days between prerequisite and this task | `2` |
| `locked` | `boolean` | No | Locks dates against accidental drag shifts | `true` |
| `color` | `string` | No | Direct task bar color override (overrides category) | `"#EC4899"` |
| `baseline` | `object` | No | Planned timeframe `{ "start", "end" }` for variance | `{"start": "2026-09-25", "end": "2026-10-31"}` |
| `estimatedCost` | `number` | No | Planned value budget (EVM basis) | `125000` |
| `actualCost` | `number` | No | Incurred actual cost (EVM basis) | `88000` |
| `notes` | `string` | No | Technical notes and acceptance criteria | `"Detailed specs..."` |
| `fields` | `object` | No | Arbitrary domain key-value metadata | `{"jira": "KERN-104", "storyPoints": 21}` |

---

## 8. Specific Functionality Samples

### Functionality 1: Zero-Duration Milestone Gates
Milestones mark key phase transitions or contract sign-offs. Represented by diamonds:
```json
{
  "id": "gate-spec-approved",
  "wbs": "1.2",
  "label": "Milestone 1: Architecture Sign-Off Gate",
  "category": "specs",
  "start": "2026-09-24",
  "end": "2026-09-24",
  "milestone": true,
  "dependsOn": "task-arch-spec",
  "gapDays": 2,
  "locked": true,
  "status": "completed",
  "progress": 1.0,
  "assignee": "@ahmadhassan"
}
```

### Functionality 2: Multi-Prerequisite DAG Dependencies
Tasks that cannot begin until multiple upstream tasks finish use an array of prerequisite IDs:
```json
{
  "id": "task-formal-audit",
  "wbs": "3.1",
  "label": "Comprehensive Cryptographic Penetration & Formal Audit",
  "category": "security",
  "start": "2026-12-12",
  "end": "2027-01-15",
  "assignee": "Dr. Marcus Vance",
  "dependsOn": ["task-kernel-core", "task-pqc-engine", "task-mesh-p2p"],
  "gapDays": 2
}
```

### Functionality 3: Baseline Variance Tracking (Ghost Bars)
Compare original project commitments against live dates with the `baseline` object:
```json
{
  "id": "task-kernel-core",
  "label": "Microkernel Primitive Implementation",
  "category": "kernel",
  "start": "2026-09-26",
  "end": "2026-11-05",
  "baseline": {
    "start": "2026-09-25",
    "end": "2026-10-31"
  }
}
```

### Functionality 4: Locked Tasks & Fixed Deadline Constraints
Prevent inadvertent mouse or touch dragging by pinning the schedule:
```json
{
  "id": "gate-production-ga",
  "label": "Hard Cutoff: Mainnet Release",
  "category": "release",
  "start": "2027-02-15",
  "end": "2027-02-15",
  "milestone": true,
  "locked": true
}
```

### Functionality 5: Direct Task Color Overrides
Override the default category theme color for specific high-priority tasks:
```json
{
  "id": "task-special-override",
  "label": "Executive Board Prototype Demo",
  "category": "specs",
  "start": "2026-10-10",
  "end": "2026-10-18",
  "color": "#EC4899"
}
```

### Functionality 6: Blocked Task State
Flag tasks impeded by external supply chain, physical hardware, or legal issues:
```json
{
  "id": "task-blocked-hardware",
  "label": "Hardware Enclave HSM Integration (TPM 2.0)",
  "category": "crypto",
  "start": "2026-12-15",
  "end": "2027-01-20",
  "status": "blocked",
  "notes": "Awaiting physical silicon development boards from vendor fab."
}
```

### Functionality 7: Custom Domain Fields Dictionary
Attach Jira ticket keys, story points, PR URLs, and SLAs to any task:
```json
{
  "id": "task-kernel-core",
  "fields": {
    "jira": "KERN-104",
    "repo": "github.com/Fractal-Compute-Orchestrations/mesh-kernel",
    "prUrl": "https://github.com/org/repo/pull/42",
    "storyPoints": 21,
    "coverageTarget": "98.4%",
    "slaDays": 14
  }
}
```

---

## 9. Operations Research & Advanced PM Analytics

The Jantt core engine runs classical project management algorithms directly in the browser and CLI:

### 1. Critical Path Method (CPM)
- **Calculations**: Computes Early Start (ES), Early Finish (EF), Late Start (LS), Late Finish (LF).
- **Float Analysis**: Calculates **Total Float** (`LS - ES`) and **Free Float** (`min(succ.ES) - EF`).
- **Identification**: Tasks with `Total Float === 0` are flagged as **Critical** (`isCritical: true`) and rendered with luminous highlight paths.

### 2. Earned Value Management (EVM - ANSI/EIA-748)
- **Planned Value (PV)**: Planned budget of work scheduled up to today.
- **Earned Value (EV)**: `BAC * Progress` (budgeted value of work physically completed).
- **Actual Cost (AC)**: Direct recorded expenditures.
- **Variances & Indices**:
  - `Schedule Variance (SV) = EV - PV`
  - `Cost Variance (CV) = EV - AC`
  - `Schedule Performance Index (SPI) = EV / PV` (Values > 1.0 indicate ahead of schedule)
  - `Cost Performance Index (CPI) = EV / AC` (Values > 1.0 indicate under budget)
  - `Estimate at Completion (EAC) = BAC / CPI`

### 3. DCMA-14 Schedule Health Audit
- Automated diagnostic checks for missing logic (dangling tasks), high float (> 44 days), negative float (overdue commitments), out-of-sequence completions, and broken logic chains.
- Outputs an overall Schedule Health Score (0-100) and letter grade (`A`, `B`, `C`, `D`, `F`).

### 4. PERT 3-Point Risk Simulation
- Calculates expected duration (`(O + 4M + P) / 6`), standard deviation, and variance.
- Outputs statistical on-time completion probabilities against contractual delivery dates.

---

## 10. Multi-User Collaboration & Security Architecture

1. **Role-Based Permissions**:
   - **Room Owner**: Full read/write access, access token management, transfer rights.
   - **Editor**: Full read/write access to tasks, baselines, dependencies, notes, and documents.
   - **Viewer**: Strict read-only view. Edits, dragging, and modifications are blocked. The viewer can clone the room to their local workspace with a single click.
2. **Atomic Batching**: Real-time room changes are synchronized using atomic payloads to prevent race conditions.
3. **Plan Sanitization**: Internal database keys (`uid`, `authId`, `authToken`, `secretKey`) are stripped during plan exports and local persistence. Only canonical `@username` handles are retained.

---

## 11. Validation Rules Enforced by `@jantt/core`

1. **ISO 8601 Date Format**: Dates must be `YYYY-MM-DD`.
2. **Chronological Validity**: `end` must be greater than or equal to `start`.
3. **Category Integrity**: Every task `category` must exist in `categories`.
4. **Task ID Uniqueness**: Duplicate task IDs are strictly rejected.
5. **DAG Dependency Validation**:
   - No dangling dependencies pointing to nonexistent tasks.
   - Zero circular cycles (`A -> B -> C -> A`).
   - Timing sanity: Dependent tasks cannot start before prerequisite completion + `gapDays`.
6. **Progress Constraints**: Must be a float between `0.0` and `1.0`.
