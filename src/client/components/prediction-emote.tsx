import { useEffect, useRef, useState } from "react";

export function PredictionEmote({
  bid,
  name,
  next = false,
}: {
  bid: number | null;
  name: string;
  next?: boolean;
}) {
  const previous = useRef(bid);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const changed = previous.current === null && bid !== null;
    previous.current = bid;
    if (!changed) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 2800);
    return () => clearTimeout(timer);
  }, [bid]);
  return visible || next ? (
    <span
      className={`seat-bubble ${visible ? "prediction-emote" : "next-bubble"}`}
      role="status"
      aria-label={
        visible ? `${name} predicts ${bid} ${bid === 1 ? "trick" : "tricks"}` : `${name} is next`
      }
    >
      <span aria-hidden="true">{visible ? bid : "Next"}</span>
    </span>
  ) : null;
}
