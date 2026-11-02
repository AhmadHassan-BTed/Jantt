import React, { useState, useEffect, useMemo, useRef } from "react";
import {
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

interface CommandItem {
  id: string;
  category: "Views" | "Actions" | "Tasks" | "Export & Interop" | "Themes" | "Help";
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  parsedData,
  activeView,
  setActiveView,
  selectedThemeId,
  setSelectedThemeId,
  showCriticalPath,
  onToggleCriticalPath,
  showBaselines,
  onToggleBaselines,
  onSelectTask,
  onOpenMonteCarlo,
  onOpenShare,
  onOpenAddPlan,
  onOpenPlanManager,
  onOpenShortcuts,
  onExportMsProject,
  onExportPrimavera,
  onExportCsv,
  onExportExecutiveReport,
  onDownloadJson,
  onJumpToday,
  onFilterWeek
}) => {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [isOpen]);

  // Build command catalogue
  const allCommands = useMemo(() => {
    const list: CommandItem[] = [];

    // 1. Views
    list.push({
      id: "view-gantt",
      category: "Views",
      title: "Gantt Timeline Schedule",
      subtitle: "Standard timeline with critical path and baseline bars",
      icon: <Layers size={15} style={{ color: "#38BDF8" }} />,
      shortcut: "1",
      action: () => {
        setActiveView("gantt");
        onClose();
      }
    });
    list.push({
      id: "view-canvas",
      category: "Views",
      title: "Canvas 60 FPS Engine",
      subtitle: "Hardware-accelerated viewport for 100k+ tasks",
      icon: <Zap size={15} style={{ color: "#A855F7" }} />,
      shortcut: "2",
      action: () => {
        setActiveView("canvas");
        onClose();
      }
    });
    list.push({
      id: "view-kanban",
      category: "Views",
      title: "Kanban Board",
      subtitle: "Status-based card workflow and drag management",
      icon: <Kanban size={15} style={{ color: "#F59E0B" }} />,
      shortcut: "3",
      action: () => {
        setActiveView("kanban");
        onClose();
      }
    });
    list.push({
      id: "view-tasks",
      category: "Views",
      title: "Task Checklist & Grid",
      subtitle: "Detailed tabular task manager with completion checks",
      icon: <CheckSquare size={15} style={{ color: "#10B981" }} />,
      shortcut: "4",
      action: () => {
        setActiveView("tasks");
        onClose();
      }
    });
    list.push({
      id: "view-summary",
      category: "Views",
      title: "Health & EVM Analytics",
      subtitle: "DCMA 14-point audit, S-Curve, Earned Value Performance",
      icon: <Activity size={15} style={{ color: "#F43F5E" }} />,
      shortcut: "5",
      action: () => {
        setActiveView("summary");
        onClose();
      }
    });
    list.push({
      id: "view-notes",
      category: "Views",
      title: "Project Notes & Docs",
      subtitle: "Markdown documentation linked to schedule activities",
      icon: <StickyNote size={15} style={{ color: "#06B6D4" }} />,
      shortcut: "6",
      action: () => {
        setActiveView("notes");
        onClose();
      }
    });

    // 2. Actions & Toggles
    list.push({
      id: "action-critical-path",
      category: "Actions",
      title: `${showCriticalPath ? "Disable" : "Enable"} Critical Path Highlighting`,
      subtitle: "Highlight zero-float tasks driving project deadline",
      icon: <Activity size={15} style={{ color: "#EF4444" }} />,
      shortcut: "C",
      action: () => {
        onToggleCriticalPath();
        onClose();
      }
    });
    list.push({
      id: "action-baselines",
      category: "Actions",
      title: `${showBaselines ? "Hide" : "Show"} Planned vs Actual Baselines`,
      subtitle: "Compare current dates with baseline commitments",
      icon: <Sliders size={15} style={{ color: "#818CF8" }} />,
      shortcut: "B",
      action: () => {
        onToggleBaselines();
        onClose();
      }
    });
    if (onJumpToday) {
      list.push({
        id: "action-jump-today",
        category: "Actions",
        title: "Jump to Today",
        subtitle: "Align schedule view with current calendar date",
        icon: <Calendar size={15} style={{ color: "#38BDF8" }} />,
        shortcut: "T",
        action: () => {
          onJumpToday();
          onClose();
        }
      });
    }
    if (onFilterWeek) {
      list.push({
        id: "action-filter-week",
        category: "Actions",
        title: "Filter Current Week",
        subtitle: "Focus activities scheduled for this week",
        icon: <Calendar size={15} style={{ color: "#A78BFA" }} />,
        shortcut: "W",
        action: () => {
          onFilterWeek();
          onClose();
        }
      });
    }
    if (onOpenMonteCarlo) {
      list.push({
        id: "action-monte-carlo",
        category: "Actions",
        title: "Run Monte Carlo Risk Simulation",
        subtitle: "Probabilistic schedule risk assessment (P50, P80, P95)",
        icon: <Sparkles size={15} style={{ color: "#F59E0B" }} />,
        action: () => {
          onOpenMonteCarlo();
          onClose();
        }
      });
    }
    if (onOpenAddPlan) {
      list.push({
        id: "action-new-plan",
        category: "Actions",
        title: "Create New Project Plan",
        subtitle: "Start a fresh project from scratch or from templates",
        icon: <Command size={15} style={{ color: "#10B981" }} />,
        action: () => {
          onOpenAddPlan();
          onClose();
        }
      });
    }
    if (onOpenPlanManager) {
      list.push({
        id: "action-manage-plans",
        category: "Actions",
        title: "Plan Manager & Cloud Hub",
        subtitle: "Organize, clone, export, and sync all saved projects",
        icon: <Layers size={15} style={{ color: "#818CF8" }} />,
        action: () => {
          onOpenPlanManager();
          onClose();
        }
      });
    }

    // 3. Export & Interoperability
    if (onExportMsProject) {
      list.push({
        id: "export-msproject",
        category: "Export & Interop",
        title: "Export Microsoft Project XML (.xml)",
        subtitle: "Native MSPDI XML format compatible with MS Project 2010-2024",
        icon: <FileCode size={15} style={{ color: "#38BDF8" }} />,
        action: () => {
          onExportMsProject();
          onClose();
        }
      });
    }
    if (onExportPrimavera) {
      list.push({
        id: "export-primavera",
        category: "Export & Interop",
        title: "Export Primavera P6 XER (.xer)",
        subtitle: "Oracle Primavera P6 Enterprise batch interchange format",
        icon: <FileSpreadsheet size={15} style={{ color: "#F59E0B" }} />,
        action: () => {
          onExportPrimavera();
          onClose();
        }
      });
    }
    if (onExportCsv) {
      list.push({
        id: "export-csv",
        category: "Export & Interop",
        title: "Export Universal Spreadsheet CSV (.csv)",
        subtitle: "Standard tabular data for Excel, Google Sheets, or BI tools",
        icon: <FileSpreadsheet size={15} style={{ color: "#10B981" }} />,
        action: () => {
          onExportCsv();
          onClose();
        }
      });
    }
    if (onExportExecutiveReport) {
      list.push({
        id: "export-exec-report",
        category: "Export & Interop",
        title: "Generate Executive Status Booklet (.html)",
        subtitle: "Self-contained C-level briefing document formatted for vector PDF print",
        icon: <Download size={15} style={{ color: "#A855F7" }} />,
        action: () => {
          onExportExecutiveReport();
          onClose();
        }
      });
    }
    if (onDownloadJson) {
      list.push({
        id: "export-json",
        category: "Export & Interop",
        title: "Download Native Jantt JSON (.json)",
        subtitle: "Zero-loss local backup containing all metadata, people, and baselines",
        icon: <FileCode size={15} style={{ color: "#64748B" }} />,
        action: () => {
          onDownloadJson();
          onClose();
        }
      });
    }
    if (onOpenShare) {
      list.push({
        id: "action-share-link",
        category: "Export & Interop",
        title: "Share Project Link & Embed Snippet",
        subtitle: "Generate compressed read-only URL or iframe embed code",
        icon: <Share2 size={15} style={{ color: "#A855F7" }} />,
        action: () => {
          onOpenShare();
          onClose();
        }
      });
    }

    // 4. Themes
    AVAILABLE_THEMES.forEach((theme) => {
      list.push({
        id: `theme-${theme.id}`,
        category: "Themes",
        title: `Theme: ${theme.name}`,
        subtitle: `${theme.mode.toUpperCase()} MODE - ${theme.description || "Sophisticated color scheme"}`,
        icon: <Palette size={15} style={{ color: selectedThemeId === theme.id ? "#10B981" : "#94A3B8" }} />,
        action: () => {
          setSelectedThemeId(theme.id);
          onClose();
        }
      });
    });

    // 5. Help
    if (onOpenShortcuts) {
      list.push({
        id: "help-shortcuts",
        category: "Help",
        title: "Keyboard Shortcuts Cheatsheet",
        subtitle: "View all desktop-grade hotkeys and navigation controls",
        icon: <HelpCircle size={15} style={{ color: "#38BDF8" }} />,
        shortcut: "?",
        action: () => {
          onOpenShortcuts();
          onClose();
        }
      });
    }

    // 6. Tasks (Active Schedule)
    const tasks = (parsedData?.tasks || []).filter((t) => !t._deleted);
    tasks.forEach((task) => {
      const taskTitle = task.label || task.name || task.id;
      const progressPct = Math.round((task.progress || 0) * 100);
      list.push({
        id: `task-${task.id}`,
        category: "Tasks",
        title: taskTitle,
        subtitle: `ID: ${task.id} &bull; ${task.start} &rarr; ${task.end} &bull; ${progressPct}% completed`,
        icon: (
          <div
            style={{
              width: "12px",
              height: "12px",
              borderRadius: "2px",
              background: progressPct === 100 ? "#10B981" : progressPct > 0 ? "#38BDF8" : "#64748B"
            }}
          />
        ),
        action: () => {
          if (onSelectTask) {
            onSelectTask(task);
          }
          onClose();
        }
      });
    });

    return list;
  }, [
    parsedData,
    activeView,
    setActiveView,
    selectedThemeId,
    setSelectedThemeId,
    showCriticalPath,
    onToggleCriticalPath,
    showBaselines,
    onToggleBaselines,
    onSelectTask,
    onOpenMonteCarlo,
    onOpenShare,
    onOpenAddPlan,
    onOpenPlanManager,
    onOpenShortcuts,
    onExportMsProject,
    onExportPrimavera,
    onExportCsv,
    onExportExecutiveReport,
    onDownloadJson,
    onJumpToday,
    onFilterWeek,
    onClose
  ]);

  // Filter commands by query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) {
      // Default: show Views, Actions, Help, and First 5 Tasks
      return allCommands.filter(
        (c) => c.category === "Views" || c.category === "Actions" || c.category === "Help"
      );
    }

    const q = query.toLowerCase().trim();
    return allCommands.filter((c) => {
      return (
        c.title.toLowerCase().includes(q) ||
        (c.subtitle && c.subtitle.toLowerCase().includes(q)) ||
        c.category.toLowerCase().includes(q)
      );
    });
  }, [allCommands, query]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1 < filteredCommands.length ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filteredCommands.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = filteredCommands[selectedIndex];
      if (selected) {
        selected.action();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  // Scroll active item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const activeEl = list.querySelector(".is-command-selected") as HTMLElement;
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div
      className="prompt-modal-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(3, 7, 18, 0.75)",
        backdropFilter: "blur(8px)",
        zIndex: 99999,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "12vh"
      }}
      onClick={onClose}
    >
      <div
        className="command-palette-card"
        style={{
          width: "92%",
          maxWidth: "640px",
          maxHeight: "68vh",
          background: "var(--jantt-surface, #0B132B)",
          border: "1px solid var(--jantt-border, #1E293B)",
          borderRadius: "12px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.05)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Box */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "14px 18px",
            borderBottom: "1px solid var(--jantt-border, #1E293B)",
            gap: "12px"
          }}
        >
          <Search size={18} style={{ color: "#38BDF8", flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command, jump to task, switch view, or run simulation..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--jantt-text, #F8FAFC)",
              fontSize: "14px",
              fontFamily: "inherit"
            }}
          />
          <kbd
            style={{
              fontSize: "10px",
              padding: "2px 6px",
              borderRadius: "4px",
              background: "rgba(255, 255, 255, 0.08)",
              color: "var(--jantt-text-muted, #94A3B8)",
              border: "1px solid rgba(255, 255, 255, 0.12)"
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Command List */}
        <div
          ref={listRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "8px",
            maxHeight: "440px"
          }}
        >
          {filteredCommands.length === 0 ? (
            <div
              style={{
                padding: "36px 20px",
                textAlign: "center",
                color: "var(--jantt-text-muted, #94A3B8)",
                fontSize: "13px"
              }}
            >
              No matching commands or tasks found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={cmd.id}
                  className={`command-item ${isSelected ? "is-command-selected" : ""}`}
                  onClick={cmd.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "9px 12px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    background: isSelected ? "rgba(56, 189, 248, 0.12)" : "transparent",
                    border: isSelected ? "1px solid rgba(56, 189, 248, 0.25)" : "1px solid transparent",
                    transition: "background 0.1s ease",
                    marginBottom: "2px"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", overflow: "hidden" }}>
                    <div style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>{cmd.icon}</div>
                    <div style={{ overflow: "hidden" }}>
                      <div
                        style={{
                          fontSize: "13px",
                          fontWeight: 500,
                          color: isSelected ? "#38BDF8" : "var(--jantt-text, #F8FAFC)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis"
                        }}
                      >
                        {cmd.title}
                      </div>
                      {cmd.subtitle && (
                        <div
                          style={{
                            fontSize: "11px",
                            color: "var(--jantt-text-muted, #94A3B8)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis"
                          }}
                          dangerouslySetInnerHTML={{ __html: cmd.subtitle }}
                        />
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0, marginLeft: "12px" }}>
                    <span
                      style={{
                        fontSize: "9.5px",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        background: "rgba(255, 255, 255, 0.05)",
                        color: "var(--jantt-text-muted, #64748B)"
                      }}
                    >
                      {cmd.category}
                    </span>
                    {cmd.shortcut && (
                      <kbd
                        style={{
                          fontSize: "10px",
                          padding: "2px 5px",
                          borderRadius: "4px",
                          background: "rgba(56, 189, 248, 0.15)",
                          color: "#38BDF8",
                          border: "1px solid rgba(56, 189, 248, 0.3)"
                        }}
                      >
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Help Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 16px",
            borderTop: "1px solid var(--jantt-border, #1E293B)",
            background: "rgba(0, 0, 0, 0.2)",
            fontSize: "11px",
            color: "var(--jantt-text-muted, #64748B)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span>&uarr;&darr; Navigate</span>
            <span>&crarr; Select</span>
            <span>ESC Close</span>
          </div>
          <div>
            <span style={{ color: "#38BDF8", fontWeight: 600 }}>Jantt Command Engine</span>
          </div>
        </div>
      </div>
    </div>
  );
};

