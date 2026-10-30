# Sensation Systems EPIMS

Production, inventory, quality and purchasing in one system: orders come in from Marketing, Operations approves them, Store issues material, Production builds, QC tests, Store dispatches, and Marketing bills.

| Part | Stack | Folder |
|---|---|---|
| API | Node 20+, Express 5, MySQL (`mysql2`), JWT in an httpOnly cookie | [backend/](backend/) |
| Web app | React 19, Vite, Redux Toolkit (RTK Query), Tailwind 4, shadcn-style components | [frontend/](frontend/) |

## Getting started

```bash
# 1. API
cd backend
cp .env.example .env          # fill in DB_* and JWT_SECRET
npm install
npm run db:setup              # empty database: schema + baseline + seed data
npm run migrate               # existing database: apply new migrations only
npm run super-admin           # create the first login
npm run dev                   # http://localhost:5000

# 2. Web app (second terminal)
cd frontend
cp .env.example .env          # defaults work for local development
npm install
npm run dev                   # http://localhost:5173
```

To try the UI without a backend, set `VITE_DATA_MODE=mock` in `frontend/.env`. Every request is then answered in the browser from [frontend/src/api/mock/](frontend/src/api/mock/).

## Configuration

Environment config lives outside the code, in `.env` files that are never committed. Each side has one module that reads them; the rest of the code imports from that module.

| Side | Template | The only reader | Notes |
|---|---|---|---|
| API | [backend/.env.example](backend/.env.example) | [backend/src/config/env.js](backend/src/config/env.js) | Fails fast at startup when a required variable is missing |
| Web | [frontend/.env.example](frontend/.env.example) | [frontend/src/config/env.js](frontend/src/config/env.js) | Only `VITE_*` variables reach the browser |

Adding a setting: put it in `.env.example` with a comment, read it in `config/env.js`, then import `env` where you need it. Do not read `process.env` / `import.meta.env` anywhere else.

## Departments

Business code is grouped by **department**, with the same names on both sides:

| Department | Backend `src/<dept>/` and frontend `src/<dept>/` |
|---|---|
| `core/` | login, super admins, activity feed, notifications, push, reports / order tracker, dashboards shell, public site |
| `sales/` | marketing orders, order approvals (Operations Admin), approved orders, orders, customers, billing |
| `purchase/` | purchase orders, IQC, incoming stock (frontend `purchase/shared/` = pieces used across purchase screens) |
| `store/` | component inventory, products + BOM, product stock, material requests, extra materials, store status |
| `production/` | production runs, quality control, finished goods, repairs |
| `people/` | employees, attendance |

Each frontend department also has `dashboards/` for its roles' home screens (`sales/dashboards/MarketingView.jsx`...).
Code shared by everyone stays outside the departments: backend `config/ middleware/ shared/ routes/ realtime/ database/`,
frontend `api/ app/ components/ lib/ config/ realtime/ test/`. A department may import another department's files
(an order screen shows stock), but anything used by **many** departments belongs in `components/` or `lib/`.

## Backend layout

```
backend/
  server.js                 process entry: validate config, listen, graceful shutdown
  src/
    app.js                  builds the Express app (used by server.js and tests)
    config/                 env.js, db.js (connection pool), cors.js
    routes/index.js         THE route table: every module, its mount path and its permission guard
    <department>/<module>/  core, sales, purchase, store, production, people (see Departments)
      <name>.routes.js        URL -> controller, per-route middleware
      <name>.controller.js    reads req, calls the service, writes res. No SQL, no try/catch
      <name>.service.js       business rules + SQL. Throws AppError for expected failures
    middleware/             auth, permissions, error handling, live-update broadcast
    shared/                 AppError, validators, idempotency, request context, session
    realtime/               server-sent events hub (live refresh in open browsers)
    database/
      schema.sql            full schema for a fresh database
      migrations/           numbered .sql changes, applied once each by `npm run migrate`
      setup_data/           seed data (`npm run seed`)
    scripts/                CLI helpers (create a user / super admin)
  tests/                    vitest: *.test.js (fake DB), mysql/*.mysql.js (real MySQL), e2e/
```

### API structure

- Every endpoint lives under **`/api/v1`**. The unversioned `/api` prefix still works for older clients. A breaking change goes under a new `/api/v2` prefix next to v1, not into v1.
- `GET /api/v1/health` checks the database, for uptime monitors.
- **Adding a module:** create `<department>/<module>/{<name>.routes,<name>.controller,<name>.service}.js` and add one entry to `MODULES` in [routes/index.js](backend/src/routes/index.js). That entry sets the path, the login and permission guards, and the activity-feed resource name.

### Error handling

One path for every failure, so every error response has the same JSON shape: `{ message, code?, ...extra }`.

1. **Services** throw `AppError` for expected failures, such as `throw new AppError(422, "Quantity is required", "VALIDATION")`. See [shared/AppError.js](backend/src/shared/AppError.js).
2. **Controllers** are wrapped in `asyncHandler(fn, { message })`, so they contain no try/catch. The `message` is what the user sees if something unexpected breaks.
3. **[middleware/errorHandler.js](backend/src/middleware/errorHandler.js)** maps known MySQL errors (duplicate entry → 409, missing reference → 400, and others), logs real 500s with their cause, and never leaks internals.
4. **[server.js](backend/server.js)** logs unhandled rejections and exits on uncaught exceptions, so the process manager restarts a clean process.

### Database migrations

- New change: add `backend/src/database/migrations/NNN_short_description.sql` with the next free number (currently **045**) in `snake_case`, then run `npm run migrate`.
- **Never rename or edit a migration that has been merged.** Applied migrations are recorded by **file name** in `schema_migrations`, so a renamed file runs again on every existing database. That is why some old files share a number or have odd names (`002_...sql.sql`, `011-...`). They stay as they are.
- `npm run schema:check` builds a throw-away database from `schema.sql` and compares it with your live one. When you add a migration, update `schema.sql` too (`npm run schema:dump`).

## Frontend layout

```
frontend/src/
  main.jsx, App.jsx         entry, router, error boundaries, providers
  app/
    routes.jsx              THE page table: URL, permission module, lazy page, tab title
    store.js                Redux store
  config/env.js             environment settings
  api/
    api.js                  the one axios instance (cookies, base URL, role header, mock mode)
    baseApi.js              RTK Query root; features inject their endpoints into it
    mock/                   in-browser backend for VITE_DATA_MODE=mock
  <department>/<feature>/   core, sales, purchase, store, production, people (see Departments)
    <Name>.jsx                the page
    <name>Api.js              RTK Query endpoints: data shown on screen (cached, auto-refreshed)
    <name>Service.js          one-off requests and business helpers (submit, import, export)
    components/               pieces used only by this feature
    hooks/                    hooks used only by this feature
  <department>/dashboards/  the home screen of each role in that department
  components/               reusable UI shared across departments
    ui/                       base primitives (button, card, input, table...)
    PageKit, PageHeader, Modal, ErrorBanner, ErrorBoundary, Pagination, SearchBar...
  lib/                      framework-free helpers: formatting, numbers, CSV/XLSX, permissions, URL state
  realtime/                 LiveSync: server events -> RTK Query cache invalidation
  test/                     render helpers and the fake API for vitest
```

### Where logic goes

| Kind of code | Goes in | Not in |
|---|---|---|
| Fetching and caching server data | `<feature>/<name>Api.js` (RTK Query) | `useEffect` + `useState` in the page |
| Write requests, imports, multi-step flows | `<feature>/<name>Service.js` or `*Flow.js` | inline in JSX handlers |
| Pure calculations (stock, money, dates) | `lib/` or `<feature>/*Utils.js` | components |
| Rendering and local UI state | components | services |

Components never import `api/api.js` directly. They use a feature's `*Api.js` hook or `*Service.js` function.

### State management

- **Server state** (orders, stock, users...) lives in the **RTK Query** cache ([api/baseApi.js](frontend/src/api/baseApi.js)). Every list is tagged, so a mutation invalidates the right tags and open screens refetch. Changes made by *other* users arrive over server-sent events: [realtime/LiveSync.jsx](frontend/src/realtime/LiveSync.jsx) invalidates the matching tags.
- **URL state** (filters, tabs, search) uses [lib/useUrlState.js](frontend/src/lib/useUrlState.js), so a refresh or a shared link keeps the view.
- **Local UI state** (an open modal, a form draft) stays in component `useState`. To reset it when a prop changes (a dialog opening, a filter changing), use [lib/useChanged.js](frontend/src/lib/useChanged.js) during render: `if (useChanged(open) && open) setQty("")`. Don't use a `useEffect` that calls `setState`; ESLint rejects it.
- There is no global client-state slice. Add a Redux slice to [app/store.js](frontend/src/app/store.js) only for state that several unrelated screens share and that does not come from the server.

### Error handling

- **Request errors**: RTK Query hooks return `error`. Pages show it with `<ErrorBanner onRetry={...}>`. Actions show a toast (`useToast()`).
- **Render crashes**: [components/ErrorBoundary.jsx](frontend/src/components/ErrorBoundary.jsx) wraps every page (reset on navigation) and the whole app, so one broken screen never blanks the app. A page file missing after a new release offers "Reload".
- **Double submits**: [lib/useIdempotentSubmit.js](frontend/src/lib/useIdempotentSubmit.js) sends an idempotency key that the API honours.

### Adding a page

1. Create `<department>/<feature>/<Name>.jsx` (and `<name>Api.js` for its data).
2. Add one line to `PAGES` in [app/routes.jsx](frontend/src/app/routes.jsx).
3. Add the sidebar entry in [components/Layout.jsx](frontend/src/components/Layout.jsx) and the permission module in [lib/permissions.js](frontend/src/lib/permissions.js).

## Naming conventions

| What | Convention | Example |
|---|---|---|
| Department / module folders | kebab-case, plural business noun | `sales/marketing-orders/` |
| Backend files | `<singular>.<layer>.js` | `marketing-order.service.js` |
| React components / pages | PascalCase `.jsx`, one component per file | `OrderDrawer.jsx` |
| Hooks | `useThing.js` | `useUrlState.js` |
| Feature data / logic files | camelCase + role suffix | `ordersApi.js`, `ordersService.js` |
| SQL tables and columns | snake_case | `production_orders.created_by` |
| JSON over the API | snake_case for new fields (older endpoints also accept a few camelCase ones, such as `productId`; keep those working) | `{ order_id, required_by }` |
| Migrations | `NNN_snake_case.sql` | `045_add_invoice_notes.sql` |

## Scripts

| Where | Command | Does |
|---|---|---|
| backend | `npm run dev` | API with auto-restart |
| backend | `npm test` | unit and service tests (fake DB, no MySQL needed) |
| backend | `npm run test:mysql` | service tests on a throw-away MySQL database. Run after any SQL, schema or API-input change |
| backend | `npm run e2e` | the whole order flow on a throw-away copy of the database (slow, needs MySQL) |
| backend | `npm run migrate` | apply new migrations |
| backend | `npm run db:save` / `db:load` / `db:list` | snapshot and restore test data |
| backend | `npm run seed:demo` | fill a demo copy of the database |
| frontend | `npm run dev` / `build` / `preview` | Vite |
| frontend | `npm test` | component and page tests (vitest + Testing Library) |
| frontend | `npm run lint` | ESLint |

More detail on the order planning endpoints: [backend/docs/ORDER_PLAN_API.md](backend/docs/ORDER_PLAN_API.md).
