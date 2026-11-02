# @jantt/interop

> **Enterprise Interoperability Engine for Jantt: Microsoft Project XML, Oracle Primavera P6 XER, CSV, and High-Resolution Executive Vector PDF / HTML Booklets**

`@jantt/interop` empowers organizations to seamlessly bridge modern JSON Gantt workflows with legacy enterprise portfolio management software and C-suite reporting pipelines.

---

## 🚀 Features

- **Microsoft Project (.xml):** Lossless ingestion and export supporting Schema 2013–2021 with full 4-type dependencies (`FS`, `SS`, `FF`, `SF`) and lead/lag intervals.
- **Oracle Primavera P6 (.xer):** Batch import and export with standard table structures (`TASK`, `TASKPRED`, `PROJ`, `CALENDAR`).
- **Spreadsheet CSV (RFC 4180):** Two-way synchronization with Excel and Google Sheets with dependency expressions.
- **Executive Vector PDF & HTML Booklet Engine:** Multi-page executive dashboard with ANSI/EIA-748 Earned Value Management (EVM) metrics, DCMA-14 health score (A–F), and auto-paginated timeline vector SVG slices.

---

## 📦 Installation

```bash
npm install @jantt/interop @jantt/core
```

---

## 💻 Usage Examples

### 1. Microsoft Project XML

```typescript
import { exportMsProjectXml, importMsProjectXml } from "@jantt/interop";
import type { JanttData } from "@jantt/core";

// Ingest an MS Project XML string
const plan: JanttData = importMsProjectXml(xmlString);

// Export back to MS Project XML
const xmlOutput = exportMsProjectXml(plan);
```

### 2. Oracle Primavera P6 XER

```typescript
import { exportPrimaveraXer, importPrimaveraXer } from "@jantt/interop";

// Import Primavera P6 XER file content
const plan = importPrimaveraXer(xerContent);

// Export to valid Primavera P6 batch XER
const xerOutput = exportPrimaveraXer(plan);
```

### 3. Executive Report Booklet (HTML & Printable Vector PDF)

```typescript
import { exportExecutiveReportHtml, downloadExecutiveReport } from "@jantt/interop";

// Generate standalone HTML report
const html = exportExecutiveReportHtml(plan.tasks, {
  title: "Q4 Mission Critical Roadmap",
  subtitle: "Defense & Aerospace Portfolio",
  pageSize: "A4",
  orientation: "landscape",
  includeEvm: true,
  includeDcma14: true
});

// Or trigger direct browser download
downloadExecutiveReport(plan.tasks, { title: "Executive Report" }, "Q4-Roadmap-Report.html");
```

---

## 📄 License

MIT © [Jantt Team](https://github.com/AhmadHassan-BTed/Jantt)

