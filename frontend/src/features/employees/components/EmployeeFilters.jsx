import SearchBar from "@/components/SearchBar";
import { cn } from "@/lib/utils";
import { selectClass } from "@/components/FormField";
import { Button } from "@/components/ui/button";

export default function EmployeeFilters({
  clearFilters,
  departments,
  dept,
  filtered,
  filtering,
  query,
  setDept,
  setQuery,
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
      <SearchBar
        value={query}
        onChange={setQuery}
        placeholder="Search name, code or email"
      />
      <select
        aria-label="Filter by department"
        value={dept}
        onChange={(e) => setDept(e.target.value)}
        className={cn(selectClass, "w-full sm:w-auto")}
      >
        <option value="">All departments</option>
        {departments.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      {filtering && (
        <Button variant="ghost" size="lg" onClick={clearFilters}>
          Clear filters
        </Button>
      )}
      <p className="ml-auto text-sm text-muted-foreground tabular-nums">
        {filtered.length} {filtered.length === 1 ? "employee" : "employees"}
      </p>
    </div>
  );
}
