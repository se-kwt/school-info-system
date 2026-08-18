"use client";

import { Search, LayoutGrid, List } from "lucide-react";

export function GridToolbar({
  searchValue,
  onSearchChange,
  searchLabel,
  filterValue,
  onFilterChange,
  filterOptions,
  view,
  onViewChange,
}: {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchLabel: string;
  filterValue: string;
  onFilterChange: (value: string) => void;
  filterOptions: { value: string; label: string }[];
  view: "grid" | "list";
  onViewChange: (view: "grid" | "list") => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-1 flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            aria-label={searchLabel}
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchLabel}
            className="w-full rounded-lg border border-neutral-200 py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <select
          aria-label="Filter by academic year"
          value={filterValue}
          onChange={(event) => onFilterChange(event.target.value)}
          className="rounded-lg border border-neutral-200 px-3 py-2 text-sm"
        >
          {filterOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-1 rounded-lg border border-neutral-200 p-1">
        <button
          type="button"
          aria-label="Grid view"
          aria-pressed={view === "grid"}
          onClick={() => onViewChange("grid")}
          className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
            view === "grid" ? "bg-neutral-900 text-white" : "text-neutral-500"
          }`}
        >
          <LayoutGrid className="h-3.5 w-3.5" /> Grid
        </button>
        <button
          type="button"
          aria-label="List view"
          aria-pressed={view === "list"}
          onClick={() => onViewChange("list")}
          className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
            view === "list" ? "bg-neutral-900 text-white" : "text-neutral-500"
          }`}
        >
          <List className="h-3.5 w-3.5" /> List
        </button>
      </div>
    </div>
  );
}
