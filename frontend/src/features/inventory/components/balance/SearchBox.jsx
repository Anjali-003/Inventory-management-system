import { cn } from "@/lib/utils";
import { Search } from "lucide-react";

export function SearchBox({ value, onChange, placeholder, className }) {
  return (
    <div className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 size-[15px] -translate-y-1/2 text-cf-faint"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 w-full rounded-[7px] border border-cf-line-strong bg-card pl-8 pr-3 text-xs outline-none transition-shadow placeholder:text-cf-faint focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15"
      />
    </div>
  );
}
