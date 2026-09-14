import { useId, type ReactNode } from "react";
import { AlertDialog as AlertPrimitive, Dialog as DialogPrimitive } from "radix-ui";
import { Button } from "./button";
import { contentClass, overlayClass } from "./dialog";

export function ActionDialog({
  open,
  onOpenChange,
  title,
  hideTitle = false,
  centerTitle = false,
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
  centerTitle?: boolean;
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
                : `flex flex-col gap-2 text-center ${centerTitle ? "" : "sm:text-left"}`
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
