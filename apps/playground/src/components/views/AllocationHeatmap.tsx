import { useMemo, useState } from "react";
import type { ResourceAllocation } from "@jantt/core";

interface Props {
  conflicts: ResourceAllocation[];
  resources: Array<{ id: string; name: string }>;
}

export function AllocationHeatmap({ conflicts, resources }: Props) {
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
  return <section className="allocation-heatmap" aria-label="Resource overload calendar">
    <label>Overloaded member
      <select value={person} onChange={event => { setSelectedPerson(event.target.value); setPage(0); setDay(""); }}>
        {Array.from(grouped.keys(), id => <option key={id} value={id}>{names.get(id) || id}</option>)}
      </select>
    </label>
    <div className="allocation-days" role="group" aria-label="Overloaded dates">
      {visible.map(item => {
        const percent = Math.round(item.totalUnits * 100);
        return <button type="button" key={item.date} aria-pressed={selected.date === item.date}
          aria-label={`${item.date}, ${percent}% allocated`} className={item.totalUnits >= item.capacity * 1.5 ? "severe" : ""}
          onClick={() => setDay(item.date)}>
          <time dateTime={item.date}>{item.date.slice(5)}</time><strong>{percent}%</strong>
        </button>;
      })}
    </div>
    <p aria-live="polite">{names.get(person) || person} has <strong>{Math.round(selected.totalUnits * 100)}% allocated</strong> on {selected.date}, with {Math.round(selected.capacity * 100)}% capacity across {selected.tasks.length} assigned {selected.tasks.length === 1 ? "task" : "tasks"}.</p>
    {last > 0 && <div className="heatmap-paging">
      <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Earlier</button>
      <span>{currentPage + 1} / {last + 1}</span>
      <button type="button" disabled={currentPage === last} onClick={() => setPage(currentPage + 1)}>Later</button>
    </div>}
  </section>;
}
