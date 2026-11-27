import React, { useState, useEffect, useMemo, useRef, useId } from "react";
import {
  X,
  Search,
  Layers,
  Zap,
  Kanban,
  CheckSquare,
  Activity,
  StickyNote,
  Sliders,
  Calendar,
  FileCode,
  FileSpreadsheet,
  Download,
  Share2,
  Sparkles,
  Command,
  Palette,
  HelpCircle
} from "lucide-react";
import type { JanttData, Task } from "@jantt/core";
import type { ActiveView } from "../../types";
import { AVAILABLE_THEMES } from "../../constants";
import { useI18n } from "../../i18n/I18nProvider";
import type { MessageKey } from "../../i18n";
import { themeDescription } from "../../i18n/theme";

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  parsedData: JanttData | null;
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  selectedThemeId: string;
  setSelectedThemeId: (id: string) => void;
  showCriticalPath: boolean;
  onToggleCriticalPath: () => void;
  showBaselines: boolean;
  onToggleBaselines: () => void;
  onSelectTask?: (task: Task) => void;
  onOpenMonteCarlo?: () => void;
  onOpenShare?: () => void;
  onOpenAddPlan?: () => void;
  onOpenPlanManager?: () => void;
  onOpenShortcuts?: () => void;
  onExportMsProject?: () => void;
  onExportPrimavera?: () => void;
  onExportCsv?: () => void;
  onExportExecutiveReport?: () => void;
  onDownloadJson?: () => void;
  onJumpToday?: () => void;
  onFilterWeek?: () => void;
}

type CommandCategory = "Views" | "Actions" | "Tasks" | "Export & Interop" | "Themes" | "Help";

/** Category ids stay stable (they drive filtering); only their rendered label is translated. */
const CATEGORY_LABEL_KEYS: Record<CommandCategory, MessageKey> = {
  Views: "palette.categoryViews",
  Actions: "palette.categoryActions",
  Tasks: "palette.categoryTasks",
  "Export & Interop": "palette.categoryExport",
  Themes: "palette.categoryThemes",
  Help: "palette.categoryHelp"
};

interface CommandItem {
  id: string;
  category: CommandCategory;
  title: string;
  /** Plain text only; it is always rendered as a text node, never as HTML. */
  subtitle?: string;
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
}

/** Task search results are capped so a 100k-task plan cannot stall typing. */
const MAX_TASK_RESULTS = 50;

const IS_APPLE_PLATFORM =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "");

/** Label of the primary shortcut modifier on this platform ("⌘" on Apple devices, "Ctrl" elsewhere). */
export const PRIMARY_MODIFIER_LABEL = IS_APPLE_PLATFORM ? "⌘" : "Ctrl";

const DEFAULT_CATEGORIES: ReadonlySet<CommandCategory> = new Set(["Views", "Actions", "Help"]);

function matchesQuery(command: CommandItem, q: string): boolean {
  return (
    command.title.toLowerCase().includes(q) ||
    (command.subtitle?.toLowerCase().includes(q) ?? false) ||
    command.category.toLowerCase().includes(q)
  );
}

/**
 * Universal command palette (Ctrl/Cmd+K).
 * The dialog body only mounts while open, so the closed palette costs nothing on App renders.
 */
export const CommandPalette: React.FC<CommandPaletteProps> = (props) => {
  if (!props.isOpen) return null;
  return <CommandPaletteDialog {...props} />;
};

const CommandPaletteDialog: React.FC<CommandPaletteProps> = (props) => {
  const { t } = useI18n();
  const { parsedData, selectedThemeId, showCriticalPath, showBaselines } = props;
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (index: number) => `${baseId}-opt-${index}`;

  // Callbacks are read through a ref so inline arrow props from App do not rebuild the catalogue.
  const propsRef = useRef(props);
  propsRef.current = props;

  // Focus the search box on open and give focus back to where it was on close, unless a dialog
  // opened by the chosen command has already taken focus.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => {
      const focusLost = !document.activeElement || document.activeElement === document.body;
      if (focusLost && previouslyFocused?.isConnected && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
    };
  }, []);

  const has = {
    jumpToday: Boolean(props.onJumpToday),
    filterWeek: Boolean(props.onFilterWeek),
    monteCarlo: Boolean(props.onOpenMonteCarlo),
    addPlan: Boolean(props.onOpenAddPlan),
    planManager: Boolean(props.onOpenPlanManager),
    msProject: Boolean(props.onExportMsProject),
    primavera: Boolean(props.onExportPrimavera),
    csv: Boolean(props.onExportCsv),
    execReport: Boolean(props.onExportExecutiveReport),
    json: Boolean(props.onDownloadJson),
    share: Boolean(props.onOpenShare),
    shortcuts: Boolean(props.onOpenShortcuts)
  };

  const staticCommands = useMemo(() => {
    const run = (fn: (p: CommandPaletteProps) => void) => () => {
      fn(propsRef.current);
      propsRef.current.onClose();
    };
    const list: CommandItem[] = [];
    const view = (id: ActiveView, title: string, subtitle: string, icon: React.ReactNode, shortcut: string) =>
      list.push({ id: `view-${id}`, category: "Views", title, subtitle, icon, shortcut, action: run((p) => p.setActiveView(id)) });

    view("gantt", t("palette.viewGantt"), t("palette.viewGanttDesc"), <Layers size={15} style={{ color: "#38BDF8" }} />, "1");
    view("canvas", t("palette.viewCanvas"), t("palette.viewCanvasDesc"), <Zap size={15} style={{ color: "#A855F7" }} />, "2");
    view("kanban", t("palette.viewKanban"), t("palette.viewKanbanDesc"), <Kanban size={15} style={{ color: "#F59E0B" }} />, "3");
    view("tasks", t("palette.viewTasks"), t("palette.viewTasksDesc"), <CheckSquare size={15} style={{ color: "#10B981" }} />, "4");
    view("summary", t("palette.viewSummary"), t("palette.viewSummaryDesc"), <Activity size={15} style={{ color: "#F43F5E" }} />, "5");
    view("notes", t("palette.viewNotes"), t("palette.viewNotesDesc"), <StickyNote size={15} style={{ color: "#06B6D4" }} />, "6");

    list.push({
      id: "action-critical-path",
      category: "Actions",
      title: showCriticalPath ? t("palette.criticalPathDisable") : t("palette.criticalPathEnable"),
      subtitle: t("palette.criticalPathDesc"),
      icon: <Activity size={15} style={{ color: "#EF4444" }} />,
      shortcut: "C",
      action: run((p) => p.onToggleCriticalPath())
    });
    list.push({
      id: "action-baselines",
      category: "Actions",
      title: showBaselines ? t("palette.baselinesHide") : t("palette.baselinesShow"),
      subtitle: t("palette.baselinesDesc"),
      icon: <Sliders size={15} style={{ color: "#818CF8" }} />,
      shortcut: "B",
      action: run((p) => p.onToggleBaselines())
    });
    if (has.jumpToday) {
      list.push({
        id: "action-filter-today",
        category: "Actions",
        title: t("palette.filterToday"),
        subtitle: t("palette.filterTodayDesc"),
        icon: <Calendar size={15} style={{ color: "#38BDF8" }} />,
        shortcut: "T",
        action: run((p) => p.onJumpToday?.())
      });
    }
    if (has.filterWeek) {
      list.push({
        id: "action-filter-week",
        category: "Actions",
        title: t("palette.filterWeek"),
        subtitle: t("palette.filterWeekDesc"),
        icon: <Calendar size={15} style={{ color: "#A78BFA" }} />,
        shortcut: "W",
        action: run((p) => p.onFilterWeek?.())
      });
    }
    if (has.monteCarlo) {
      list.push({
        id: "action-monte-carlo",
        category: "Actions",
        title: t("palette.riskAnalytics"),
        subtitle: t("palette.riskAnalyticsDesc"),
        icon: <Sparkles size={15} style={{ color: "#F59E0B" }} />,
        action: run((p) => p.onOpenMonteCarlo?.())
      });
    }
    if (has.addPlan) {
      list.push({
        id: "action-new-plan",
        category: "Actions",
        title: t("palette.newPlan"),
        subtitle: t("palette.newPlanDesc"),
        icon: <Command size={15} style={{ color: "#10B981" }} />,
        action: run((p) => p.onOpenAddPlan?.())
      });
    }
    if (has.planManager) {
      list.push({
        id: "action-manage-plans",
        category: "Actions",
        title: t("palette.planManager"),
        subtitle: t("palette.planManagerDesc"),
        icon: <Layers size={15} style={{ color: "#818CF8" }} />,
        action: run((p) => p.onOpenPlanManager?.())
      });
    }

    if (has.msProject) {
      list.push({
        id: "export-msproject",
        category: "Export & Interop",
        title: t("palette.exportMsProject"),
        subtitle: t("palette.exportMsProjectDesc"),
        icon: <FileCode size={15} style={{ color: "#38BDF8" }} />,
        action: run((p) => p.onExportMsProject?.())
      });
    }
    if (has.primavera) {
      list.push({
        id: "export-primavera",
        category: "Export & Interop",
        title: t("palette.exportPrimavera"),
        subtitle: t("palette.exportPrimaveraDesc"),
        icon: <FileSpreadsheet size={15} style={{ color: "#F59E0B" }} />,
        action: run((p) => p.onExportPrimavera?.())
      });
    }
    if (has.csv) {
      list.push({
        id: "export-csv",
        category: "Export & Interop",
        title: t("palette.exportCsv"),
        subtitle: t("palette.exportCsvDesc"),
        icon: <FileSpreadsheet size={15} style={{ color: "#10B981" }} />,
        action: run((p) => p.onExportCsv?.())
      });
    }
    if (has.execReport) {
      list.push({
        id: "export-exec-report",
        category: "Export & Interop",
        title: t("palette.exportExecReport"),
        subtitle: t("palette.exportExecReportDesc"),
        icon: <Download size={15} style={{ color: "#A855F7" }} />,
        action: run((p) => p.onExportExecutiveReport?.())
      });
    }
    if (has.json) {
      list.push({
        id: "export-json",
        category: "Export & Interop",
        title: t("palette.exportJson"),
        subtitle: t("palette.exportJsonDesc"),
        icon: <FileCode size={15} style={{ color: "#64748B" }} />,
        action: run((p) => p.onDownloadJson?.())
      });
    }
    if (has.share) {
      list.push({
        id: "action-share-link",
        category: "Export & Interop",
        title: t("palette.shareLink"),
        subtitle: t("palette.shareLinkDesc"),
        icon: <Share2 size={15} style={{ color: "#A855F7" }} />,
        action: run((p) => p.onOpenShare?.())
      });
    }

    AVAILABLE_THEMES.forEach((theme) => {
      list.push({
        id: `theme-${theme.id}`,
        category: "Themes",
        title: t("palette.themeTitle", { name: theme.name }),
        subtitle: t("palette.themeSubtitle", {
          mode: t(theme.mode === "dark" ? "palette.themeModeDark" : "palette.themeModeLight"),
          description: themeDescription(theme, t) || t("palette.themeFallbackDesc")
        }),
        icon: <Palette size={15} style={{ color: selectedThemeId === theme.id ? "#10B981" : "#94A3B8" }} />,
        action: run((p) => p.setSelectedThemeId(theme.id))
      });
    });

    if (has.shortcuts) {
      list.push({
        id: "help-shortcuts",
        category: "Help",
        title: t("palette.shortcuts"),
        subtitle: t("palette.shortcutsDesc"),
        icon: <HelpCircle size={15} style={{ color: "#38BDF8" }} />,
        shortcut: "?",
        action: run((p) => p.onOpenShortcuts?.())
      });
    }

    return list;
    // `has` is a fresh object each render; its individual flags are the real dependencies.
  }, [
    t,
    showCriticalPath,
    showBaselines,
    selectedThemeId,
    has.jumpToday,
    has.filterWeek,
    has.monteCarlo,
    has.addPlan,
    has.planManager,
    has.msProject,
    has.primavera,
    has.csv,
    has.execReport,
    has.json,
    has.share,
    has.shortcuts
  ]);

  const normalizedQuery = query.toLowerCase().trim();

  // Tasks are only searched (never listed wholesale) and the result set is capped.
  const taskCommands = useMemo(() => {
    if (!normalizedQuery || !parsedData?.tasks) return [];
    const results: CommandItem[] = [];
    for (const task of parsedData.tasks) {
      if (task._deleted) continue;
      const taskTitle = String(task.label || task.name || task.id);
      const progressPct = Math.round((task.progress || 0) * 100);
      const subtitle = t("palette.taskSubtitle", {
        id: task.id,
        start: String(task.start),
        end: String(task.end),
        progress: progressPct
      });
      if (!taskTitle.toLowerCase().includes(normalizedQuery) && !subtitle.toLowerCase().includes(normalizedQuery)) {
        continue;
      }
      results.push({
        id: `task-${task.id}`,
        category: "Tasks",
        title: taskTitle,
        subtitle,
        icon: (
          <span
            className="command-task-swatch"
            style={{ background: progressPct === 100 ? "#10B981" : progressPct > 0 ? "#38BDF8" : "#64748B" }}
            aria-hidden="true"
          />
        ),
        action: () => {
          propsRef.current.onSelectTask?.(task);
          propsRef.current.onClose();
        }
      });
      if (results.length >= MAX_TASK_RESULTS) break;
    }
    return results;
  }, [parsedData, normalizedQuery, t]);

  const filteredCommands = useMemo(() => {
    if (!normalizedQuery) {
      return staticCommands.filter((c) => DEFAULT_CATEGORIES.has(c.category));
    }
    return [...staticCommands.filter((c) => matchesQuery(c, normalizedQuery)), ...taskCommands];
  }, [staticCommands, taskCommands, normalizedQuery]);

  const activeIndex = filteredCommands.length === 0 ? -1 : Math.min(selectedIndex, filteredCommands.length - 1);

  useEffect(() => {
    if (activeIndex < 0) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const count = filteredCommands.length;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (count) setSelectedIndex((activeIndex + 1) % count);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (count) setSelectedIndex((activeIndex - 1 + count) % count);
        break;
      case "Home":
        if (count) {
          e.preventDefault();
          setSelectedIndex(0);
        }
        break;
      case "End":
        if (count) {
          e.preventDefault();
          setSelectedIndex(count - 1);
        }
        break;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0) filteredCommands[activeIndex].action();
        break;
      case "Escape":
        e.preventDefault();
        props.onClose();
        break;
      case "Tab":
        e.preventDefault();
        inputRef.current?.parentElement?.querySelector<HTMLElement>(".palette-close")?.focus();
        break;
    }
  };

  return (
    <div className="command-palette-backdrop" onMouseDown={props.onClose}>
      <div
        className="command-palette-card"
        role="dialog"
        aria-modal="true"
        aria-label={t("palette.title")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="command-palette-search">
          <Search size={18} className="command-palette-search-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            placeholder={t("palette.placeholder")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
            aria-label={t("palette.searchAria")}
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" className="palette-close" onClick={props.onClose} onKeyDown={e => {
            if (e.key === "Tab") { e.preventDefault(); inputRef.current?.focus(); }
            if (e.key === "Escape") props.onClose();
          }} aria-label={t("palette.closeSearch")}><X size={18} /></button>
          <kbd className="command-palette-kbd">ESC</kbd>
        </div>

        <div ref={listRef} id={listId} className="command-palette-list" role="listbox" aria-label={t("palette.commands")}>
          {filteredCommands.length === 0 ? (
            <div className="command-palette-empty" role="presentation">
              {t("palette.noResults", { query })}
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const isSelected = idx === activeIndex;
              return (
                <div
                  key={cmd.id}
                  id={optionId(idx)}
                  data-index={idx}
                  role="option"
                  aria-selected={isSelected}
                  className={`command-item ${isSelected ? "is-command-selected" : ""}`}
                  onClick={cmd.action}
                  onMouseMove={() => {
                    if (!isSelected) setSelectedIndex(idx);
                  }}
                >
                  <div className="command-item-main">
                    <span className="command-item-icon">{cmd.icon}</span>
                    <div className="command-item-text">
                      <div className="command-item-title">{cmd.title}</div>
                      {cmd.subtitle && <div className="command-item-subtitle">{cmd.subtitle}</div>}
                    </div>
                  </div>
                  <div className="command-item-meta">
                    <span className="command-item-category">{t(CATEGORY_LABEL_KEYS[cmd.category])}</span>
                    {cmd.shortcut && <kbd className="command-item-shortcut">{cmd.shortcut}</kbd>}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="command-palette-footer" aria-hidden="true">
          <div className="command-palette-hints">
            <span>&uarr;&darr; {t("palette.navigate")}</span>
            <span>&crarr; {t("palette.select")}</span>
            <span>{t("palette.escClose")}</span>
          </div>
          <span className="command-palette-brand">{PRIMARY_MODIFIER_LABEL}+K</span>
        </div>
      </div>
    </div>
  );
};
