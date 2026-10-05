/**
 * Routes worth having offline. The Android app ships no bundled pages (the site is
 * server-rendered, so a static export is not possible), which means offline support depends
 * entirely on what gets cached while online. Used both by the automatic warm-up after sign-in
 * and by the manual "save for offline" control in Settings.
 */
export const OFFLINE_ROUTES = [
  "/dashboard",
  "/alarms",
  "/reminders",
  "/focus",
  "/planner",
  "/notes",
  "/flashcards",
  "/past-papers",
  "/exam-marks",
  "/mistakes",
  "/questions",
  "/analytics",
  "/downloads",
  "/profile",
];
