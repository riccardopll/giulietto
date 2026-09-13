import { ArrowRight } from "lucide-react";
import { Input } from "./input";

export function NameChangeInput({
  currentName,
  value,
  disabled,
  onChange,
}: {
  currentName: string;
  value: string;
  disabled: boolean;
  onChange: (name: string) => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,2.5rem)_auto_minmax(0,1fr)] items-center gap-1 sm:grid-cols-[minmax(0,6rem)_auto_minmax(0,1fr)] sm:gap-3">
      <span className="truncate text-sm font-medium" title={currentName}>
        {currentName}
      </span>
      <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
      <Input
        aria-label="New name"
        placeholder="Enter new name"
        className="h-12 px-2 text-base placeholder:text-xs min-[360px]:placeholder:text-sm md:text-base"
        autoComplete="off"
        maxLength={20}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
