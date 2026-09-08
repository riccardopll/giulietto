# Local layout preview

Run `npm run dev`, then open `/preview` on the local server (for example,
`http://127.0.0.1:5184/preview`). The page is available only in development.

Switch between independent tables with 6, 5, 4, 3, or 2 players. Each table keeps
its state while you inspect another one. Nothing is written to D1 or the saved
live-game session.

- Use **Scenario** to jump to play, predictions, a trick win, round results, or a blind round.
- Set the initial hand size, choose a player to view, or try long names.
- Games start paused. You can play your cards and make predictions using the normal controls.
- **Next move** advances the current player or moves past a result.
- **Autoplay** advances the selected table every 1.8 seconds and restarts it when finished.
- **Reset table** restores the selected scenario. Reloading restores all five tables.

The preview uses the real game rules and UI. Countdowns are frozen between moves
so the page remains available for layout inspection.
