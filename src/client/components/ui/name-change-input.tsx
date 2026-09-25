import { Input } from "@ui/input";

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
      autoComplete="off"
      maxLength={20}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
