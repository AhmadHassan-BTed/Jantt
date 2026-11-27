/**
 * Jantt Vue 3 Adapter
 *
 * Official Vue 3 Composition API component for the Jantt JSON Gantt chart engine.
 */

import {
  defineComponent,
  ref,
  onMounted,
  onUnmounted,
  watch,
  h,
  toRaw,
  getCurrentInstance,
  camelize,
  toHandlerKey,
  type PropType
} from "vue";
import {
  JanttData,
  Task,
  ViewportOptions,
  JanttOptions,
  renderJantt,
  normalizeTimelineLocale,
  JanttInstance
} from "@jantt/core";

/**
 * Viewport keys the engine treats as live state (the toolbar, zoom and date filter change them).
 * Forwarding one again on an unrelated update would undo the user's change.
 */
const STATEFUL_VIEWPORT_KEYS: (keyof ViewportOptions)[] = [
  "scale",
  "dayWidth",
  "linkRouting",
  "rowHeight",
  "rowHeightMode",
  "showCriticalPath",
  "showBaselines",
  "autoCascade",
  "selectedDate"
];

/** Scalar viewport props that trigger an update when they change. */
const WATCHED_VIEWPORT_KEYS: (keyof ViewportOptions)[] = [
  ...STATEFUL_VIEWPORT_KEYS,
  "labelWidth",
  "headerHeight",
  "startDate",
  "endDate",
  "showToday",
  "showTodayTag",
  "showWeekends",
  "showDateFilterBadge",
  "filterTasksByDate"
];

/**
 * Returns the viewport to forward on update, or null when no viewport prop changed. Stateful keys
 * whose prop did not change since the last forward are omitted, which the engine reads as "keep
 * the current value".
 */
function viewportUpdate(
  prev: ViewportOptions | undefined,
  next: ViewportOptions | undefined,
  engineDayWidth: number
): ViewportOptions | null {
  const changed = new Set(WATCHED_VIEWPORT_KEYS.filter((key) => prev?.[key] !== next?.[key]));
  // The engine already shows this zoom (it reported it through day-width-change/viewport-change).
  // A scale forwarded without its dayWidth would snap the zoom to the scale's default.
  if (changed.has("dayWidth") && next?.dayWidth === engineDayWidth) {
    changed.delete("dayWidth");
    changed.delete("scale");
  }
  if (changed.size === 0) return null;

  const forwarded: ViewportOptions = { ...next };
  STATEFUL_VIEWPORT_KEYS.forEach((key) => {
    if (!changed.has(key)) delete forwarded[key];
  });
  return forwarded;
}

interface SyncedProps {
  data: JanttData;
  viewport?: ViewportOptions;
  selectedDate?: string | null;
  autoCascade?: boolean;
  config: unknown[];
}

const toError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

export const JanttTimeline = defineComponent({
  name: "JanttTimeline",
  props: {
    data: {
      type: Object as PropType<JanttData>,
      required: true
    },
    viewport: {
      type: Object as PropType<ViewportOptions>,
      default: undefined
    },
    /** Interface language. English is the default. */
    locale: {
      type: String,
      default: "en"
    },
    theme: {
      type: Object as PropType<Record<string, string>>,
      default: undefined
    },
    themeClassName: {
      type: String,
      default: undefined
    },
    /** Extra class on the wrapper element. */
    className: {
      type: String,
      default: undefined
    },
    readOnly: {
      type: Boolean,
      default: false
    },
    // Optional booleans keep `default: undefined` (Vue would otherwise cast an absent Boolean
    // prop to false), so the engine's own defaults apply exactly as in the other bindings.
    autoCascade: {
      type: Boolean,
      default: undefined
    },
    selectedDate: {
      type: String as PropType<string | null>,
      default: undefined
    },
    showDateFilterBadge: {
      type: Boolean,
      default: undefined
    },
    filterTasksByDate: {
      type: Boolean,
      default: undefined
    },
    disableDragOnTouch: {
      type: Boolean,
      default: undefined
    },
    isMobile: {
      type: Boolean,
      default: undefined
    },
    /** Initial toolbar search text; later changes are made by the user in the toolbar. */
    searchQuery: {
      type: String,
      default: undefined
    },
    sidebarContainer: {
      type: [String, Object] as PropType<HTMLElement | string>,
      default: undefined
    },
    renderDetail: {
      type: Function as PropType<NonNullable<JanttOptions["renderDetail"]>>,
      default: undefined
    }
  },
  emits: {
    change: (_draft: JanttData) => true,
    commit: (_final: JanttData) => true,
    "task-click": (_task: Task) => true,
    "task-delete": (_taskId: string) => true,
    "task-add": (_newTask: Task) => true,
    "link-create": (_fromTaskId: string, _toTaskId: string) => true,
    "link-delete": (_fromTaskId: string, _toTaskId: string) => true,
    "viewport-change": (_viewport: ViewportOptions) => true,
    "date-click": (_dateStr: string) => true,
    "clear-date-filter": () => true,
    "day-width-change": (_dayWidth: number) => true,
    // Toolbar data menu actions: each menu entry is shown only while its event has a listener.
    "open-auto-save": () => true,
    "import-json": () => true,
    "export-json": () => true,
    "export-csv": () => true,
    error: (_error: Error) => true,
    ready: (_instance: JanttInstance) => true
  },
  setup(props, { emit, expose }) {
    const containerRef = ref<HTMLDivElement | null>(null);
    const vm = getCurrentInstance();
    let instance: JanttInstance | null = null;
    /** Props as last handed to the engine; null before the first mount attempt. */
    let synced: SyncedProps | null = null;
    /**
     * Plan the engine emitted most recently: receiving it back as `data` needs no update. Cleared
     * whenever other data is applied, so returning to it later (e.g. redo) is applied again.
     */
    let lastEmitted: JanttData | null = null;

    /** Whether the parent listens to `event` (`@export-json`, `onExportJson` or `.once`). */
    const hasListener = (event: string): boolean => {
      const vnodeProps = vm?.vnode.props;
      if (!vnodeProps) return false;
      const key = toHandlerKey(camelize(event));
      return Boolean(vnodeProps[key] || vnodeProps[`${key}Once`] || vnodeProps[toHandlerKey(event)]);
    };

    // Options that are plain configuration: re-applying an unchanged value is harmless.
    const readConfig = (): unknown[] => [
      props.theme ? JSON.stringify(props.theme) : "",
      props.themeClassName,
      normalizeTimelineLocale(props.locale),
      props.readOnly,
      props.sidebarContainer,
      props.showDateFilterBadge,
      props.filterTasksByDate,
      props.disableDragOnTouch,
      props.isMobile,
      Boolean(props.renderDetail),
      hasListener("open-auto-save"),
      hasListener("import-json"),
      hasListener("export-json"),
      hasListener("export-csv")
    ];

    const reportError = (error: unknown) => {
      const err = toError(error);
      if (hasListener("error")) emit("error", err);
      else console.error("[@jantt/vue] Jantt error:", err);
    };

    const buildOptions = (): JanttOptions => ({
      theme: props.theme ? toRaw(props.theme) : undefined,
      themeClassName: props.themeClassName,
      locale: normalizeTimelineLocale(props.locale),
      readOnly: props.readOnly,
      showDateFilterBadge: props.showDateFilterBadge,
      filterTasksByDate: props.filterTasksByDate,
      disableDragOnTouch: props.disableDragOnTouch,
      isMobile: props.isMobile,
      sidebarContainer: props.sidebarContainer,
      // Stable wrapper: a new inline function on every parent render must not cause an update.
      renderDetail: props.renderDetail
        ? (task, container, api) => props.renderDetail?.(task, container, api)
        : undefined,
      onChange: (draft: JanttData) => {
        lastEmitted = draft;
        emit("change", draft);
      },
      onCommit: (final: JanttData) => {
        lastEmitted = final;
        emit("commit", final);
      },
      onTaskClick: (task: Task) => emit("task-click", task),
      onTaskDelete: (taskId: string) => emit("task-delete", taskId),
      onTaskAdd: (newTask: Task) => emit("task-add", newTask),
      onLinkCreate: (fromId: string, toId: string) => emit("link-create", fromId, toId),
      onLinkDelete: (fromId: string, toId: string) => emit("link-delete", fromId, toId),
      onViewportChange: (vp: ViewportOptions) => emit("viewport-change", vp),
      onDateClick: (dateStr: string) => emit("date-click", dateStr),
      onClearDateFilter: () => emit("clear-date-filter"),
      onDayWidthChange: (w: number) => emit("day-width-change", w),
      onOpenAutoSave: hasListener("open-auto-save") ? () => emit("open-auto-save") : undefined,
      onImportJson: hasListener("import-json") ? () => emit("import-json") : undefined,
      onExportJson: hasListener("export-json") ? () => emit("export-json") : undefined,
      onExportCsv: hasListener("export-csv") ? () => emit("export-csv") : undefined,
      onError: (err: Error) => reportError(err)
    });

    // Reactive proxies never reach the engine: it works on plain objects.
    const rawData = (): JanttData => toRaw(props.data);
    const rawViewport = (): ViewportOptions | undefined => (props.viewport ? { ...toRaw(props.viewport) } : undefined);

    const mount = () => {
      if (!containerRef.value) return;
      const viewport = rawViewport();
      synced = { data: rawData(), viewport, selectedDate: props.selectedDate, autoCascade: props.autoCascade, config: readConfig() };
      lastEmitted = null;
      try {
        instance = renderJantt(containerRef.value, rawData(), {
          ...buildOptions(),
          viewport,
          selectedDate: props.selectedDate,
          autoCascade: props.autoCascade,
          searchQuery: props.searchQuery
        });
        emit("ready", instance);
      } catch (err) {
        instance = null;
        reportError(err);
      }
    };

    const sync = (dataMutated: boolean) => {
      const prev = synced;
      if (!prev) return;
      const data = rawData();
      const viewport = rawViewport();
      const config = readConfig();
      const dataChanged = dataMutated || (data !== prev.data && data !== lastEmitted);
      const configChanged = config.some((value, i) => value !== prev.config[i]);
      const viewportChanges = viewportUpdate(prev.viewport, viewport, instance ? instance.getDayWidth() : NaN);
      const selectedDateChanged = props.selectedDate !== prev.selectedDate;
      const autoCascadeChanged = props.autoCascade !== prev.autoCascade;
      if (!dataChanged && !configChanged && !viewportChanges && !selectedDateChanged && !autoCascadeChanged) {
        synced = { ...prev, data, viewport };
        return;
      }

      if (!instance) {
        mount(); // the previous mount failed: retry with the new props
        return;
      }

      synced = { data, viewport, selectedDate: props.selectedDate, autoCascade: props.autoCascade, config };
      const options: Partial<JanttOptions> = buildOptions();
      if (viewportChanges) options.viewport = viewportChanges;
      if (selectedDateChanged) options.selectedDate = props.selectedDate;
      if (autoCascadeChanged) options.autoCascade = props.autoCascade;
      if (dataChanged) lastEmitted = null;
      try {
        // Unchanged data means the engine's own plan is the newest; never revert it to the prop.
        instance.update(dataChanged ? data : instance.getData(), options);
      } catch (err) {
        reportError(err);
      }
    };

    onMounted(mount);

    onUnmounted(() => {
      instance?.destroy();
      instance = null;
      synced = null;
    });

    // Every prop the chart reads; a new `data` reference is handled here in the same update.
    watch(
      () => [
        props.data,
        ...WATCHED_VIEWPORT_KEYS.map((key) => props.viewport?.[key]),
        props.selectedDate,
        props.autoCascade,
        ...readConfig()
      ],
      () => sync(false)
    );

    // In-place mutations of the plan (e.g. `plan.value.tasks.push(task)`).
    watch(
      () => props.data,
      (next, prev) => {
        if (next === prev) sync(true);
      },
      { deep: true }
    );

    // Expose controller methods
    expose({
      getInstance: () => instance,
      getContainer: () => containerRef.value
    });

    return () =>
      h("div", {
        ref: containerRef,
        lang: normalizeTimelineLocale(props.locale),
        class: ["jantt-vue-timeline-container", props.className].filter(Boolean).join(" "),
        style: {
          width: "100%",
          height: "100%",
          // Override with the --jantt-min-height custom property (e.g. 0 in split panes).
          minHeight: "var(--jantt-min-height, 400px)"
        }
      });
  }
});

export { JanttTimeline as Jantt };
export default JanttTimeline;
