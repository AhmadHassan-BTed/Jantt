/**
 * @jantt/interop
 *
 * Interoperability engine for Jantt:
 * - Microsoft Project XML (MSPDI 2013-2021) import & export
 * - Oracle Primavera P6 XER import & export
 * - CSV / TSV spreadsheet import & export (RFC 4180)
 * - Executive report: print-ready HTML booklet & standalone SVG timeline
 *
 * The public surface is listed explicitly so helpers shared between modules stay internal.
 */

export { exportMsProjectXml, importMsProjectXml } from "./ms-project.js";
export type { MsProjectExportOptions, MsProjectImportOptions } from "./ms-project.js";
export { exportPrimaveraXer, importPrimaveraXer } from "./primavera.js";
export type { PrimaveraExportOptions, PrimaveraImportOptions } from "./primavera.js";
export { exportSpreadsheetCsv, importSpreadsheetCsv, decodeTextBytes } from "./spreadsheet.js";
export type { SpreadsheetExportOptions, SpreadsheetImportOptions } from "./spreadsheet.js";
export { exportExecutiveReportHtml, exportExecutiveReportSvg, downloadExecutiveReport } from "./report.js";
export type { ExecutiveReportOptions } from "./report.js";
