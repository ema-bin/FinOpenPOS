"use client";

import { useMemo } from "react";
import { canonicalTimezone, timezoneChoices, timezoneLabel } from "@/lib/clubs/timezones";

export function TimezoneSelect({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const options = useMemo(() => {
    const list = timezoneChoices();
    const selected = canonicalTimezone(value);
    if (selected && !list.some((option) => option.value === selected)) {
      return [{ value: selected, label: timezoneLabel(selected) }, ...list];
    }
    return list;
  }, [value]);
  const selected = canonicalTimezone(value);

  return (
    <select
      id={id}
      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
      value={selected}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
