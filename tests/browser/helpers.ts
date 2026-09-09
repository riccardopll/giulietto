import { expect, test as base, type Page, type TestInfo } from "@playwright/test";
import type { PreviewOptions } from "../../src/client/preview/games";

export type PreviewFixture = PreviewOptions & { viewer?: number };
export type TableGeometry = {
  table: Record<string, { x: number; y: number; width: number; height: number }>;
  seats: Record<string, { centerX: number; centerY: number; width: number; height: number }>;
};
const fixtureChanges = new WeakMap<Page, number>();

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
  fixtureChanges.set(page, 0);
  await expect(page.locator("[data-seat]").first()).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode()));
  });
}

export async function configurePreview(page: Page, fixture: PreviewFixture) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(fixture)) {
    if (value === undefined) continue;
    query.set(
      key === "seatStates" ? "seats" : key,
      Array.isArray(value)
        ? value.join(",")
        : String(typeof value === "boolean" ? Number(value) : value),
    );
  }
  // The normal URL serialization effect removes this marker after React commits the fixture.
  query.set("pending", "1");
  const changes = fixtureChanges.get(page) ?? 0;
  // WebKit limits a document to 100 History API writes per 10s. Each fixture writes twice.
  if (page.context().browser()?.browserType().name() === "webkit" && changes >= 35) {
    await page.goto(`/preview?${query}`);
    fixtureChanges.set(page, 0);
  } else {
    await page.evaluate((query) => {
      history.replaceState(null, "", `/preview?${query}`);
      dispatchEvent(new PopStateEvent("popstate"));
    }, query.toString());
    fixtureChanges.set(page, changes + 1);
  }
  await expect(page).not.toHaveURL(/[?&]pending=/);
}

export async function checkLayout(page: Page, expected?: TableGeometry): Promise<TableGeometry> {
  const result = await page.evaluate((expected) => {
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
    for (const owner of seats) {
      const cards = [...owner.querySelectorAll(".seat-hand .playing-card")];
      if (!cards.length) continue;
      const bounds = cards.map((card) => card.getBoundingClientRect());
      const handCenter = {
        x: (Math.min(...bounds.map((b) => b.left)) + Math.max(...bounds.map((b) => b.right))) / 2,
        y: (Math.min(...bounds.map((b) => b.top)) + Math.max(...bounds.map((b) => b.bottom))) / 2,
      };
      const distances = seats.map((seat) => {
        const rect = seat.querySelector(".seat-identity")!.getBoundingClientRect();
        return {
          seat,
          distance: Math.hypot(
            handCenter.x - rect.x - rect.width / 2,
            handCenter.y - rect.y - rect.height / 2,
          ),
        };
      });
      const ownDistance = distances.find(({ seat }) => seat === owner)!.distance;
      if (distances.some(({ seat, distance }) => seat !== owner && distance < ownDistance - 1))
        errors.push(`Opponent cards are closer to another player: ${owner.dataset.seat}`);
    }
    const trick = document.querySelector(".trick-cards");
    const bidding =
      document.querySelector<HTMLElement>(".match-board")!.dataset.phase === "bidding";
    if (bidding && !document.querySelector(".bid-options"))
      errors.push("Prediction controls are missing");
    if (!bidding && !trick) errors.push("The current trick container is missing");
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
        ".seat-identity, .seat-avatar, .seat-name, .seat-status, [data-seat-stats], .seat-number, .hand .playing-card, .trick-cards .playing-card, .bid-options button, header a, header h2, header button, .seat-hand .playing-card",
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
        const minimum = element.closest("[data-revealed]") ? 40 : 24;
        if (parseFloat(getComputedStyle(element).width) < minimum - 0.5)
          errors.push(`Unreadable opponent card: ${label}`);
      }
      if (
        element.matches(".trick-cards .playing-card") &&
        parseFloat(getComputedStyle(element).width) < 39.5
      )
        errors.push(`Unreadable played card: ${label}`);
      if (element.matches(".seat-name, .seat-status, [data-seat-stats]")) {
        const text = document.createRange();
        text.selectNodeContents(element);
        for (const line of text.getClientRects()) {
          if (
            line.left < rect.left - 1 ||
            line.right > rect.right + 1 ||
            line.top < rect.top - 1 ||
            line.bottom > rect.bottom + 1
          )
            errors.push(`Clipped player text: ${label}`);
        }
      }
      {
        for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor);
          const clip = ancestor.getBoundingClientRect();
          const clipsX = /hidden|clip|scroll|auto/.test(style.overflowX);
          const clipsY = /hidden|clip|scroll|auto/.test(style.overflowY);
          if (
            (clipsX && (rect.left < clip.left - 1 || rect.right > clip.right + 1)) ||
            (clipsY && (rect.top < clip.top - 1 || rect.bottom > clip.bottom + 1))
          )
            errors.push(`Clipped content: ${label}`);
        }
      }
      if (element.matches("button, a") && !element.hasAttribute("disabled")) {
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        if (!hit || !element.contains(hit)) errors.push(`Covered control: ${label}`);
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
    const contour = document.querySelector<SVGGeometryElement>(".table-contour > path");
    const tableCoordinates = contour?.getScreenCTM()?.inverse();
    if (!contour || !tableCoordinates)
      errors.push("The table contour or its viewport transform is missing");
    if (contour && tableCoordinates) {
      for (const card of document.querySelectorAll(
        ".trick-cards .playing-card, .bid-options button",
      )) {
        const rect = card.getBoundingClientRect();
        const outsideFelt = [0, 1].some((x) =>
          [0, 1].some(
            (y) =>
              !contour.isPointInFill(
                new DOMPoint(
                  rect.left + rect.width * x,
                  rect.top + rect.height * y,
                ).matrixTransform(tableCoordinates),
              ),
          ),
        );
        if (outsideFelt)
          errors.push(`Card or prediction extends outside the felt: ${card.ariaLabel}`);
      }
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
    const geometry = {
      table: Object.fromEntries(
        [".table-arena", ".table-surface", ".play-table"].map((selector) => {
          const { x, y, width, height } = document.querySelector(selector)!.getBoundingClientRect();
          return [selector, { x, y, width, height }];
        }),
      ),
      seats: Object.fromEntries(
        seats.map((seat) => {
          const { x, y, width, height } = seat
            .querySelector(".seat-identity")!
            .getBoundingClientRect();
          return [
            seat.dataset.seat!,
            { centerX: x + width / 2, centerY: y + height / 2, width, height },
          ];
        }),
      ),
    };
    if (expected) {
      for (const [selector, before] of Object.entries(expected.table)) {
        for (const key of ["x", "y", "width", "height"] as const)
          if (Math.abs(geometry.table[selector][key] - before[key]) > 0.5)
            errors.push(`Table moved between configurations: ${selector} ${key}`);
      }
      for (const [id, before] of Object.entries(expected.seats)) {
        if (!geometry.seats[id]) {
          errors.push(`Seat disappeared between configurations: ${id}`);
          continue;
        }
        for (const key of ["centerX", "centerY", "width", "height"] as const)
          if (Math.abs(geometry.seats[id][key] - before[key]) > 0.5)
            errors.push(`Seat moved between configurations: ${id} ${key}`);
      }
    }
    return { errors, geometry };
  }, expected);
  expect(result.errors).toEqual([]);
  return result.geometry;
}

export async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: "image/png" });
}
