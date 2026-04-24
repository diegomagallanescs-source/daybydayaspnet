# ASP.NET Core Web API — 25-Day Study Guide

A deployable, interactive study site covering 25 days of ASP.NET Core Web API fundamentals through enterprise patterns — mapped to real Microsoft Intune Compliance team concerns.

Each day has **four difficulty modes** (beginner → mid → advanced → enterprise), **flashcards** for concept recall, and a **coding challenge** per mode with toggle-able solutions.

- 25 days
- 100 coding challenges
- 388 flashcards
- 100 code examples
- Pure static site (HTML + CSS + JS) — deploys anywhere

---

## Topics

| # | Topic | Focus |
|---|-------|-------|
| 1 | ASP.NET Core Fundamentals | Program.cs, hosting model, WebApplication |
| 2 | Controllers & Routing | [ApiController], attribute routing, route constraints |
| 3 | HTTP Verbs & Status Codes | REST semantics, ActionResult<T>, status code hygiene |
| 4 | Model Binding & DTOs | [FromBody]/[FromQuery], record DTOs, validation pipeline |
| 5 | Entities, Enums & Domain Models | Anemic vs rich models, value objects, domain events |
| 6 | Dependency Injection | Lifetimes, constructor injection, factory patterns |
| 7 | Middleware Pipeline | Request/response flow, custom middleware, ordering |
| 8 | Configuration & Options | IConfiguration, IOptions, named options, Key Vault |
| 9 | Repository Pattern | Abstraction over EF, generic repos, specifications |
| 10 | Unit of Work & Service Layer | Thin controllers, rich services, transactional boundaries |
| 11 | EF Core Basics | DbContext, LINQ, tracking vs no-tracking, Include |
| 12 | EF Core Advanced | Migrations, Fluent API, concurrency, pooled contexts |
| 13 | Validation | DataAnnotations, FluentValidation, IValidatableObject |
| 14 | Error Handling | Exception middleware, IExceptionHandler, ProblemDetails |
| 15 | Logging | ILogger<T>, structured templates, Serilog, Activity |
| 16 | Authentication (JWT) | AddJwtBearer, claims, refresh tokens, Microsoft.Identity.Web |
| 17 | Authorization | Policies, handlers, resource-based, ABAC |
| 18 | Filters & Attributes | Action filters, ServiceFilter, global filters |
| 19 | Async/Await | Task vs ValueTask, CT propagation, Parallel.ForEachAsync |
| 20 | Caching | IMemoryCache, IDistributedCache, HybridCache, invalidation |
| 21 | Proxy & Decorator Patterns | Scrutor decorators, generic decorators, composition |
| 22 | Message Bus (Azure Service Bus) | Queues/topics, consumers, outbox pattern |
| 23 | Background Services | BackgroundService, PeriodicTimer, Channels, health checks |
| 24 | Unit Testing (xUnit + Moq) | AAA, FluentAssertions, SQLite for repos, IClock |
| 25 | Integration Testing & Deployment | WebApplicationFactory, test auth, Docker, Azure |

---

## Running Locally

The site is pure static HTML/CSS/JS — no build step required. Any static server works.

```bash
# Python 3 (already on most systems)
cd aspnetcore-25day-studyguide
python3 -m http.server 8080

# Or Node http-server
npx http-server -p 8080

# Or VS Code Live Server extension
```

Open `http://localhost:8080` and pick a day from the grid.

---

## Deploying

### GitHub Pages (free, recommended)

```bash
# 1. Create a repo on GitHub, push this folder
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<you>/aspnetcore-25day-studyguide.git
git push -u origin main

# 2. Settings → Pages → Source: Deploy from a branch → main → / (root) → Save
# Site available at https://<you>.github.io/aspnetcore-25day-studyguide/
```

### Netlify (free, drag-and-drop)

1. Go to [app.netlify.com/drop](https://app.netlify.com/drop)
2. Drag the entire `aspnetcore-25day-studyguide/` folder onto the page
3. Done — you'll get a random URL; customize under Site Settings

### Vercel (free)

```bash
npm i -g vercel
cd aspnetcore-25day-studyguide
vercel
# Follow prompts; accept defaults (framework: Other)
```

### Azure Static Web Apps (free tier)

```bash
# Install CLI
npm install -g @azure/static-web-apps-cli

# Deploy
cd aspnetcore-25day-studyguide
swa deploy --env production
# Opens browser to authenticate; creates resource and uploads
```

Or connect a GitHub repo via the Azure Portal (Static Web Apps → Create → GitHub source) for CI/CD on every push.

---

## Study Rhythm

Each day is designed for **30–60 minutes**:

- **10 min**: Read the overview + beginner mode, run through its flashcards
- **15 min**: Mid mode — read, flashcards, attempt the challenge before revealing the solution
- **15 min**: Advanced mode — same pattern
- **20 min**: Enterprise mode — this is where the real job lives; slow down here

**Retention tips:**
- Revisit flashcards from yesterday before starting today
- Every 5 days, skim all previous enterprise challenges
- Before your Microsoft start date, do a final pass of enterprise modes only — that's 25 scenarios closest to the actual work

**Progress tracking:** the site uses `localStorage` to remember which days you've marked complete. Data stays on your device.

---

## Project Structure

```
aspnetcore-25day-studyguide/
├── index.html              # Landing grid of 25 days
├── day.html                # Study page (loads by ?day=N)
├── css/
│   └── styles.css          # Complete design system
├── js/
│   ├── app.js              # Page orchestration, mode tabs, flashcard flip
│   └── components.js       # Render helpers + C# syntax highlighter
├── data/
│   ├── days-1-9.js         # Days 1–9 content
│   ├── days-10-17.js       # Days 10–17 content
│   ├── days-18-25.js       # Days 18–25 content
│   └── index.js            # Merges all into window.ALL_DAYS
├── .gitignore
└── README.md
```

All content lives in `data/days-*.js` — pure JavaScript data. Each day is an object with `modes.{beginner,mid,advanced,enterprise}`, each mode has `concept`, `codeExamples`, `flashcards`, `challenges`.

---

## Customizing

**Add a flashcard:** edit the relevant `data/days-*.js` file, add to the `flashcards` array of the right mode. No rebuild needed — just refresh.

**Add a challenge:** same pattern, add to the `challenges` array.

**Change the theme:** CSS variables live at the top of `css/styles.css` (`:root { --accent: ...; }`). Tweak colors there.

**Add more days:** extend a `DAYS_*` array, increment the count in `index.html`'s grid generation.

---

## Notes on Content Accuracy

Code samples target **.NET 8+** (with some **.NET 9** features noted where relevant — HybridCache, AddDecorator). API surface is current as of the `Microsoft.Extensions.*` and `EntityFrameworkCore` versions shipping with .NET 9.

Enterprise mode examples draw from patterns common in Microsoft Intune-style services: tenant scoping, Azure Service Bus outbox, Application Insights + Activity-based correlation, Microsoft.Identity.Web, EF Core pooled contexts with retry-on-failure.

---

## License

Personal study material. Copy, modify, fork freely.
