import { useId, type ReactNode } from "react";
import { AlertDialog as AlertPrimitive, Dialog as DialogPrimitive } from "radix-ui";
import { Button } from "@ui/button";

export const overlayClass =
  "fixed inset-0 z-50 bg-foreground/50 data-[state=open]:animate-[fade-in_.2s_ease-out] data-[state=closed]:animate-[fade-out_.2s_ease-in]";
export const contentClass =
  "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 max-h-[calc(100dvh-2rem)] min-w-0 gap-4 overflow-y-auto rounded-xl border bg-card p-5 shadow-lg wrap-anywhere outline-none data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out";

export function ActionDialog({
  open,
  onOpenChange,
  title,
  hideTitle = false,
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
  hideTitle?: boolean;
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
        <Primitive.Overlay className={overlayClass} />
        <Primitive.Content
          aria-describedby={confirmation || description ? descriptionId : undefined}
          className={contentClass}
        >
          <div
            className={
              hideTitle && !description && !confirmation
                ? "sr-only"
                : "flex flex-col gap-2 text-center"
            }
          >
            <Primitive.Title className={hideTitle ? "sr-only" : "text-lg font-semibold"}>
              {title}
            </Primitive.Title>
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
                <Button type="button" variant="outline" disabled={busy}>
                  {cancelLabel}
                </Button>
              </Cancel>
              <Button type="submit" disabled={busy || actionDisabled}>
                {actionLabel}
              </Button>
            </div>
          </form>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
