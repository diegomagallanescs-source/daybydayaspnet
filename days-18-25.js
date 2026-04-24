/* ============================================================
   data/days-18-25.js — Days 18-20 so far; more added in later passes
   ============================================================ */

const DAYS_18_25 = [

/* ====================== DAY 18 ====================== */
{
  id: 18, day: 18,
  title: "Filters & Attributes",
  subtitle: "Cross-cutting MVC concerns via the filter pipeline.",
  overview: "Authorization, Resource, Action, Exception, and Result filters — when and which to reach for.",
  csharpFocus: "Attributes, DI via TypeFilter/ServiceFilter, filter order.",
  modes: {
    beginner: {
      concept: "Filters run around action methods in the MVC pipeline. Five types: Authorization (first), Resource (before model binding), Action (before/after the method), Exception (on error), Result (before/after result execution). You've already used [Authorize] — it's an authorization filter. Custom filters let you share logic across many actions without inheritance.",
      codeExamples: [{
        title: "Attribute-based action filter",
        lang: "csharp",
        code: `public class LogActionAttribute : ActionFilterAttribute
{
    public override void OnActionExecuting(ActionExecutingContext ctx)
    {
        var action = ctx.ActionDescriptor.DisplayName;
        Console.WriteLine($"-> {action} starting");
    }

    public override void OnActionExecuted(ActionExecutedContext ctx)
    {
        var action = ctx.ActionDescriptor.DisplayName;
        Console.WriteLine($"<- {action} done");
    }
}

[LogAction]
[HttpGet]
public IActionResult Get() => Ok();`,
        explanation: "ActionFilterAttribute has OnActionExecuting (pre) and OnActionExecuted (post) hooks. Attach as an attribute — no DI here, so it's fine for simple logging."
      }],
      flashcards: [
        { front: "Filter types?", back: "Authorization, Resource, Action, Exception, Result — in that pipeline order." },
        { front: "ActionFilterAttribute hooks?", back: "OnActionExecuting (before), OnActionExecuted (after). Async variants for async work." },
        { front: "Filter vs middleware?", back: "Middleware is app-wide, pre-MVC. Filters are MVC-specific and have access to ActionContext (model, result)." },
        { front: "Attribute filters can't use DI?", back: "They can't have constructor injection. Use TypeFilter/ServiceFilter (Day 18 advanced) to get DI." }
      ],
      challenges: [{
        title: "Simple action filter",
        difficulty: "Warm-up",
        prompt: "Write StopwatchAttribute that logs action duration.",
        starterCode: `// TODO`,
        solution: `public class StopwatchAttribute : ActionFilterAttribute
{
    private Stopwatch _sw = null!;

    public override void OnActionExecuting(ActionExecutingContext ctx)
    {
        _sw = Stopwatch.StartNew();
    }

    public override void OnActionExecuted(ActionExecutedContext ctx)
    {
        _sw.Stop();
        var action = ctx.ActionDescriptor.DisplayName;
        Console.WriteLine($"{action} took {_sw.ElapsedMilliseconds}ms");
    }
}

[Stopwatch]
[HttpGet]
public IActionResult Get() => Ok();`,
        explanation: "Field persists across the two hooks because attribute instances are per-action. For DI-based logging, use ServiceFilter (advanced).",
        hint: "Stopwatch field; start in Executing, stop in Executed."
      }]
    },
    mid: {
      concept: "Async filters implement IAsyncActionFilter. More common for real work. Return early by setting context.Result to short-circuit the action. Filters are useful for enforcing invariants (throttling, idempotency, audit logging) that otherwise would duplicate across actions.",
      codeExamples: [{
        title: "Async filter with short-circuit",
        lang: "csharp",
        code: `public class IdempotencyFilter : IAsyncActionFilter
{
    private readonly IMemoryCache _cache;

    public IdempotencyFilter(IMemoryCache cache) { _cache = cache; }

    public async Task OnActionExecutionAsync(
        ActionExecutingContext ctx, ActionExecutionDelegate next)
    {
        if (!ctx.HttpContext.Request.Headers.TryGetValue(
                "Idempotency-Key", out var key))
        {
            await next();
            return;
        }

        if (_cache.TryGetValue(key.ToString(), out IActionResult? cached))
        {
            ctx.Result = cached;   // short-circuit
            return;
        }

        var executed = await next();   // run the action
        if (executed.Result is ObjectResult result)
        {
            _cache.Set(key.ToString(), result, TimeSpan.FromMinutes(5));
        }
    }
}`,
        explanation: "Setting ctx.Result skips the action entirely. next() returns ActionExecutedContext so you can inspect what the action produced. Perfect for idempotency, rate limiting, response caching."
      }],
      flashcards: [
        { front: "Short-circuit a filter?", back: "Set ctx.Result before calling next(). Framework skips the action and returns your result." },
        { front: "Async filter interface?", back: "IAsyncActionFilter / IAsyncResourceFilter / IAsyncExceptionFilter / IAsyncResultFilter / IAsyncAuthorizationFilter." },
        { front: "When resource vs action filter?", back: "Resource runs BEFORE model binding — good for caching entire responses. Action runs AFTER binding — has the parsed model." },
        { front: "Filter order?", back: "Global → controller → action. Within a scope, by Order property (lower runs first)." }
      ],
      challenges: [{
        title: "Async rate limit filter",
        difficulty: "Mid",
        prompt: "IAsyncActionFilter that checks IRateLimiter.AllowAsync(userId); return 429 if not allowed.",
        starterCode: `public interface IRateLimiter { Task<bool> AllowAsync(string userId); }`,
        solution: `public class RateLimitFilter : IAsyncActionFilter
{
    private readonly IRateLimiter _limiter;
    public RateLimitFilter(IRateLimiter limiter) { _limiter = limiter; }

    public async Task OnActionExecutionAsync(
        ActionExecutingContext ctx, ActionExecutionDelegate next)
    {
        var userId = ctx.HttpContext.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (userId is not null && !await _limiter.AllowAsync(userId))
        {
            ctx.Result = new StatusCodeResult(StatusCodes.Status429TooManyRequests);
            return;
        }

        await next();
    }
}`,
        explanation: "Short-circuit with 429 when limiter says no; otherwise let the action run. DI via constructor works because this filter is registered via ServiceFilter (see advanced).",
        hint: "Short-circuit by setting ctx.Result; otherwise await next()."
      }]
    },
    advanced: {
      concept: "Filters with DI need TypeFilter or ServiceFilter. [TypeFilter(typeof(MyFilter))] constructs with DI per action (new instance each time). [ServiceFilter(typeof(MyFilter))] resolves from the container (must register). ServiceFilter is preferred for scoped dependencies; TypeFilter for transient filters with constructor args.",
      codeExamples: [{
        title: "ServiceFilter vs TypeFilter",
        lang: "csharp",
        code: `// Register the filter
builder.Services.AddScoped<IdempotencyFilter>();

// ServiceFilter — resolved from DI
[ServiceFilter(typeof(IdempotencyFilter))]
[HttpPost]
public IActionResult Create([FromBody] CreateRequest req) => Ok();

// TypeFilter — new instance per request, DI-aware
[TypeFilter(typeof(AuditFilter), Arguments = new object[] { "orders" })]
[HttpPost("{id:guid}/approve")]
public IActionResult Approve(Guid id) => Ok();

public class AuditFilter : IAsyncActionFilter
{
    private readonly IAuditLog _audit;
    private readonly string _resource;

    public AuditFilter(IAuditLog audit, string resource)
    {
        _audit = audit;
        _resource = resource;
    }

    public async Task OnActionExecutionAsync(
        ActionExecutingContext ctx, ActionExecutionDelegate next)
    {
        var userId = ctx.HttpContext.User.FindFirstValue(ClaimTypes.NameIdentifier);
        await _audit.RecordAsync(_resource, userId, ctx.HttpContext.Request.Method);
        await next();
    }
}`,
        explanation: "ServiceFilter needs DI registration; TypeFilter constructs on demand and can take extra constructor args via Arguments. Both support DI."
      }],
      flashcards: [
        { front: "ServiceFilter vs TypeFilter?", back: "ServiceFilter: resolved from DI, must register. TypeFilter: created per action with DI-injected deps + optional Arguments." },
        { front: "Why not attribute-based DI?", back: "Attributes are instantiated by the CLR — no DI container involved. TypeFilter/ServiceFilter wrap attributes with DI." },
        { front: "Global filter registration?", back: "builder.Services.AddControllers(opt => opt.Filters.Add<MyFilter>()). Applies to every action." },
        { front: "Filter scope levels?", back: "Global (all actions), controller (class attribute), action (method attribute). Most specific wins for shared behavior; all execute if attributed at multiple levels." }
      ],
      challenges: [{
        title: "ServiceFilter with DI",
        difficulty: "Advanced",
        prompt: "Create AuditActionFilter taking ILogger and ICurrentUser. Register as scoped. Apply via [ServiceFilter].",
        starterCode: `public interface ICurrentUser { Guid? UserId { get; } }`,
        solution: `public class AuditActionFilter : IAsyncActionFilter
{
    private readonly ILogger<AuditActionFilter> _log;
    private readonly ICurrentUser _user;

    public AuditActionFilter(ILogger<AuditActionFilter> log, ICurrentUser user)
    {
        _log = log;
        _user = user;
    }

    public async Task OnActionExecutionAsync(
        ActionExecutingContext ctx, ActionExecutionDelegate next)
    {
        _log.LogInformation("Audit: {UserId} calling {Action}",
            _user.UserId, ctx.ActionDescriptor.DisplayName);
        await next();
    }
}

builder.Services.AddScoped<AuditActionFilter>();

[ServiceFilter(typeof(AuditActionFilter))]
[HttpPost]
public IActionResult Create() => Ok();`,
        explanation: "ServiceFilter pulls from DI so scoped deps (DbContext-adjacent services) work correctly.",
        hint: "AddScoped<TheFilter>() + [ServiceFilter(typeof(TheFilter))]."
      }]
    },
    enterprise: {
      concept: "Intune-scale APIs use global filters for cross-cutting concerns: correlation ID injection, audit logging, tenant scoping, compliance-tagging. Attribute-based filters handle exceptions (per-endpoint overrides). Combine with conventions (MVC Conventions API) to auto-apply filters based on controller name/attribute presence — avoids manual application on every action.",
      codeExamples: [{
        title: "Global filter + audit",
        lang: "csharp",
        code: `public class CorrelationFilter : IAsyncResourceFilter
{
    public async Task OnResourceExecutionAsync(
        ResourceExecutingContext ctx, ResourceExecutionDelegate next)
    {
        var correlationId = ctx.HttpContext.Request.Headers
            .TryGetValue("X-Correlation-Id", out var h)
            ? h.ToString()
            : Guid.NewGuid().ToString();

        ctx.HttpContext.Response.Headers["X-Correlation-Id"] = correlationId;
        Activity.Current?.SetTag("correlationId", correlationId);

        await next();
    }
}

public class AuditActionFilter : IAsyncActionFilter
{
    private readonly IAuditLog _audit;
    private readonly ITenantContext _tenant;

    public AuditActionFilter(IAuditLog audit, ITenantContext tenant)
    { _audit = audit; _tenant = tenant; }

    public async Task OnActionExecutionAsync(
        ActionExecutingContext ctx, ActionExecutionDelegate next)
    {
        var executed = await next();
        await _audit.RecordAsync(new AuditEntry(
            tenantId: _tenant.TenantId,
            userId: ctx.HttpContext.User.FindFirstValue("oid"),
            action: ctx.ActionDescriptor.DisplayName ?? "",
            statusCode: ctx.HttpContext.Response.StatusCode,
            timestamp: DateTime.UtcNow));
    }
}

builder.Services.AddControllers(opt =>
{
    opt.Filters.Add<CorrelationFilter>();
    opt.Filters.Add<AuditActionFilter>();
});`,
        explanation: "Global registration means every action gets correlation + audit automatically — no chance of forgetting. Attaching correlationId to Activity propagates it through distributed traces."
      }],
      flashcards: [
        { front: "Why global filters?", back: "Applied to every action automatically. No chance of forgetting on new endpoints — forced consistency for cross-cutting concerns." },
        { front: "Correlation ID pattern?", back: "Read from request header (if present), else generate. Emit back in response header. Tag Activity for distributed tracing." },
        { front: "Record audit post-action?", back: "After next() so you have the response status. Pre-action = 'attempted'; post-action = 'completed with status'." },
        { front: "MVC Conventions?", back: "IControllerModelConvention: programmatically tweak attributes/filters across controllers. Avoids repeating boilerplate per class." }
      ],
      challenges: [{
        title: "Global audit filter",
        difficulty: "Enterprise",
        prompt: "Global IAsyncActionFilter: before action runs, capture User + path; after, record audit with status code. Register globally.",
        starterCode: `public interface IAuditLog { Task RecordAsync(string user, string path, int status, CancellationToken ct); }`,
        solution: `public class AuditFilter : IAsyncActionFilter
{
    private readonly IAuditLog _audit;
    public AuditFilter(IAuditLog audit) { _audit = audit; }

    public async Task OnActionExecutionAsync(
        ActionExecutingContext ctx, ActionExecutionDelegate next)
    {
        var user = ctx.HttpContext.User.FindFirstValue("oid") ?? "anonymous";
        var path = ctx.HttpContext.Request.Path;

        var executed = await next();

        await _audit.RecordAsync(
            user, path, ctx.HttpContext.Response.StatusCode,
            ctx.HttpContext.RequestAborted);
    }
}

builder.Services.AddScoped<AuditFilter>();
builder.Services.AddControllers(opt => opt.Filters.Add<AuditFilter>());`,
        explanation: "RequestAborted is the CT that fires if the client disconnects — plumbing it into the audit write is good hygiene.",
        hint: "Capture before next(), record after."
      }]
    }
  }
},

/* ====================== DAY 19 ====================== */
{
  id: 19, day: 19,
  title: "Async / Await",
  subtitle: "Non-blocking I/O for scalable request handling.",
  overview: "Task, ValueTask, CancellationToken, async all the way down, common pitfalls.",
  csharpFocus: "async/await semantics, Task composition, ConfigureAwait, synchronization context.",
  modes: {
    beginner: {
      concept: "async/await frees the request thread during I/O (DB, HTTP, disk). While waiting, the thread serves other requests. A method marked `async` returns `Task` (void-equivalent) or `Task<T>`. Callers `await` it — that resumes the method when the task completes.",
      codeExamples: [{
        title: "async basics",
        lang: "csharp",
        code: `public async Task<Device?> GetDeviceAsync(Guid id, CancellationToken ct)
{
    var device = await _db.Devices
        .FirstOrDefaultAsync(d => d.Id == id, ct);

    if (device is null) return null;

    device.LastAccessedAt = DateTime.UtcNow;
    await _db.SaveChangesAsync(ct);

    return device;
}

[HttpGet("{id:guid}")]
public async Task<IActionResult> Get(Guid id, CancellationToken ct)
{
    var device = await _svc.GetDeviceAsync(id, ct);
    return device is null ? NotFound() : Ok(device);
}`,
        explanation: "Every I/O call has an async variant — FirstOrDefaultAsync, SaveChangesAsync, ReadAsync. Pass CancellationToken through every level so aborted requests can stop work mid-flight."
      }],
      flashcards: [
        { front: "async Task vs async Task<T>?", code: undefined, back: "Task = async void-equivalent (the method completes, no return value). Task<T> = async method returning T." },
        { front: "Why pass CancellationToken?", back: "Client disconnects, request times out — CT lets you stop DB queries, HTTP calls mid-flight instead of wasting work." },
        { front: "async void?", back: "Avoid everywhere except event handlers. No Task returned = exceptions crash the process; no way to await completion." },
        { front: "Task vs Thread?", back: "Task is a promise of future work. Thread runs code. Async I/O uses zero threads while waiting — that's the scalability win." }
      ],
      challenges: [{
        title: "Async all the way",
        difficulty: "Warm-up",
        prompt: "Convert this sync method to async, accepting a CancellationToken.",
        starterCode: `public Device? Get(Guid id)
{
    var d = _db.Devices.FirstOrDefault(x => x.Id == id);
    if (d != null) { d.LastAccessedAt = DateTime.UtcNow; _db.SaveChanges(); }
    return d;
}`,
        solution: `public async Task<Device?> GetAsync(Guid id, CancellationToken ct)
{
    var d = await _db.Devices.FirstOrDefaultAsync(x => x.Id == id, ct);
    if (d is not null)
    {
        d.LastAccessedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
    }
    return d;
}`,
        explanation: "Every I/O call has an Async suffix. CancellationToken threaded through. Method name gets the Async suffix convention.",
        hint: "Every sync call becomes its Async variant; pass ct."
      }]
    },
    mid: {
      concept: "Never block on async with .Result or .Wait() — causes deadlocks in UI/sync contexts and wastes threadpool threads in web apps. 'Async all the way down' is a rule: once you're in async, stay in async. ConfigureAwait(false) is for library code to skip syncing back to the original context; ASP.NET Core has no sync context so it's optional in app code.",
      codeExamples: [{
        title: "Common pitfalls and fixes",
        lang: "csharp",
        code: `// BAD — blocks, can deadlock, wastes threads
public IActionResult BadGet(Guid id)
{
    var device = _svc.GetAsync(id, CancellationToken.None).Result;
    return Ok(device);
}

// GOOD — async all the way
public async Task<IActionResult> GoodGet(Guid id, CancellationToken ct)
{
    var device = await _svc.GetAsync(id, ct);
    return Ok(device);
}

// Parallel I/O with Task.WhenAll
public async Task<DashboardData> GetDashboardAsync(Guid userId, CancellationToken ct)
{
    var devicesTask = _devices.GetForUserAsync(userId, ct);
    var policiesTask = _policies.GetForUserAsync(userId, ct);
    var alertsTask = _alerts.GetForUserAsync(userId, ct);

    await Task.WhenAll(devicesTask, policiesTask, alertsTask);

    return new DashboardData(
        await devicesTask,
        await policiesTask,
        await alertsTask);
}`,
        explanation: "Task.WhenAll runs independent I/O in parallel. Total time ≈ slowest call, not sum of all. The second await on each task after WhenAll is free — task already completed."
      }],
      flashcards: [
        { front: "Why never .Result or .Wait()?", back: "Deadlocks (sync contexts) and threadpool starvation (blocked threads can't serve requests)." },
        { front: "Task.WhenAll?", back: "Awaits multiple tasks concurrently. Total time = max(tasks), not sum. Use for independent I/O." },
        { front: "ConfigureAwait(false)?", back: "Library convention: skip resuming on original sync context. ASP.NET Core has no sync context so it's optional in app code." },
        { front: "Async method name convention?", back: "Suffix 'Async'. GetAsync, SaveChangesAsync. Signals to callers that await is required." }
      ],
      challenges: [{
        title: "Parallelize independent I/O",
        difficulty: "Mid",
        prompt: "GetDashboardAsync currently sequential. Fan out the three independent calls with Task.WhenAll.",
        starterCode: `public async Task<DashboardData> GetDashboardAsync(Guid userId, CancellationToken ct)
{
    var devices = await _devices.GetForUserAsync(userId, ct);
    var policies = await _policies.GetForUserAsync(userId, ct);
    var alerts = await _alerts.GetForUserAsync(userId, ct);
    return new DashboardData(devices, policies, alerts);
}`,
        solution: `public async Task<DashboardData> GetDashboardAsync(Guid userId, CancellationToken ct)
{
    var devicesTask = _devices.GetForUserAsync(userId, ct);
    var policiesTask = _policies.GetForUserAsync(userId, ct);
    var alertsTask = _alerts.GetForUserAsync(userId, ct);

    await Task.WhenAll(devicesTask, policiesTask, alertsTask);

    return new DashboardData(
        await devicesTask,
        await policiesTask,
        await alertsTask);
}`,
        explanation: "Start all tasks, then WhenAll. Total time drops from sum to max. Watch for shared state (DbContext is NOT thread-safe — use separate contexts per parallel branch).",
        hint: "Start tasks without await, then Task.WhenAll them."
      }]
    },
    advanced: {
      concept: "ValueTask avoids allocating a Task when the method often completes synchronously (cache hits). IAsyncEnumerable<T> streams sequences asynchronously — perfect for paginated DB queries. Caveat: await a ValueTask exactly once; don't store or re-await.",
      codeExamples: [{
        title: "ValueTask + IAsyncEnumerable",
        lang: "csharp",
        code: `// ValueTask — common cache-hit path doesn't allocate a Task
public class CachedDeviceService
{
    private readonly IMemoryCache _cache;
    private readonly IDeviceRepository _repo;

    public CachedDeviceService(IMemoryCache cache, IDeviceRepository repo)
    { _cache = cache; _repo = repo; }

    public ValueTask<Device?> GetAsync(Guid id, CancellationToken ct)
    {
        if (_cache.TryGetValue<Device>(id, out var cached))
            return new ValueTask<Device?>(cached);

        return new ValueTask<Device?>(GetFromRepoAsync(id, ct));
    }

    private async Task<Device?> GetFromRepoAsync(Guid id, CancellationToken ct)
    {
        var device = await _repo.GetAsync(id, ct);
        if (device is not null) _cache.Set(id, device, TimeSpan.FromMinutes(5));
        return device;
    }
}

// IAsyncEnumerable — stream results
public async IAsyncEnumerable<Device> StreamActiveAsync(
    [EnumeratorCancellation] CancellationToken ct)
{
    await foreach (var d in _db.Devices.AsNoTracking()
        .Where(d => d.IsActive).AsAsyncEnumerable().WithCancellation(ct))
    {
        yield return d;
    }
}`,
        explanation: "ValueTask saves a heap allocation on the cache-hit path — matters at high QPS. IAsyncEnumerable streams rows as they arrive from the DB — constant memory regardless of result size."
      }],
      flashcards: [
        { front: "When to use ValueTask?", back: "Hot paths where the method often completes synchronously (cache hits). Skips Task allocation." },
        { front: "ValueTask rules?", back: "Await exactly once. Don't store in a field. Don't WhenAll directly — convert with AsTask()." },
        { front: "IAsyncEnumerable?", back: "Stream of async-produced items. `await foreach` consumes. Constant memory; good for large DB queries." },
        { front: "[EnumeratorCancellation]?", back: "Attribute on CancellationToken param of async iterator so await foreach's WithCancellation flows through." }
      ],
      challenges: [{
        title: "IAsyncEnumerable streaming",
        difficulty: "Advanced",
        prompt: "Write StreamAuditAsync that yields audit records page-by-page (100 at a time) until exhausted.",
        starterCode: `public interface IAuditRepo { Task<List<AuditRecord>> GetPageAsync(int page, int size, CancellationToken ct); }`,
        solution: `public async IAsyncEnumerable<AuditRecord> StreamAuditAsync(
    [EnumeratorCancellation] CancellationToken ct)
{
    var page = 0;
    while (true)
    {
        var batch = await _repo.GetPageAsync(page, 100, ct);
        if (batch.Count == 0) yield break;

        foreach (var record in batch)
            yield return record;

        if (batch.Count < 100) yield break;
        page++;
    }
}

// Consumer:
await foreach (var record in _svc.StreamAuditAsync(ct))
{
    Process(record);
}`,
        explanation: "yield return emits each item; the consumer's await foreach pulls. Memory stays constant because only one batch is in memory at a time. Perfect for exports of millions of rows.",
        hint: "yield return inside async iterator; [EnumeratorCancellation] on the CT."
      }]
    },
    enterprise: {
      concept: "Fire-and-forget is tempting but dangerous — exceptions vanish and the process can exit before the work finishes. Intune patterns: for truly async-side work, push to a message bus (Day 22) or use a tracked Task with logging. For controlled parallelism, use Parallel.ForEachAsync with MaxDegreeOfParallelism. Never start Task.Run from a request handler without a plan for completion and cancellation.",
      codeExamples: [{
        title: "Safe fire-and-forget + throttled parallelism",
        lang: "csharp",
        code: `public class SafeBackground
{
    private readonly ILogger<SafeBackground> _log;
    public SafeBackground(ILogger<SafeBackground> log) { _log = log; }

    public void Schedule(Func<CancellationToken, Task> work, CancellationToken ct)
    {
        _ = Task.Run(async () =>
        {
            try { await work(ct); }
            catch (OperationCanceledException) { /* expected on shutdown */ }
            catch (Exception ex) { _log.LogError(ex, "Background work failed"); }
        }, ct);
    }
}

// Throttled parallel — bounded concurrency for IO fan-out
public async Task RecalculateAllAsync(
    IEnumerable<Guid> deviceIds, CancellationToken ct)
{
    await Parallel.ForEachAsync(
        deviceIds,
        new ParallelOptions
        {
            MaxDegreeOfParallelism = 20,
            CancellationToken = ct
        },
        async (id, ct) =>
        {
            using var scope = _scopeFactory.CreateScope();
            var svc = scope.ServiceProvider.GetRequiredService<IRecalcService>();
            await svc.RecalculateAsync(id, ct);
        });
}`,
        explanation: "SafeBackground wraps Task.Run with error logging so fire-and-forget exceptions don't vanish. Parallel.ForEachAsync with MaxDegreeOfParallelism prevents overwhelming downstream — critical when fanning out thousands of operations."
      }],
      flashcards: [
        { front: "Why is fire-and-forget dangerous?", back: "Unhandled exceptions vanish; process can exit before work finishes; no observability." },
        { front: "Parallel.ForEachAsync?", back: ".NET 6+ throttled parallel async loop. MaxDegreeOfParallelism bounds concurrency. Pass CT." },
        { front: "Scope per parallel branch?", back: "DbContext (and other scoped services) is NOT thread-safe. Create a fresh scope per parallel operation with IServiceScopeFactory." },
        { front: "Alternative to fire-and-forget?", back: "Message bus (durable, observable, retriable). Or IHostedService with Channels (Day 23). Real async work deserves a real runtime." }
      ],
      challenges: [{
        title: "Throttled parallel with scope",
        difficulty: "Enterprise",
        prompt: "Process 1000 device IDs: max 10 parallel, each uses a fresh scope, fetches IRecalcService, calls RecalculateAsync.",
        starterCode: `public interface IRecalcService { Task RecalculateAsync(Guid deviceId, CancellationToken ct); }`,
        solution: `public class BulkRecalculator
{
    private readonly IServiceScopeFactory _scopeFactory;
    public BulkRecalculator(IServiceScopeFactory scopeFactory)
    { _scopeFactory = scopeFactory; }

    public Task RecalculateAllAsync(
        IEnumerable<Guid> deviceIds, CancellationToken ct) =>
        Parallel.ForEachAsync(
            deviceIds,
            new ParallelOptions
            {
                MaxDegreeOfParallelism = 10,
                CancellationToken = ct
            },
            async (id, innerCt) =>
            {
                using var scope = _scopeFactory.CreateScope();
                var svc = scope.ServiceProvider
                    .GetRequiredService<IRecalcService>();
                await svc.RecalculateAsync(id, innerCt);
            });
}`,
        explanation: "Fresh scope per iteration gives each parallel branch its own DbContext, avoiding thread-safety issues. Bounded parallelism prevents burying SQL Server with 1000 concurrent queries.",
        hint: "Parallel.ForEachAsync + IServiceScopeFactory.CreateScope()."
      }]
    }
  }
},

/* ====================== DAY 20 ====================== */
{
  id: 20, day: 20,
  title: "Caching",
  subtitle: "Memory and distributed caches to cut latency and load.",
  overview: "IMemoryCache, IDistributedCache, cache-aside pattern, invalidation, stampede protection.",
  csharpFocus: "Generic methods, async delegates, cache key strategies.",
  modes: {
    beginner: {
      concept: "Caching stores computed results so repeated requests don't redo the work. IMemoryCache is process-local: fast, simple, but each web server has its own copy. Register with AddMemoryCache, inject, use Set/TryGetValue or GetOrCreateAsync.",
      codeExamples: [{
        title: "IMemoryCache basics",
        lang: "csharp",
        code: `builder.Services.AddMemoryCache();

public class DeviceService
{
    private readonly IMemoryCache _cache;
    private readonly IDeviceRepository _repo;

    public DeviceService(IMemoryCache cache, IDeviceRepository repo)
    { _cache = cache; _repo = repo; }

    public async Task<Device?> GetAsync(Guid id, CancellationToken ct)
    {
        var key = $"device:{id}";

        if (_cache.TryGetValue(key, out Device? cached))
            return cached;

        var device = await _repo.GetAsync(id, ct);
        if (device is not null)
        {
            _cache.Set(key, device, TimeSpan.FromMinutes(5));
        }
        return device;
    }
}`,
        explanation: "Classic cache-aside: check cache, miss → load + cache, return. Cache expiry (TimeSpan) prevents stale data indefinitely. Key naming convention (prefix:id) helps debugging."
      }],
      flashcards: [
        { front: "Cache-aside pattern?", back: "App code checks cache → miss → loads from source → stores in cache → returns. Cache is a sideline, not the source of truth." },
        { front: "IMemoryCache vs IDistributedCache?", back: "Memory: in-process, fast, not shared. Distributed (Redis, SQL): shared across instances, slower (network)." },
        { front: "Absolute vs sliding expiration?", back: "Absolute: expires at a fixed time. Sliding: expires N minutes after last access. Combine for max lifetime with idle timeout." },
        { front: "Cache key strategy?", back: "Prefix + ID: 'device:{guid}'. Makes invalidation scans possible; self-documenting; collision-free across types." }
      ],
      challenges: [{
        title: "Cache-aside get",
        difficulty: "Warm-up",
        prompt: "Add memory caching to GetPolicyAsync. Key 'policy:{id}'. 5-min expiry.",
        starterCode: `public async Task<Policy?> GetPolicyAsync(Guid id, CancellationToken ct)
{
    return await _repo.GetAsync(id, ct);
}`,
        solution: `public async Task<Policy?> GetPolicyAsync(Guid id, CancellationToken ct)
{
    var key = $"policy:{id}";
    if (_cache.TryGetValue(key, out Policy? cached))
        return cached;

    var policy = await _repo.GetAsync(id, ct);
    if (policy is not null)
        _cache.Set(key, policy, TimeSpan.FromMinutes(5));

    return policy;
}`,
        explanation: "TryGetValue returns true on hit. On miss, load and set. Guard the Set with null-check so missing records don't pollute the cache.",
        hint: "TryGetValue → miss → Set."
      }]
    },
    mid: {
      concept: "GetOrCreateAsync combines check-and-set into one expression. It handles the standard pattern cleanly. MemoryCacheEntryOptions exposes sliding, absolute, size (for memory pressure eviction), and post-eviction callbacks. Invalidation is explicit: call Remove on the key when the underlying data changes.",
      codeExamples: [{
        title: "GetOrCreateAsync + invalidation",
        lang: "csharp",
        code: `public async Task<Device?> GetAsync(Guid id, CancellationToken ct)
{
    return await _cache.GetOrCreateAsync($"device:{id}", async entry =>
    {
        entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(10);
        entry.SlidingExpiration = TimeSpan.FromMinutes(2);
        entry.Size = 1;

        return await _repo.GetAsync(id, ct);
    });
}

public async Task UpdateAsync(Device device, CancellationToken ct)
{
    await _repo.UpdateAsync(device, ct);
    _cache.Remove($"device:{device.Id}");   // invalidate
}

// Register with size limit for eviction
builder.Services.AddMemoryCache(opt =>
{
    opt.SizeLimit = 10_000;
});`,
        explanation: "GetOrCreateAsync runs the factory only on miss. Entry.Size lets the cache evict when total size exceeds SizeLimit. Invalidation must be explicit — cache has no way to know the underlying data changed."
      }],
      flashcards: [
        { front: "GetOrCreateAsync?", back: "Atomic 'check-then-load-and-set'. Less boilerplate; the factory runs only on miss." },
        { front: "Absolute vs sliding?", back: "Absolute: expires at T+duration. Sliding: T+duration after last access. Combine: 'max 10 min, evict after 2 min idle'." },
        { front: "Why invalidate on update?", back: "Cache doesn't know the source changed. Explicit Remove keeps reads fresh after writes." },
        { front: "SizeLimit?", back: "Cap on total cache size. Each entry declares Size. When total exceeds SizeLimit, entries evicted by priority/age." }
      ],
      challenges: [{
        title: "GetOrCreate + invalidate",
        difficulty: "Mid",
        prompt: "GetOrCreateAsync for Device with 10-min absolute + 2-min sliding. InvalidateAsync removes the entry.",
        starterCode: `// TODO`,
        solution: `public Task<Device?> GetAsync(Guid id, CancellationToken ct) =>
    _cache.GetOrCreateAsync($"device:{id}", async entry =>
    {
        entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(10);
        entry.SlidingExpiration = TimeSpan.FromMinutes(2);
        return await _repo.GetAsync(id, ct);
    });

public void Invalidate(Guid id) =>
    _cache.Remove($"device:{id}");`,
        explanation: "One call handles the full pattern. Invalidate is one line — the hard part is remembering to call it from every mutation path.",
        hint: "GetOrCreateAsync + Remove."
      }]
    },
    advanced: {
      concept: "IDistributedCache (Redis, SQL Server) shares cache state across web server instances. Values are byte[] — you serialize yourself. Slower than memory but consistent across a fleet. Use for sessions, idempotency keys, anything that must be shared. Register AddStackExchangeRedisCache.",
      codeExamples: [{
        title: "Distributed cache with JSON",
        lang: "csharp",
        code: `builder.Services.AddStackExchangeRedisCache(opt =>
{
    opt.Configuration = builder.Configuration.GetConnectionString("Redis");
    opt.InstanceName = "intune-api:";
});

public class DistributedCache<T> where T : class
{
    private readonly IDistributedCache _cache;
    public DistributedCache(IDistributedCache cache) { _cache = cache; }

    public async Task<T?> GetAsync(string key, CancellationToken ct)
    {
        var bytes = await _cache.GetAsync(key, ct);
        return bytes is null ? null : JsonSerializer.Deserialize<T>(bytes);
    }

    public Task SetAsync(string key, T value, TimeSpan ttl, CancellationToken ct)
    {
        var bytes = JsonSerializer.SerializeToUtf8Bytes(value);
        return _cache.SetAsync(key, bytes,
            new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = ttl },
            ct);
    }

    public Task RemoveAsync(string key, CancellationToken ct) =>
        _cache.RemoveAsync(key, ct);
}`,
        explanation: "Wrapper centralizes serialization. InstanceName prefixes all keys so multiple apps can share a Redis without collisions. JSON is human-debuggable; consider MessagePack/protobuf for hot paths."
      }],
      flashcards: [
        { front: "Why distributed cache?", back: "Shared state across instances: sessions, idempotency keys, rate-limit counters. Scale-out requires it." },
        { front: "IDistributedCache stores byte[]?", back: "Yes — you serialize. Centralize in a wrapper with JSON/MessagePack to avoid forgetting." },
        { front: "Redis typical TTLs?", back: "Seconds to hours for hot reads. Minutes for session data. Set explicitly — Redis defaults to no expiry." },
        { front: "InstanceName?", back: "Key prefix for the app. Lets multiple services share one Redis without colliding keys." }
      ],
      challenges: [{
        title: "Redis cache-aside",
        difficulty: "Advanced",
        prompt: "GetOrCreateAsync equivalent for IDistributedCache: check, load on miss, serialize, store. Key + TTL + factory.",
        starterCode: `public interface IJsonCache { Task<T?> GetOrCreateAsync<T>(string key, Func<Task<T>> factory, TimeSpan ttl, CancellationToken ct) where T : class; }`,
        solution: `public class JsonCache : IJsonCache
{
    private readonly IDistributedCache _cache;
    public JsonCache(IDistributedCache cache) { _cache = cache; }

    public async Task<T?> GetOrCreateAsync<T>(
        string key, Func<Task<T>> factory, TimeSpan ttl, CancellationToken ct)
        where T : class
    {
        var bytes = await _cache.GetAsync(key, ct);
        if (bytes is not null)
            return JsonSerializer.Deserialize<T>(bytes);

        var value = await factory();
        if (value is not null)
        {
            await _cache.SetAsync(key,
                JsonSerializer.SerializeToUtf8Bytes(value),
                new DistributedCacheEntryOptions
                {
                    AbsoluteExpirationRelativeToNow = ttl
                }, ct);
        }
        return value;
    }
}`,
        explanation: "Generic wrapper replicates IMemoryCache's GetOrCreateAsync for distributed. Centralized serialization, consistent TTL handling, null-safe.",
        hint: "Get bytes → deserialize, or run factory + serialize + set."
      }]
    },
    enterprise: {
      concept: "At Intune scale, caching challenges multiply: cache stampedes (many requests hit cache miss simultaneously, all hit DB), version-aware invalidation (deploys that change entity shape), observability (hit/miss ratios per key prefix). .NET 9's HybridCache (Microsoft.Extensions.Caching.Hybrid) combines L1 memory + L2 distributed with stampede protection built in.",
      codeExamples: [{
        title: "HybridCache + stampede protection",
        lang: "csharp",
        code: `builder.Services.AddHybridCache(opt =>
{
    opt.DefaultEntryOptions = new HybridCacheEntryOptions
    {
        Expiration = TimeSpan.FromMinutes(10),
        LocalCacheExpiration = TimeSpan.FromMinutes(2)
    };
});

public class DeviceService
{
    private readonly HybridCache _cache;
    private readonly IDeviceRepository _repo;

    public DeviceService(HybridCache cache, IDeviceRepository repo)
    { _cache = cache; _repo = repo; }

    public async ValueTask<Device?> GetAsync(Guid id, CancellationToken ct)
    {
        return await _cache.GetOrCreateAsync(
            $"device:v2:{id}",
            factory: async innerCt => await _repo.GetAsync(id, innerCt),
            tags: new[] { "devices", $"tenant:{_tenant.TenantId}" },
            cancellationToken: ct);
    }

    public async Task InvalidateTenantAsync(Guid tenantId, CancellationToken ct)
    {
        await _cache.RemoveByTagAsync($"tenant:{tenantId}", ct);
    }
}`,
        explanation: "HybridCache deduplicates concurrent misses for the same key — only one factory call runs; others wait for the result. Tag-based invalidation lets you wipe many keys atomically (all tenant-scoped entries on tenant settings change). Version the key (v2) when entity shape changes across deploys."
      }],
      flashcards: [
        { front: "Cache stampede?", back: "Key expires → many concurrent requests all miss → all hit DB → DB overload. HybridCache dedupes factory calls." },
        { front: "Tag-based invalidation?", back: "Attach tags to entries. RemoveByTagAsync wipes all entries with that tag. Perfect for tenant-wide or entity-family invalidation." },
        { front: "Version keys across deploys?", back: "Entity shape changes mid-deploy can corrupt readers. Include a version in the key: 'device:v2:{id}'. Old keys orphaned; new readers use v2." },
        { front: "Cache observability?", back: "Emit metrics per key prefix: hits, misses, duration-on-miss. App Insights dependency tracking shows Redis calls." }
      ],
      challenges: [{
        title: "HybridCache with tag invalidation",
        difficulty: "Enterprise",
        prompt: "GetDeviceAsync uses HybridCache, tags ['devices', 'tenant:{tenantId}']. InvalidateTenantAsync wipes all 'tenant:{id}' entries.",
        starterCode: `public interface ITenantContext { Guid TenantId { get; } }`,
        solution: `public class DeviceService
{
    private readonly HybridCache _cache;
    private readonly IDeviceRepository _repo;
    private readonly ITenantContext _tenant;

    public DeviceService(HybridCache cache,
        IDeviceRepository repo, ITenantContext tenant)
    { _cache = cache; _repo = repo; _tenant = tenant; }

    public ValueTask<Device?> GetAsync(Guid id, CancellationToken ct) =>
        _cache.GetOrCreateAsync(
            $"device:v1:{id}",
            factory: async innerCt => await _repo.GetAsync(id, innerCt),
            tags: new[] { "devices", $"tenant:{_tenant.TenantId}" },
            cancellationToken: ct);

    public Task InvalidateTenantAsync(Guid tenantId, CancellationToken ct) =>
        _cache.RemoveByTagAsync($"tenant:{tenantId}", ct).AsTask();
}`,
        explanation: "Tag invalidation scales to 'all entries related to X' in one call. The HybridCache deduplicates concurrent factory calls automatically — stampede protection for free.",
        hint: "tags: new[] { ... } + RemoveByTagAsync."
      }]
    }
  }
}

,

/* ====================== DAY 21 ====================== */
{
  id: 21, day: 21,
  title: "Proxy & Decorator Patterns",
  subtitle: "Wrapping interfaces to add cross-cutting behavior without modifying implementations.",
  overview: "Manual decorators, Scrutor.Decorate, composition order, common decorator stacks.",
  csharpFocus: "Interface implementation, delegation, DI registration order.",
  modes: {
    beginner: {
      concept: "A decorator implements the same interface as the thing it wraps, delegates to it, and adds behavior (logging, caching, retry). The consumer doesn't know it's wrapped — just depends on the interface. Same pattern you see in your Intune internship code around compliance proxies.",
      codeExamples: [{
        title: "Manual logging decorator",
        lang: "csharp",
        code: `public interface IDeviceRepository
{
    Task<Device?> GetAsync(Guid id, CancellationToken ct);
}

public class DeviceRepository : IDeviceRepository
{
    public Task<Device?> GetAsync(Guid id, CancellationToken ct)
    {
        // actual DB work
        return Task.FromResult<Device?>(null);
    }
}

public class LoggingDeviceRepository : IDeviceRepository
{
    private readonly IDeviceRepository _inner;
    private readonly ILogger<LoggingDeviceRepository> _log;

    public LoggingDeviceRepository(
        IDeviceRepository inner, ILogger<LoggingDeviceRepository> log)
    { _inner = inner; _log = log; }

    public async Task<Device?> GetAsync(Guid id, CancellationToken ct)
    {
        _log.LogInformation("Fetching device {DeviceId}", id);
        var sw = Stopwatch.StartNew();
        try
        {
            return await _inner.GetAsync(id, ct);
        }
        finally
        {
            _log.LogInformation("Fetched {DeviceId} in {Ms}ms", id, sw.ElapsedMilliseconds);
        }
    }
}`,
        explanation: "Consumer sees only IDeviceRepository. The decorator intercepts every call, adds logging, delegates to _inner. Zero changes to DeviceRepository or its callers."
      }],
      flashcards: [
        { front: "Decorator pattern?", back: "Class implements interface X and wraps another X. Adds behavior; delegates actual work." },
        { front: "Decorator vs inheritance?", back: "Inheritance couples to the concrete type. Decoration is to the interface — compose at runtime, swap independently." },
        { front: "Common decorator roles?", back: "Logging, metrics, caching, retry, circuit breaker, authorization, tracing." },
        { front: "Why works well with DI?", back: "Consumer depends on the interface. DI decides what to inject — the base, a single decorator, or a stack." }
      ],
      challenges: [{
        title: "Manual metrics decorator",
        difficulty: "Warm-up",
        prompt: "Decorator for IDeviceRepository that counts calls via IMetrics.Increment.",
        starterCode: `public interface IMetrics { void Increment(string name); }`,
        solution: `public class MetricsDeviceRepository : IDeviceRepository
{
    private readonly IDeviceRepository _inner;
    private readonly IMetrics _metrics;

    public MetricsDeviceRepository(IDeviceRepository inner, IMetrics metrics)
    { _inner = inner; _metrics = metrics; }

    public async Task<Device?> GetAsync(Guid id, CancellationToken ct)
    {
        _metrics.Increment("device.get.calls");
        try
        {
            return await _inner.GetAsync(id, ct);
        }
        catch
        {
            _metrics.Increment("device.get.errors");
            throw;
        }
    }
}`,
        explanation: "Count on entry; count errors on catch (rethrow to preserve behavior). Delegation to _inner keeps the actual work untouched.",
        hint: "Count, delegate, rethrow."
      }]
    },
    mid: {
      concept: "Register decorators with Scrutor's Decorate<> — avoids hand-wiring chains. Decorators stack: Decorate<T, D1>() then Decorate<T, D2>() means consumers get D2(D1(Base)). Order matters — outermost wraps first. Built-in .NET 9 adds AddDecorator but Scrutor is the common choice.",
      codeExamples: [{
        title: "Scrutor Decorate<>",
        lang: "csharp",
        code: `// NuGet: Scrutor
using Scrutor;

builder.Services.AddScoped<IDeviceRepository, DeviceRepository>();
builder.Services.Decorate<IDeviceRepository, LoggingDeviceRepository>();
builder.Services.Decorate<IDeviceRepository, MetricsDeviceRepository>();

// Resolution order at inject time:
// ctor(IDeviceRepository) gets MetricsDeviceRepository
//   → wraps LoggingDeviceRepository
//     → wraps DeviceRepository

// So on every call:
// Metrics increments → Logging logs → base executes
// → Logging logs duration → Metrics... done.`,
        explanation: "Last Decorate call becomes outermost. If you want logging to observe metric collection, order logging last. Think of the call stack from top to bottom."
      }],
      flashcards: [
        { front: "Scrutor Decorate<T, D>()?", back: "Wraps existing registration of T with D. Each call adds another layer; last call becomes outermost." },
        { front: "Order matters?", back: "Yes. Decorate(T, A).Decorate(T, B) gives B(A(Base)). Caller sees B first." },
        { front: "How does DI resolve constructor params in decorators?", back: "Scrutor replaces T's registration. The decorator's inner IDeviceRepository parameter is resolved to the previous registration — that's the chain." },
        { front: "Alternative to Scrutor?", back: ".NET 9+ has Services.AddDecorator<T, D>() built in. Before that, Scrutor or manual factory." }
      ],
      challenges: [{
        title: "Decorator stack",
        difficulty: "Mid",
        prompt: "Register DeviceRepository → Logging → Metrics with Scrutor. Outermost should be Metrics.",
        starterCode: `// TODO`,
        solution: `builder.Services.AddScoped<IDeviceRepository, DeviceRepository>();
builder.Services.Decorate<IDeviceRepository, LoggingDeviceRepository>();
builder.Services.Decorate<IDeviceRepository, MetricsDeviceRepository>();

// Chain from outside in:
// MetricsDeviceRepository
//   -> LoggingDeviceRepository
//     -> DeviceRepository`,
        explanation: "Last Decorate call is outermost. Controllers injecting IDeviceRepository get the full stack automatically — zero changes needed at consumer side.",
        hint: "Base → Decorate(Logging) → Decorate(Metrics)."
      }]
    },
    advanced: {
      concept: "Decorators compose naturally for retry + caching stacks. Caching typically outermost (skip everything on hit). Retry inside caching (don't retry cache hits). Logging often inside both (log actual work). Order encodes policy: what should run on every call vs only on the slow path.",
      codeExamples: [{
        title: "Caching + retry decorator stack",
        lang: "csharp",
        code: `public class CachingDeviceRepository : IDeviceRepository
{
    private readonly IDeviceRepository _inner;
    private readonly IMemoryCache _cache;

    public CachingDeviceRepository(IDeviceRepository inner, IMemoryCache cache)
    { _inner = inner; _cache = cache; }

    public Task<Device?> GetAsync(Guid id, CancellationToken ct) =>
        _cache.GetOrCreateAsync($"device:{id}", async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5);
            return await _inner.GetAsync(id, ct);
        });
}

public class RetryingDeviceRepository : IDeviceRepository
{
    private readonly IDeviceRepository _inner;
    public RetryingDeviceRepository(IDeviceRepository inner) { _inner = inner; }

    public async Task<Device?> GetAsync(Guid id, CancellationToken ct)
    {
        for (var attempt = 1; attempt <= 3; attempt++)
        {
            try { return await _inner.GetAsync(id, ct); }
            catch (Exception) when (attempt < 3)
            {
                await Task.Delay(TimeSpan.FromMilliseconds(100 * attempt), ct);
            }
        }
        return await _inner.GetAsync(id, ct);
    }
}

// Composition
builder.Services.AddScoped<IDeviceRepository, DeviceRepository>();
builder.Services.Decorate<IDeviceRepository, RetryingDeviceRepository>();
builder.Services.Decorate<IDeviceRepository, CachingDeviceRepository>();
// Cache outermost: hits skip retry + DB entirely.`,
        explanation: "Outermost cache: no retry cost on hits. Retry inside cache: hits never retry; misses retry the actual call. Order expresses the behavior policy."
      }],
      flashcards: [
        { front: "Typical decorator order (outer → inner)?", back: "Cache → Retry → Logging → Base. Cache skips everything on hit; retry only the slow path; logging wraps actual work." },
        { front: "Why not retry on cache hit?", back: "A hit means success — retrying adds latency with no upside." },
        { front: "Circuit breaker placement?", back: "Inside retry (to stop the retry storm) but outside logging (so opened circuit is logged)." },
        { front: "Polly vs manual decorators?", back: "Polly provides production-grade retry/circuit/timeout; integrate as a decorator using IHttpClientFactory or a wrapper." }
      ],
      challenges: [{
        title: "Compose cache + retry + base",
        difficulty: "Advanced",
        prompt: "Register: base repo, retry decorator (3 attempts, backoff), cache decorator. Cache outermost.",
        starterCode: `// TODO`,
        solution: `builder.Services.AddScoped<IDeviceRepository, DeviceRepository>();
builder.Services.Decorate<IDeviceRepository, RetryingDeviceRepository>();
builder.Services.Decorate<IDeviceRepository, CachingDeviceRepository>();

// On Get: cache first (often served from memory),
// else retry block runs up to 3x around DB call.`,
        explanation: "Decorate calls in order of increasing outerness. Consumers just depend on IDeviceRepository — unaware of the stack.",
        hint: "Retry before Cache so Cache is outermost."
      }]
    },
    enterprise: {
      concept: "At Intune, the decorator pattern is the standard way to compose cross-cutting behavior: auth filters, tenant scoping, audit logging, retry with Polly, caching with tags. Every repo is wrapped; consumers get a consistent contract. Generic decorators (class D<T> : IRepo<T>) scale to many entities without repeating decorator code.",
      codeExamples: [{
        title: "Generic tenant-scoping decorator",
        lang: "csharp",
        code: `public interface IRepository<T> where T : class, ITenantScoped
{
    Task<T?> GetAsync(Guid id, CancellationToken ct);
    Task<IReadOnlyList<T>> ListAsync(CancellationToken ct);
}

public class TenantScopingRepository<T> : IRepository<T>
    where T : class, ITenantScoped
{
    private readonly IRepository<T> _inner;
    private readonly ITenantContext _tenant;
    private readonly ILogger<TenantScopingRepository<T>> _log;

    public TenantScopingRepository(IRepository<T> inner,
        ITenantContext tenant, ILogger<TenantScopingRepository<T>> log)
    { _inner = inner; _tenant = tenant; _log = log; }

    public async Task<T?> GetAsync(Guid id, CancellationToken ct)
    {
        var item = await _inner.GetAsync(id, ct);
        if (item is null) return null;

        if (item.TenantId != _tenant.TenantId)
        {
            _log.LogWarning("Cross-tenant read blocked: {Type} {Id}",
                typeof(T).Name, id);
            return null;
        }
        return item;
    }

    public async Task<IReadOnlyList<T>> ListAsync(CancellationToken ct)
    {
        var all = await _inner.ListAsync(ct);
        return all.Where(x => x.TenantId == _tenant.TenantId).ToList();
    }
}

builder.Services.AddScoped(typeof(IRepository<>), typeof(EfRepository<>));
builder.Services.Decorate(typeof(IRepository<>), typeof(TenantScopingRepository<>));`,
        explanation: "One decorator enforces tenant boundaries across every IRepository<T>. Open generic registration means new entity types get tenant scoping automatically — no place to forget."
      }],
      flashcards: [
        { front: "Open generic registration?", back: "Register typeof(IRepo<>) with typeof(Impl<>). DI resolves concrete T at inject time. One registration covers all T." },
        { front: "Why generic decorators?", back: "Enforce cross-cutting concerns (tenant, audit, cache) uniformly across entity types. New entities inherit the policy automatically." },
        { front: "Defense in depth?", back: "Even with query filters on DbContext, the decorator double-checks — belt and suspenders against subtle bugs." },
        { front: "Decorator as security boundary?", back: "Yes — a decorator enforcing tenant scope is testable in isolation and harder to bypass than scattered checks." }
      ],
      challenges: [{
        title: "Generic audit decorator",
        difficulty: "Enterprise",
        prompt: "Generic decorator IRepository<T> that writes AuditLog entry (UserId, Operation, Type) on every mutation call (UpdateAsync, DeleteAsync).",
        starterCode: `public interface IRepository<T> where T : class
{
    Task UpdateAsync(T entity, CancellationToken ct);
    Task DeleteAsync(Guid id, CancellationToken ct);
}
public interface IAuditLog { Task WriteAsync(string userId, string op, string type, Guid id, CancellationToken ct); }
public interface ICurrentUser { string UserId { get; } }`,
        solution: `public class AuditingRepository<T> : IRepository<T> where T : class
{
    private readonly IRepository<T> _inner;
    private readonly IAuditLog _audit;
    private readonly ICurrentUser _user;

    public AuditingRepository(IRepository<T> inner,
        IAuditLog audit, ICurrentUser user)
    { _inner = inner; _audit = audit; _user = user; }

    public async Task UpdateAsync(T entity, CancellationToken ct)
    {
        await _inner.UpdateAsync(entity, ct);
        var id = (Guid)(typeof(T).GetProperty("Id")?.GetValue(entity) ?? Guid.Empty);
        await _audit.WriteAsync(_user.UserId, "Update", typeof(T).Name, id, ct);
    }

    public async Task DeleteAsync(Guid id, CancellationToken ct)
    {
        await _inner.DeleteAsync(id, ct);
        await _audit.WriteAsync(_user.UserId, "Delete", typeof(T).Name, id, ct);
    }
}

builder.Services.Decorate(typeof(IRepository<>), typeof(AuditingRepository<>));`,
        explanation: "Audit write after the mutation succeeds — if Update throws, no misleading audit entry. Reflection reads the Id (good enough; for hot paths, add IHasId<T> interface).",
        hint: "Delegate first, then audit — only log on success."
      }]
    }
  }
},

/* ====================== DAY 22 ====================== */
{
  id: 22, day: 22,
  title: "Message Bus (Azure Service Bus)",
  subtitle: "Durable async messaging between services.",
  overview: "Queues vs topics, publishers, consumers, dead-letter, duplicate detection, Intune patterns.",
  csharpFocus: "ServiceBusClient, async receive loops, message handlers.",
  modes: {
    beginner: {
      concept: "Message bus decouples producers from consumers. Producer writes a message to a queue/topic; consumer reads asynchronously. Benefits: producer doesn't wait, consumer can retry/fail independently, adding consumers is configuration. Azure Service Bus is the Microsoft managed option — queues (point-to-point), topics (pub-sub).",
      codeExamples: [{
        title: "Publisher and consumer",
        lang: "csharp",
        code: `// NuGet: Azure.Messaging.ServiceBus
builder.Services.AddAzureClients(c =>
{
    c.AddServiceBusClient(builder.Configuration
        .GetConnectionString("ServiceBus"));
});

public class DeviceEventPublisher
{
    private readonly ServiceBusClient _client;
    public DeviceEventPublisher(ServiceBusClient client) { _client = client; }

    public async Task PublishEnrolledAsync(
        DeviceEnrolledEvent evt, CancellationToken ct)
    {
        await using var sender = _client.CreateSender("device-events");
        var message = new ServiceBusMessage(
            BinaryData.FromObjectAsJson(evt))
        {
            Subject = "DeviceEnrolled",
            MessageId = evt.DeviceId.ToString(),
            ContentType = "application/json"
        };
        await sender.SendMessageAsync(message, ct);
    }
}

public record DeviceEnrolledEvent(Guid DeviceId, DateTime EnrolledAt);`,
        explanation: "Publisher sends to a named queue or topic. Subject names the message type (lets consumers filter). MessageId enables duplicate detection (same ID in a window = deduped)."
      }],
      flashcards: [
        { front: "Queue vs topic?", back: "Queue: point-to-point, one consumer takes the message. Topic: pub-sub, each subscription gets a copy." },
        { front: "Why a message bus?", back: "Decoupling, durability, retry, back-pressure. Producer doesn't wait on slow consumers; consumers can fail independently." },
        { front: "ServiceBusMessage fields to set?", back: "Subject (type), MessageId (dedup), ContentType, Body. Optional: SessionId, TimeToLive, CorrelationId." },
        { front: "Idempotent consumer?", back: "Handler can safely process the same message twice. Bus guarantees at-least-once; consumer must be idempotent." }
      ],
      challenges: [{
        title: "Publish an event",
        difficulty: "Warm-up",
        prompt: "PublishComplianceChangedAsync: sends ComplianceChangedEvent to 'compliance-events' topic with MessageId = DeviceId.",
        starterCode: `public record ComplianceChangedEvent(Guid DeviceId, bool IsCompliant, DateTime At);`,
        solution: `public class CompliancePublisher
{
    private readonly ServiceBusClient _client;
    public CompliancePublisher(ServiceBusClient client) { _client = client; }

    public async Task PublishComplianceChangedAsync(
        ComplianceChangedEvent evt, CancellationToken ct)
    {
        await using var sender = _client.CreateSender("compliance-events");
        var message = new ServiceBusMessage(BinaryData.FromObjectAsJson(evt))
        {
            Subject = "ComplianceChanged",
            MessageId = evt.DeviceId.ToString(),
            ContentType = "application/json"
        };
        await sender.SendMessageAsync(message, ct);
    }
}`,
        explanation: "Stable MessageId lets Service Bus dedupe if the publisher retries. DeviceId is natural because 'compliance changed for device X at time T' is idempotent per device.",
        hint: "ServiceBusMessage + MessageId + sender.SendMessageAsync."
      }]
    },
    mid: {
      concept: "Consumer is typically a BackgroundService hosting a ServiceBusProcessor. Processor invokes a handler per message. Handler Completes the message on success, Abandons/DeadLetters on failure. Failure to Complete means delivery retries — bus tries N times, then moves to dead-letter queue (DLQ) for inspection.",
      codeExamples: [{
        title: "Consumer as BackgroundService",
        lang: "csharp",
        code: `public class DeviceEventConsumer : BackgroundService
{
    private readonly ServiceBusClient _client;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<DeviceEventConsumer> _log;
    private ServiceBusProcessor _processor = null!;

    public DeviceEventConsumer(
        ServiceBusClient client,
        IServiceScopeFactory scopeFactory,
        ILogger<DeviceEventConsumer> log)
    { _client = client; _scopeFactory = scopeFactory; _log = log; }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _processor = _client.CreateProcessor("device-events",
            new ServiceBusProcessorOptions
            {
                MaxConcurrentCalls = 10,
                AutoCompleteMessages = false
            });

        _processor.ProcessMessageAsync += HandleAsync;
        _processor.ProcessErrorAsync += args =>
        {
            _log.LogError(args.Exception, "Processor error");
            return Task.CompletedTask;
        };

        await _processor.StartProcessingAsync(stoppingToken);
        await Task.Delay(Timeout.Infinite, stoppingToken);
    }

    private async Task HandleAsync(ProcessMessageEventArgs args)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var handler = scope.ServiceProvider
                .GetRequiredService<IDeviceEventHandler>();
            var evt = args.Message.Body.ToObjectFromJson<DeviceEnrolledEvent>();
            await handler.HandleAsync(evt, args.CancellationToken);
            await args.CompleteMessageAsync(args.Message);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Handler failed for message {MessageId}",
                args.Message.MessageId);
            await args.AbandonMessageAsync(args.Message);
            // AbandonMessageAsync re-delivers; bus retries until MaxDeliveryCount → DLQ
        }
    }
}`,
        explanation: "AutoCompleteMessages=false gives explicit control. Complete on success; Abandon on failure so the bus retries. After MaxDeliveryCount attempts, message auto-moves to DLQ. Scoped handler resolution = fresh DbContext per message."
      }],
      flashcards: [
        { front: "Complete vs Abandon vs DeadLetter?", back: "Complete: done. Abandon: retry. DeadLetter: permanent failure, push to DLQ for inspection." },
        { front: "MaxConcurrentCalls?", back: "How many messages the processor handles in parallel. Tune based on downstream capacity." },
        { front: "Why scope per message?", back: "Handlers typically use DbContext (scoped). One scope per message keeps each message's work isolated." },
        { front: "Dead-letter queue (DLQ)?", back: "Sub-queue holding messages that hit MaxDeliveryCount. Alert + inspect; typically fix + resubmit." }
      ],
      challenges: [{
        title: "Consumer with complete/abandon",
        difficulty: "Mid",
        prompt: "Handle message: scope, deserialize to ComplianceChangedEvent, invoke IComplianceHandler. Complete on success, Abandon on exception, log.",
        starterCode: `public interface IComplianceHandler { Task HandleAsync(ComplianceChangedEvent evt, CancellationToken ct); }`,
        solution: `private async Task HandleAsync(ProcessMessageEventArgs args)
{
    try
    {
        using var scope = _scopeFactory.CreateScope();
        var handler = scope.ServiceProvider
            .GetRequiredService<IComplianceHandler>();
        var evt = args.Message.Body
            .ToObjectFromJson<ComplianceChangedEvent>();

        await handler.HandleAsync(evt, args.CancellationToken);
        await args.CompleteMessageAsync(args.Message);
    }
    catch (Exception ex)
    {
        _log.LogError(ex, "Failed to handle {MessageId}",
            args.Message.MessageId);
        await args.AbandonMessageAsync(args.Message);
    }
}`,
        explanation: "Scope → resolve → deserialize → handle → complete. Errors abandon so bus retries. Structured log captures MessageId for correlating DLQ entries back to this attempt.",
        hint: "scope → deserialize → handle → complete; catch → log → abandon."
      }]
    },
    advanced: {
      concept: "Sessions let you process related messages in order on one consumer (all device-X events go to the same receiver). Duplicate detection dedupes by MessageId within a window. Scheduled enqueue delays delivery. DLQ inspection is a first-class operational task — you'll write tools to browse and resubmit.",
      codeExamples: [{
        title: "Session-based ordering + scheduled",
        lang: "csharp",
        code: `// Send with session and scheduled enqueue
public async Task PublishAsync(DeviceEvent evt, CancellationToken ct)
{
    await using var sender = _client.CreateSender("device-events");

    var message = new ServiceBusMessage(BinaryData.FromObjectAsJson(evt))
    {
        Subject = evt.GetType().Name,
        MessageId = evt.EventId.ToString(),
        SessionId = evt.DeviceId.ToString(),   // group by device
        ScheduledEnqueueTime = evt.DeferUntil   // optional delayed delivery
    };

    await sender.SendMessageAsync(message, ct);
}

// Session-aware receiver — processes one session at a time to completion
public class SessionConsumer : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var processor = _client.CreateSessionProcessor("device-events",
            new ServiceBusSessionProcessorOptions
            {
                MaxConcurrentSessions = 8,
                MaxConcurrentCallsPerSession = 1   // strict ordering per device
            });

        processor.ProcessMessageAsync += HandleAsync;
        processor.ProcessErrorAsync += OnError;
        await processor.StartProcessingAsync(stoppingToken);
        await Task.Delay(Timeout.Infinite, stoppingToken);
    }
}`,
        explanation: "SessionId groups messages for one key (DeviceId). Session processor processes sessions in parallel but one at a time per session — key for keeping events in order per device while still scaling across devices."
      }],
      flashcards: [
        { front: "SessionId on messages?", back: "Groups related messages. Receiver handles one session's messages in order. Parallelism is across sessions." },
        { front: "Duplicate detection window?", back: "Bus-level feature — dedupes same MessageId within the configured window (up to 7 days). Requires queue/topic duplicate detection enabled." },
        { front: "Scheduled enqueue?", back: "ScheduledEnqueueTime delays delivery until that timestamp. For retries with backoff, reminders, deferred work." },
        { front: "Why one session at a time?", back: "Preserves per-entity ordering. All events for device X processed sequentially; different devices in parallel." }
      ],
      challenges: [{
        title: "Session-based publish",
        difficulty: "Advanced",
        prompt: "PublishAsync uses DeviceId as SessionId, MessageId as event ID, Subject as message type name.",
        starterCode: `public abstract record DeviceEvent(Guid EventId, Guid DeviceId);
public record EnrolledEvent(Guid EventId, Guid DeviceId, DateTime At) : DeviceEvent(EventId, DeviceId);`,
        solution: `public class DeviceEventPublisher
{
    private readonly ServiceBusClient _client;
    public DeviceEventPublisher(ServiceBusClient c) { _client = c; }

    public async Task PublishAsync(DeviceEvent evt, CancellationToken ct)
    {
        await using var sender = _client.CreateSender("device-events");

        var message = new ServiceBusMessage(BinaryData.FromObjectAsJson(evt))
        {
            Subject = evt.GetType().Name,
            MessageId = evt.EventId.ToString(),
            SessionId = evt.DeviceId.ToString(),
            ContentType = "application/json"
        };

        await sender.SendMessageAsync(message, ct);
    }
}`,
        explanation: "Receiver can now process each device's events in order while parallelizing across devices.",
        hint: "SessionId = DeviceId; MessageId = EventId; Subject = GetType().Name."
      }]
    },
    enterprise: {
      concept: "Intune compliance patterns: operational API writes a state change, publishes domain event; downstream services (reporting, notifications, search indexer) subscribe on topics. Outbox pattern guarantees DB commit and message publish are atomic (store event in same transaction, background worker publishes). This is exactly the architecture your recalculation feature fits into.",
      codeExamples: [{
        title: "Outbox pattern",
        lang: "csharp",
        code: `public class OutboxMessage
{
    public Guid Id { get; set; }
    public string Topic { get; set; } = "";
    public string Subject { get; set; } = "";
    public string Body { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public DateTime? PublishedAt { get; set; }
}

// In the same DbContext transaction as the business change
public async Task RecalculateAsync(Guid deviceId, CancellationToken ct)
{
    var device = await _db.Devices.FindAsync(new object[] { deviceId }, ct);
    device!.ComplianceState = ComplianceState.Compliant;

    _db.OutboxMessages.Add(new OutboxMessage
    {
        Id = Guid.NewGuid(),
        Topic = "compliance-events",
        Subject = "ComplianceRecalculated",
        Body = JsonSerializer.Serialize(new ComplianceRecalculatedEvent(
            deviceId, device.ComplianceState)),
        CreatedAt = DateTime.UtcNow
    });

    await _db.SaveChangesAsync(ct);   // atomic: state + outbox commit together
}

// Separate BackgroundService drains the outbox
public class OutboxPublisher : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var client = scope.ServiceProvider.GetRequiredService<ServiceBusClient>();

            var pending = await db.OutboxMessages
                .Where(m => m.PublishedAt == null)
                .OrderBy(m => m.CreatedAt)
                .Take(100)
                .ToListAsync(ct);

            foreach (var msg in pending)
            {
                await using var sender = client.CreateSender(msg.Topic);
                await sender.SendMessageAsync(new ServiceBusMessage(msg.Body)
                {
                    Subject = msg.Subject,
                    MessageId = msg.Id.ToString()
                }, ct);
                msg.PublishedAt = DateTime.UtcNow;
            }

            await db.SaveChangesAsync(ct);
            await Task.Delay(TimeSpan.FromSeconds(2), ct);
        }
    }
}`,
        explanation: "Business change + outbox row commit in one transaction. If publish fails, message stays in outbox until next run. If DB commit fails, no ghost event. At-least-once delivery with idempotent consumers = eventual consistency that survives crashes."
      }],
      flashcards: [
        { front: "Outbox pattern?", back: "Save event to outbox table in same transaction as business change; separate worker publishes. Guarantees DB state ↔ event consistency." },
        { front: "Why not publish directly after SaveChanges?", back: "Crash between save and publish = lost event. Outbox survives crashes." },
        { front: "At-least-once delivery?", back: "Bus may deliver same message multiple times. Consumers MUST be idempotent (use MessageId, check state, use natural keys)." },
        { front: "DLQ triage?", back: "Dashboard showing DLQ counts per queue, grouped by reason. Ops inspects, fixes root cause, resubmits (or abandons)." }
      ],
      challenges: [{
        title: "Outbox write within transaction",
        difficulty: "Enterprise",
        prompt: "ApproveOrderAsync: update Order.Status, insert OutboxMessage 'OrderApproved'. Both commit atomically.",
        starterCode: `public class Order { public Guid Id { get; set; } public string Status { get; set; } = "Pending"; }
public record OrderApprovedEvent(Guid OrderId, DateTime At);`,
        solution: `public async Task ApproveAsync(Guid orderId, CancellationToken ct)
{
    var order = await _db.Orders.FindAsync(new object[] { orderId }, ct)
        ?? throw new NotFoundException(nameof(Order), orderId);

    if (order.Status != "Pending")
        throw new InvalidOperationException("Only pending orders can be approved");

    order.Status = "Approved";

    _db.OutboxMessages.Add(new OutboxMessage
    {
        Id = Guid.NewGuid(),
        Topic = "order-events",
        Subject = "OrderApproved",
        Body = JsonSerializer.Serialize(
            new OrderApprovedEvent(order.Id, DateTime.UtcNow)),
        CreatedAt = DateTime.UtcNow
    });

    await _db.SaveChangesAsync(ct);   // atomic
}`,
        explanation: "One SaveChangesAsync = one DB transaction = both changes commit or neither. Crash during subsequent publish? Outbox worker retries. This is the architecture behind durable event sourcing.",
        hint: "Insert OutboxMessage + mutate entity, single SaveChangesAsync."
      }]
    }
  }
}

,

/* ====================== DAY 23 ====================== */
{
  id: 23, day: 23,
  title: "Background Services",
  subtitle: "Long-running work hosted inside the web app or as dedicated workers.",
  overview: "IHostedService, BackgroundService, PeriodicTimer, Channels, graceful shutdown.",
  csharpFocus: "Cancellation propagation, async loops, System.Threading.Channels.",
  modes: {
    beginner: {
      concept: "BackgroundService is the base class for long-running work inside a .NET host. Override ExecuteAsync — it's called once at startup with a stopping CancellationToken. Return from the method when ct is triggered (shutdown). Register with AddHostedService. Same host can run web requests + background workers together.",
      codeExamples: [{
        title: "BackgroundService basics",
        lang: "csharp",
        code: `public class HeartbeatService : BackgroundService
{
    private readonly ILogger<HeartbeatService> _log;
    public HeartbeatService(ILogger<HeartbeatService> log) { _log = log; }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            _log.LogInformation("Heartbeat at {Time}", DateTimeOffset.UtcNow);
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                // expected during shutdown
                break;
            }
        }
    }
}

builder.Services.AddHostedService<HeartbeatService>();`,
        explanation: "Loop until ct signals. Catch OperationCanceledException from Task.Delay — it's normal shutdown behavior, not an error. AddHostedService starts it when the host starts, stops it on shutdown."
      }],
      flashcards: [
        { front: "IHostedService vs BackgroundService?", back: "IHostedService: low-level StartAsync/StopAsync. BackgroundService: convenient base with ExecuteAsync + stoppingToken. Use BackgroundService unless you need explicit start/stop control." },
        { front: "stoppingToken?", back: "CancellationToken signaled when the host is shutting down. Respect it to exit cleanly within the shutdown timeout." },
        { front: "Why catch OperationCanceledException?", back: "Task.Delay throws when ct fires. That's a normal shutdown signal, not an error — break out of the loop, don't log as failure." },
        { front: "AddHostedService lifetime?", back: "Singleton. If you need scoped services (DbContext) inside, create a scope per unit of work with IServiceScopeFactory." }
      ],
      challenges: [{
        title: "Periodic worker",
        difficulty: "Warm-up",
        prompt: "BackgroundService logging 'tick' every 10 seconds; exits cleanly on shutdown.",
        starterCode: `// TODO`,
        solution: `public class TickService : BackgroundService
{
    private readonly ILogger<TickService> _log;
    public TickService(ILogger<TickService> log) { _log = log; }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            _log.LogInformation("tick at {Time}", DateTimeOffset.UtcNow);
            try { await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }
}

builder.Services.AddHostedService<TickService>();`,
        explanation: "The standard loop shape. Replace Log with your actual work.",
        hint: "while (!ct.IsCancellationRequested) + Task.Delay + try/catch(OCE)."
      }]
    },
    mid: {
      concept: "PeriodicTimer (.NET 6+) is a cleaner alternative to Task.Delay loops: WaitForNextTickAsync yields on schedule and returns false on disposal. For scoped dependencies (DbContext), use IServiceScopeFactory per tick — the BackgroundService is a singleton but a fresh scope per iteration keeps DB work isolated.",
      codeExamples: [{
        title: "PeriodicTimer + scoped work",
        lang: "csharp",
        code: `public class StaleDeviceCleaner : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<StaleDeviceCleaner> _log;

    public StaleDeviceCleaner(
        IServiceScopeFactory scopeFactory,
        ILogger<StaleDeviceCleaner> log)
    { _scopeFactory = scopeFactory; _log = log; }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(15));

        while (await timer.WaitForNextTickAsync(ct))
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

                var cutoff = DateTime.UtcNow.AddDays(-30);
                var affected = await db.Devices
                    .Where(d => d.IsActive && d.LastSeenAt < cutoff)
                    .ExecuteUpdateAsync(
                        s => s.SetProperty(d => d.IsActive, false),
                        ct);

                _log.LogInformation("Deactivated {Count} stale devices", affected);
            }
            catch (Exception ex) when (!ct.IsCancellationRequested)
            {
                _log.LogError(ex, "Stale cleanup failed");
            }
        }
    }
}`,
        explanation: "PeriodicTimer returns false cleanly when ct fires. Scope per iteration gives the worker a fresh DbContext — and disposes it when done, releasing resources."
      }],
      flashcards: [
        { front: "PeriodicTimer vs Task.Delay?", back: "PeriodicTimer encapsulates the schedule + cancellation; Task.Delay requires manual loop management. Cleaner for periodic work." },
        { front: "Why IServiceScopeFactory?", back: "BackgroundService is singleton. Scoped services (DbContext) need their own scope per unit of work; the factory creates them." },
        { front: "when (!ct.IsCancellationRequested) filter?", back: "Only log+swallow when it's NOT shutdown. During shutdown, let the cancellation propagate." },
        { front: "ExecuteUpdateAsync in a worker?", back: "Perfect fit — bulk update without loading entities. Minimal memory, minimal DB round-trips." }
      ],
      challenges: [{
        title: "Scheduled job with scoped DbContext",
        difficulty: "Mid",
        prompt: "BackgroundService that every 5 minutes removes expired OutboxMessages (CreatedAt older than 30 days, PublishedAt != null).",
        starterCode: `public class OutboxMessage { public Guid Id { get; set; } public DateTime CreatedAt { get; set; } public DateTime? PublishedAt { get; set; } }`,
        solution: `public class OutboxCleanupService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<OutboxCleanupService> _log;

    public OutboxCleanupService(
        IServiceScopeFactory scopeFactory,
        ILogger<OutboxCleanupService> log)
    { _scopeFactory = scopeFactory; _log = log; }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(5));

        while (await timer.WaitForNextTickAsync(ct))
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

                var cutoff = DateTime.UtcNow.AddDays(-30);
                var removed = await db.OutboxMessages
                    .Where(m => m.PublishedAt != null && m.CreatedAt < cutoff)
                    .ExecuteDeleteAsync(ct);

                _log.LogInformation("Cleaned {Count} outbox entries", removed);
            }
            catch (Exception ex) when (!ct.IsCancellationRequested)
            {
                _log.LogError(ex, "Outbox cleanup failed");
            }
        }
    }
}`,
        explanation: "ExecuteDeleteAsync (EF 7+) issues one DELETE — far faster than load-then-remove loops. Scoped DbContext per tick.",
        hint: "PeriodicTimer + scope + ExecuteDeleteAsync."
      }]
    },
    advanced: {
      concept: "System.Threading.Channels is a producer-consumer primitive for in-process queuing. API writes messages to Channel.Writer; a BackgroundService reads from Channel.Reader. Bounded channels apply back-pressure (writer waits if full). Perfect for async work that doesn't need a durable bus but benefits from decoupling request handling from processing.",
      codeExamples: [{
        title: "Channel-based work queue",
        lang: "csharp",
        code: `public record AuditEntry(Guid UserId, string Action, DateTime At);

public class AuditQueue
{
    private readonly Channel<AuditEntry> _channel;

    public AuditQueue()
    {
        _channel = Channel.CreateBounded<AuditEntry>(new BoundedChannelOptions(10_000)
        {
            FullMode = BoundedChannelFullMode.Wait
        });
    }

    public ValueTask EnqueueAsync(AuditEntry entry, CancellationToken ct)
        => _channel.Writer.WriteAsync(entry, ct);

    public IAsyncEnumerable<AuditEntry> ReadAllAsync(CancellationToken ct)
        => _channel.Reader.ReadAllAsync(ct);
}

builder.Services.AddSingleton<AuditQueue>();
builder.Services.AddHostedService<AuditWriter>();

public class AuditWriter : BackgroundService
{
    private readonly AuditQueue _queue;
    private readonly IServiceScopeFactory _scopeFactory;

    public AuditWriter(AuditQueue queue, IServiceScopeFactory scopeFactory)
    { _queue = queue; _scopeFactory = scopeFactory; }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        var batch = new List<AuditEntry>(100);
        await foreach (var entry in _queue.ReadAllAsync(ct))
        {
            batch.Add(entry);
            if (batch.Count >= 100)
            {
                await FlushAsync(batch, ct);
                batch.Clear();
            }
        }
        if (batch.Count > 0) await FlushAsync(batch, ct);
    }

    private async Task FlushAsync(List<AuditEntry> batch, CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.AuditEntries.AddRange(batch);
        await db.SaveChangesAsync(ct);
    }
}`,
        explanation: "Requests enqueue (cheap, non-blocking). Writer batches 100 at a time for efficient DB inserts. Bounded channel with Wait gives back-pressure — if consumers can't keep up, writers slow down instead of exploding memory."
      }],
      flashcards: [
        { front: "Channel<T>?", back: "Producer-consumer queue in .NET. Thread-safe, async-friendly. Use for in-process work decoupling." },
        { front: "Bounded vs unbounded channel?", back: "Bounded enforces capacity (back-pressure). Unbounded grows forever (risk: OOM). Prefer bounded for production." },
        { front: "FullMode options?", back: "Wait (writer blocks), DropOldest, DropNewest, DropWrite. Pick based on policy (keep all vs prioritize recency)." },
        { front: "Why batch DB writes?", back: "Per-row INSERT is slow. Batching cuts round-trips dramatically. Channel-based workers naturally enable batching." }
      ],
      challenges: [{
        title: "Channel-based notifier",
        difficulty: "Advanced",
        prompt: "NotificationQueue with bounded channel capacity 1000. BackgroundService reads and calls INotifier.SendAsync for each.",
        starterCode: `public record Notification(string UserId, string Message);
public interface INotifier { Task SendAsync(Notification n, CancellationToken ct); }`,
        solution: `public class NotificationQueue
{
    private readonly Channel<Notification> _channel = Channel.CreateBounded<Notification>(
        new BoundedChannelOptions(1000) { FullMode = BoundedChannelFullMode.Wait });

    public ValueTask EnqueueAsync(Notification n, CancellationToken ct)
        => _channel.Writer.WriteAsync(n, ct);

    public IAsyncEnumerable<Notification> ReadAllAsync(CancellationToken ct)
        => _channel.Reader.ReadAllAsync(ct);
}

public class NotificationWorker : BackgroundService
{
    private readonly NotificationQueue _queue;
    private readonly IServiceScopeFactory _scopeFactory;

    public NotificationWorker(
        NotificationQueue queue, IServiceScopeFactory scopeFactory)
    { _queue = queue; _scopeFactory = scopeFactory; }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        await foreach (var n in _queue.ReadAllAsync(ct))
        {
            using var scope = _scopeFactory.CreateScope();
            var notifier = scope.ServiceProvider.GetRequiredService<INotifier>();
            await notifier.SendAsync(n, ct);
        }
    }
}

builder.Services.AddSingleton<NotificationQueue>();
builder.Services.AddHostedService<NotificationWorker>();`,
        explanation: "ReadAllAsync yields messages as they arrive; the await foreach blocks when empty, resumes on enqueue. Scope per message gives the notifier its own dependencies.",
        hint: "Channel.CreateBounded + ReadAllAsync + scope per message."
      }]
    },
    enterprise: {
      concept: "Production workers need graceful shutdown (drain in-flight work before exit), health checks (is the worker alive and processing?), and observability (throughput, lag, error rates). ShutdownTimeout in host options controls how long shutdown waits. Health checks published via /health endpoints let Kubernetes/AKS restart stuck workers.",
      codeExamples: [{
        title: "Graceful shutdown + health checks",
        lang: "csharp",
        code: `builder.Host.ConfigureHostOptions(opt =>
{
    opt.ShutdownTimeout = TimeSpan.FromSeconds(60);
});

public class ProcessingHealthCheck : IHealthCheck
{
    private readonly IProcessorState _state;
    public ProcessingHealthCheck(IProcessorState state) { _state = state; }

    public Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context, CancellationToken ct = default)
    {
        var since = DateTime.UtcNow - _state.LastProcessedAt;
        if (since > TimeSpan.FromMinutes(5))
            return Task.FromResult(HealthCheckResult.Unhealthy(
                $"No processing for {since.TotalMinutes:F1} minutes"));

        return Task.FromResult(HealthCheckResult.Healthy(
            $"Last processed {since.TotalSeconds:F0}s ago"));
    }
}

builder.Services.AddSingleton<IProcessorState, ProcessorState>();
builder.Services.AddHealthChecks()
    .AddCheck<ProcessingHealthCheck>("processor", tags: new[] { "ready" });

app.MapHealthChecks("/health/live");
app.MapHealthChecks("/health/ready",
    new HealthCheckOptions { Predicate = c => c.Tags.Contains("ready") });

public class ComplianceWorker : BackgroundService
{
    private readonly IProcessorState _state;
    private readonly IServiceScopeFactory _scopeFactory;

    public ComplianceWorker(
        IProcessorState state, IServiceScopeFactory scopeFactory)
    { _state = state; _scopeFactory = scopeFactory; }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(30));
        while (await timer.WaitForNextTickAsync(ct))
        {
            using var scope = _scopeFactory.CreateScope();
            var svc = scope.ServiceProvider.GetRequiredService<IComplianceService>();
            await svc.ProcessBatchAsync(ct);
            _state.LastProcessedAt = DateTime.UtcNow;
        }
    }
}`,
        explanation: "Liveness check: is the process running? Readiness check: is it processing work? Kubernetes uses both. ShutdownTimeout gives the worker 60s to finish in-flight work before forced kill."
      }],
      flashcards: [
        { front: "Liveness vs readiness?", back: "Liveness: process alive? (restart if no). Readiness: ready for traffic/work? (remove from LB if no)." },
        { front: "ShutdownTimeout?", back: "How long the host waits for services to complete after signaling ct. Default 30s; increase for workers with long units of work." },
        { front: "Why track LastProcessedAt?", back: "Health checks read it. If 'too long since last batch', report unhealthy → orchestrator restarts." },
        { front: "Web app + worker in one host?", back: "Viable for small systems. At scale, separate deployables — workers scale independently of web front-end." }
      ],
      challenges: [{
        title: "Health-aware worker",
        difficulty: "Enterprise",
        prompt: "BackgroundService updates IProcessorState.LastProcessedAt after each batch. HealthCheck reports unhealthy if no update in 5 min.",
        starterCode: `public interface IProcessorState { DateTime LastProcessedAt { get; set; } }`,
        solution: `public class ProcessorState : IProcessorState
{
    public DateTime LastProcessedAt { get; set; } = DateTime.UtcNow;
}

public class BatchWorker : BackgroundService
{
    private readonly IProcessorState _state;
    private readonly IServiceScopeFactory _scopeFactory;

    public BatchWorker(IProcessorState state, IServiceScopeFactory scopeFactory)
    { _state = state; _scopeFactory = scopeFactory; }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(30));
        while (await timer.WaitForNextTickAsync(ct))
        {
            using var scope = _scopeFactory.CreateScope();
            var svc = scope.ServiceProvider.GetRequiredService<IBatchProcessor>();
            await svc.RunAsync(ct);
            _state.LastProcessedAt = DateTime.UtcNow;
        }
    }
}

public class LivenessCheck : IHealthCheck
{
    private readonly IProcessorState _state;
    public LivenessCheck(IProcessorState state) { _state = state; }

    public Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext ctx, CancellationToken ct = default)
    {
        var since = DateTime.UtcNow - _state.LastProcessedAt;
        return Task.FromResult(since > TimeSpan.FromMinutes(5)
            ? HealthCheckResult.Unhealthy($"Stale by {since.TotalMinutes:F1}m")
            : HealthCheckResult.Healthy());
    }
}

builder.Services.AddSingleton<IProcessorState, ProcessorState>();
builder.Services.AddHostedService<BatchWorker>();
builder.Services.AddHealthChecks().AddCheck<LivenessCheck>("batch-worker");`,
        explanation: "The state singleton is shared between worker (writes) and health check (reads). Orchestrator (AKS, Azure Container Apps) restarts the pod when /health/ready returns 503.",
        hint: "Singleton state + update after each batch + health check reads it."
      }]
    }
  }
}

,

/* ====================== DAY 24 ====================== */
{
  id: 24, day: 24,
  title: "Unit Testing (xUnit + Moq)",
  subtitle: "Isolated tests for business logic, written to stay fast and honest.",
  overview: "xUnit structure, Moq for dependencies, arrange-act-assert, what to test, FluentAssertions.",
  csharpFocus: "Test attributes, lambda setup in Moq, async assertions.",
  modes: {
    beginner: {
      concept: "Unit tests verify a single piece of code in isolation. xUnit is the standard test framework: [Fact] for single-case tests, [Theory] + [InlineData] for parameterized. Arrange-Act-Assert is the canonical layout: set up inputs, call the method, assert outcomes. Moq creates fake implementations of interfaces so tests don't hit real DBs or services.",
      codeExamples: [{
        title: "xUnit + Moq basics",
        lang: "csharp",
        code: `// NuGet: xunit, Moq, FluentAssertions
public class OrderServiceTests
{
    [Fact]
    public async Task CreateAsync_PositiveAmount_Succeeds()
    {
        // Arrange
        var repo = new Mock<IOrderRepository>();
        var sut = new OrderService(repo.Object);

        // Act
        var result = await sut.CreateAsync(
            new CreateOrderRequest(100m), CancellationToken.None);

        // Assert
        result.Amount.Should().Be(100m);
        repo.Verify(r => r.AddAsync(It.IsAny<Order>(), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(-100)]
    public async Task CreateAsync_NonPositiveAmount_Throws(decimal amount)
    {
        var repo = new Mock<IOrderRepository>();
        var sut = new OrderService(repo.Object);

        var act = () => sut.CreateAsync(
            new CreateOrderRequest(amount), CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>();
    }
}`,
        explanation: "One Fact per behavior, Theory for the same behavior across multiple inputs. `sut` (system under test) is a convention — names the thing you're testing. FluentAssertions (`Should().Be(...)`) reads like English and produces clearer failure messages than raw Assert.Equal."
      }],
      flashcards: [
        { front: "Arrange-Act-Assert?", back: "Three-section layout. Arrange: set up. Act: call the method. Assert: verify outcome. Makes tests readable at a glance." },
        { front: "[Fact] vs [Theory]?", back: "Fact: single test case. Theory + InlineData: same test body, multiple inputs. Cuts duplication." },
        { front: "Mock<T>?", back: "Moq creates an IT-compatible test double. Setup behavior with `.Setup(...)`, verify calls with `.Verify(...)`. Use .Object to get the instance." },
        { front: "Why FluentAssertions?", back: "Readable: `result.Should().Be(100)`. Better failure messages. Supports async, collections, exceptions." }
      ],
      challenges: [{
        title: "First unit test",
        difficulty: "Warm-up",
        prompt: "Test: DeviceService.GetAsync returns null when repo returns null.",
        starterCode: `public class DeviceService
{
    private readonly IDeviceRepository _repo;
    public DeviceService(IDeviceRepository repo) { _repo = repo; }
    public Task<Device?> GetAsync(Guid id, CancellationToken ct) => _repo.GetAsync(id, ct);
}
public interface IDeviceRepository { Task<Device?> GetAsync(Guid id, CancellationToken ct); }`,
        solution: `public class DeviceServiceTests
{
    [Fact]
    public async Task GetAsync_NotInRepo_ReturnsNull()
    {
        var repo = new Mock<IDeviceRepository>();
        repo.Setup(r => r.GetAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Device?)null);
        var sut = new DeviceService(repo.Object);

        var result = await sut.GetAsync(Guid.NewGuid(), CancellationToken.None);

        result.Should().BeNull();
    }
}`,
        explanation: "Setup returns null; assert Service returns null. ReturnsAsync is Moq's async-aware return.",
        hint: "Setup the mock → Act → assert null."
      }]
    },
    mid: {
      concept: "Moq's Setup matches arguments: specific values, It.IsAny<T>(), It.Is<T>(predicate). Verify confirms a method was called with expected args. Use Callback to capture arguments for deeper inspection. For async, ReturnsAsync/ThrowsAsync match on return type.",
      codeExamples: [{
        title: "Argument matching and capture",
        lang: "csharp",
        code: `[Fact]
public async Task EnrollAsync_ExistingSerial_Throws()
{
    // Arrange
    var repo = new Mock<IDeviceRepository>();
    repo.Setup(r => r.ExistsBySerialAsync("ABC123", It.IsAny<CancellationToken>()))
        .ReturnsAsync(true);

    var sut = new DeviceService(repo.Object);

    // Act + Assert
    var act = () => sut.EnrollAsync(
        new EnrollRequest("My Device", "ABC123"),
        CancellationToken.None);

    await act.Should().ThrowAsync<DuplicateDeviceException>();
}

[Fact]
public async Task EnrollAsync_NewSerial_CallsAddWithCorrectDevice()
{
    Device? captured = null;
    var repo = new Mock<IDeviceRepository>();
    repo.Setup(r => r.ExistsBySerialAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
        .ReturnsAsync(false);
    repo.Setup(r => r.AddAsync(It.IsAny<Device>(), It.IsAny<CancellationToken>()))
        .Callback<Device, CancellationToken>((d, _) => captured = d)
        .Returns(Task.CompletedTask);

    var sut = new DeviceService(repo.Object);
    await sut.EnrollAsync(
        new EnrollRequest("My Device", "ABC123"), CancellationToken.None);

    captured.Should().NotBeNull();
    captured!.Name.Should().Be("My Device");
    captured.SerialNumber.Should().Be("ABC123");
    captured.EnrolledAt.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromSeconds(5));
}`,
        explanation: "Callback captures the argument into a local so you can assert properties individually. BeCloseTo handles timestamps without brittleness."
      }],
      flashcards: [
        { front: "It.IsAny<T>() vs It.Is<T>(predicate)?", back: "IsAny: match anything. Is: match a predicate (It.Is<int>(x => x > 0))." },
        { front: "Callback<T>(...)?", back: "Runs on invocation. Capture arguments, record side effects. Combine with Returns for stubbed return." },
        { front: "ThrowsAsync<T>?", back: "FluentAssertions method asserting an async delegate throws TException. Returns the exception for further inspection." },
        { front: "Moq: Loose vs Strict?", back: "Loose (default): unstubbed calls return default. Strict: throw on unstubbed. Loose is usually fine; strict catches over-mocking." }
      ],
      challenges: [{
        title: "Verify interaction + capture",
        difficulty: "Mid",
        prompt: "Test: OrderService.ApproveAsync calls IEmailer.SendAsync with user email and 'order.approved' template.",
        starterCode: `public interface IEmailer { Task SendAsync(string to, string template, object data, CancellationToken ct); }`,
        solution: `[Fact]
public async Task ApproveAsync_SendsApprovalEmail()
{
    var repo = new Mock<IOrderRepository>();
    var emailer = new Mock<IEmailer>();

    var order = new Order { Id = Guid.NewGuid(), CustomerEmail = "user@example.com" };
    repo.Setup(r => r.GetAsync(order.Id, It.IsAny<CancellationToken>()))
        .ReturnsAsync(order);

    var sut = new OrderService(repo.Object, emailer.Object);
    await sut.ApproveAsync(order.Id, CancellationToken.None);

    emailer.Verify(e => e.SendAsync(
        "user@example.com",
        "order.approved",
        It.IsAny<object>(),
        It.IsAny<CancellationToken>()),
        Times.Once);
}`,
        explanation: "Verify asserts the call happened with specific args. Times.Once catches accidental double-sends.",
        hint: "emailer.Verify(e => e.SendAsync(...), Times.Once)."
      }]
    },
    advanced: {
      concept: "Testing EF Core is a choice: pure unit (mock repository) or integration (real SQLite in-memory or Testcontainers). Mocking DbContext/IQueryable is fragile — prefer an abstraction (repository/IQueryable wrapper) you can mock, or use a real test DB. For pure business logic, mocking is cleaner; for query correctness, real DB.",
      codeExamples: [{
        title: "SQLite in-memory for repository tests",
        lang: "csharp",
        code: `public class OrderRepositoryTests : IDisposable
{
    private readonly SqliteConnection _conn;
    private readonly AppDbContext _db;

    public OrderRepositoryTests()
    {
        _conn = new SqliteConnection("DataSource=:memory:");
        _conn.Open();

        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite(_conn)
            .Options;
        _db = new AppDbContext(options);
        _db.Database.EnsureCreated();
    }

    public void Dispose()
    {
        _db.Dispose();
        _conn.Dispose();
    }

    [Fact]
    public async Task AddAsync_PersistsOrder()
    {
        var repo = new OrderRepository(_db);
        var order = new Order { Id = Guid.NewGuid(), Amount = 42m };

        await repo.AddAsync(order, CancellationToken.None);

        var loaded = await _db.Orders.FindAsync(order.Id);
        loaded.Should().NotBeNull();
        loaded!.Amount.Should().Be(42m);
    }
}`,
        explanation: "SQLite in-memory gives a real SQL database that lives only for the test. Connection must stay open (the DB is gone when it closes). Fast, isolated, no cleanup needed — perfect for repository integration tests."
      }],
      flashcards: [
        { front: "Mock DbContext directly?", back: "Fragile — IQueryable is hard to mock correctly. Prefer real SQLite in-memory or a repository interface you can mock." },
        { front: "Why keep SQLite connection open?", back: "In-memory DB exists only while the connection is open. Close = data gone." },
        { front: "EnsureCreated vs Migrate?", back: "EnsureCreated builds schema from the model (fast, no migrations). Migrate runs migrations (slower, tests migration correctness). Use EnsureCreated in unit tests." },
        { front: "Test data builders?", back: "Small helper methods/classes that create valid entities with sensible defaults — keeps arrange sections short. `NewOrder().WithAmount(100).Build()`." }
      ],
      challenges: [{
        title: "SQLite repository test",
        difficulty: "Advanced",
        prompt: "Repository test: AddAsync persists; GetByIdAsync returns it.",
        starterCode: `public class Order { public Guid Id { get; set; } public decimal Amount { get; set; } }
public class OrderRepository {
    private readonly AppDbContext _db;
    public OrderRepository(AppDbContext db) { _db = db; }
    public async Task AddAsync(Order o, CancellationToken ct) { _db.Orders.Add(o); await _db.SaveChangesAsync(ct); }
    public Task<Order?> GetByIdAsync(Guid id, CancellationToken ct) => _db.Orders.FindAsync(new object[]{id}, ct).AsTask();
}`,
        solution: `public class OrderRepositoryTests : IDisposable
{
    private readonly SqliteConnection _conn;
    private readonly AppDbContext _db;
    private readonly OrderRepository _sut;

    public OrderRepositoryTests()
    {
        _conn = new SqliteConnection("DataSource=:memory:");
        _conn.Open();
        _db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite(_conn).Options);
        _db.Database.EnsureCreated();
        _sut = new OrderRepository(_db);
    }

    public void Dispose() { _db.Dispose(); _conn.Dispose(); }

    [Fact]
    public async Task AddThenGet_RoundTrips()
    {
        var order = new Order { Id = Guid.NewGuid(), Amount = 99m };
        await _sut.AddAsync(order, CancellationToken.None);

        var loaded = await _sut.GetByIdAsync(order.Id, CancellationToken.None);

        loaded.Should().NotBeNull();
        loaded!.Amount.Should().Be(99m);
    }
}`,
        explanation: "Connection kept alive in field; disposed in Dispose. One real DB per test class (xUnit constructs a new instance per test method, so each test gets a fresh DB).",
        hint: "Open connection + EnsureCreated + IDisposable."
      }]
    },
    enterprise: {
      concept: "Intune-scale testing applies test pyramids: many unit tests, fewer integration, even fewer E2E. Patterns: builders for test data, fixtures for shared setup (xUnit IClassFixture), deterministic time via IClock abstraction, trait categorization for selective test runs. Coverage is a hint, not a goal — mutation testing (Stryker.NET) reveals which tests actually catch bugs.",
      codeExamples: [{
        title: "IClock + fixtures + builders",
        lang: "csharp",
        code: `public interface IClock { DateTime UtcNow { get; } }
public class SystemClock : IClock { public DateTime UtcNow => DateTime.UtcNow; }
public class FakeClock : IClock { public DateTime UtcNow { get; set; } = new(2025, 1, 1); }

// Production uses SystemClock; tests use FakeClock
public class DeviceService
{
    private readonly IClock _clock;
    public DeviceService(IClock clock) { _clock = clock; }
    public Device Enroll(string name) => new()
    {
        Id = Guid.NewGuid(),
        Name = name,
        EnrolledAt = _clock.UtcNow   // deterministic in tests
    };
}

// Test data builder
public class OrderBuilder
{
    private Order _o = new() { Id = Guid.NewGuid(), Amount = 100m, Status = "Pending" };
    public OrderBuilder WithAmount(decimal a) { _o.Amount = a; return this; }
    public OrderBuilder WithStatus(string s) { _o.Status = s; return this; }
    public Order Build() => _o;
}

// Shared fixture
public class DatabaseFixture : IDisposable { /* shared SQLite */ }

public class OrderTests : IClassFixture<DatabaseFixture>
{
    private readonly DatabaseFixture _db;
    public OrderTests(DatabaseFixture db) { _db = db; }

    [Fact]
    [Trait("Category", "Fast")]
    public async Task ApproveAsync_PendingOrder_Succeeds()
    {
        var order = new OrderBuilder().WithAmount(50m).Build();
        // ... test ...
    }
}`,
        explanation: "IClock makes time a dependency — tests control it. Builders keep arrange sections focused on what matters for each test. IClassFixture shares expensive setup (DB) across tests in a class without re-creating it. Traits enable `dotnet test --filter Category=Fast` for quick feedback loops."
      }],
      flashcards: [
        { front: "IClock pattern?", back: "Abstract DateTime.UtcNow behind an interface. Production uses real clock; tests use a fake. Makes time-dependent logic deterministic." },
        { front: "Test pyramid?", back: "Many unit (fast, isolated), fewer integration (real pieces glued), very few E2E (full system). Cost and flakiness grow with each layer." },
        { front: "IClassFixture<T>?", back: "xUnit shared fixture per test class. Constructor runs once; test instance created per test. For expensive setup." },
        { front: "Traits and filtering?", back: "[Trait(\"Category\", \"Slow\")] tags tests. Filter with `dotnet test --filter`. CI runs slow separately; dev runs fast." }
      ],
      challenges: [{
        title: "Deterministic time test",
        difficulty: "Enterprise",
        prompt: "Test DeviceService.Enroll sets EnrolledAt to exactly IClock.UtcNow. Use FakeClock.",
        starterCode: `public interface IClock { DateTime UtcNow { get; } }
public class FakeClock : IClock { public DateTime UtcNow { get; set; } }`,
        solution: `[Fact]
public void Enroll_SetsEnrolledAtFromClock()
{
    var clock = new FakeClock { UtcNow = new DateTime(2025, 6, 15, 10, 30, 0) };
    var sut = new DeviceService(clock);

    var device = sut.Enroll("My Device");

    device.EnrolledAt.Should().Be(new DateTime(2025, 6, 15, 10, 30, 0));
}`,
        explanation: "Exact equality now possible because time is controlled. No BeCloseTo workaround needed. This is why time-as-dependency matters.",
        hint: "FakeClock with fixed UtcNow → assert exact equality."
      }]
    }
  }
},

/* ====================== DAY 25 ====================== */
{
  id: 25, day: 25,
  title: "Integration Testing & Deployment",
  subtitle: "Full-stack tests with WebApplicationFactory, and shipping to Azure.",
  overview: "WebApplicationFactory, TestServer, overriding services, Azure App Service / Container Apps deployment.",
  csharpFocus: "Generic host overrides, HttpClient test patterns, environment-based config.",
  modes: {
    beginner: {
      concept: "Integration tests exercise the real HTTP pipeline. WebApplicationFactory<TProgram> spins up the whole app in-process; CreateClient() returns an HttpClient hitting the in-memory server. You test routing, model binding, auth, filters, middleware — all the glue unit tests miss.",
      codeExamples: [{
        title: "WebApplicationFactory basics",
        lang: "csharp",
        code: `// NuGet: Microsoft.AspNetCore.Mvc.Testing

// Make Program accessible to tests
// In Program.cs, add at the bottom:
// public partial class Program { }

public class DeviceEndpointsTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;
    public DeviceEndpointsTests(WebApplicationFactory<Program> f) { _factory = f; }

    [Fact]
    public async Task Get_Unknown_Returns404()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync($"/api/devices/{Guid.NewGuid()}");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Post_ValidRequest_Returns201()
    {
        var client = _factory.CreateClient();
        var body = new { name = "My Device", osType = "Windows" };

        var response = await client.PostAsJsonAsync("/api/devices", body);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        response.Headers.Location.Should().NotBeNull();
    }
}`,
        explanation: "The factory bootstraps the full app. Tests hit real routes, real filters, real middleware. No mocks at this layer — the point is to verify glue."
      }],
      flashcards: [
        { front: "WebApplicationFactory<T>?", back: "xUnit-friendly host that runs your app in-process for testing. T is Program; needs `public partial class Program { }` for visibility." },
        { front: "CreateClient()?", back: "Returns HttpClient whose BaseAddress is the in-memory server. Real serialization, real pipeline." },
        { front: "Why integration tests?", back: "Unit tests miss wiring bugs: wrong route, missing filter registration, auth misconfig. Integration catches these." },
        { front: "Still keep unit tests?", back: "Yes. Integration tests are slower and broader. Most coverage comes from units; integration validates the assembly." }
      ],
      challenges: [{
        title: "Endpoint smoke test",
        difficulty: "Warm-up",
        prompt: "Test: GET /health returns 200.",
        starterCode: `// TODO`,
        solution: `public class HealthEndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;
    public HealthEndpointTests(WebApplicationFactory<Program> f) { _factory = f; }

    [Fact]
    public async Task Health_Returns200()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/health");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}`,
        explanation: "The simplest integration test. Validates the host starts, health middleware is registered, routing works.",
        hint: "CreateClient + GetAsync + Status assertion."
      }]
    },
    mid: {
      concept: "Real integration tests need to replace the DB with something test-friendly and sometimes swap services (fake emailer, fake time). WithWebHostBuilder + ConfigureServices lets you remove the prod registration and add a test one. SQLite in-memory shared by the factory + test is a common pattern.",
      codeExamples: [{
        title: "Override DbContext + services",
        lang: "csharp",
        code: `public class IntegrationFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureServices(services =>
        {
            // Remove prod DbContext
            var prod = services.SingleOrDefault(
                d => d.ServiceType == typeof(DbContextOptions<AppDbContext>));
            if (prod is not null) services.Remove(prod);

            // Replace with SQLite in-memory (shared across scopes via static connection)
            services.AddSingleton<SqliteConnection>(sp =>
            {
                var c = new SqliteConnection("DataSource=:memory:");
                c.Open();
                return c;
            });
            services.AddDbContext<AppDbContext>((sp, opt) =>
            {
                var conn = sp.GetRequiredService<SqliteConnection>();
                opt.UseSqlite(conn);
            });

            // Replace fakes
            services.AddSingleton<IEmailer, FakeEmailer>();
            services.AddSingleton<IClock, FakeClock>();
        });
    }
}

public class DeviceEndpointsTests : IClassFixture<IntegrationFactory>
{
    private readonly IntegrationFactory _factory;

    public DeviceEndpointsTests(IntegrationFactory f)
    {
        _factory = f;
        using var scope = f.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.Database.EnsureCreated();
    }

    [Fact]
    public async Task Post_Then_Get_RoundTrips()
    {
        var client = _factory.CreateClient();

        var post = await client.PostAsJsonAsync("/api/devices",
            new { name = "Test", osType = "Windows" });
        post.EnsureSuccessStatusCode();

        var location = post.Headers.Location!;
        var getResp = await client.GetAsync(location);

        getResp.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}`,
        explanation: "Custom factory subclass has one place to configure test overrides. Tests share the factory via IClassFixture. EnsureCreated builds the schema on first use. FakeEmailer/FakeClock are test doubles you can inspect."
      }],
      flashcards: [
        { front: "ConfigureWebHost override?", back: "Runs before app builds. Modify services (remove prod, add fakes) or config sources here." },
        { front: "Why remove the prod DbContext registration first?", back: "AddDbContext registers options; re-adding doesn't replace. Remove → re-add gives a clean registration." },
        { front: "IClassFixture vs AsyncLifetime?", back: "IClassFixture: shared setup via constructor. IAsyncLifetime: async InitializeAsync/DisposeAsync. Combine for async fixtures." },
        { front: "SQLite for integration vs real SQL?", back: "SQLite is fast and zero-config but differs from SQL Server in edge cases (collation, advanced SQL). Use Testcontainers (Day 25 enterprise) for real DB parity." }
      ],
      challenges: [{
        title: "Factory with fake emailer",
        difficulty: "Mid",
        prompt: "Factory replaces IEmailer with FakeEmailer. Test: POST /api/orders sends an email (FakeEmailer.Sent count == 1).",
        starterCode: `public interface IEmailer { Task SendAsync(string to, string body, CancellationToken ct); }
public class FakeEmailer : IEmailer {
    public List<(string To, string Body)> Sent { get; } = new();
    public Task SendAsync(string to, string body, CancellationToken ct) { Sent.Add((to, body)); return Task.CompletedTask; }
}`,
        solution: `public class TestFactory : WebApplicationFactory<Program>
{
    public FakeEmailer Emailer { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder b)
    {
        b.ConfigureServices(s =>
        {
            var existing = s.SingleOrDefault(d => d.ServiceType == typeof(IEmailer));
            if (existing is not null) s.Remove(existing);
            s.AddSingleton<IEmailer>(Emailer);
        });
    }
}

public class OrderTests : IClassFixture<TestFactory>
{
    private readonly TestFactory _factory;
    public OrderTests(TestFactory f) { _factory = f; }

    [Fact]
    public async Task Post_SendsEmail()
    {
        _factory.Emailer.Sent.Clear();
        var client = _factory.CreateClient();

        var resp = await client.PostAsJsonAsync("/api/orders",
            new { customerEmail = "a@b.com", amount = 10 });
        resp.EnsureSuccessStatusCode();

        _factory.Emailer.Sent.Should().HaveCount(1);
        _factory.Emailer.Sent[0].To.Should().Be("a@b.com");
    }
}`,
        explanation: "Factory exposes the fake as a property so tests can assert on its recorded calls. Clear() between tests keeps them isolated.",
        hint: "Expose fake on factory; assert after HTTP call."
      }]
    },
    advanced: {
      concept: "Authentication in integration tests: disable real auth, inject a test scheme that produces a known ClaimsPrincipal. Useful for testing [Authorize] endpoints without issuing real JWTs. Testcontainers runs real services (SQL Server, Redis) in Docker — better parity than SQLite for DB-heavy tests.",
      codeExamples: [{
        title: "Test auth + Testcontainers",
        lang: "csharp",
        code: `public class TestAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public TestAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> opts,
        ILoggerFactory log, UrlEncoder encoder)
        : base(opts, log, encoder) { }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, "00000000-0000-0000-0000-000000000001"),
            new Claim("oid", "00000000-0000-0000-0000-000000000001"),
            new Claim(ClaimTypes.Role, "Admin"),
            new Claim("permissions", "devices.read"),
            new Claim("permissions", "devices.write")
        };
        var id = new ClaimsIdentity(claims, "Test");
        var principal = new ClaimsPrincipal(id);
        var ticket = new AuthenticationTicket(principal, "Test");
        return Task.FromResult(AuthenticateResult.Success(ticket));
    }
}

public class AuthenticatedFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder b)
    {
        b.ConfigureServices(s =>
        {
            s.AddAuthentication(defaultScheme: "Test")
                .AddScheme<AuthenticationSchemeOptions, TestAuthHandler>(
                    "Test", _ => { });
        });
    }
}

// Testcontainers (NuGet: Testcontainers.MsSql)
public class SqlServerFixture : IAsyncLifetime
{
    public MsSqlContainer Container { get; } = new MsSqlBuilder().Build();
    public Task InitializeAsync() => Container.StartAsync();
    public Task DisposeAsync() => Container.DisposeAsync().AsTask();
}`,
        explanation: "TestAuthHandler short-circuits auth — every request is 'logged in' as a pre-configured user. Testcontainers spins up a real SQL Server in Docker just for the test run; teardown disposes it. Real fidelity; minimal setup."
      }],
      flashcards: [
        { front: "Test auth handler?", back: "Custom AuthenticationHandler that always succeeds with a pre-built principal. Replaces real JWT validation in tests." },
        { front: "Testcontainers?", back: "Starts real services in Docker for the test run: SQL Server, Redis, Kafka, etc. Real fidelity, auto cleanup." },
        { front: "IAsyncLifetime?", back: "xUnit async setup/teardown interface: InitializeAsync, DisposeAsync. For async-starting dependencies like containers." },
        { front: "When Testcontainers vs SQLite?", back: "Testcontainers for DB-heavy logic (stored procs, collation, SQL Server-specific features). SQLite for fast smoke tests of CRUD-only repos." }
      ],
      challenges: [{
        title: "Test auth scheme",
        difficulty: "Advanced",
        prompt: "TestAuthHandler attaching Admin role + NameIdentifier '00...001'. Test: GET /api/admin/devices returns 200.",
        starterCode: `// TODO`,
        solution: `public class TestAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public TestAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> opts,
        ILoggerFactory log, UrlEncoder encoder)
        : base(opts, log, encoder) { }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, "00000000-0000-0000-0000-000000000001"),
            new Claim(ClaimTypes.Role, "Admin")
        };
        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, "Test"));
        return Task.FromResult(AuthenticateResult.Success(
            new AuthenticationTicket(principal, "Test")));
    }
}

public class AuthFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder b)
    {
        b.ConfigureServices(s => s
            .AddAuthentication(defaultScheme: "Test")
            .AddScheme<AuthenticationSchemeOptions, TestAuthHandler>("Test", _ => { }));
    }
}

public class AdminEndpointTests : IClassFixture<AuthFactory>
{
    private readonly AuthFactory _factory;
    public AdminEndpointTests(AuthFactory f) { _factory = f; }

    [Fact]
    public async Task Admin_Devices_Returns200()
    {
        var client = _factory.CreateClient();
        var resp = await client.GetAsync("/api/admin/devices");
        resp.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}`,
        explanation: "Every integration test request runs authenticated as Admin. For per-test user variation, parameterize the handler with options.",
        hint: "AddScheme<AuthenticationSchemeOptions, TestAuthHandler>(\"Test\", _ => {})."
      }]
    },
    enterprise: {
      concept: "Deploying to Azure: App Service (PaaS, simplest), Container Apps (containers, scale-to-zero), AKS (full Kubernetes). Build once, deploy many: Docker image → Azure Container Registry → environments. CI/CD with GitHub Actions or Azure Pipelines. Config comes from Azure Key Vault + App Configuration. Monitoring via Application Insights. This is the stack Intune runs on.",
      codeExamples: [{
        title: "Dockerfile + GitHub Actions",
        lang: "csharp",
        code: `# Dockerfile
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS base
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src
COPY ["MyApi/MyApi.csproj", "MyApi/"]
RUN dotnet restore "MyApi/MyApi.csproj"
COPY . .
WORKDIR "/src/MyApi"
RUN dotnet build -c Release -o /app/build

FROM build AS publish
RUN dotnet publish -c Release -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENV ASPNETCORE_URLS=http://+:8080
ENTRYPOINT ["dotnet", "MyApi.dll"]

# .github/workflows/deploy.yml (excerpt)
# name: deploy
# on: { push: { branches: [main] } }
# jobs:
#   deploy:
#     runs-on: ubuntu-latest
#     steps:
#       - uses: actions/checkout@v4
#       - uses: actions/setup-dotnet@v4
#         with: { dotnet-version: '9.0.x' }
#       - run: dotnet test --configuration Release
#       - uses: azure/login@v2
#         with: { creds: \${{ secrets.AZURE_CREDENTIALS }} }
#       - run: |
#           az acr build --registry myregistry --image myapi:\${{ github.sha }} .
#           az containerapp update --name myapi-prod --resource-group rg-prod \\
#             --image myregistry.azurecr.io/myapi:\${{ github.sha }}`,
        explanation: "Multi-stage Dockerfile: build in SDK image, run in slim ASP.NET image (smaller, fewer vulnerabilities). Pipeline: test → build image → push to ACR → update Container App. Zero-downtime deploys via rolling update."
      }],
      flashcards: [
        { front: "App Service vs Container Apps vs AKS?", back: "App Service: PaaS, zip deploy. Container Apps: containers + scale-to-zero + KEDA. AKS: full Kubernetes, max control." },
        { front: "Multi-stage Docker build?", back: "Build in SDK image; copy output to runtime image. Runtime stays small — no compiler, no source, no secrets." },
        { front: "Where do secrets go?", back: "Key Vault. Reference from App Configuration or directly via DefaultAzureCredential. Never in appsettings committed to git." },
        { front: "Rolling deploys?", back: "Container Apps replace instances gradually; failed health checks roll back automatically. Zero downtime if the app starts healthy." }
      ],
      challenges: [{
        title: "Production-ready Dockerfile",
        difficulty: "Enterprise",
        prompt: "Multi-stage Dockerfile for a .NET 9 ASP.NET Core API. Listen on 8080. Restore as a separate layer for cache efficiency.",
        starterCode: `# TODO`,
        solution: `FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS base
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Restore layer: only changes when csproj changes
COPY ["MyApi/MyApi.csproj", "MyApi/"]
RUN dotnet restore "MyApi/MyApi.csproj"

# Build + publish
COPY . .
WORKDIR "/src/MyApi"
RUN dotnet publish -c Release -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENV ASPNETCORE_URLS=http://+:8080
ENTRYPOINT ["dotnet", "MyApi.dll"]`,
        explanation: "Copying csproj and restoring separately means the restore layer is cached across commits that don't change dependencies. 10x faster CI builds on typical commits.",
        hint: "Copy csproj + restore, then copy everything else."
      }]
    }
  }
}

];

if (typeof window !== 'undefined') window.DAYS_18_25 = DAYS_18_25;
