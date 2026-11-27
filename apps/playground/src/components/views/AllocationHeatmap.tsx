import { useMemo, useState } from "react";
import type { ResourceAllocation } from "@jantt/core";
import { useI18n } from "../../i18n/I18nProvider";

interface Props {
  conflicts: ResourceAllocation[];
  resources: Array<{ id: string; name: string }>;
}

export function AllocationHeatmap({ conflicts, resources }: Props) {
  const { t } = useI18n();
  const [selectedPerson, setSelectedPerson] = useState("");
  const [day, setDay] = useState("");
  const [page, setPage] = useState(0);
  const grouped = useMemo(() => {
    const groups = new Map<string, ResourceAllocation[]>();
    for (const item of conflicts) {
      const group = groups.get(item.resourceId);
      if (group) group.push(item);
      else groups.set(item.resourceId, [item]);
    }
    for (const group of groups.values()) group.sort((a, b) => a.date.localeCompare(b.date));
    return groups;
  }, [conflicts]);

  if (!grouped.size) return null;
  const person = grouped.has(selectedPerson) ? selectedPerson : grouped.keys().next().value!;
  const days = grouped.get(person)!;
  const last = Math.ceil(days.length / 7) - 1;
  const currentPage = Math.min(page, last);
  const visible = days.slice(currentPage * 7, currentPage * 7 + 7);
  const selected = visible.find(item => item.date === day) || visible[0];
  const names = new Map(resources.map(resource => [resource.id, resource.name]));
  return <section className="allocation-heatmap" aria-label={t("health.heatmap.aria")}>
    <label>{t("health.heatmap.overloadedMember")}
      <select value={person} onChange={event => { setSelectedPerson(event.target.value); setPage(0); setDay(""); }}>
        {Array.from(grouped.keys(), id => <option key={id} value={id}>{names.get(id) || id}</option>)}
      </select>
    </label>
    <div className="allocation-days" role="group" aria-label={t("health.heatmap.overloadedDatesAria")}>
      {visible.map(item => {
        const percent = Math.round(item.totalUnits * 100);
        return <button type="button" key={item.date} aria-pressed={selected.date === item.date}
          aria-label={t("health.heatmap.dayAria", { date: item.date, percent })} className={item.totalUnits >= item.capacity * 1.5 ? "severe" : ""}
          onClick={() => setDay(item.date)}>
          <time dateTime={item.date}>{item.date.slice(5)}</time><strong>{percent}%</strong>
        </button>;
      })}
    </div>
    <p aria-live="polite">{t(selected.tasks.length === 1 ? "health.heatmap.summaryOne" : "health.heatmap.summaryMany", {
      name: names.get(person) || person,
      percent: Math.round(selected.totalUnits * 100),
      date: selected.date,
      capacity: Math.round(selected.capacity * 100),
      count: selected.tasks.length
    })}</p>
    {last > 0 && <div className="heatmap-paging">
      <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{t("health.heatmap.earlier")}</button>
      <span>{currentPage + 1} / {last + 1}</span>
      <button type="button" disabled={currentPage === last} onClick={() => setPage(currentPage + 1)}>{t("health.heatmap.later")}</button>
    </div>}
  </section>;
}
