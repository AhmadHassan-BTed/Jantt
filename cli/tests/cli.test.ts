import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliPath = path.resolve(__dirname, "../bin/jantt.js");
const examplePath = path.resolve(__dirname, "../../examples/basic.json");
const brokenDatePath = path.resolve(__dirname, "../../examples/broken-bad-date.json");
const cliVersion = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf-8")).version;

const childEnv = { ...process.env, NO_COLOR: "1" };

function run(...args: string[]) {
  const result = spawnSync(process.execPath, [cliPath, ...args], { encoding: "utf-8", env: childEnv });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

let tmpDir = "";
const tmp = (name: string) => path.join(tmpDir, name);

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jantt-cli-"));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("Jantt Enterprise CLI Tool", () => {
  it("prints version", () => {
    const { status, stdout } = run("--version");
    expect(status).toBe(0);
    expect(stdout).toContain(`jantt v${cliVersion}`);
  });

  it("prints help menu with safe, scoped npx examples", () => {
    const { status, stdout } = run("--help");
    expect(status).toBe(0);
    expect(stdout).toContain("The Ultimate JSON Gantt & Project Timeline Engine");
    expect(stdout).toContain("Usage:");
    for (const cmd of ["jantt open", "jantt audit", "jantt monte-carlo", "jantt export", "jantt import"]) {
      expect(stdout).toContain(cmd);
    }
    expect(stdout).toContain("npx @jantt/cli");
    expect(stdout).not.toMatch(/npx jantt /);
    expect(stdout).not.toContain("Losslessly");
  });

  it("never emits ANSI escapes when NO_COLOR is set or output is piped", () => {
    const { stdout } = run("audit", examplePath);
    expect(stdout).not.toContain("\x1b[");
  });

  it("rejects unknown commands with a usage exit code", () => {
    const { status, stderr } = run("valdate", examplePath);
    expect(status).toBe(2);
    expect(stderr).toContain("Unknown command 'valdate'");
  });

  it("rejects unknown options and missing values", () => {
    expect(run("validate", examplePath, "--bogus").status).toBe(2);
    const missing = run("export", examplePath, "--out");
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain("Usage:");
  });

  it("requires a file argument", () => {
    const { status, stderr } = run("audit");
    expect(status).toBe(2);
    expect(stderr).toContain("Missing <file> argument");
  });

  describe("validate", () => {
    it("validates a valid Jantt JSON file", () => {
      const { status, stdout } = run("validate", examplePath);
      expect(status).toBe(0);
      expect(stdout).toContain("[PASS] Validation Passed");
      expect(stdout).toContain("6 activities");
    });

    it("prints readable validation errors instead of [object Object]", () => {
      const { status, stderr } = run("validate", brokenDatePath);
      expect(status).toBe(1);
      expect(stderr).not.toContain("[object Object]");
      expect(stderr).toContain("[INVALID_DATE_RANGE]");
      expect(stderr).toContain("tasks[0].end");
      expect(stderr).toContain("end date cannot be earlier than start date");
      expect(stderr).toContain("→");
    });

    it("emits machine-readable results with --json", () => {
      const { status, stdout } = run("validate", brokenDatePath, "--json");
      expect(status).toBe(1);
      const parsed = JSON.parse(stdout);
      expect(parsed.valid).toBe(false);
      expect(parsed.errors[0].code).toBe("INVALID_DATE_RANGE");
    });

    it("does not count soft-deleted tombstones as activities", () => {
      const file = tmp("tombstones.json");
      const plan = JSON.parse(fs.readFileSync(examplePath, "utf-8"));
      plan.tasks.push({ id: "ghost", category: "arch", start: "2026-09-01", end: "2026-09-02", _deleted: true });
      fs.writeFileSync(file, JSON.stringify(plan));
      expect(run("validate", file).stdout).toContain("6 activities");
    });

    it("reports invalid JSON clearly", () => {
      const file = tmp("not-json.json");
      fs.writeFileSync(file, "{ nope");
      const { status, stderr } = run("validate", file);
      expect(status).toBe(1);
      expect(stderr).toContain("Invalid JSON");
    });
  });

  describe("audit", () => {
    const writePlan = (name: string, edit: (plan: any) => void) => {
      const plan = JSON.parse(fs.readFileSync(examplePath, "utf-8"));
      edit(plan);
      fs.writeFileSync(tmp(name), JSON.stringify(plan));
      return tmp(name);
    };

    it("audits schedule health with selected DCMA checks and explains every deduction", () => {
      const { status, stdout } = run("audit", examplePath);
      expect(status).toBe(0);
      expect(stdout).toContain("Schedule Health Audit (selected DCMA checks)");
      expect(stdout).not.toContain("DCMA-14");
      expect(stdout).toContain("Health Score:");
      expect(stdout).toContain("Grade:");
      expect(stdout).toContain("Critical Path:");
      expect(stdout).toMatch(/(PASS|FAIL)\s+Missing logic\s+\d+ \/ \d+\s+max 5%/);
      // Every failing check names the points it costs.
      for (const row of stdout.split("\n").filter((line) => /^\s+FAIL\s/.test(line))) {
        expect(row).toMatch(/-[\d.]+ pts$/);
      }
      expect(stdout).toMatch(/Negative float\s+N\/A \(no target date/);
      expect(stdout).toContain("No cost data");
    });

    it("lists every check in --json with counts, thresholds and penalties", () => {
      const { status, stdout } = run("audit", examplePath, "--json");
      expect(status).toBe(0);
      const report = JSON.parse(stdout);
      expect(report.checks.length).toBeGreaterThan(0);
      for (const check of report.checks) {
        expect(check).toMatchObject({ label: expect.any(String), failed: expect.any(Number), eligible: expect.any(Number), passed: expect.any(Boolean) });
      }
      const deducted = report.checks.reduce((sum: number, c: { penalty: number }) => sum + c.penalty, 0);
      expect(report.healthScore).toBe(Math.max(0, Math.round(100 - deducted)));
      expect(report.workingDays).toBe(false);
      expect(report.evm).toBeNull();
    });

    it("detects negative float against a --target deadline", () => {
      const { status, stdout } = run("audit", examplePath, "--target", "2026-09-05", "--json");
      expect(status).toBe(0);
      const report = JSON.parse(stdout);
      expect(report.targetDate).toBe("2026-09-05");
      expect(report.metrics.negativeFloat).toBeGreaterThan(0);
      expect(report.checks.find((c: { id: string }) => c.id === "negative-float").passed).toBe(false);
    });

    it("measures duration in working days when the plan uses a working calendar", () => {
      const longTask = (plan: any) => {
        plan.tasks.push({ id: "long-haul", label: "Long haul", category: "arch", start: "2026-09-01", end: "2026-10-31" });
      };
      const highDuration = (file: string) => {
        const report = JSON.parse(run("audit", file, "--json").stdout);
        return { workingDays: report.workingDays, failed: report.checks.find((c: { id: string }) => c.id === "high-duration").failed };
      };
      // 60 calendar days are ~43 working days at 5/7, but 60 on a seven-day calendar (> 44).
      expect(highDuration(writePlan("cal-none.json", longTask))).toEqual({ workingDays: false, failed: 0 });
      const continuous = writePlan("cal-continuous.json", (plan) => {
        longTask(plan);
        plan.meta.calendar = "continuous";
      });
      expect(highDuration(continuous)).toEqual({ workingDays: true, failed: 1 });
      const named = writePlan("cal-named.json", (plan) => {
        longTask(plan);
        plan.calendars = { site: { workingDays: [0, 1, 2, 3, 4, 5, 6] } };
        plan.meta.calendar = "site";
      });
      expect(highDuration(named)).toEqual({ workingDays: true, failed: 1 });
      const disabled = writePlan("cal-disabled.json", (plan) => {
        longTask(plan);
        plan.meta.calendar = "continuous";
        plan.meta.useWorkingDays = false;
      });
      expect(highDuration(disabled)).toEqual({ workingDays: false, failed: 0 });
      expect(run("audit", continuous).stdout).toContain("float and duration in working days");
    });

    it("labels partial cost coverage and an unachievable TCPI instead of printing Infinity", () => {
      const file = writePlan("costs.json", (plan) => {
        plan.tasks.forEach((t: any) => (t.estimatedCost = 1000));
        plan.tasks[0].actualCost = 50000; // budget blown on one finished task, work remaining elsewhere
      });
      const { status, stdout } = run("audit", file);
      expect(status).toBe(0);
      expect(stdout).toMatch(/CPI \(Cost Efficiency\):\s+[\d.]+ \([a-z-]+; based on 17% of budget\)/);
      expect(stdout).toContain("Unachievable within BAC");
      expect(stdout).not.toContain("Infinity");
      expect(stdout).toMatch(/status date \d{4}-\d{2}-\d{2}/);

      const report = JSON.parse(run("audit", file, "--json").stdout);
      expect(report.evm).toMatchObject({ costDataAvailable: true, costCoverage: 0.167, tcpi: null });
    });

    it("rejects an invalid --target date", () => {
      expect(run("audit", examplePath, "--target", "next-week").status).toBe(2);
    });
  });

  describe("monte-carlo", () => {
    it("runs Monte Carlo probabilistic schedule simulation", () => {
      const { status, stdout } = run("monte-carlo", examplePath, "--runs", "500");
      expect(status).toBe(0);
      expect(stdout).toContain("Monte Carlo Probabilistic Risk Results");
      expect(stdout).toContain("P50 (Median):");
      expect(stdout).toContain("P80 Confidence:");
      expect(stdout).toContain("P95 Committed:");
      expect(stdout).toContain("Contingency Recommendation:");
      expect(stdout).toContain("±");
      expect(stdout).not.toContain("&plusmn;");
    });

    it("ranks bottleneck activities by criticality", () => {
      const { status, stdout } = run("mc", examplePath, "--runs", "300", "--seed", "7", "--json");
      expect(status).toBe(0);
      const indices = JSON.parse(stdout).taskCriticality.map((t: { criticalityIndex: number }) => t.criticalityIndex);
      expect(indices).toEqual([...indices].sort((a, b) => b - a));
    });

    it("validates --runs and --variance", () => {
      expect(run("monte-carlo", examplePath, "--runs", "abc").status).toBe(2);
      expect(run("monte-carlo", examplePath, "--runs", "100000000").status).toBe(2);
      expect(run("monte-carlo", examplePath, "--variance", "5").status).toBe(2);
    });

    it("explains an empty plan instead of crashing", () => {
      const file = tmp("empty.json");
      fs.writeFileSync(file, JSON.stringify({ tasks: [] }));
      const { status, stderr } = run("monte-carlo", file);
      expect(status).toBe(1);
      expect(stderr).toContain("No activities to simulate");
    });
  });

  describe("export / import", () => {
    it("exports to XML, XER, CSV, HTML, and SVG formats", () => {
      const outputs = {
        xml: [tmp("test.xml"), "<?xml"],
        xer: [tmp("test.xer"), "ERMHDR"],
        csv: [tmp("test.csv"), "ID,Label,Start,End"],
        html: [tmp("test.html"), "<!DOCTYPE html>"],
        svg: [tmp("test.svg"), "<svg"]
      } as const;

      for (const [format, [out, marker]] of Object.entries(outputs)) {
        const { status } = run("export", examplePath, "--format", format, "--out", out);
        expect(status).toBe(0);
        expect(fs.readFileSync(out, "utf-8")).toContain(marker);
      }
    });

    it("refuses to overwrite existing files unless --force is passed", () => {
      const out = tmp("guarded.csv");
      fs.writeFileSync(out, "keep me");
      const refused = run("export", examplePath, "--format", "csv", "--out", out);
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain("--force");
      expect(fs.readFileSync(out, "utf-8")).toBe("keep me");

      expect(run("export", examplePath, "--format", "csv", "--out", out, "--force").status).toBe(0);
      expect(fs.readFileSync(out, "utf-8")).toContain("ID,Label,Start,End");
    });

    it("never overwrites the input plan, even with --force", () => {
      const plan = tmp("self.json");
      fs.copyFileSync(examplePath, plan);
      const before = fs.readFileSync(plan, "utf-8");
      const res = run("export", plan, "--format", "csv", "--out", plan, "--force");
      expect(res.status).toBe(1);
      expect(fs.readFileSync(plan, "utf-8")).toBe(before);
    });

    it("protects the original plan in an export-then-import round trip", () => {
      const plan = tmp("project.json");
      fs.copyFileSync(examplePath, plan);
      const before = fs.readFileSync(plan, "utf-8");
      expect(run("export", plan, "--format", "csv").status).toBe(0);
      const res = run("import", tmp("project.csv"));
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("Refusing to overwrite");
      expect(fs.readFileSync(plan, "utf-8")).toBe(before);
    });

    it("leaves soft-deleted tasks out of exports", () => {
      const file = tmp("with-ghost.json");
      const plan = JSON.parse(fs.readFileSync(examplePath, "utf-8"));
      plan.tasks.push({ id: "ghost-task", label: "Ghost", category: "arch", start: "2026-09-01", end: "2026-09-02", _deleted: true });
      fs.writeFileSync(file, JSON.stringify(plan));
      const out = tmp("with-ghost.csv");
      expect(run("export", file, "--format", "csv", "--out", out).status).toBe(0);
      expect(fs.readFileSync(out, "utf-8")).not.toContain("ghost-task");
    });

    it("imports TSV from raw bytes (Excel's UTF-16 'Unicode Text') and prints importer warnings", () => {
      const tsv = tmp("sheet.tsv");
      const text = "ID\tLabel\tStart\tEnd\r\nt1\tDésign, phase 1\t2026-01-05\t2026-01-09\r\nt2\tBuild\tsoon\t2026-01-20\r\n";
      fs.writeFileSync(tsv, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]));
      const out = tmp("sheet.json");
      const res = run("import", tsv, "--out", out);
      expect(res.status).toBe(0);
      expect(res.stderr).toContain('Warning: Row 3: could not read start date "soon".');
      expect(res.stdout).toContain("1 warning(s)");
      const plan = JSON.parse(fs.readFileSync(out, "utf-8"));
      expect(plan.tasks.map((t: { label: string }) => t.label)).toEqual(["Désign, phase 1", "Build"]);
    });

    it("rejects unsupported import formats with a usage error", () => {
      const { status, stderr } = run("import", tmp("schedule.pdf"));
      expect(status).toBe(2);
      expect(stderr).toContain(".xml, .xer, .csv, .tsv");
    });

    it("imports XML back to valid Jantt JSON", () => {
      const xmlOut = tmp("sample.xml");
      const jsonOut = tmp("imported.json");

      expect(run("export", examplePath, "--format", "xml", "--out", xmlOut).status).toBe(0);
      const imported = run("import", xmlOut, "--out", jsonOut);
      expect(imported.status).toBe(0);
      expect(imported.stdout).toContain("→");

      const parsed = JSON.parse(fs.readFileSync(jsonOut, "utf-8"));
      expect(Array.isArray(parsed.tasks)).toBe(true);
      expect(parsed.tasks.length).toBe(6);
      expect(run("validate", jsonOut).stdout).toContain("[PASS] Validation Passed");
    });
  });
});

// -----------------------------------------------------------------------------
// `jantt open` local server
// -----------------------------------------------------------------------------
interface HttpResult {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

function request(port: number, opts: { method?: string; path?: string; headers?: Record<string, string>; body?: string } = {}) {
  return new Promise<HttpResult>((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method: opts.method || "GET",
        path: opts.path || "/",
        headers: { Host: `127.0.0.1:${port}`, ...opts.headers }
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
      }
    );
    req.on("error", reject);
    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });
}

function readBoot(html: string) {
  const match = html.match(/<script type="application\/json" id="jantt-boot">([\s\S]*?)<\/script>/);
  if (!match) throw new Error("boot payload not found");
  return JSON.parse(match[1]) as { token: string; version: string; plan: { tasks: Array<{ id: string; label?: string }> } };
}

/** Starts `jantt open <file>` on a free loopback port and resolves once it prints its URL. */
function startViewer(file: string, ...flags: string[]) {
  const child = spawn(process.execPath, [cliPath, "open", file, "--port", "0", "--no-open", ...flags], { env: childEnv });
  const port = new Promise<number>((resolve, reject) => {
    let out = "";
    const timer = setTimeout(() => reject(new Error(`server did not start: ${out}`)), 10000);
    child.stdout!.on("data", (chunk) => {
      out += chunk;
      const m = out.match(/URL:\s+http:\/\/127\.0\.0\.1:(\d+)/);
      if (m) {
        clearTimeout(timer);
        resolve(Number(m[1]));
      }
    });
    child.on("exit", (code) => reject(new Error(`server exited with ${code}: ${out}`)));
  });
  return { child, port };
}

const saveHeaders = (token: string, version: string) => ({ "Content-Type": "application/json", "X-Jantt-Token": token, "X-Jantt-Base": version });

describe("jantt open (local viewer server)", () => {
  let server: ChildProcess;
  let port = 0;
  let planFile = "";
  const hostileLabel = "</script><script>window.pwned=1</script>";

  beforeAll(async () => {
    planFile = tmp("open-plan.json");
    const plan = JSON.parse(fs.readFileSync(examplePath, "utf-8"));
    plan.tasks[0].label = hostileLabel;
    fs.writeFileSync(planFile, JSON.stringify(plan, null, 2));

    const viewer = startViewer(planFile);
    server = viewer.child;
    port = await viewer.port;
  }, 15000);

  afterAll(() => {
    server?.kill();
  });

  it("serves the viewer with a CSP and no wildcard CORS", async () => {
    const res = await request(port);
    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    expect(res.headers["content-security-policy"]).toContain("script-src 'self' 'nonce-");
    expect(res.body).toContain('src="/assets/jantt.standalone.js"');
  });

  it("opens the viewer and sync controls in the configured language", async () => {
    const viewer = startViewer(planFile, "--locale", "zh-CN");
    try {
      const res = await request(await viewer.port);
      expect(res.body).toContain('<html lang="zh-CN">');
      expect(res.body).toContain("已与磁盘同步");
      expect(readBoot(res.body)).toMatchObject({ locale: "zh-CN" });
    } finally {
      viewer.child.kill();
    }
  });

  it("escapes plan data so labels cannot break out of the script element", async () => {
    const res = await request(port);
    expect(res.body).not.toContain(hostileLabel);
    expect(readBoot(res.body).plan.tasks[0].label).toBe(hostileLabel);
    // The boot data is inert JSON; the only inline script is the nonce-carrying controller.
    expect(res.body.match(/<script\b/g)).toHaveLength(3);
    expect(res.body.match(/<script nonce="/g)).toHaveLength(1);
  });

  it("serves the standalone engine bundle", async () => {
    const res = await request(port, { path: "/assets/jantt.standalone.js" });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("javascript");
    expect(res.body.length).toBeGreaterThan(1000);
  });

  it("rejects requests for foreign Host headers (DNS rebinding)", async () => {
    const res = await request(port, { headers: { Host: `evil.example:${port}` } });
    expect(res.status).toBe(403);
  });

  it("no longer exposes the unauthenticated /api/data route", async () => {
    expect((await request(port, { path: "/api/data" })).status).toBe(404);
  });

  it("guards /api/save with a session token, JSON content type, origin and shape checks", async () => {
    const { token, version, plan } = readBoot((await request(port)).body);
    const body = JSON.stringify(plan);
    const headers = { "Content-Type": "application/json", "X-Jantt-Token": token, "X-Jantt-Base": version };

    expect((await request(port, { method: "POST", path: "/api/save", headers: { ...headers, "X-Jantt-Token": "nope" }, body })).status).toBe(403);
    expect((await request(port, { method: "POST", path: "/api/save", headers: { ...headers, "Content-Type": "text/plain" }, body })).status).toBe(415);
    expect((await request(port, { method: "POST", path: "/api/save", headers: { ...headers, Origin: "https://evil.example" }, body })).status).toBe(403);
    expect((await request(port, { method: "POST", path: "/api/save", headers, body: "null" })).status).toBe(422);
    expect((await request(port, { method: "POST", path: "/api/save", headers, body: "{oops" })).status).toBe(400);
    expect(JSON.parse(fs.readFileSync(planFile, "utf-8")).tasks[0].label).toBe(hostileLabel);
  });

  it("never replaces a valid file with an invalid plan", async () => {
    const { token, version, plan } = readBoot((await request(port)).body);
    const before = fs.readFileSync(planFile, "utf-8");
    const broken = { ...plan, tasks: plan.tasks.map((t, i) => (i === 0 ? { ...t, end: "2000-01-01" } : t)) };
    const res = await request(port, { method: "POST", path: "/api/save", headers: saveHeaders(token, version), body: JSON.stringify(broken) });
    expect(res.status).toBe(422);
    expect(JSON.parse(res.body).error).toContain("INVALID_DATE_RANGE");
    expect(fs.readFileSync(planFile, "utf-8")).toBe(before);
  });

  it("saves edits (including multi-byte text), serves them on reload, and detects conflicts", async () => {
    const { token, version, plan } = readBoot((await request(port)).body);
    const label = "مرحبا 世界 🚀 ".repeat(20000); // large body, multi-byte characters straddle chunk boundaries
    plan.tasks[1].label = label;
    const headers = { "Content-Type": "application/json", "X-Jantt-Token": token };

    const saved = await request(port, { method: "POST", path: "/api/save", headers: { ...headers, "X-Jantt-Base": version }, body: JSON.stringify(plan) });
    expect(saved.status).toBe(200);
    const savedVersion = JSON.parse(saved.body).version;
    expect(JSON.parse(fs.readFileSync(planFile, "utf-8")).tasks[1].label).toBe(label);

    // A reload must show what is on disk now, not the startup snapshot.
    const reloaded = readBoot((await request(port)).body);
    expect(reloaded.plan.tasks[1].label).toBe(label);
    expect(reloaded.version).toBe(savedVersion);

    // A stale base version (e.g. a second tab or an external edit) must not clobber the file.
    const stale = await request(port, { method: "POST", path: "/api/save", headers: { ...headers, "X-Jantt-Base": version }, body: JSON.stringify(plan) });
    expect(stale.status).toBe(409);
    expect(JSON.parse(stale.body).version).toBe(savedVersion);
  });

  it("pushes external file edits to open pages over server-sent events", async () => {
    const { token } = readBoot((await request(port)).body);
    const received = await new Promise<{ version: string; plan?: { tasks: Array<{ label?: string }> } }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no change event received")), 8000);
      const req = http.get(
        { host: "127.0.0.1", port, path: `/api/events?token=${token}`, headers: { Host: `127.0.0.1:${port}` } },
        (res) => {
          let buffer = "";
          let edited = false;
          res.on("data", (chunk) => {
            buffer += chunk;
            let idx: number;
            while ((idx = buffer.indexOf("\n\n")) !== -1) {
              const frame = buffer.slice(0, idx);
              buffer = buffer.slice(idx + 2);
              const data = frame.split("\n").find((l) => l.startsWith("data: "));
              if (!data) continue;
              const msg = JSON.parse(data.slice(6));
              if (!edited) {
                edited = true;
                const onDisk = JSON.parse(fs.readFileSync(planFile, "utf-8"));
                onDisk.tasks[0].label = "Edited in an external editor";
                fs.writeFileSync(planFile, JSON.stringify(onDisk, null, 2));
              } else if (msg.plan) {
                clearTimeout(timer);
                req.destroy();
                resolve(msg);
              }
            }
          });
        }
      );
      req.on("error", () => undefined);
    });
    expect(received.plan?.tasks[0].label).toBe("Edited in an external editor");
  }, 10000);

  it("rejects the event stream without a token", async () => {
    expect((await request(port, { path: "/api/events" })).status).toBe(403);
  });
});

describe("jantt open (error paths)", () => {
  let server: ChildProcess | undefined;

  afterAll(() => {
    server?.kill();
  });

  it("still saves a file that is already invalid on disk, so it can be repaired in the viewer", async () => {
    const file = tmp("already-broken.json");
    fs.copyFileSync(brokenDatePath, file);
    const viewer = startViewer(file);
    server = viewer.child;
    const port = await viewer.port;

    const { token, version, plan } = readBoot((await request(port)).body);
    plan.tasks[0].label = "Renamed while still broken";
    const res = await request(port, { method: "POST", path: "/api/save", headers: saveHeaders(token, version), body: JSON.stringify(plan) });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).issues).toBeGreaterThan(0);
    expect(JSON.parse(fs.readFileSync(file, "utf-8")).tasks[0].label).toBe("Renamed while still broken");
  }, 15000);

  it("explains an address that cannot be bound instead of crashing", () => {
    // 192.0.2.1 (TEST-NET-1) is never assigned to a local interface, so the bind fails before listening.
    const res = spawnSync(process.execPath, [cliPath, "open", examplePath, "--host", "192.0.2.1", "--port", "0", "--no-open"], {
      encoding: "utf-8",
      env: childEnv,
      timeout: 10000
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("Address '192.0.2.1' is not available");
  });
});
