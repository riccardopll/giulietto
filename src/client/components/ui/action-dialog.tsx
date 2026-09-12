import { useId, type ReactNode } from "react";
import { AlertDialog as AlertPrimitive, Dialog as DialogPrimitive } from "radix-ui";
import { Button } from "./button";

export function ActionDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  actionLabel,
  cancelLabel = "Cancel",
  busy = false,
  actionDisabled = false,
  confirmation = false,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  actionLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  actionDisabled?: boolean;
  confirmation?: boolean;
  onSubmit: () => void | Promise<void>;
}) {
  const descriptionId = useId();
  const Primitive = confirmation ? AlertPrimitive : DialogPrimitive;
  const Cancel = confirmation ? AlertPrimitive.Cancel : DialogPrimitive.Close;
  return (
    <Primitive.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!busy) onOpenChange(nextOpen);
      }}
    >
      <Primitive.Portal>
        <Primitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Primitive.Content
          aria-describedby={confirmation || description ? descriptionId : undefined}
          className="fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 max-h-[calc(100dvh-2rem)] min-w-0 gap-4 overflow-y-auto rounded-xl border bg-card p-5 shadow-lg wrap-anywhere duration-200 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg"
        >
          <div className="flex flex-col gap-2 text-center sm:text-left">
            <Primitive.Title className="text-lg font-semibold">{title}</Primitive.Title>
            {(confirmation || description) && (
              <Primitive.Description
                id={descriptionId}
                className="text-sm text-muted-foreground empty:hidden"
              >
                {description}
              </Primitive.Description>
            )}
          </div>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!busy && !actionDisabled) void onSubmit();
            }}
          >
            {children}
            <div className="grid grid-cols-2 gap-2">
              <Cancel asChild>
                <Button type="button" variant="outline" className="min-h-11" disabled={busy}>
                  {cancelLabel}
                </Button>
              </Cancel>
              <Button type="submit" className="min-h-11" disabled={busy || actionDisabled}>
                {actionLabel}
              </Button>
            </div>
          </form>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
