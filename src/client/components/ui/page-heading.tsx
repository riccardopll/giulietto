import { ArrowLeft } from "lucide-react";
import { t } from "../../i18n";
import { Button } from "./button";

export function PageHeading({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="mb-6 flex min-h-16 items-center gap-2 py-1">
      <Button variant="ghost" size="icon" aria-label={t.backToHome} onClick={onBack}>
        <ArrowLeft />
      </Button>
      <h1 className="min-w-0 flex-1 text-2xl font-semibold">{title}</h1>
    </header>
  );
}
