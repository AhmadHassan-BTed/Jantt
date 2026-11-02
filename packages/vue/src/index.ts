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
  type PropType
} from "vue";
import {
  JanttData,
  Task,
  ViewportOptions,
  JanttOptions,
  renderJantt,
  JanttInstance
} from "@jantt/core";

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
    theme: {
      type: Object as PropType<Record<string, string>>,
      default: undefined
    },
    themeClassName: {
      type: String,
      default: undefined
    },
    className: {
      type: String,
      default: undefined
    },
    readOnly: {
      type: Boolean,
      default: false
    },
    autoCascade: {
      type: Boolean,
      default: true
    },
    selectedDate: {
      type: String as PropType<string | null>,
      default: null
    },
    showDateFilterBadge: {
      type: Boolean,
      default: false
    },
    filterTasksByDate: {
      type: Boolean,
      default: false
    },
    disableDragOnTouch: {
      type: Boolean,
      default: false
    },
    isMobile: {
      type: Boolean,
      default: false
    }
  },
  emits: [
    "change",
    "commit",
    "task-click",
    "task-delete",
    "task-add",
    "viewport-change",
    "date-click",
    "clear-date-filter",
    "day-width-change",
    "error",
    "ready"
  ],
  setup(props, { emit, expose }) {
    const containerRef = ref<HTMLDivElement | null>(null);
    let instance: JanttInstance | null = null;

    const buildOptions = (): JanttOptions => ({
      viewport: props.viewport,
      theme: props.theme,
      themeClassName: props.themeClassName,
      className: props.className,
      readOnly: props.readOnly,
      autoCascade: props.autoCascade,
      selectedDate: props.selectedDate,
      showDateFilterBadge: props.showDateFilterBadge,
      filterTasksByDate: props.filterTasksByDate,
      disableDragOnTouch: props.disableDragOnTouch,
      isMobile: props.isMobile,
      onChange: (draft: JanttData) => emit("change", draft),
      onCommit: (final: JanttData) => emit("commit", final),
      onTaskClick: (task: Task) => emit("task-click", task),
      onTaskDelete: (taskId: string) => emit("task-delete", taskId),
      onTaskAdd: (newTask: Task) => emit("task-add", newTask),
      onViewportChange: (vp: ViewportOptions) => emit("viewport-change", vp),
      onDateClick: (dateStr: string) => emit("date-click", dateStr),
      onClearDateFilter: () => emit("clear-date-filter"),
      onDayWidthChange: (w: number) => emit("day-width-change", w),
      onError: (err: Error) => emit("error", err)
    });

    onMounted(() => {
      if (!containerRef.value) return;
      try {
        instance = renderJantt(containerRef.value, props.data, buildOptions());
        emit("ready", instance);
      } catch (err) {
        emit("error", err as Error);
      }
    });

    onUnmounted(() => {
      if (instance && typeof instance.destroy === "function") {
        instance.destroy();
        instance = null;
      }
    });

    // Watch for reactive updates to plan data or options
    watch(
      () => [props.data, props.viewport, props.theme, props.themeClassName, props.readOnly, props.autoCascade],
      () => {
        if (!instance || !props.data) return;
        instance.update(props.data, buildOptions());
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
        class: ["jantt-vue-timeline-container", props.className].filter(Boolean).join(" "),
        style: {
          width: "100%",
          height: "100%",
          minHeight: "400px"
        }
      });
  }
});

export default JanttTimeline;
