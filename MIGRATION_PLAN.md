# BioPulse Migration Plan
## From Monolithic PWA → Next.js AI Study Platform

---

## Migration Strategy

```
old app (index.html, 146KB monolith)
    ↓
feature extraction (identify each logical module)
    ↓
new architecture (Next.js + TypeScript + Prisma)
    ↓
feature verification (each module works independently)
    ↓
old implementation retirement (keep backup until verified)
```

---

## Feature Migration Map

### TIER 1 — Migrate in Phase 1 (NOW)

| Feature | Old Location | New Location | Action | Priority |
|---------|-------------|-------------|--------|----------|
| **Alarm data model** | `defaults().alarms[]` (line 847) | `db/schema.prisma` → `Alarm` model | **REDESIGN** — typed with UUID, FK to User/Subject | HIGH |
| **Alarm creation form** | `#alarmForm` HTML (lines 421-446) + submit handler (lines 1238-1256) | `features/alarms/components/AlarmForm.tsx` | **REDESIGN** — React form with Zod validation | HIGH |
| **Alarm list rendering** | `renderAlarms()` (lines 1179-1202) + event handlers (lines 1204-1229) | `features/alarms/components/AlarmList.tsx` | **REDESIGN** — React component | HIGH |
| **Alarm scheduling/firing** | `alarmTick()` (lines 1572-1600) + `nextOccurrenceFor()` (lines 1166-1177) | `features/alarms/lib/scheduler.ts` | **KEEP** logic, wrap in TypeScript | HIGH |
| **Alarm popup/overlay** | `apShow/Dismiss/Snooze` (lines 1358-1459) + `processQueue()` (lines 1461-1528) | `features/alarms/components/AlarmPopup.tsx` | **REDESIGN** — React portal overlay | HIGH |
| **Alarm sound engine** | `AudioEngine.play()` (lines 903-907) + `apPlayTone()` (lines 1393-1414) | `features/alarms/lib/audio-engine.ts` | **KEEP** logic, TypeScript module | HIGH |
| **Custom sounds (IndexedDB)** | `SoundDB` (lines 917-935) + `playCustomRing()` (lines 946-953) | `services/sound-service.ts` | **KEEP** logic, service abstraction | HIGH |
| **Pomodoro state model** | `defaults().live{}` + `settings.pomodoro{}` | `db/schema.prisma` → `PomodoroSession` | **REDESIGN** — persistent sessions | HIGH |
| **Pomodoro timer logic** | `pomTick/StartPause/Reset/Skip` (lines 1637-1732) | `features/pomodoro/lib/timer-engine.ts` | **KEEP** logic, TypeScript module | HIGH |
| **Pomodoro SVG ring** | `setRing()` (line 1640) + SVG HTML (lines 500-505) | `features/pomodoro/components/TimerRing.tsx` | **REDESIGN** — React SVG component | HIGH |
| **Marks data model** | `defaults().marks[]` | `db/schema.prisma` → `MarkRecord` model | **REDESIGN** — typed with UUID, FK | HIGH |
| **Marks logging form** | `#markForm` submit (lines 1809-1817) | `features/marks/components/MarkForm.tsx` | **REDESIGN** — React form | HIGH |
| **Grade calculations** | `pctOf/avg/slopeOf/stdev/gradeOf` (lines 1136, 1882-1887) | `features/marks/lib/grade-math.ts` | **KEEP** logic, pure TypeScript | HIGH |
| **Trend chart** | `renderCharts()` trend section (lines 1840-1852) | `features/marks/components/TrendChart.tsx` | **REDESIGN** — Recharts | HIGH |
| **Radar chart** | `renderCharts()` radar section (lines 1854-1866) | `features/marks/components/RadarChart.tsx` | **REDESIGN** — Recharts | HIGH |
| **Predictive grades** | `renderPredictor()` (lines 1889-1922) | `features/marks/components/PredictorTable.tsx` | **REDESIGN** — React table | HIGH |
| **AI coach rules** | `computeAdvice()` (lines 1925-1963) — 7 rules | `services/ai/rule-engine.ts` | **KEEP** rules, behind `AICoachService` | HIGH |
| **AI coach UI** | `renderCoach()` (lines 1965-1972) | `features/ai/components/CoachInsights.tsx` | **REDESIGN** — React cards | HIGH |
| **Dashboard stats** | `renderDashboardStats()` + `renderDashboard()` | `app/(app)/dashboard/page.tsx` | **REDESIGN** — React page | HIGH |
| **Navigation** | `showView()` + `bindNav()` (sidebar links) | `components/layout/Sidebar.tsx` | **REDESIGN** — Next.js routing | HIGH |
| **App shell/layout** | `<div class="app">` + sidebar + topbar (HTML lines 58-86) | `app/(app)/layout.tsx` | **REDESIGN** — React layout | HIGH |
| **Theme/colors** | CSS variables `:root{}` (lines 18-35) | `tailwind.config.ts` + `globals.css` | **REDESIGN** — Tailwind tokens | HIGH |
| **Toast notifications** | `toast()` (lines 995-1013) | `components/ui/sonner.tsx` | **REPLACE** — use Sonner library | HIGH |
| **localStorage persistence** | `DB.load/save()` (lines 858-883) | `services/storage/local-storage.ts` | **REDESIGN** — StorageService abstraction | HIGH |
| **Profile state** | `defaults().profile{}` | `db/schema.prisma` → `Profile` model | **REDESIGN** — DB-backed | HIGH |

### TIER 2 — Migrate in Phase 2

| Feature | Old Location | New Location | Action | Priority |
|---------|-------------|-------------|--------|----------|
| **Browser notifications** | `safeNotify()` (lines 1015-1047) | `services/notification/browser-provider.ts` | **KEEP** behind `NotificationProvider` | MEDIUM |
| **Telegram push** | `sendTelegram()` (lines 1003-1012) | `services/notification/telegram-provider.ts` | **KEEP** behind `NotificationProvider` | MEDIUM |
| **ntfy.sh push** | ntfy section (lines 2081-2090, 1499-1500) | `services/notification/ntfy-provider.ts` | **KEEP** behind `NotificationProvider` | MEDIUM |
| **TTS/Speech** | `Speech.speak/refresh()` (lines 977-992) | `services/speech/speech-service.ts` | **KEEP** behind `SpeechService` | MEDIUM |
| **Phone Alert Mode** | `KeepAlive` object (lines 1096-1131) | `services/alert/keep-alive.ts` | **KEEP** logic, service module | MEDIUM |
| **BioCloud sync** | `CLOUD` object (lines 2341-2398) + `ingestDoc()` (lines 2400-2425) | `services/sync/cloud-sync.ts` | **REPLACE** — proper backend sync | MEDIUM |
| **Topic tracker** | `renderTopics()` + `scheduleReviews()` | `features/topics/` (new module) | **DEFER** to Phase 2 | MEDIUM |
| **Spaced repetition** | `scheduleReviews()` (lines 1757-1762) | `features/topics/lib/spaced-rep.ts` | **DEFER** to Phase 2 | MEDIUM |
| **Hydration reminders** | `pomTick()` hydration check (lines 1689-1694) | `features/pomodoro/lib/hydration.ts` | **KEEP** logic | MEDIUM |
| **Session logging** | `state.sessions[]` + `renderSessions()` | `db/schema.prisma` → `StudySession` | **REDESIGN** — DB-backed | MEDIUM |
| **Weekly stats** | `weekMinutes()` + weekly strip chart | `features/analytics/weekly-stats.ts` | **REDESIGN** — React component | MEDIUM |
| **Data export/import** | `#exportBtn` / `#importBtn` (lines 2285-2308) | `features/settings/components/DataVault.tsx` | **KEEP** logic | MEDIUM |
| **Demo data seeding** | `seedDemo()` (lines 2309-2336) | `lib/seed.ts` | **KEEP** logic | MEDIUM |
| **Settings form** | All settings bindings (lines 2052-2295) | `app/(app)/settings/page.tsx` | **REDESIGN** — React forms | MEDIUM |

### TIER 3 — Defer to Later Phases

| Feature | Old Location | New Location | Action | Priority |
|---------|-------------|-------------|--------|----------|
| **Syllabus tracking** | N/A (new) | `features/syllabus/` | **DEFER** | LOW |
| **Question bank** | N/A (new) | `features/questions/` | **DEFER** | LOW |
| **Flashcards** | N/A (new) | `features/flashcards/` | **DEFER** | LOW |
| **Diagram lab** | N/A (new) | `features/diagrams/` | **DEFER** | LOW |
| **Study planner** | N/A (new) | `features/planner/` | **DEFER** | LOW |
| **Mistake book** | N/A (new) | `features/mistakes/` | **DEFER** | LOW |
| **Exam simulator** | N/A (new) | ~~`features/simulator/`~~ | **REMOVED** | LOW |
| **Past papers** | N/A (new) | `features/past-papers/` | **DEFER** | LOW |
| **Notes** | N/A (new) | `features/notes/` | **DEFER** | LOW |
| **AI tutor (LLM)** | N/A (new) | `services/ai/llm-provider.ts` | **DEFER** | LOW |
| **Gamification** | N/A (new) | `features/gamification/` | **DEFER** | LOW |
| **Auth (login/signup)** | N/A (new) | `app/(auth)/` | **DEFER** | LOW |

---

## Data Model Migration

### Old State Shape (localStorage)
```js
{
  profile: { name, examDate, targetGrade, revHours, dailyHr },
  alarms: [{ id, kind, time, fireAt, label, subjectId, priority, sound, tts, days, enabled, fired, lastFired, snoozeCount, reviewTopicId }],
  topics: [{ id, subjectId, name, estHours, reviewTime, reviewsDone, createdAt }],
  marks: [{ id, subjectId, type, score, total, date }],
  sessions: [{ id, subjectId, minutes, end }],
  fired: { "alarmId@date": timestamp },
  settings: { sound, ttsOn, voiceName, rate, pitch, keepAlive, telegram, ntfy, pomodoro, hydration },
  live: { running, phase, endTs, pausedMs, cyclesDone, setDone, lastHyd },
  cloud: { code, device, auto, lastSync }
}
```

### New Prisma Schema (Phase 1 subset)
```
User → Profile (1:1)
User → Alarm (1:N)
User → StudySession (1:N)
User → MarkRecord (1:N)
Subject (reference table, seeded)
```

### Migration Strategy for localStorage → DB
1. Create `StorageService` abstraction with `LocalStorageProvider` implementing current behavior
2. New features use Prisma/DB directly
3. When auth is added, data migrates from localStorage to DB on first login
4. Keep `LocalStorageProvider` as fallback for unauthenticated usage

---

## What to Preserve (KEEP)

| Item | Why |
|------|-----|
| Alarm scheduling algorithm | Complex time-matching + dedup logic works correctly |
| Pomodoro timer engine | Battle-tested state machine with pause/resume/skip |
| Audio engine (Web Audio synthesis) | No external dependencies, works offline |
| Grade calculation math | Correct statistical functions (slope, stdev, grade bands) |
| AI coach rule engine | 7 diagnostic rules produce actionable insights |
| IndexedDB sound storage | Works offline, handles binary blobs correctly |
| Service Worker alarm delivery | Critical for background alarm reliability |
| Telegram/ntfy HTTP push | Simple, reliable notification channels |
| KeepAlive wake lock + silent audio | Android-specific reliability hack that works |
| Custom sound upload/record | Full pipeline (upload → IndexedDB → playback) |

## What to Redesign

| Item | Why |
|------|-----|
| All HTML → React components | Type safety, reactivity, maintainability |
| CSS → Tailwind CSS | Utility-first, dark mode, consistent design system |
| Global state → Zustand stores | Scoped state, no prop drilling |
| DOM manipulation → React rendering | Declarative updates, no manual DOM |
| inline JS → TypeScript modules | Type safety, IDE support, testability |
| localStorage → Prisma/DB | Relational data, multi-user, queryable |
| Single file → feature modules | Separation of concerns, code splitting |

## What to Replace

| Item | Why |
|------|-----|
| `toast()` custom → Sonner library | Battle-tested, accessible, animated |
| Chart.js CDN → Recharts | React-native, tree-shakeable, better DX |
| `$()` selector → React refs + hooks | Standard React patterns |
| Custom `$()` wrapper → N/A | No longer needed |

---

## Phase 1 Scope (This Implementation)

### IN SCOPE
- [x] MIGRATION_PLAN.md
- [ ] Next.js 14 project scaffold
- [ ] TypeScript configuration
- [ ] Tailwind CSS + design tokens
- [ ] Prisma schema (User, Profile, Subject, Alarm, StudySession, MarkRecord)
- [ ] Application shell (sidebar, topbar, mobile nav)
- [ ] Page stubs with empty states (all 15 navigation items)
- [ ] Alarms feature (complete proof-of-concept migration)
- [ ] Service abstractions (AI, Notifications, Speech, Storage)
- [ ] Error handling foundation
- [ ] Testing setup (Vitest)
- [ ] Environment configuration

### OUT OF SCOPE
- Full Pomodoro migration (Phase 2)
- Full Marks/Analytics migration (Phase 2)
- Auth implementation
- Real database connection
- AI LLM integration
- Syllabus, Questions, Flashcards, etc.

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Breaking old app during extraction | Keep original files untouched, work in new directory |
| Prisma schema won't match old data | Schema designed to accommodate all old fields |
| Next.js build fails on Windows | Use cross-platform tooling, test early |
| Design system inconsistency | Single source of truth in Tailwind config |
| Feature regression | Each migrated feature gets unit tests |

---

## Timeline

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Phase 1 | Now | Foundation + Alarms migrated |
| Phase 2 | Next | Pomodoro + Marks + Notifications |
| Phase 3 | Later | Topics + AI + Settings |
| Phase 4 | Future | New features (syllabus, questions, etc.) |
