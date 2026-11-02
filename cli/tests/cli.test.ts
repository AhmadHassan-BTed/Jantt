import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliPath = path.resolve(__dirname, "../bin/jantt.js");
const examplePath = path.resolve(__dirname, "../../examples/basic.json");
const tmpDir = path.resolve(__dirname, "./tmp");

describe("Jantt Enterprise CLI Tool", () => {
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  it("prints version", () => {
    const output = execSync(`node ${cliPath} --version`, { encoding: "utf-8" });
    expect(output).toContain("jantt v1.1.0");
  });

  it("prints help menu", () => {
    const output = execSync(`node ${cliPath} --help`, { encoding: "utf-8" });
    expect(output).toContain("The Ultimate JSON Gantt & Project Timeline Engine");
    expect(output).toContain("Usage:");
    expect(output).toContain("jantt open");
    expect(output).toContain("jantt audit");
    expect(output).toContain("jantt monte-carlo");
    expect(output).toContain("jantt export");
    expect(output).toContain("jantt import");
  });

  it("validates a valid Jantt JSON file", () => {
    const output = execSync(`node ${cliPath} validate ${examplePath}`, { encoding: "utf-8" });
    expect(output).toContain("[PASS] Validation Passed");
    expect(output).toContain("6 activities");
  });

  it("audits schedule health against DCMA-14 and CPM", () => {
    const output = execSync(`node ${cliPath} audit ${examplePath}`, { encoding: "utf-8" });
    expect(output).toContain("Schedule Health & DCMA-14 Integrity Audit");
    expect(output).toContain("Health Score:");
    expect(output).toContain("Grade:");
    expect(output).toContain("Critical Path:");
  });

  it("runs Monte Carlo probabilistic schedule simulation", () => {
    const output = execSync(`node ${cliPath} monte-carlo ${examplePath} --runs 500`, { encoding: "utf-8" });
    expect(output).toContain("Monte Carlo Probabilistic Risk Results");
    expect(output).toContain("P50 (Median):");
    expect(output).toContain("P80 Confidence:");
    expect(output).toContain("P95 Committed:");
    expect(output).toContain("Contingency Recommendation:");
  });

  it("exports to XML, XER, CSV, HTML, and SVG formats", () => {
    const xmlOut = path.join(tmpDir, "test.xml");
    const xerOut = path.join(tmpDir, "test.xer");
    const csvOut = path.join(tmpDir, "test.csv");
    const htmlOut = path.join(tmpDir, "test.html");
    const svgOut = path.join(tmpDir, "test.svg");

    execSync(`node ${cliPath} export ${examplePath} --format xml --out ${xmlOut}`);
    execSync(`node ${cliPath} export ${examplePath} --format xer --out ${xerOut}`);
    execSync(`node ${cliPath} export ${examplePath} --format csv --out ${csvOut}`);
    execSync(`node ${cliPath} export ${examplePath} --format html --out ${htmlOut}`);
    execSync(`node ${cliPath} export ${examplePath} --format svg --out ${svgOut}`);

    expect(fs.existsSync(xmlOut)).toBe(true);
    expect(fs.readFileSync(xmlOut, "utf-8")).toContain("<?xml");

    expect(fs.existsSync(xerOut)).toBe(true);
    expect(fs.readFileSync(xerOut, "utf-8")).toContain("ERMHDR");

    expect(fs.existsSync(csvOut)).toBe(true);
    expect(fs.readFileSync(csvOut, "utf-8")).toContain("ID,Label,Start,End");

    expect(fs.existsSync(htmlOut)).toBe(true);
    expect(fs.readFileSync(htmlOut, "utf-8")).toContain("<!DOCTYPE html>");

    expect(fs.existsSync(svgOut)).toBe(true);
    expect(fs.readFileSync(svgOut, "utf-8")).toContain("<svg");

    // Clean up
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("losslessly imports XML and CSV back to valid Jantt JSON", () => {
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const xmlOut = path.join(tmpDir, "sample.xml");
    const jsonOut = path.join(tmpDir, "imported.json");

    execSync(`node ${cliPath} export ${examplePath} --format xml --out ${xmlOut}`);
    execSync(`node ${cliPath} import ${xmlOut} --out ${jsonOut}`);

    expect(fs.existsSync(jsonOut)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(jsonOut, "utf-8"));
    expect(Array.isArray(parsed.tasks)).toBe(true);
    expect(parsed.tasks.length).toBe(6);

    // Validate imported file
    const valOut = execSync(`node ${cliPath} validate ${jsonOut}`, { encoding: "utf-8" });
    expect(valOut).toContain("[PASS] Validation Passed");

    // Clean up
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
