import { expect, test as base, type Page, type TestInfo } from "@playwright/test";

export const test = base.extend<{ previewMotion: "system" | null }>({
  previewMotion: ["system", { option: true }],
  page: async ({ page, previewMotion }, use) => {
    if (previewMotion) {
      // Geometry tests follow the browser's reduced-motion setting.
      await page.addInitScript((motion) => {
        localStorage.setItem("giulietto-preview-motion", motion);
      }, previewMotion);
    }
    await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
    await page.clock.pauseAt(new Date("2026-01-01T00:00:01Z"));
    await use(page);
  },
});

export async function openPreview(page: Page, query: string) {
  await page.goto(`/preview?${query}`);
  await expect(page.locator("[data-seat]").first()).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode()));
  });
}

export async function checkLayout(page: Page) {
  const failures = await page.evaluate(() => {
    const errors: string[] = [];
    const viewport = { width: innerWidth, height: innerHeight };
    if (document.documentElement.scrollWidth > innerWidth + 1)
      errors.push("Horizontal page overflow");
    if (document.documentElement.scrollHeight > innerHeight + 1)
      errors.push("Vertical page overflow");
    const header = document.querySelector("header")!;
    const heading = header.querySelector("h2")!;
    const title = document.createRange();
    title.selectNodeContents(heading);
    const headerBounds = header.getBoundingClientRect();
    const titleBounds = title.getBoundingClientRect();
    if (
      Math.abs(titleBounds.x + titleBounds.width / 2 - headerBounds.x - headerBounds.width / 2) > 1
    )
      errors.push("The round title is not centered in the header");
    const board = document.querySelector(".match-board")!.getBoundingClientRect();
    const desktop = board.width >= 768 && board.height >= 480;
    const seats = [...document.querySelectorAll<HTMLElement>("[data-seat]")];
    const arena = document.querySelector(".table-arena")!.getBoundingClientRect();
    const center = { x: arena.x + arena.width / 2, y: arena.y + arena.height / 2 };
    const localSeat = document
      .querySelector(".seat-name[aria-label='You']")
      ?.closest<HTMLElement>("[data-seat]");
    const positions = seats.map((seat) => {
      const rect = seat.querySelector(".seat-identity")!.getBoundingClientRect();
      return {
        seat,
        x: rect.x + rect.width / 2 - center.x,
        y: rect.y + rect.height / 2 - center.y,
      };
    });
    const local = positions.find(({ seat }) => seat === localSeat);
    if (!local || Math.abs(local.x) > 1 || local.y <= 0)
      errors.push("The local player is not seated at the bottom center");
    const localAvatar = localSeat?.querySelector(".seat-avatar")?.getBoundingClientRect();
    const opponentAvatarWidths = seats
      .filter((seat) => seat !== localSeat)
      .map((seat) => seat.querySelector(".seat-avatar")!.getBoundingClientRect().width);
    if (!localAvatar || localAvatar.width <= Math.max(...opponentAvatarWidths) + 1)
      errors.push("The local player avatar is not larger than the opponents");
    const normalize = (angle: number) => ((angle % 360) + 360) % 360;
    if (desktop) {
      const distances = seats
        .map((seat) => {
          const style = getComputedStyle(seat.querySelector(".seat-identity")!);
          if (!style.offsetPath.startsWith("ellipse(") || !style.offsetDistance.endsWith("%"))
            errors.push(`Player is not on the table perimeter: ${seat.getAttribute("aria-label")}`);
          return ((parseFloat(style.offsetDistance) % 100) + 100) % 100;
        })
        .sort((a, b) => a - b);
      if (
        distances.some(
          (distance, i) =>
            Math.abs(
              ((distances[(i + 1) % distances.length] - distance + 100) % 100) - 100 / seats.length,
            ) > 0.01,
        )
      )
        errors.push("Desktop players are not evenly spaced around the table");
    } else {
      for (const side of ["top", "bottom"]) {
        const row = seats.filter((seat) => seat.dataset.side === side);
        if (row.length > 3) errors.push("More than three players in a seating row");
        if (
          row.some(
            (seat) =>
              positions.find((position) => position.seat === seat)!.y < 0 !== (side === "top"),
          )
        )
          errors.push(`Player is on the wrong side of the table: ${side}`);
      }
    }
    for (const owner of seats) {
      const cards = owner.querySelector<HTMLElement>(".seat-fan-orientation");
      if (!cards) continue;
      const hand = cards.closest<HTMLElement>(".seat-hand")!;
      const revealed = hand.hasAttribute("data-revealed");
      const expected = !desktop && !revealed && owner.dataset.side === "top" ? 180 : 0;
      const rotation = normalize(parseFloat(getComputedStyle(cards).rotate) || 0);
      if (Math.min(normalize(rotation - expected), normalize(expected - rotation)) > 3)
        errors.push(`Card fan faces away from its owner: ${owner.dataset.seat}`);
      if (desktop) {
        const style = getComputedStyle(hand);
        const identity = getComputedStyle(owner.querySelector(".seat-identity")!);
        if (style.offsetDistance !== identity.offsetDistance)
          errors.push(`Card fan is away from its owner: ${owner.dataset.seat}`);
        if (
          (!revealed && style.offsetRotate !== "auto 180deg") ||
          (revealed && style.offsetRotate !== "0deg")
        )
          errors.push(`Card fan has the wrong orientation: ${owner.dataset.seat}`);
      }
    }
    const trick = document.querySelector(".trick-cards");
    if (trick) {
      const cards = trick.getBoundingClientRect();
      const area = document.querySelector(".play-table")!.getBoundingClientRect();
      if (
        cards.left < area.left - 1 ||
        cards.top < area.top - 1 ||
        cards.right > area.right + 1 ||
        cards.bottom > area.bottom + 1
      )
        errors.push("Played cards extend outside the play area");
    }
    const elements = [
      ...document.querySelectorAll<HTMLElement>(
        ".seat-identity, .seat-avatar, .seat-name, [data-seat-stats], .seat-number, .hand .playing-card, .trick-cards .playing-card, .bid-options button, header a, header h2, header button, .seat-hand .playing-card",
      ),
    ];
    const bounds = elements.map((element) => ({
      element,
      rect: element.getBoundingClientRect(),
      label: [
        element.closest("[data-seat]")?.getAttribute("aria-label"),
        element.getAttribute("aria-label") ?? element.className.split(" ")[0],
      ]
        .filter(Boolean)
        .join(" · "),
    }));
    for (const { element, rect, label } of bounds) {
      if (
        rect.left < -1 ||
        rect.top < -1 ||
        rect.right > viewport.width + 1 ||
        rect.bottom > viewport.height + 1
      )
        errors.push(`Outside viewport: ${label}`);
      if (element.matches("button") && (rect.width < 43.5 || rect.height < 43.5))
        errors.push(`Small touch target: ${label}`);
      if (element.matches(".seat-hand .playing-card")) {
        const minimum = element.closest("[data-revealed]") ? 32 : 24;
        if (parseFloat(getComputedStyle(element).width) < minimum - 0.5)
          errors.push(`Unreadable opponent card: ${label}`);
      }
      if (element.matches(".hand .playing-card") && !element.hasAttribute("disabled")) {
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        if (!hit || !element.contains(hit)) errors.push(`Covered playable card: ${label}`);
      }
    }
    for (let i = 0; i < bounds.length; i++) {
      for (let j = i + 1; j < bounds.length; j++) {
        const a = bounds[i],
          b = bounds[j];
        if (a.element.matches(".seat-identity") || b.element.matches(".seat-identity")) continue;
        if (a.element.contains(b.element) || b.element.contains(a.element)) continue;
        const avatar = a.element.closest(".seat-avatar-wrap");
        if (avatar && avatar === b.element.closest(".seat-avatar-wrap")) continue;
        const fan = a.element.closest(".seat-hand");
        if (fan && fan === b.element.closest(".seat-hand")) continue;
        const overlapX = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
        const overlapY = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
        if (overlapX > 1 && overlapY > 1) errors.push(`Overlap: ${a.label} / ${b.label}`);
      }
    }
    const contour = document.querySelector<SVGGeometryElement>(".table-rail-edge");
    const tableCoordinates = contour?.getScreenCTM()?.inverse();
    if (contour && tableCoordinates) {
      for (const stats of document.querySelectorAll("[data-seat-stats]")) {
        const rect = stats.getBoundingClientRect();
        const overlapsFelt = [0, 0.5, 1].some((x) =>
          [0, 0.5, 1].some((y) =>
            contour.isPointInFill(
              new DOMPoint(rect.left + rect.width * x, rect.top + rect.height * y).matrixTransform(
                tableCoordinates,
              ),
            ),
          ),
        );
        if (overlapsFelt) errors.push(`Player stats overlap the table: ${stats.textContent}`);
      }
    }
    return errors;
  });
  expect(failures).toEqual([]);
}

export async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: "image/png" });
}
