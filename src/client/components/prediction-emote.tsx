import { useEffect, useRef, useState } from "react";
import { EMOTE_DURATION_MS } from "@/shared/emotes";
import { AnimatedWebp, preloadWebp } from "./animated-webp";
import { Bubble } from "./bubble";

// Number animations: https://www.animatedgif.net/numberscharacters/numbers.shtml
export function PredictionEmote({ bid, name }: { bid: number | null; name: string }) {
  const previous = useRef(bid);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    for (let number = 0; number <= 6; number++) {
      void preloadWebp(`/emotes/prediction-${number}.webp`).catch(() => {});
    }
  }, []);
  useEffect(() => {
    const changed = previous.current === null && bid !== null;
    previous.current = bid;
    if (!changed) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), EMOTE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [bid]);
  return visible ? (
    <Bubble label={`${name} predicts ${bid} ${bid === 1 ? "trick" : "tricks"}`}>
      <span className="absolute bottom-[2.5px] left-1/2 h-[44px] w-8 -translate-x-1/2">
        <AnimatedWebp
          src={`/emotes/prediction-${bid}.webp`}
          poster={`/emotes/prediction-${bid}-still.webp`}
        />
      </span>
    </Bubble>
  ) : null;
}
