import { t } from "../../i18n";
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
      aria-label={t.newName}
      placeholder={t.newNamePlaceholder}
      autoComplete="off"
      maxLength={20}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
