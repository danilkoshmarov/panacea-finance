# Panacea Finance — instructions for AI agents

## Product purpose
This is a personal finance and decision-support tool for one person. Optimize for the owner's real workflows, clarity, correctness, and ease of maintenance. Do not add multi-user features, accounts, subscriptions, analytics tracking, cloud sync, or commercial SaaS infrastructure unless the owner explicitly asks.

## Product priorities
1. Protect the owner's financial records and make backups/restores dependable.
2. Make calculations transparent, traceable, and easy to verify.
3. Support personal cash flow, savings goals, relocation planning, and the owner's business experiments (resale, web development, marketplace pickup points, P2P).
4. Keep the interface fast, understandable, and comfortable on mobile and desktop.
5. Avoid overengineering. A feature is valuable when it helps the owner make a better decision or saves real time.

## Technical baseline
- Current app is a static, single-page HTML/CSS/JavaScript application.
- Data is stored locally in IndexedDB through `src/data/indexeddb.js`; UI code must use the adapter API rather than opening IndexedDB transactions directly. There is intentionally no server and no cloud synchronization.
- Keep the app easy to run as a static site. Do not add a framework, build system, database service, or dependency without explaining the concrete benefit and maintenance cost first.
- Reuse established browser APIs and well-maintained libraries when they materially improve reliability; do not reinvent complex infrastructure.
- Keep money calculations explicit. Distinguish revenue, expenses, cash balance, profit, margin, and transfers. Transfers between the owner's accounts are not income or expenses.
- Validate imported data before writing it. Multi-store imports must be atomic so a failed restore cannot leave a half-empty database.
- Treat local backup files as untrusted input. Validate shapes, types, IDs, references, dates, and numeric ranges; escape user-controlled content before rendering HTML.
- Never silently discard existing data. Destructive actions need a clear confirmation.
- Preserve compatibility with existing IndexedDB records and exported backups. If a schema change is necessary, provide a migration and test it against the current data shape.

## Engineering workflow
- Inspect the existing implementation and relevant documentation before editing.
- Research established solutions and current browser/platform guidance before introducing a dependency or custom abstraction.
- Work on a feature branch. Do not push directly to main, force-push, or delete user data.
- Make focused changes with clear commit messages.
- Run available checks and tests. If browser execution or automated tests are unavailable, state exactly what was and was not verified.
- Review the diff for regressions, especially around balances, transfers, backup import/export, and date handling.
- Explain trade-offs plainly. If an idea is technically fragile or economically pointless, say so and offer a better option.

## Scope discipline
The owner is the primary user, not an imagined mass market. Do not optimize for hypothetical customers at the expense of the owner's workflow. Commercialization, multi-tenant security, and SaaS readiness are out of scope unless explicitly requested.
