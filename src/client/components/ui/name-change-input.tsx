import { Input } from "./input";

export function NameChangeInput({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (name: string) => void;
}) {
  return (
    <Input
      aria-label="New name"
      placeholder="Enter new name"
      className="h-12 text-base md:text-base"
      autoComplete="off"
      maxLength={20}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
