# @jantt/cli

> **Modern Terminal Command Center for Jantt Project Timelines, Auditing, Monte Carlo Risk Simulation, and Enterprise Conversion**

`@jantt/cli` brings Jantt's scheduling engine directly to your command line. Open interactive timelines that save straight back to your JSON file, run schedule health audits (selected DCMA checks), simulate project risks with Monte Carlo algorithms, and convert between MS Project XML, Primavera P6 XER, CSV, and TSV.

---

## ⚡ Quick Start

You can run commands directly using `npx` without installation (always use the scoped name `@jantt/cli`):

```bash
npx @jantt/cli <command> [options]
```

Or install globally:

```bash
npm install -g @jantt/cli
jantt --help
```

---

## 🛠️ CLI Commands

### 1. `jantt open <file.json> [--port 3456] [--host 127.0.0.1] [--locale en|zh-CN] [--no-open]`
Launches a local interactive Gantt viewer in your browser.

- Edits made in the browser are saved back to the JSON file (atomically, so a crash never leaves a half-written file).
- Edits made to the file on disk (your editor, `git checkout`, another tool) reload in the open page automatically.
- If the file changed on disk while you had unsaved edits, the page asks whether to load the disk version or keep your changes, so nothing is silently overwritten.
- A valid file is never replaced by an invalid plan: such an edit is not saved, and the page and terminal show the first validation error. A file that is already invalid still saves, so you can repair it in the viewer.

The server listens on `127.0.0.1` only, answers only requests addressed to its own host name, and accepts saves only from the page it served (a per-session token). Pass `--host 0.0.0.0` to share the viewer on your network; anyone who can reach that address can then view and edit the file. `--port 0` picks any free port, and `--no-open` skips launching the browser.

```bash
jantt open ./roadmap.json --port 8080 --locale zh-CN
```

### 2. `jantt validate <file.json> [--json]`
Validates JSON syntax, schema rules, date formats, and checks for circular dependency cycles. Each problem is printed with its error code, JSON path, message, and a suggested fix. Exits with code `1` when the plan is invalid, so it can gate CI.

```bash
jantt validate ./roadmap.json
```

### 3. `jantt audit <file.json> [--target YYYY-MM-DD] [--json]`
Runs a schedule health audit built on selected DCMA 14-Point checks (missing logic, leads, lags, non-FS links, hard constraints, high float, negative float, high duration) plus out-of-sequence progress and broken links. Each check is listed with its failed / eligible count, pass threshold, and the points it deducts from the health score. Float and duration are measured in working days when the plan sets `meta.calendar` or `meta.useWorkingDays`. The critical path honors `meta.defaultGapDays`. Negative float is only meaningful against a deadline: pass `--target` (or set `meta.targetDate` in the plan) to enable it.

The ANSI/EIA-748 Earned Value section names its status date and whether planned value comes from baselines. Without any `estimatedCost` it reports only the duration-weighted SPI ("No cost data"); CPI is labelled with the share of budget that reports an `actualCost`, and a TCPI that cannot be met is shown as "Unachievable within BAC".

```bash
jantt audit ./roadmap.json --target 2026-12-31
```

### 4. `jantt monte-carlo <file.json> [--runs 2000] [--variance 0.25] [--seed <n>] [--json]`
Executes probabilistic schedule risk simulations (100 to 50,000 iterations; `--uncertainty` is an alias of `--variance`, accepted range 0 to 2). Outputs deterministic vs. P50, P80, P90, and P95 completion dates, a recommended contingency buffer, and the activities most often on the critical path. Pass `--seed` for reproducible results.

```bash
jantt monte-carlo ./roadmap.json --runs 2000 --variance 0.25
```

### 5. `jantt export <file.json> --format <xml|xer|csv|html|svg> [--out <output>] [--force]`
Exports Jantt timelines into enterprise formats (soft-deleted tasks are left out):
- `xml`: Microsoft Project XML (Schema 2013–2021)
- `xer`: Oracle Primavera P6 Batch XER
- `csv`: Spreadsheet RFC-4180
- `html`: Printable executive report (use your browser's "Print to PDF" for a PDF)
- `svg`: Standalone vector timeline image

Existing files are never overwritten unless you pass `--force`, and the input plan itself is never overwritten.

```bash
jantt export ./roadmap.json --format xml --out ./project.xml
jantt export ./roadmap.json --format html --out ./executive-report.html
```

### 6. `jantt import <file> [--format <xml|xer|csv|tsv>] [--out <output.json>] [--force]`
Converts MS Project XML, Primavera P6 XER, CSV, or TSV files into Jantt JSON (the format comes from the file extension unless you pass `--format`). The file's encoding is detected (UTF-8, UTF-16 with a byte-order mark, or Windows-1252 as saved by Excel and P6). Conversions are best-effort: they keep tasks, dates, progress, and dependencies, while format-specific details (for example colors, baselines, or custom fields in CSV) may not survive. Anything that could not be converted cleanly is printed as a warning. Like `export`, it refuses to overwrite an existing file unless you pass `--force`.

```bash
jantt import ./project.xml --out ./imported-plan.json
```

---

## Scripting

- `--json` on `validate`, `audit`, and `monte-carlo` prints machine-readable results.
- Colors are turned off automatically when output is piped, when `NO_COLOR` is set, or with `--no-color`.
- Exit codes: `0` success, `1` failure (invalid plan, unreadable file, refused overwrite), `2` usage error (unknown command or option, bad flag value).

---

## 📄 License

MIT © [Jantt Team](https://github.com/AhmadHassan-BTed/Jantt)
