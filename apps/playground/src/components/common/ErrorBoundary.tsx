import React from "react";
import { AlertTriangle, RotateCcw, Download, LayoutTemplate, FileJson } from "lucide-react";
import { STORAGE_KEYS } from "../../constants";
import { storageService } from "../../services/storage";
import { requestOpenJsonEditor } from "./EmptyChartState";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /**
   * "app" (default): full-page recovery screen. "pane": compact fallback inside one pane, so the
   * rest of the shell (navigation, plan switcher) stays usable.
   */
  scope?: "app" | "pane";
  /** Changing this value clears a caught error (e.g. on view or plan switch). */
  resetKey?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Best-effort copy of the plan that was open when the app crashed, read straight from storage
 * (without the app's own loaders, which may be what failed). storageService also returns writes
 * that only reached its in-memory fallback because the browser storage was full.
 */
function readRecoverablePlanJson(): string | null {
  try {
    const activeId = storageService.getItem<string>(STORAGE_KEYS.ACTIVE_PROJECT_ID);
    if (activeId && activeId !== "default") {
      const list = storageService.getItem<unknown>(STORAGE_KEYS.CUSTOM_PROJECTS);
      const found = Array.isArray(list) ? list.find((p: any) => p && p.id === activeId) : null;
      if (found?.data) return JSON.stringify(found.data, null, 2);
    }
    const defaultPlan = storageService.getItem<unknown>(STORAGE_KEYS.DEFAULT_PLAN);
    if (defaultPlan && typeof defaultPlan === "object") return JSON.stringify(defaultPlan, null, 2);
  } catch {
    // Unreadable storage: nothing to offer.
  }
  return null;
}

/**
 * Top-level safety net: a render error anywhere in the app shows a recovery screen instead of a
 * blank page. Because the active plan and view are persisted, a plain reload could hit the same
 * crash again, so the fallback also offers to open the built-in template or download the plan.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Jantt crashed while rendering:", error, info.componentStack);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private handleRetry = () => {
    this.setState({ error: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  /** Reloads on the built-in template and Gantt view without touching any saved plan. */
  private handleOpenTemplate = () => {
    // When storage is unavailable, the URL parameters below still select the template.
    storageService.setItem(STORAGE_KEYS.ACTIVE_PROJECT_ID, "default");
    storageService.setItem(STORAGE_KEYS.VIEW, "gantt");
    const url = new URL(window.location.href);
    url.search = "?plan=default&view=gantt";
    url.hash = "";
    window.location.assign(url.toString());
  };

  private handleDownload = () => {
    const json = readRecoverablePlanJson();
    if (!json) return;
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "jantt-recovered-plan.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoked late: a large file may still be read after click() returns.
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.scope === "pane") {
      return (
        <div className="empty-chart-state" role="alert">
          <AlertTriangle size={32} color="#F43F5E" aria-hidden="true" />
          <h3>This view could not be displayed</h3>
          <p>{error.message || "An unexpected error occurred while drawing this view."}</p>
          <div className="app-error-actions">
            <button type="button" className="btn btn-primary" onClick={this.handleRetry}>
              <RotateCcw size={14} aria-hidden="true" />
              <span>Try again</span>
            </button>
            <button type="button" className="btn btn-secondary" onClick={requestOpenJsonEditor}>
              <FileJson size={14} aria-hidden="true" />
              <span>Open JSON editor</span>
            </button>
          </div>
        </div>
      );
    }

    const hasRecoverablePlan = Boolean(readRecoverablePlanJson());

    return (
      <div className="app-error-boundary" role="alert">
        <div className="app-error-card">
          <AlertTriangle size={36} className="app-error-icon" aria-hidden="true" />
          <h1>Something went wrong</h1>
          <p>
            Jantt hit an unexpected error while drawing this screen. Your saved plans are still in this
            browser.
          </p>
          <pre className="app-error-detail">{error.message || String(error)}</pre>
          <div className="app-error-actions">
            <button type="button" className="btn btn-primary" onClick={this.handleReload}>
              <RotateCcw size={14} aria-hidden="true" />
              <span>Reload</span>
            </button>
            <button type="button" className="btn btn-secondary" onClick={this.handleOpenTemplate}>
              <LayoutTemplate size={14} aria-hidden="true" />
              <span>Open built-in template</span>
            </button>
            {hasRecoverablePlan && (
              <button type="button" className="btn btn-secondary" onClick={this.handleDownload}>
                <Download size={14} aria-hidden="true" />
                <span>Download current plan (JSON)</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}
