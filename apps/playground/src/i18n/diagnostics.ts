import type { ValidationError } from "@jantt/core";
import { getActiveLocale, tGlobal, type Locale, type MessageKey } from "./index";

export function validationMessage(
  issue: ValidationError,
  syntaxError = false,
  locale: Locale = getActiveLocale(),
  t: (key: MessageKey) => string = tGlobal
): string {
  if (locale === "en") return issue.message;
  return t(syntaxError ? "editor.diagnostics.JSON_SYNTAX" : `editor.diagnostics.${issue.code}`);
}
