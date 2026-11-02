# @jantt/cli

> **Modern Terminal Command Center for Jantt Project Timelines, Auditing, Monte Carlo Risk Simulation, and Enterprise Conversion**

`@jantt/cli` brings the full power of Jantt's zero-dependency scheduling engine directly to your command line. Open interactive timelines with live 2-way disk syncing, run DCMA-14 health audits, simulate project risks with Monte Carlo algorithms, and convert seamlessly between MS Project XML, Primavera P6 XER, and CSV.

---

## ⚡ Quick Start

You can run commands directly using `npx` without installation:

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

### 1. `jantt open <file.json> [--port 3000]`
Launches a local interactive browser Gantt viewer with real-time bidirectional disk sync. Edits made in the browser automatically save back to your local JSON file.

```bash
jantt open ./roadmap.json --port 8080
```

### 2. `jantt validate <file.json>`
Validates JSON syntax, schema rules, date formats, and checks for circular dependency cycles.

```bash
jantt validate ./roadmap.json
```

### 3. `jantt audit <file.json>`
Runs a DCMA-14 schedule integrity audit and ANSI/EIA-748 Earned Value Management (EVM) scorecard directly in your terminal with colored ANSI health grades.

```bash
jantt audit ./roadmap.json
```

### 4. `jantt monte-carlo <file.json> [--runs 1000] [--uncertainty 0.2]`
Executes probabilistic schedule risk simulations (500 to 5,000 iterations). Outputs deterministic vs. P50, P80, and P95 completion confidence dates, recommended contingency buffers, and top bottleneck activities.

```bash
jantt monte-carlo ./roadmap.json --runs 2000 --uncertainty 0.25
```

### 5. `jantt export <file.json> --format <xml|xer|csv|html|svg> [--out <output>]`
Exports Jantt timelines into enterprise formats:
- `xml`: Microsoft Project XML (Schema 2013–2021)
- `xer`: Oracle Primavera P6 Batch XER
- `csv`: Spreadsheet RFC-4180
- `html`: Printable Executive Vector PDF / HTML Booklet
- `svg`: Standalone vector timeline image

```bash
jantt export ./roadmap.json --format xml --out ./project.xml
jantt export ./roadmap.json --format html --out ./executive-report.html
```

### 6. `jantt import <file> [--out <output.json>]`
Ingests MS Project XML, Primavera P6 XER, or CSV files and converts them into clean Jantt JSON.

```bash
jantt import ./project.xml --out ./imported-plan.json
```

---

## 📄 License

MIT © [Jantt Team](https://github.com/AhmadHassan-BTed/Jantt)

