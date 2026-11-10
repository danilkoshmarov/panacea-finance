# Panacea Finance — architecture plan

## Product direction

Panacea Finance is developed web-first, then packaged as a native Windows desktop application. The web version remains useful on its own. The desktop build must reuse the same product UI and financial rules rather than becoming a separate implementation.

## Current baseline

- Static single-page HTML/CSS/JavaScript application.
- IndexedDB is the current local persistence layer.
- No server, account system, cloud sync, analytics, or multi-user features.
- JSON backup/restore is the portability and recovery mechanism.

## Target structure before desktop packaging

Move toward clear boundaries without introducing a framework just for structure:

- `src/core/`: pure financial calculations and validation; no DOM or storage access.
- `src/data/`: persistence contract and backup/restore logic.
- `src/data/web/`: IndexedDB implementation for the browser build.
- `src/ui/`: page rendering and user interactions.
- `src-tauri/`: desktop shell, permissions, native dialogs, and packaging configuration; add only when the web build is stable.

The exact folder layout may be adjusted during the refactor. Keep changes incremental and preserve a runnable web build.

## Persistence and migration rules

1. Financial calculations must not depend on IndexedDB or Tauri APIs.
2. The UI should call a small storage interface instead of using IndexedDB directly.
3. Keep IndexedDB for the web build.
4. For a future desktop build, choose its local persistence implementation only after a migration spike. SQLite is a candidate for structured local data, but is not a requirement yet.
5. Provide an explicit, validated migration path from existing browser data and JSON backups. Never assume browser IndexedDB will automatically appear in the desktop app's data directory.
6. Keep JSON export/import supported even after desktop packaging so the owner can move and recover their data.
7. Schema changes require versioned migrations and tests against existing backup shapes.

## Desktop target

Use Tauri 2 as the initial desktop candidate for Windows. It hosts the existing web UI in a system WebView and exposes native features through explicitly granted capabilities. Keep permissions minimal: initially only the native file dialogs needed for backup/restore. Do not grant shell, arbitrary filesystem, network, or updater permissions without a concrete requirement.

The desktop build should eventually provide:
- a Windows installer and executable;
- an app-specific local data location;
- native open/save dialogs for backups;
- a clear app version and update strategy;
- tested backup/restore and data migration.

## Delivery sequence

1. Audit and verify the current browser app.
2. Add tests for pure calculations, backup validation, and data transformations.
3. Split the monolithic file into small modules while keeping the web build working.
4. Introduce a storage interface and keep IndexedDB as the first adapter.
5. Run a small Tauri proof of concept with the existing frontend.
6. Decide whether desktop should continue using IndexedDB inside the WebView or move to SQLite. Compare reliability, migration complexity, backup behavior, and maintenance cost before choosing.
7. Build, test, and package Windows releases.

## Non-goals unless explicitly requested

- SaaS, accounts, subscriptions, cloud sync, multi-user access.
- A separate rewrite of the frontend in React or another framework.
- A premature database migration or broad permission set.
- Automatic merging or destructive changes to the main branch.
