import { useEffect, useRef, useState } from "react";

export function PredictionEmote({ bid, name }: { bid: number | null; name: string }) {
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
  return visible ? (
    <span
      className="seat-bubble prediction-emote"
      role="status"
      aria-label={`${name} predicts ${bid} ${bid === 1 ? "trick" : "tricks"}`}
    >
      <span aria-hidden="true">{bid}</span>
    </span>
  ) : null;
}
