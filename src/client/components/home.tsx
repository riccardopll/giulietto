import { Globe2, Loader2, Users } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";

type HomeProps = {
  name: string;
  code: string;
  ready: boolean;
  busy: boolean;
  onNameChange: (name: string) => void;
  onCodeChange: (code: string) => void;
  onAction: (action: "match" | "create" | "join") => void | Promise<void>;
};

const inputClass = "h-13 rounded-lg bg-card px-4 text-base md:text-base";
const actionClass = "h-auto min-h-12 w-full rounded-lg px-4 py-3 text-sm whitespace-normal";

export function Home({ name, code, ready, busy, onNameChange, onCodeChange, onAction }: HomeProps) {
  return (
    <main className="mx-auto w-full max-w-sm py-6 sm:py-8">
      <div className="grid gap-2.5">
        <label htmlFor="name" className="text-sm font-medium">
          Display name
        </label>
        <Input
          className={inputClass}
          id="name"
          maxLength={20}
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="Your name"
          autoComplete="nickname"
        />
      </div>
      <div className="mt-3.5 grid gap-3.5">
        <Button
          className={actionClass}
          disabled={!ready || busy || !name.trim()}
          onClick={() => void onAction("match")}
        >
          {busy ? <Loader2 className="size-5 animate-spin" /> : <Globe2 className="size-5" />}
          Find matchmaking
        </Button>
        <Button
          variant="outline"
          className={actionClass}
          disabled={!ready || busy || !name.trim()}
          onClick={() => void onAction("create")}
        >
          <Users className="size-5" />
          Create private lobby
        </Button>
      </div>
      <form
        className="mt-7 grid gap-2.5 border-t pt-6"
        autoComplete="off"
        onSubmit={(event) => {
          event.preventDefault();
          void onAction("join");
        }}
      >
        <label htmlFor="lobby-code" className="text-sm font-medium">
          Lobby code
        </label>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
          <Input
            className={`${inputClass} tracking-wider uppercase placeholder:tracking-normal placeholder:normal-case`}
            id="lobby-code"
            name="table-invite"
            type="text"
            autoComplete="off"
            data-1p-ignore="true"
            data-lpignore="true"
            data-form-type="other"
            placeholder="Enter code"
            maxLength={8}
            value={code}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            onChange={(event) =>
              onCodeChange(event.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase())
            }
          />
          <Button
            className="h-13 rounded-lg px-5"
            type="submit"
            variant="secondary"
            disabled={!ready || busy || !name.trim() || code.length !== 8}
          >
            Join
          </Button>
        </div>
      </form>
    </main>
  );
}
