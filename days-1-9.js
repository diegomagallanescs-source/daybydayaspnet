/* ============================================================
   data/days-1-9.js — Days 1 through 8 (Checkpoint 1)
   Note: file name keeps "1-9" for forward-compat; day 9 is
   added in Checkpoint 2.
   ============================================================ */
const DAYS_1_9 = [

/* ====================== DAY 1 ====================== */
{
  id: 1, day: 1,
  title: "ASP.NET Core Fundamentals & Program.cs",
  subtitle: "The composition root where your web application is born, wired, and launched.",
  overview: "What ASP.NET Core is, how a Web API starts up, and what every line in Program.cs does.",
  csharpFocus: "Top-level statements, file-scoped namespaces, using directives, implicit usings.",
  modes: {
    beginner: {
      concept: "ASP.NET Core is a cross-platform framework for building web apps and APIs on .NET. A Web API returns data (JSON) instead of HTML. It runs on Kestrel, a cross-platform web server built into .NET. Every app starts in Program.cs — which does two jobs: register services on the DI container, then configure the middleware pipeline. Minimal hosting (.NET 6+) means no Startup class or Main method — just top-level statements.",
      codeExamples: [{
        title: "A minimal Program.cs",
        lang: "csharp",
        code: `var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();

app.Run();`,
        explanation: "Read top-to-bottom: build a WebApplicationBuilder, register services on builder.Services, call Build() to freeze the container and produce a WebApplication, add middleware in order, then Run() starts Kestrel and blocks until shutdown."
      }],
      flashcards: [
        { front: "What is Kestrel?", back: "The cross-platform web server that ships with ASP.NET Core. In production you often front it with IIS or Nginx." },
        { front: "What are the two phases in Program.cs?", back: "(1) Service registration on <code>builder.Services</code>. (2) Middleware pipeline on the built <code>app</code>. You can't add services after <code>Build()</code>." },
        { front: "Why two variables (builder and app)?", back: "Builder is mutable setup; <code>Build()</code> freezes DI and produces the runtime <code>app</code>. Separation prevents mutating services after the container is live." }
      ],
      challenges: [{
        title: "Register a service",
        difficulty: "Warm-up",
        prompt: "Register an `ITimeProvider` (transient) in Program.cs along with controllers and dev-only Swagger.",
        starterCode: `public interface ITimeProvider { DateTime UtcNow(); }
public class TimeProvider : ITimeProvider { public DateTime UtcNow() => DateTime.UtcNow; }

var builder = WebApplication.CreateBuilder(args);
// TODO: register services
var app = builder.Build();
// TODO: configure middleware
app.Run();`,
        solution: `var builder = WebApplication.CreateBuilder(args);
builder.Services.AddTransient<ITimeProvider, TimeProvider>();
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();
if (app.Environment.IsDevelopment()) { app.UseSwagger(); app.UseSwaggerUI(); }
app.UseHttpsRedirection();
app.MapControllers();
app.Run();`,
        explanation: "Register the implementation against the interface. Any controller can now take ITimeProvider in its constructor and get a fresh instance each request.",
        hint: "AddTransient<TInterface, TImplementation>()"
      }]
    },
    mid: {
      concept: "The builder pattern splits setup (mutable) from runtime (immutable). Once Build() runs, the service collection becomes an IServiceProvider. Middleware order is functional, not cosmetic — UseAuthentication must run before UseAuthorization. Group related registrations into extension methods so Program.cs reads as a table of contents, not a manual.",
      codeExamples: [{
        title: "Extension methods to keep Program.cs clean",
        lang: "csharp",
        code: `public static class ServiceRegistration
{
    public static IServiceCollection AddDataServices(
        this IServiceCollection services, IConfiguration config)
    {
        var cs = config.GetConnectionString("Default")!;
        services.AddDbContext<AppDbContext>(o => o.UseSqlServer(cs));
        services.AddScoped<IDeviceRepository, DeviceRepository>();
        services.AddScoped<IComplianceService, ComplianceService>();
        return services;
    }
}

// Program.cs becomes:
builder.Services.AddDataServices(builder.Configuration);`,
        explanation: "Return `services` so callers can chain. This `this IServiceCollection` pattern is the canonical way to compose registrations in .NET."
      }],
      flashcards: [
        { front: "Why does auth middleware order matter?", back: "UseAuthentication reads the token and sets <code>HttpContext.User</code>. UseAuthorization checks that user. Reversed, the authz check fires against an empty user." },
        { front: "IServiceCollection vs IServiceProvider?", back: "Collection = mutable registration list (setup-time). Provider = runtime container that resolves services." },
        { front: "What does AddControllers() return?", back: "An IMvcBuilder you can chain onto — JSON options, filters, model validation behavior." }
      ],
      challenges: [{
        title: "Refactor into feature modules",
        difficulty: "Mid",
        prompt: "Refactor a messy Program.cs so the service registrations split into `AddApiServices` and `AddPersistence` extension methods.",
        starterCode: `// Starter: flat registrations
builder.Services.AddControllers();
builder.Services.AddSwaggerGen();
builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseSqlServer(builder.Configuration.GetConnectionString("Default")));
builder.Services.AddScoped<IDeviceRepository, DeviceRepository>();`,
        solution: `public static class ServiceRegistration
{
    public static IServiceCollection AddApiServices(this IServiceCollection s)
    {
        s.AddControllers();
        s.AddEndpointsApiExplorer();
        s.AddSwaggerGen();
        return s;
    }
    public static IServiceCollection AddPersistence(
        this IServiceCollection s, IConfiguration c)
    {
        s.AddDbContext<AppDbContext>(o => o.UseSqlServer(c.GetConnectionString("Default")));
        s.AddScoped<IDeviceRepository, DeviceRepository>();
        return s;
    }
}

// Program.cs
builder.Services.AddApiServices();
builder.Services.AddPersistence(builder.Configuration);`,
        explanation: "Program.cs now reads like a feature list. Each extension method owns its slice — easy to unit-test, easy to toggle off.",
        hint: "Static class + `this IServiceCollection` parameter."
      }]
    },
    advanced: {
      concept: "WebApplicationBuilder is a facade over IHostBuilder, IWebHostBuilder, and IConfigurationBuilder. The DI container does scope validation in Development — it throws if a scoped service is captured by a singleton (classic bug). Force this in Production via UseDefaultServiceProvider with ValidateOnBuild and ValidateScopes.",
      codeExamples: [{
        title: "Validating options at startup",
        lang: "csharp",
        code: `public class CacheOptions
{
    public const string SectionName = "Cache";
    [Required] public string RedisConnection { get; set; } = default!;
    [Range(1, 3600)] public int DefaultTtlSeconds { get; set; } = 60;
}

builder.Services.AddOptions<CacheOptions>()
    .Bind(builder.Configuration.GetSection(CacheOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();`,
        explanation: "ValidateOnStart runs validation during host startup — misconfigured environments fail immediately, not on first request. The production-safe pattern for configuration."
      }],
      flashcards: [
        { front: "What does ValidateOnBuild do?", back: "Forces the container to resolve every registration at startup to catch missing dependencies before the first request." },
        { front: "Scoped service captured in a singleton — what happens?", back: "In Dev with scope validation: throws. In Prod without: the scoped service gets app lifetime — stale DbContexts, memory leaks." },
        { front: "Can you resolve scoped services from Program.cs?", back: "Yes — <code>using var scope = app.Services.CreateScope(); var svc = scope.ServiceProvider.GetRequiredService&lt;T&gt;();</code>. Common for running migrations at startup." },
        { front: "app.Run vs app.RunAsync?", back: "Run blocks the thread until shutdown. RunAsync returns a Task — used in integration tests and custom hosts." }
      ],
      challenges: [{
        title: "Apply migrations at startup",
        difficulty: "Advanced",
        prompt: "Modify Program.cs to apply pending EF Core migrations before Run(), using a scope so the DbContext is properly disposed.",
        starterCode: `var app = builder.Build();
// TODO: migrate
app.MapControllers();
app.Run();`,
        solution: `var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();
}

app.MapControllers();
app.Run();`,
        explanation: "DbContext is scoped; app.Services is root. Creating an explicit scope (and disposing it via using) is the correct pattern. Program.cs is an async context in .NET 6+, so await works.",
        hint: "CreateScope() inside a using block."
      }]
    },
    enterprise: {
      concept: "At Microsoft scale, Program.cs is a composition root driven by environment. Dev uses local SQL; Production adds Key Vault, Application Insights, distributed cache, and health probes. The pattern: thin Program.cs that delegates to feature modules, each owning its registrations and middleware. Features become additive, testable, and feature-flag-able.",
      codeExamples: [{
        title: "Production-shaped Program.cs",
        lang: "csharp",
        code: `var builder = WebApplication.CreateBuilder(args);

if (!builder.Environment.IsDevelopment())
{
    builder.Configuration.AddAzureKeyVault(
        new Uri(builder.Configuration["KeyVault:Uri"]!),
        new DefaultAzureCredential());
}

builder.Services.AddApplicationInsightsTelemetry();

builder.Services
    .AddApiInfrastructure(builder.Configuration)
    .AddComplianceFeature(builder.Configuration)
    .AddDeviceFeature(builder.Configuration);

builder.Services.AddHealthChecks()
    .AddDbContextCheck<AppDbContext>();

var app = builder.Build();

app.UseExceptionHandler();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHealthChecks("/health/live", new() { Predicate = _ => false });
app.MapHealthChecks("/health/ready");

app.Run();`,
        explanation: "/health/live with Predicate=false answers 'is the process alive?' — the K8s/App Service liveness probe. /health/ready runs every check — the readiness probe. Different semantics, different recovery actions."
      }],
      flashcards: [
        { front: "Liveness vs readiness?", back: "Liveness: restart me if dead. Readiness: route traffic only when I can serve. A DB blip should mark unready (remove from LB) without killing the pod." },
        { front: "Why Azure Key Vault over appsettings?", back: "Rotation without redeploy, audited access, HSM-backed keys, secrets never in source control or container images." },
        { front: "What is DefaultAzureCredential?", back: "A credential chain from Azure.Identity — Managed Identity, VS, Azure CLI. Same code works locally and in Azure." },
        { front: "Why feature modules?", back: "Ownership (compliance team owns AddComplianceFeature), feature-flaggable, testable (a test host composes only modules it needs)." }
      ],
      challenges: [{
        title: "Build a feature module with decorator",
        difficulty: "Enterprise",
        prompt: "Create an `AddDeviceFeature` that binds `DeviceOptions`, registers `DeviceService` as scoped, then wraps it with `LoggingDeviceService` (a decorator that also implements IDeviceService).",
        starterCode: `public interface IDeviceService { Task<Device?> GetByIdAsync(Guid id, CancellationToken ct); }
public class DeviceService : IDeviceService { /*...*/ }
public class LoggingDeviceService : IDeviceService {
    private readonly IDeviceService _inner; private readonly ILogger<LoggingDeviceService> _log;
    public LoggingDeviceService(IDeviceService inner, ILogger<LoggingDeviceService> log) { _inner = inner; _log = log; }
    public Task<Device?> GetByIdAsync(Guid id, CancellationToken ct) { _log.LogInformation("Fetch {Id}", id); return _inner.GetByIdAsync(id, ct); }
}`,
        solution: `public static class DeviceFeatureExtensions
{
    public static IServiceCollection AddDeviceFeature(
        this IServiceCollection s, IConfiguration c)
    {
        s.Configure<DeviceOptions>(c.GetSection("Devices"));

        // Concrete type — so the decorator can resolve it without recursion
        s.AddScoped<DeviceService>();
        s.AddScoped<IDeviceService>(sp =>
            new LoggingDeviceService(
                sp.GetRequiredService<DeviceService>(),
                sp.GetRequiredService<ILogger<LoggingDeviceService>>()));

        return s;
    }
}`,
        explanation: "Register the real service by its concrete type; register the interface via a factory that wraps it. If you registered both against IDeviceService, the decorator would inject itself — infinite recursion. Scrutor automates this as `services.Decorate<IDeviceService, LoggingDeviceService>()`.",
        hint: "Concrete type for the inner; factory for the interface."
      }]
    }
  }
},

/* ====================== DAY 2 ====================== */
{
  id: 2, day: 2,
  title: "Controllers & Routing",
  subtitle: "How URLs become C# methods — attribute routing and the MVC model.",
  overview: "Controllers, action methods, route templates, and how the framework picks which method handles a request.",
  csharpFocus: "Attributes, inheritance (ControllerBase), expression-bodied members.",
  modes: {
    beginner: {
      concept: "A controller groups related endpoints. For APIs, inherit from ControllerBase. Decorate with [ApiController] and [Route]. Methods become endpoints via [HttpGet], [HttpPost], etc. The token [controller] in a route template is replaced with the controller name minus the 'Controller' suffix.",
      codeExamples: [{
        title: "A basic API controller",
        lang: "csharp",
        code: `[ApiController]
[Route("api/[controller]")]
public class DevicesController : ControllerBase
{
    [HttpGet]
    public IActionResult GetAll() => Ok(new[] { "iPhone-1", "Surface-2" });

    [HttpGet("{id}")]
    public IActionResult GetById(int id)
    {
        if (id < 1) return NotFound();
        return Ok(new { id, name = $"Device-{id}" });
    }
}`,
        explanation: "[ApiController] enables auto model validation, [FromBody] inference for complex types, and ProblemDetails on errors. The route becomes api/devices because DevicesController drops the suffix."
      }],
      flashcards: [
        { front: "ControllerBase vs Controller?", back: "ControllerBase has everything for APIs (no view rendering). Controller adds views. For Web APIs, always use ControllerBase." },
        { front: "What does [ApiController] enable?", back: "Auto 400 on invalid models, [FromBody] inference for complex types, ProblemDetails error responses, stricter binding source detection." },
        { front: "What does [controller] resolve to?", back: "Class name minus 'Controller'. DevicesController → 'devices'." }
      ],
      challenges: [{
        title: "Simple controller",
        difficulty: "Warm-up",
        prompt: "Create a ProductsController at api/products with GET all and GET by id that returns 404 when id <= 0.",
        starterCode: `// TODO`,
        solution: `[ApiController]
[Route("api/[controller]")]
public class ProductsController : ControllerBase
{
    [HttpGet]
    public IActionResult GetAll() => Ok(new[] {
        new { id = 1, name = "Widget" }, new { id = 2, name = "Gadget" } });

    [HttpGet("{id:int}")]
    public IActionResult GetById(int id)
    {
        if (id <= 0) return NotFound();
        return Ok(new { id, name = $"Product-{id}" });
    }
}`,
        explanation: "The {id:int} constraint means the route only matches valid integers. Without it, api/products/abc would bind (and fail), returning 400 instead of a clean 404 routing miss.",
        hint: "Use [HttpGet(\"{id:int}\")]."
      }]
    },
    mid: {
      concept: "Route templates support constraints (:int, :guid, :minlength(3)), optional segments ({id?}), and defaults. Two actions can share a path if verbs differ. Use ActionResult<T> to preserve return-type info for Swagger and enable implicit Ok() wrapping.",
      codeExamples: [{
        title: "Route constraints and ActionResult<T>",
        lang: "csharp",
        code: `[HttpGet("{id:guid}")]
public ActionResult<Device> GetById(Guid id)
{
    var device = _repo.Find(id);
    if (device is null) return NotFound();
    return device;  // implicit Ok(device)
}

[HttpGet("by-name/{name:minlength(2)}")]
public ActionResult<IEnumerable<Device>> GetByName(string name)
    => Ok(_repo.Search(name));

[HttpPost]
public ActionResult<Device> Create([FromBody] CreateDeviceRequest req)
{
    var device = new Device { Id = Guid.NewGuid(), Name = req.Name };
    _repo.Add(device);
    return CreatedAtAction(nameof(GetById), new { id = device.Id }, device);
}`,
        explanation: "CreatedAtAction returns 201 with a Location header pointing at the new resource — the RESTful convention every Microsoft-internal API uses for successful POSTs."
      }],
      flashcards: [
        { front: "What's {id:guid}?", back: "A route constraint. The route only matches when the segment parses as a GUID, and the action receives the typed value." },
        { front: "ActionResult<T> vs IActionResult?", back: "ActionResult<T> preserves type info for Swagger and lets you return T directly (auto-wrapped in Ok). IActionResult works but hides the type." },
        { front: "When are two actions ambiguous?", back: "When they share verb + route template. Startup or first request fails with AmbiguousMatchException." },
        { front: "What does CreatedAtAction return?", back: "201 Created with a Location header built from the named action — the RESTful response for successful creation." }
      ],
      challenges: [{
        title: "Multi-action controller",
        difficulty: "Mid",
        prompt: "Build OrdersController with: GET /{id:int}, GET /by-customer/{customerId:guid}, POST. POST returns 201 with CreatedAtAction.",
        starterCode: `public record Order(int Id, Guid CustomerId, decimal Total);
public record CreateOrderRequest(Guid CustomerId, decimal Total);`,
        solution: `[ApiController]
[Route("api/[controller]")]
public class OrdersController : ControllerBase
{
    [HttpGet("{id:int}")]
    public ActionResult<Order> GetById(int id)
    {
        if (id < 1) return NotFound();
        return new Order(id, Guid.NewGuid(), 42.50m);
    }

    [HttpGet("by-customer/{customerId:guid}")]
    public ActionResult<IEnumerable<Order>> GetByCustomer(Guid customerId)
        => Ok(new[] { new Order(1, customerId, 10m) });

    [HttpPost]
    public ActionResult<Order> Create([FromBody] CreateOrderRequest req)
    {
        var order = new Order(100, req.CustomerId, req.Total);
        return CreatedAtAction(nameof(GetById), new { id = order.Id }, order);
    }
}`,
        explanation: "CreatedAtAction takes an action name, route values, and the created object. The framework builds the Location header from the route template. This pattern is bread-and-butter on Microsoft teams.",
        hint: "CreatedAtAction(nameof(GetById), new { id = ... }, order)."
      }]
    },
    advanced: {
      concept: "The framework picks actions via endpoint routing. UseRouting matches URL→endpoint; UseAuthorization/UseEndpoints execute it. For dynamic scenarios (feature flags, protocol versions) you can write IActionConstraint — per-action match filters that return 404 when they don't match. Route value transformers let you enforce URL style (kebab-case) without per-controller attributes.",
      codeExamples: [{
        title: "Feature-flag action constraint",
        lang: "csharp",
        code: `[AttributeUsage(AttributeTargets.Method)]
public class RequireFeatureAttribute : Attribute, IActionConstraint
{
    private readonly string _feature;
    public RequireFeatureAttribute(string feature) { _feature = feature; }
    public int Order => 0;

    public bool Accept(ActionConstraintContext ctx)
    {
        var flags = ctx.RouteContext.HttpContext.RequestServices
            .GetRequiredService<IFeatureFlags>();
        return flags.IsEnabled(_feature);
    }
}

[HttpGet("new-shape")]
[RequireFeature("NewShapeV2")]
public IActionResult New() => Ok("new!");`,
        explanation: "When the flag is off, the constraint rejects — client gets 404, not 403. This is how you dark-launch endpoints without leaking their existence."
      }],
      flashcards: [
        { front: "What is endpoint routing?", back: "UseRouting matches URL to endpoint; middleware between can read the selected endpoint via HttpContext.GetEndpoint(); UseEndpoints executes it." },
        { front: "What does IActionConstraint do?", back: "Per-action match filters. Useful for feature flags, header gates, protocol selection. Returning false → 404." },
        { front: "When does authorization run vs routing?", back: "UseRouting selects the endpoint → UseAuthorization sees it and applies policies → endpoint executes. Policies need endpoint metadata." },
        { front: "IOutboundParameterTransformer?", back: "Customizes how route tokens serialize in URLs (Pascal → kebab-case). Works bidirectionally for matching too." }
      ],
      challenges: [{
        title: "Version-matching constraint",
        difficulty: "Advanced",
        prompt: "Build [RequireApiVersion(\"v1\")] that matches only when request header X-Api-Version: v1. Two actions share a route but different versions.",
        starterCode: `// TODO`,
        solution: `public class RequireApiVersionAttribute : Attribute, IActionConstraint
{
    private readonly string _version;
    public RequireApiVersionAttribute(string v) { _version = v; }
    public int Order => 0;

    public bool Accept(ActionConstraintContext ctx)
    {
        var h = ctx.RouteContext.HttpContext.Request.Headers;
        return h.TryGetValue("X-Api-Version", out var v) && v.Contains(_version);
    }
}

[ApiController, Route("api/reports")]
public class ReportsController : ControllerBase
{
    [HttpGet, RequireApiVersion("v1")]
    public IActionResult GetV1() => Ok(new { version = "v1" });

    [HttpGet, RequireApiVersion("v2")]
    public IActionResult GetV2() => Ok(new { version = "v2", shape = new[] { "new" } });
}`,
        explanation: "Two candidates match path+verb. Constraints run — only the one matching the header accepts; the other is filtered out. Production uses Microsoft.AspNetCore.Mvc.Versioning, but understanding the primitive makes you effective when the defaults don't fit.",
        hint: "ActionConstraintContext exposes Request.Headers."
      }]
    },
    enterprise: {
      concept: "At scale, API versioning is non-negotiable. The Mvc.Versioning package supports URL-based, query-based, and header-based versioning, with DeprecatedApiVersion and auto api-supported-versions headers. For cross-cutting policy, IApplicationModelConvention applies filters/authz globally without per-controller attributes — one policy change, one file.",
      codeExamples: [{
        title: "URL-based versioning + deprecation",
        lang: "csharp",
        code: `// Program.cs
builder.Services.AddApiVersioning(o =>
{
    o.DefaultApiVersion = new ApiVersion(2, 0);
    o.AssumeDefaultVersionWhenUnspecified = true;
    o.ReportApiVersions = true;
    o.ApiVersionReader = new UrlSegmentApiVersionReader();
}).AddMvc();

[ApiController]
[ApiVersion("1.0", Deprecated = true)]
[ApiVersion("2.0")]
[Route("api/v{version:apiVersion}/[controller]")]
public class DevicesController : ControllerBase
{
    [HttpGet, MapToApiVersion("1.0")]
    public IActionResult GetV1() => Ok(new { shape = "legacy" });

    [HttpGet, MapToApiVersion("2.0")]
    public IActionResult GetV2() => Ok(new { shape = "current" });
}`,
        explanation: "ReportApiVersions=true emits api-supported-versions and api-deprecated-versions headers so clients see the migration path. Intune ships this on every versioned surface."
      }],
      flashcards: [
        { front: "Why URL-based versioning?", back: "Discoverable, visible in logs, easy to cache, hard to accidentally call wrong version. Purists dislike version in URI, but ops wins this debate." },
        { front: "What does MapToApiVersion do?", back: "Pins a specific action to one version when the controller declares multiple. Unpinned actions apply to all declared versions." },
        { front: "IApplicationModelConvention?", back: "Startup-time hook to inspect/mutate discovered controller metadata — apply filters, authz policies, route transforms — across the entire app." },
        { front: "Why prefer conventions over attributes for policy?", back: "One policy change touches one file, not N controllers. You can enforce 'every non-anon controller has X' without trusting reviewers to remember." }
      ],
      challenges: [{
        title: "Versioned compliance-policy endpoint",
        difficulty: "Enterprise",
        prompt: "Build CompliancePoliciesController at /api/v{version:apiVersion}/compliance-policies. V1 returns string[] names. V2 returns { id, name, severity } objects. Mark V1 deprecated.",
        starterCode: `// TODO`,
        solution: `[ApiController]
[ApiVersion("1.0", Deprecated = true)]
[ApiVersion("2.0")]
[Route("api/v{version:apiVersion}/compliance-policies")]
public class CompliancePoliciesController : ControllerBase
{
    [HttpGet, MapToApiVersion("1.0")]
    public ActionResult<IEnumerable<string>> GetV1() =>
        new[] { "MinOSVersion", "RequirePasscode" };

    [HttpGet, MapToApiVersion("2.0")]
    public ActionResult<IEnumerable<PolicyDto>> GetV2() => new[]
    {
        new PolicyDto(Guid.NewGuid(), "MinOSVersion", Severity.High),
        new PolicyDto(Guid.NewGuid(), "RequirePasscode", Severity.Critical)
    };
}

public record PolicyDto(Guid Id, string Name, Severity Severity);
public enum Severity { Low, Medium, High, Critical }`,
        explanation: "One controller, one resource, two shapes. Clients on /v1 get a deprecation header warning; /v2 is the current shape. Tomorrow V1 can be removed with zero changes to V2.",
        hint: "[ApiVersion(\"1.0\", Deprecated = true)] on the class."
      }]
    }
  }
},

/* ====================== DAY 3 ====================== */
{
  id: 3, day: 3,
  title: "HTTP Verbs & Status Codes",
  subtitle: "The semantic contract between your API and its clients.",
  overview: "GET/POST/PUT/PATCH/DELETE semantics and the status codes that communicate outcomes precisely.",
  csharpFocus: "Pattern matching with switch expressions, ranges, null-coalescing.",
  modes: {
    beginner: {
      concept: "HTTP verbs aren't interchangeable. GET fetches (safe, idempotent, no body). POST creates or triggers (not idempotent). PUT replaces entirely (idempotent). DELETE removes (idempotent). PATCH partially updates. Status codes: 200 OK, 201 Created, 204 No Content, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 409 Conflict, 500 Internal Server Error.",
      codeExamples: [{
        title: "All five verbs",
        lang: "csharp",
        code: `[ApiController]
[Route("api/[controller]")]
public class BooksController : ControllerBase
{
    private static readonly Dictionary<int, Book> _store = new();

    [HttpGet]
    public IActionResult GetAll() => Ok(_store.Values);

    [HttpGet("{id:int}")]
    public IActionResult GetById(int id) =>
        _store.TryGetValue(id, out var b) ? Ok(b) : NotFound();

    [HttpPost]
    public IActionResult Create([FromBody] Book book)
    {
        _store[book.Id] = book;
        return CreatedAtAction(nameof(GetById), new { id = book.Id }, book);
    }

    [HttpPut("{id:int}")]
    public IActionResult Replace(int id, [FromBody] Book book)
    {
        if (!_store.ContainsKey(id)) return NotFound();
        _store[id] = book with { Id = id };
        return NoContent();
    }

    [HttpDelete("{id:int}")]
    public IActionResult Delete(int id) =>
        _store.Remove(id) ? NoContent() : NotFound();
}

public record Book(int Id, string Title);`,
        explanation: "200+body for reads, 201+Location for create, 204 for idempotent writes that succeed with no body, 404 when the resource doesn't exist. Memorize this table."
      }],
      flashcards: [
        { front: "Idempotent means?", back: "The same request made multiple times has the same effect as once. GET, PUT, DELETE are idempotent. POST is not." },
        { front: "Which verb returns 201?", back: "POST when it successfully creates. Include a Location header pointing at the new resource." },
        { front: "When 204 instead of 200?", back: "When the operation succeeded but there's no meaningful body (typical for PUT and DELETE)." },
        { front: "401 vs 403?", back: "401: didn't authenticate (no/bad credentials). 403: authenticated fine but not allowed to do this." }
      ],
      challenges: [{
        title: "Pick the right status",
        difficulty: "Warm-up",
        prompt: "POST to create a user with an email that already exists. Return the correct status code.",
        starterCode: `[HttpPost]
public IActionResult Create([FromBody] CreateUserRequest req) { /* TODO */ }`,
        solution: `[HttpPost]
public IActionResult Create([FromBody] CreateUserRequest req)
{
    if (_users.Any(u => u.Email == req.Email))
        return Conflict(new { error = "Email already exists." });

    var user = new User { Id = Guid.NewGuid(), Email = req.Email };
    _users.Add(user);
    return CreatedAtAction(nameof(GetById), new { id = user.Id }, user);
}`,
        explanation: "409 Conflict is correct: the request is well-formed (not 400), the user is authorized (not 401/403), but the request conflicts with current state.",
        hint: "Not 400, not 500 — the request is fine, the state is the problem."
      }]
    },
    mid: {
      concept: "For well-formed but semantically invalid requests, 422 Unprocessable Entity beats 400 (which is syntactic). RFC 7807 ProblemDetails is the standard error shape — [ApiController] auto-generates it for validation errors, and Problem(...) returns it explicitly.",
      codeExamples: [{
        title: "Returning ProblemDetails",
        lang: "csharp",
        code: `[HttpPost("transfer")]
public IActionResult Transfer([FromBody] TransferRequest req)
{
    if (req.Amount <= 0)
        return Problem(
            type: "https://errors.example.com/invalid-amount",
            title: "Invalid amount",
            detail: "Transfer amount must be positive.",
            statusCode: StatusCodes.Status422UnprocessableEntity);

    if (_accounts[req.From].Balance < req.Amount)
        return Problem(
            title: "Insufficient funds",
            statusCode: StatusCodes.Status409Conflict);

    return NoContent();
}`,
        explanation: "Clients get machine-parseable errors. The type URI lets clients dispatch on error kind without parsing the (possibly localized) title string."
      }],
      flashcards: [
        { front: "422 vs 400?", back: "400: malformed/syntactic (bad JSON, wrong type). 422: well-formed input that violates business rules." },
        { front: "RFC 7807?", back: "ProblemDetails spec — standard JSON error shape so clients consistently parse failures across APIs." },
        { front: "PATCH vs PUT?", back: "PATCH changes a subset of fields. PUT requires the full resource shape and replaces it entirely." },
        { front: "Is PATCH idempotent?", back: "Not necessarily. JSON Patch can include non-idempotent ops (add to array). JSON Merge Patch tends to be idempotent." }
      ],
      challenges: [{
        title: "ProblemDetails with extensions",
        difficulty: "Mid",
        prompt: "Enroll endpoint returns ProblemDetails with status 409 when device is already enrolled, including a machine-readable type URI and deviceId extension.",
        starterCode: `[HttpPost("{deviceId:guid}/enroll")]
public IActionResult Enroll(Guid deviceId) { /* TODO */ }`,
        solution: `[HttpPost("{deviceId:guid}/enroll")]
public IActionResult Enroll(Guid deviceId)
{
    if (_enrollments.Contains(deviceId))
    {
        var problem = new ProblemDetails
        {
            Type   = "https://errors.intune/device-already-enrolled",
            Title  = "Device is already enrolled",
            Status = StatusCodes.Status409Conflict,
            Detail = "This device has an active enrollment."
        };
        problem.Extensions["deviceId"] = deviceId;
        return new ObjectResult(problem) { StatusCode = 409 };
    }
    _enrollments.Add(deviceId);
    return NoContent();
}`,
        explanation: "Extensions is the RFC-sanctioned escape hatch for custom fields. A client library can read problem.extensions.deviceId without conflicting with the standard fields.",
        hint: "ProblemDetails has an Extensions dictionary."
      }]
    },
    advanced: {
      concept: "Idempotency for POST: client sends Idempotency-Key header; server records (key, response) for N hours and returns the same response for repeats. Conditional requests use ETag / If-Match (writes) and If-None-Match (reads). Stale ETags yield 412 Precondition Failed; current ones on reads yield 304 Not Modified.",
      codeExamples: [{
        title: "ETag-based optimistic concurrency",
        lang: "csharp",
        code: `[HttpGet("{id:int}")]
public IActionResult GetById(int id)
{
    var book = _store[id];
    var etag = ComputeEtag(book);
    var incoming = Request.Headers.IfNoneMatch.ToString();
    if (incoming == etag) return StatusCode(StatusCodes.Status304NotModified);
    Response.Headers.ETag = etag;
    return Ok(book);
}

[HttpPut("{id:int}")]
public IActionResult Put(int id, [FromBody] Book book)
{
    var currentEtag = ComputeEtag(_store[id]);
    var incoming = Request.Headers.IfMatch.ToString();
    if (string.IsNullOrEmpty(incoming))
        return StatusCode(StatusCodes.Status428PreconditionRequired);
    if (incoming != currentEtag)
        return StatusCode(StatusCodes.Status412PreconditionFailed);
    _store[id] = book;
    return NoContent();
}

private static string ComputeEtag(Book b) =>
    $"\\"{Convert.ToHexString(MD5.HashData(Encoding.UTF8.GetBytes($"{b.Id}:{b.Title}")))}\\"";`,
        explanation: "ETag = version fingerprint. Client reads with ETag, modifies, PUTs with If-Match. If someone else wrote in between, the hash is stale → 412 → client refetches and retries. No lost updates."
      }],
      flashcards: [
        { front: "412 Precondition Failed?", back: "If-Match (or similar) didn't match server state. The client's version is stale — optimistic concurrency trigger." },
        { front: "428 Precondition Required?", back: "Server requires the client to include a precondition header before performing a dangerous operation." },
        { front: "ETag format?", back: "Quoted string: <code>\"abc123\"</code>. Weak: <code>W/\"abc123\"</code>. Content-identical responses must have equal strong ETags." },
        { front: "Why Idempotency-Key?", back: "Retry-safety for POST. Real payments, signups, order creation need it — the verb alone doesn't guarantee idempotency." }
      ],
      challenges: [{
        title: "ETag on a GET",
        difficulty: "Advanced",
        prompt: "Add ETag support to GET /api/reports/{id}. Compute ETag from report.Version. Return 304 on If-None-Match match. Always emit ETag header on 200s and 304s.",
        starterCode: `public record Report(int Id, string Title, int Version);
[HttpGet("{id:int}")] public IActionResult GetById(int id) { /* TODO */ }`,
        solution: `[HttpGet("{id:int}")]
public IActionResult GetById(int id)
{
    if (!_reports.TryGetValue(id, out var report)) return NotFound();
    var etag = $"\\"v{report.Version}\\"";
    var incoming = Request.Headers.IfNoneMatch.ToString();
    if (!string.IsNullOrEmpty(incoming) && incoming == etag)
    {
        Response.Headers.ETag = etag;
        return StatusCode(StatusCodes.Status304NotModified);
    }
    Response.Headers.ETag = etag;
    return Ok(report);
}`,
        explanation: "Pattern: compute ETag → check If-None-Match → 304 on match, else 200 with ETag. ETags must be double-quoted per HTTP spec. In real systems, use a rowversion column or stable hash.",
        hint: "Set Response.Headers.ETag on BOTH 200 and 304."
      }]
    },
    enterprise: {
      concept: "At Intune scale every error flows through one consistent ProblemDetails pipeline — UseExceptionHandler + UseStatusCodePages + AddProblemDetails customization. You also emit operation headers: x-ms-request-id, x-ms-correlation-id, Retry-After on 429/503. These are the glue between the API and client SDK diagnostics.",
      codeExamples: [{
        title: "Unified ProblemDetails pipeline",
        lang: "csharp",
        code: `builder.Services.AddProblemDetails(opts =>
{
    opts.CustomizeProblemDetails = ctx =>
    {
        var requestId = ctx.HttpContext.TraceIdentifier;
        ctx.ProblemDetails.Instance = ctx.HttpContext.Request.Path;
        ctx.ProblemDetails.Extensions["requestId"] = requestId;
        ctx.ProblemDetails.Extensions["correlationId"] =
            ctx.HttpContext.Items["CorrelationId"] ?? requestId;

        if (ctx.ProblemDetails.Status is >= 500 and < 600)
        {
            ctx.ProblemDetails.Extensions["supportLink"] =
                $"https://support.example.com/?traceId={requestId}";
        }
    };
});

app.UseExceptionHandler();
app.UseStatusCodePages();`,
        explanation: "Any exception or 4xx/5xx reaching the pipeline produces a uniform body. The pattern-matched range `>= 500 and < 600` adds a support link only for server errors — 4xx is the client's fault."
      }],
      flashcards: [
        { front: "Why x-ms-request-id AND x-ms-correlation-id?", back: "Request-id is unique per HTTP call (support tickets). Correlation-id spans a logical operation across services (distributed tracing)." },
        { front: "503 vs 500?", back: "503: a dependency is down (DB, bus) — transient, retryable, include Retry-After. 500: internal bug." },
        { front: "Retry-After format?", back: "Either seconds (integer) or HTTP-date. Clients should parse both; seconds is the rate-limit convention." },
        { front: "Why stable error `type` URIs?", back: "Clients dispatch on the URI without regex-ing title. Changing a localized title doesn't break error handling — the URI is the contract." }
      ],
      challenges: [{
        title: "Consistent error contract",
        difficulty: "Enterprise",
        prompt: "Configure ProblemDetails so every error includes requestId, correlationId, and (only for 5xx) a supportLink to https://support.example.com/?traceId=<requestId>.",
        starterCode: `// TODO in Program.cs`,
        solution: `builder.Services.AddProblemDetails(opts =>
{
    opts.CustomizeProblemDetails = ctx =>
    {
        var requestId = ctx.HttpContext.TraceIdentifier;
        ctx.ProblemDetails.Extensions["requestId"] = requestId;
        ctx.ProblemDetails.Extensions["correlationId"] =
            ctx.HttpContext.Items["CorrelationId"] ?? requestId;

        if (ctx.ProblemDetails.Status is >= 500 and < 600)
        {
            ctx.ProblemDetails.Extensions["supportLink"] =
                $"https://support.example.com/?traceId={requestId}";
        }
    };
});

app.UseExceptionHandler();
app.UseStatusCodePages();`,
        explanation: "The range pattern `is >= 500 and < 600` is the C# 9+ way to bucket status codes. Only 5xx gets a support link — 4xx is the client's bug, not yours. The customizer runs for every error the pipeline produces.",
        hint: "ctx.ProblemDetails.Status is >= 500 and < 600."
      }]
    }
  }
},

/* ====================== DAY 4 ====================== */
{
  id: 4, day: 4,
  title: "Model Binding & DTOs",
  subtitle: "How request data becomes typed objects — and why DTOs protect your domain.",
  overview: "FromRoute/FromQuery/FromBody/FromHeader, DTOs, mapping, JSON options.",
  csharpFocus: "Records, init-only properties, required members, JsonStringEnumConverter.",
  modes: {
    beginner: {
      concept: "Model binding converts raw HTTP data (route, query, body, headers) into typed parameters. Be explicit with [FromRoute], [FromQuery], [FromBody], [FromHeader], or rely on inference. A DTO (Data Transfer Object) is a shape-matched class for the API boundary — separate from your entity so DB changes don't break consumers and sensitive fields never leak.",
      codeExamples: [{
        title: "Binding from different sources",
        lang: "csharp",
        code: `[HttpGet("{id:int}/details")]
public IActionResult GetDetails(
    [FromRoute] int id,
    [FromQuery] string section = "summary",
    [FromHeader(Name = "X-Trace-Id")] string? traceId = null)
{
    return Ok(new { id, section, traceId });
}

[HttpPost]
public IActionResult Create([FromBody] CreateBookRequest request) => Ok(request);

public record CreateBookRequest(string Title, string Author, int Year);`,
        explanation: "Records are ideal DTOs — immutable, value equality, compact syntax. JSON binds to each property by name (case-insensitive)."
      }],
      flashcards: [
        { front: "Default binding source for complex types in [ApiController]?", back: "[FromBody]. Simple types (int, string) default to [FromRoute] if templated, else [FromQuery]." },
        { front: "Why DTOs instead of entities?", back: "Decouples API contract from DB schema. Prevents over-posting. Lets you evolve internal models without breaking clients." },
        { front: "Why records for DTOs?", back: "Immutable by default, concise, value equality (great for tests), `with` expressions for copy-modify." }
      ],
      challenges: [{
        title: "Paged list endpoint",
        difficulty: "Warm-up",
        prompt: "GET /api/books accepts page (default 1) and pageSize (default 20, max 100) as query params. Returns { items, page, pageSize, total }.",
        starterCode: `// TODO`,
        solution: `public record BookDto(int Id, string Title);
public record PagedResult<T>(IEnumerable<T> Items, int Page, int PageSize, int Total);

[HttpGet]
public ActionResult<PagedResult<BookDto>> GetAll(
    [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
{
    if (page < 1) page = 1;
    if (pageSize is < 1 or > 100) pageSize = 20;

    var all = Enumerable.Range(1, 155)
        .Select(i => new BookDto(i, $"Book {i}")).ToList();
    var items = all.Skip((page - 1) * pageSize).Take(pageSize);
    return new PagedResult<BookDto>(items, page, pageSize, all.Count);
}`,
        explanation: "Default parameter values make query params optional. Clamping is defensive — clients will send 0 and -1. Capping pageSize is important: unbounded paging is a DoS vector.",
        hint: "Default parameter values make query params optional."
      }]
    },
    mid: {
      concept: "Separate request and response DTOs even when shapes look similar. CreateUserRequest has Password; UserResponse doesn't. UpdateUserRequest has all-nullable fields for partial updates. For mapping, hand-written extension methods stay greppable and fast; AutoMapper / Mapster remove boilerplate but add runtime config that can drift silently.",
      codeExamples: [{
        title: "Hand-written mapping extensions",
        lang: "csharp",
        code: `public record CreateUserRequest(
    [Required] string Email,
    [Required, MinLength(8)] string Password,
    string DisplayName);

public record UserResponse(Guid Id, string Email, string DisplayName, DateTime CreatedAt);

public class User
{
    public Guid Id { get; set; }
    public string Email { get; set; } = default!;
    public string PasswordHash { get; set; } = default!;  // never in response
    public string DisplayName { get; set; } = default!;
    public DateTime CreatedAt { get; set; }
}

public static class UserMappings
{
    public static UserResponse ToResponse(this User u) =>
        new(u.Id, u.Email, u.DisplayName, u.CreatedAt);

    public static User ToEntity(this CreateUserRequest r, IPasswordHasher hasher) => new()
    {
        Id = Guid.NewGuid(),
        Email = r.Email.ToLowerInvariant(),
        PasswordHash = hasher.Hash(r.Password),
        DisplayName = r.DisplayName,
        CreatedAt = DateTime.UtcNow
    };
}`,
        explanation: "You can grep `ToResponse` to find every User→UserResponse conversion. AutoMapper profiles don't grep that way."
      }],
      flashcards: [
        { front: "Over-posting attack?", back: "Client sends fields they shouldn't be able to set (IsAdmin=true, CreatedAt=...). DTOs prevent it because the model only has allowed fields." },
        { front: "Why nullable fields on an update DTO?", back: "Null means 'don't change'; non-null means 'update to this'. Lets a single DTO support partial updates." },
        { front: "AutoMapper tradeoff?", back: "Less boilerplate for many type pairs; but runtime config, silent drift when types change, and harder debugging." },
        { front: "What's C# 11 `required`?", back: "A keyword forcing the caller to set the property during initialization — compile-time, not runtime validation." }
      ],
      challenges: [{
        title: "Shape-per-purpose DTOs",
        difficulty: "Mid",
        prompt: "For Device, write CreateDeviceRequest, UpdateDeviceRequest (all optional), DeviceResponse. Add a mapping extension entity→response and an ApplyTo for partial updates.",
        starterCode: `public enum OsType { Windows, iOS, Android }
public class Device
{
    public Guid Id { get; set; } public string Name { get; set; } = "";
    public OsType OsType { get; set; } public DateTime CreatedAt { get; set; }
    public DateTime? LastSeenAt { get; set; }
    public string? InternalDiagnostic { get; set; }  // never in response
}`,
        solution: `public record CreateDeviceRequest([Required] string Name, [Required] OsType OsType);
public record UpdateDeviceRequest(string? Name, OsType? OsType);
public record DeviceResponse(Guid Id, string Name, OsType OsType,
    DateTime CreatedAt, DateTime? LastSeenAt);

public static class DeviceMappings
{
    public static DeviceResponse ToResponse(this Device d) =>
        new(d.Id, d.Name, d.OsType, d.CreatedAt, d.LastSeenAt);

    public static Device ToEntity(this CreateDeviceRequest r) => new()
    {
        Id = Guid.NewGuid(), Name = r.Name, OsType = r.OsType,
        CreatedAt = DateTime.UtcNow
    };

    public static void ApplyTo(this UpdateDeviceRequest r, Device d)
    {
        if (r.Name is not null) d.Name = r.Name;
        if (r.OsType.HasValue) d.OsType = r.OsType.Value;
    }
}`,
        explanation: "Three shapes for three jobs. Update has nullable throughout; ApplyTo writes only set fields — the standard partial-update pattern on Intune teams.",
        hint: "Update uses nullables; ApplyTo only writes non-null fields."
      }]
    },
    advanced: {
      concept: "Custom model binders handle formats the defaults miss — CSV query params, domain primitives like DeviceId that wrap a Guid. Implement IModelBinder and register via IModelBinderProvider. For JSON: System.Text.Json is default (.NET Core 3+), case-insensitive via ASP.NET Core's config. Add JsonStringEnumConverter so enums serialize as names instead of ints.",
      codeExamples: [{
        title: "Domain primitive binder",
        lang: "csharp",
        code: `public readonly record struct DeviceId(Guid Value)
{
    public static bool TryParse(string? s, out DeviceId id)
    {
        id = default;
        if (Guid.TryParse(s, out var g)) { id = new DeviceId(g); return true; }
        return false;
    }
}

public class DeviceIdBinder : IModelBinder
{
    public Task BindModelAsync(ModelBindingContext ctx)
    {
        var raw = ctx.ValueProvider.GetValue(ctx.ModelName).FirstValue;
        if (!DeviceId.TryParse(raw, out var id))
        {
            ctx.ModelState.TryAddModelError(ctx.ModelName,
                $"'{raw}' is not a valid DeviceId.");
            return Task.CompletedTask;
        }
        ctx.Result = ModelBindingResult.Success(id);
        return Task.CompletedTask;
    }
}

public class DeviceIdBinderProvider : IModelBinderProvider
{
    public IModelBinder? GetBinder(ModelBinderProviderContext ctx)
        => ctx.Metadata.ModelType == typeof(DeviceId)
            ? new BinderTypeModelBinder(typeof(DeviceIdBinder)) : null;
}

// Program.cs
builder.Services.AddControllers(o =>
    o.ModelBinderProviders.Insert(0, new DeviceIdBinderProvider()));`,
        explanation: "Now [HttpGet(\"{deviceId}\")] binds directly to DeviceId, with proper ModelState errors on invalid input. Domain primitives prevent 'mix up two Guids' bugs at compile time."
      }],
      flashcards: [
        { front: "When to write a custom binder?", back: "When defaults can't parse the format (CSV query, domain primitives, unusual dates)." },
        { front: "What's IValueProvider?", back: "Abstraction over where a value came from (route, query, form). Binders read from the chain, which makes them testable." },
        { front: "Why JsonStringEnumConverter?", back: "Default is int — unreadable in logs and breaks when values are renumbered. Strings are self-documenting." },
        { front: "Source-generated JSON?", back: ".NET 7+ feature: Roslyn source generator emits zero-reflection serializers at compile time. Faster, works in AOT." }
      ],
      challenges: [{
        title: "Binder provider",
        difficulty: "Advanced",
        prompt: "Given DeviceId (above), write DeviceIdBinder and DeviceIdBinderProvider so GET /api/devices/{deviceId} binds directly to DeviceId.",
        starterCode: `public readonly record struct DeviceId(Guid Value)
{
    public static bool TryParse(string? s, out DeviceId id) { /* given */ return false; }
}
// TODO: Binder, Provider, and controller`,
        solution: `public class DeviceIdBinder : IModelBinder
{
    public Task BindModelAsync(ModelBindingContext ctx)
    {
        var raw = ctx.ValueProvider.GetValue(ctx.ModelName).FirstValue;
        if (!DeviceId.TryParse(raw, out var id))
        {
            ctx.ModelState.TryAddModelError(ctx.ModelName,
                $"'{raw}' is not a valid DeviceId.");
            return Task.CompletedTask;
        }
        ctx.Result = ModelBindingResult.Success(id);
        return Task.CompletedTask;
    }
}

public class DeviceIdBinderProvider : IModelBinderProvider
{
    public IModelBinder? GetBinder(ModelBinderProviderContext ctx)
        => ctx.Metadata.ModelType == typeof(DeviceId)
            ? new BinderTypeModelBinder(typeof(DeviceIdBinder)) : null;
}

// Program.cs
builder.Services.AddControllers(o =>
    o.ModelBinderProviders.Insert(0, new DeviceIdBinderProvider()));

// Controller
[HttpGet("{deviceId}")]
public IActionResult Get(DeviceId deviceId) => Ok(new { deviceId });`,
        explanation: "Two pieces: binder (parse) + provider (when to use it). Provider is inserted at index 0 so it runs before defaults. Microsoft uses this internally for type-safe IDs.",
        hint: "Both IModelBinder and IModelBinderProvider, registered in order."
      }]
    },
    enterprise: {
      concept: "Contract-first design: the schema (OpenAPI) is the source of truth; DTOs are generated from it. Shipping 20 consumer SDKs stays sane. For versioning: additive changes within a version (new optional property = ok), deprecate before delete, dual-write during transition. Combined with Day 2's API versioning, this is how Intune rolls out schema changes without pager duty.",
      codeExamples: [{
        title: "Versioned DTOs with dual-write",
        lang: "csharp",
        code: `public record DevicePolicyV1Dto(Guid Id, string Name, string Severity);

public enum SeverityLevel { Low, Medium, High, Critical }

public record DevicePolicyV2Dto
{
    public Guid Id { get; init; }
    public string Name { get; init; } = default!;
    public SeverityLevel Severity { get; init; }
    public DateTime? LastModified { get; init; }
}

public static class DevicePolicyMapping
{
    public static DevicePolicyV1Dto ToV1(this DevicePolicy d) =>
        new(d.Id, d.Name, d.Severity.ToString());

    public static DevicePolicyV2Dto ToV2(this DevicePolicy d) => new()
    {
        Id = d.Id, Name = d.Name, Severity = d.Severity,
        LastModified = d.LastModified
    };
}`,
        explanation: "Two DTOs project the same domain. With JsonStringEnumConverter enabled, V2's Severity enum serializes as 'High' — same wire format as V1's string. Clients can migrate at their pace."
      }],
      flashcards: [
        { front: "Contract-first?", back: "The OpenAPI schema is truth. Server and clients derive DTOs from it via code-gen, preventing drift." },
        { front: "[Obsolete] on a DTO?", back: "Compile-time warning for C# consumers; most SDK generators propagate it as a deprecation notice in generated client code." },
        { front: "Dual-write during migration?", back: "Emit both old and new properties during the transition window so consumers on either version work. Delete the old after all clients upgrade." },
        { front: "Why JsonPropertyOrder?", back: "Stable serialization order helps clients that hash/diff payloads, and makes log diffs much more readable." }
      ],
      challenges: [{
        title: "Evolve without breaking V1",
        difficulty: "Enterprise",
        prompt: "DevicePolicyDto has string Severity. You want V2 with strongly-typed SeverityLevel enum while V1 clients continue reading string severities. Design both DTOs and controllers.",
        starterCode: `public record DevicePolicyV1Dto(Guid Id, string Name, string Severity);
public enum SeverityLevel { Low, Medium, High, Critical }
// TODO`,
        solution: `public record DevicePolicyV2Dto
{
    public Guid Id { get; init; }
    public string Name { get; init; } = default!;
    public SeverityLevel Severity { get; init; }
}

public static class PolicyMapping
{
    public static DevicePolicyV1Dto ToV1(this DevicePolicy d) =>
        new(d.Id, d.Name, d.Severity.ToString());
    public static DevicePolicyV2Dto ToV2(this DevicePolicy d) =>
        new() { Id = d.Id, Name = d.Name, Severity = d.Severity };
}

[ApiController, ApiVersion("1.0", Deprecated = true)]
[Route("api/v{version:apiVersion}/policies")]
public class PoliciesV1Controller : ControllerBase
{
    [HttpGet("{id:guid}")]
    public ActionResult<DevicePolicyV1Dto> Get(Guid id)
        => _domain.Find(id)?.ToV1() ?? (ActionResult<DevicePolicyV1Dto>)NotFound();
}

[ApiController, ApiVersion("2.0")]
[Route("api/v{version:apiVersion}/policies")]
public class PoliciesV2Controller : ControllerBase
{
    [HttpGet("{id:guid}")]
    public ActionResult<DevicePolicyV2Dto> Get(Guid id)
        => _domain.Find(id)?.ToV2() ?? (ActionResult<DevicePolicyV2Dto>)NotFound();
}`,
        explanation: "Two controllers, two DTOs, one domain. JsonStringEnumConverter makes V2 serialize 'Severity': 'High' — same wire format as V1's string. This is the standard Microsoft pattern for breaking-but-not-quite-breaking evolution.",
        hint: "Two versioned controllers share the domain via different projection mappings."
      }]
    }
  }
},

/* ====================== DAY 5 ====================== */
{
  id: 5, day: 5,
  title: "Entities, Enums & Domain Models",
  subtitle: "The C# types representing the business — the core of every backend.",
  overview: "POCO entities, navigation properties, enums as ints vs strings, value objects, and when to enrich models with behavior.",
  csharpFocus: "Enums, [Flags] enums, value objects with records, init-only properties, nullable reference types.",
  modes: {
    beginner: {
      concept: "An entity is a class representing a thing with identity — Device, User, CompliancePolicy. It has a primary key (usually Id), properties, and sometimes navigation properties to related entities. Enums define a fixed set of named values backed by integers. Prefer enums over magic strings for finite sets.",
      codeExamples: [{
        title: "Entity with an enum",
        lang: "csharp",
        code: `public enum OsType
{
    Unknown = 0,
    Windows = 1,
    iOS = 2,
    Android = 3,
    MacOS = 4,
    Linux = 5
}

public class Device
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public OsType OsType { get; set; }
    public string? SerialNumber { get; set; }
    public DateTime EnrolledAt { get; set; }
    public DateTime? LastSeenAt { get; set; }

    public Guid OwnerId { get; set; }
    public User? Owner { get; set; }  // navigation property
}`,
        explanation: "Always give enums explicit values and start with Unknown = 0. Default(OsType) is 0, so forgetting to set the field yields a catchable sentinel, not accidentally Windows."
      }],
      flashcards: [
        { front: "Navigation property?", back: "A property on an entity referencing another entity. EF Core uses it for relationships and eager-loading." },
        { front: "Why Unknown = 0 first?", back: "default(enum) is 0. Forgetting to set the field yields a sentinel you can detect, not a 'real' value." },
        { front: "POCO?", back: "Plain Old CLR Object — a simple class with properties, no framework attachments. Keeps your domain portable." }
      ],
      challenges: [{
        title: "Model a policy",
        difficulty: "Warm-up",
        prompt: "Create CompliancePolicy with Id (Guid), Name (non-null), PolicyType (enum Passcode/Encryption/OSVersion), CreatedAt, IsActive (default true).",
        starterCode: `// TODO`,
        solution: `public enum PolicyType
{
    Unknown = 0, Passcode = 1, Encryption = 2, OSVersion = 3
}

public class CompliancePolicy
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public PolicyType PolicyType { get; set; }
    public DateTime CreatedAt { get; set; }
    public bool IsActive { get; set; } = true;
}`,
        explanation: "Small habits pay off: explicit enum values, Unknown=0, default IsActive=true (new policies active by default), Name defaults to empty to avoid null.",
        hint: "Enum with explicit values starting at Unknown = 0."
      }]
    },
    mid: {
      concept: "Enums stored as strings in the DB are self-documenting (WHERE PolicyType = 'Passcode') but renaming becomes a migration. Ints are compact but opaque. EF Core supports both via converters. A value object has no identity — it's defined by its values (Money { Amount, Currency }). Two with same fields are equal. Records fit perfectly: immutable, value equality.",
      codeExamples: [{
        title: "Value object with behavior",
        lang: "csharp",
        code: `public record Money(decimal Amount, string Currency)
{
    public static Money Usd(decimal amount) => new(amount, "USD");

    public Money Add(Money other)
    {
        if (Currency != other.Currency)
            throw new InvalidOperationException(
                $"Cannot add {Currency} to {other.Currency}");
        return this with { Amount = Amount + other.Amount };
    }
}

// Store enum as string in EF Core
public class AppDbContext : DbContext
{
    protected override void OnModelCreating(ModelBuilder mb)
    {
        mb.Entity<Device>()
            .Property(d => d.OsType)
            .HasConversion<string>()
            .HasMaxLength(20);
    }
}`,
        explanation: "Records give you value equality and immutability; invariants (can't add mismatched currencies) live as methods on the record. HasConversion<string>() makes SQL readable; the cost is rename = data migration."
      }],
      flashcards: [
        { front: "Value object?", back: "A type defined by values, not identity. Money, Address. Two with same fields are equal. Records are perfect for them." },
        { front: "Enum as string in EF Core — pros/cons?", back: "Pro: readable SQL, robust to renumbering. Con: rename = data migration, slightly larger storage." },
        { front: "Anemic vs rich domain model?", back: "Anemic: properties-only, logic elsewhere. Rich: behavior on the type enforcing invariants. Rich scales better for complex domains." },
        { front: "record `with` expression?", back: "Creates a shallow copy with specified properties changed: <code>money with { Amount = 10 }</code>." }
      ],
      challenges: [{
        title: "Money value object",
        difficulty: "Mid",
        prompt: "Create Money record with Amount and Currency. Add Add and Subtract methods that throw on currency mismatch. Use `with` for new instances.",
        starterCode: `// TODO`,
        solution: `public record Money(decimal Amount, string Currency)
{
    public Money Add(Money other)
    {
        EnsureSameCurrency(other);
        return this with { Amount = Amount + other.Amount };
    }

    public Money Subtract(Money other)
    {
        EnsureSameCurrency(other);
        return this with { Amount = Amount - other.Amount };
    }

    private void EnsureSameCurrency(Money other)
    {
        if (Currency != other.Currency)
            throw new InvalidOperationException(
                $"Currency mismatch: {Currency} vs {other.Currency}");
    }
}`,
        explanation: "Immutable arithmetic: operations return new instances. Invariants live on the type, not in services. Value equality means two Money(5, 'USD') are `==`.",
        hint: "this with { Amount = ... }"
      }]
    },
    advanced: {
      concept: "Owned entities (EF Core) let you model value objects that live inside an aggregate without their own table. Domain events capture things that happened (OrderShipped, PolicyApplied); the aggregate raises them, a dispatcher publishes them. Bitwise [Flags] enums model sets: Permissions.Read | Permissions.Write.",
      codeExamples: [{
        title: "Flags enum + owned entity + domain event",
        lang: "csharp",
        code: `[Flags]
public enum Permissions
{
    None = 0,
    Read = 1 << 0,        // 1
    Write = 1 << 1,       // 2
    Delete = 1 << 2,      // 4
    Admin = Read | Write | Delete  // 7
}

public record Address(string Street, string City, string Zip);

public class Order
{
    private readonly List<object> _events = new();
    public IReadOnlyList<object> DomainEvents => _events;

    public Guid Id { get; private set; }
    public Address ShipTo { get; private set; } = default!;
    public OrderStatus Status { get; private set; }

    public void Ship()
    {
        if (Status != OrderStatus.Paid)
            throw new InvalidOperationException("Cannot ship unpaid order");
        Status = OrderStatus.Shipped;
        _events.Add(new OrderShipped(Id, DateTime.UtcNow));
    }
}

public record OrderShipped(Guid OrderId, DateTime At);`,
        explanation: "The aggregate owns its invariants: Ship() checks state before mutating. Domain events record what happened; outside the aggregate, a dispatcher reads them and publishes to a bus. This is the DDD / CQRS pattern."
      }],
      flashcards: [
        { front: "[Flags] enum?", back: "Marks an enum as a set of bits you can combine with |. HasFlag() checks membership. Use powers of two as values." },
        { front: "Owned entity (EF Core)?", back: "A type that's part of its owner's table (no separate rows). Perfect for value objects like Address that don't need their own ID." },
        { front: "Domain event?", back: "A record of something that happened in the domain (OrderShipped). Captured inside an aggregate, published outside." },
        { front: "Why private setters on an entity?", back: "Enforces invariants — mutations go through methods (Ship, Cancel) that check state. Properties as data-only would let anyone assign." }
      ],
      challenges: [{
        title: "Flags enum + HasFlag",
        difficulty: "Advanced",
        prompt: "Create a [Flags] Permissions enum (Read, Write, Delete). Write a method HasAllPermissions(this Permissions p, Permissions required) that returns true only if all required bits are set.",
        starterCode: `// TODO`,
        solution: `[Flags]
public enum Permissions
{
    None = 0,
    Read = 1 << 0,
    Write = 1 << 1,
    Delete = 1 << 2
}

public static class PermissionExtensions
{
    public static bool HasAllPermissions(this Permissions actual, Permissions required)
        => (actual & required) == required;
}

// Usage:
var userPerms = Permissions.Read | Permissions.Write;
userPerms.HasAllPermissions(Permissions.Read);                       // true
userPerms.HasAllPermissions(Permissions.Read | Permissions.Delete);  // false`,
        explanation: "(actual & required) == required means every bit in 'required' is also in 'actual'. HasFlag works too but has boxing overhead; bitwise AND is idiomatic for hot paths.",
        hint: "Bitwise AND: (actual & required) == required."
      }]
    },
    enterprise: {
      concept: "At Intune scale, compliance-policy entities follow a consistent shape: tenant-scoped, versioned, auditable. Sensitive enums (severity) are [Flags] for intersecting rules. Domain primitives (PolicyId, TenantId) prevent mix-ups. Source-generated JSON converters keep hot paths allocation-free. Every entity includes audit fields (CreatedBy, LastModifiedBy, RowVersion) for concurrency and compliance reporting.",
      codeExamples: [{
        title: "Intune-shaped compliance entity",
        lang: "csharp",
        code: `public readonly record struct TenantId(Guid Value);
public readonly record struct PolicyId(Guid Value);

public enum PlatformType { Unknown, Windows, iOS, Android, MacOS }

[Flags]
public enum Severity
{
    None = 0,
    Informational = 1 << 0,
    Warning = 1 << 1,
    Error = 1 << 2,
    Critical = 1 << 3
}

public class CompliancePolicy
{
    public PolicyId Id { get; private set; }
    public TenantId TenantId { get; private set; }
    public string Name { get; private set; } = default!;
    public PlatformType Platform { get; private set; }
    public Severity Severity { get; private set; }
    public int Version { get; private set; }

    // Audit
    public DateTime CreatedAt { get; private set; }
    public string CreatedBy { get; private set; } = default!;
    public DateTime LastModifiedAt { get; private set; }
    public string LastModifiedBy { get; private set; } = default!;

    // Concurrency
    public byte[] RowVersion { get; private set; } = default!;

    public void UpdateName(string name, string modifiedBy)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Name required", nameof(name));
        Name = name;
        Version++;
        LastModifiedAt = DateTime.UtcNow;
        LastModifiedBy = modifiedBy;
    }
}`,
        explanation: "Every mutation goes through a method that updates Version and audit fields. RowVersion is EF Core's concurrency token — optimistic locking via ETags upstream. Strong-typed IDs prevent passing TenantId where PolicyId was expected."
      }],
      flashcards: [
        { front: "Why TenantId as a struct?", back: "Compile-time prevention of mixing it with other Guid-wrapped IDs. Also cheap — no heap allocation." },
        { front: "Why byte[] RowVersion?", back: "EF Core maps it to SQL rowversion/timestamp; incremented on every row write. Perfect for optimistic concurrency and ETags." },
        { front: "Why audit fields on every entity?", back: "Compliance, debugging, and 'who did this and when' support tickets. Enterprise systems need this everywhere, so centralize it (base class or convention)." },
        { front: "Why Version alongside RowVersion?", back: "RowVersion detects concurrent writes (opaque); Version is a human-readable revision number for UIs and audit logs. They serve different purposes." }
      ],
      challenges: [{
        title: "Auditable entity base",
        difficulty: "Enterprise",
        prompt: "Create an abstract AuditableEntity base class with CreatedAt, CreatedBy, LastModifiedAt, LastModifiedBy, RowVersion. Add a method Touch(string by) that updates both LastModified fields. CompliancePolicy extends it.",
        starterCode: `// TODO`,
        solution: `public abstract class AuditableEntity
{
    public DateTime CreatedAt { get; set; }
    public string CreatedBy { get; set; } = default!;
    public DateTime LastModifiedAt { get; set; }
    public string LastModifiedBy { get; set; } = default!;
    public byte[] RowVersion { get; set; } = default!;

    protected void Touch(string by)
    {
        LastModifiedAt = DateTime.UtcNow;
        LastModifiedBy = by;
    }

    protected void MarkCreated(string by)
    {
        var now = DateTime.UtcNow;
        CreatedAt = now;
        CreatedBy = by;
        LastModifiedAt = now;
        LastModifiedBy = by;
    }
}

public class CompliancePolicy : AuditableEntity
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public int Version { get; set; }

    public void UpdateName(string name, string modifiedBy)
    {
        Name = name;
        Version++;
        Touch(modifiedBy);
    }

    public static CompliancePolicy Create(string name, string createdBy)
    {
        var p = new CompliancePolicy { Id = Guid.NewGuid(), Name = name, Version = 1 };
        p.MarkCreated(createdBy);
        return p;
    }
}`,
        explanation: "The base class encapsulates every auditable-entity contract. Subclasses just call Touch on mutations and MarkCreated on construction. EF Core will map RowVersion to the DB concurrency column via a fluent config.",
        hint: "Protected Touch/MarkCreated methods, inherited by CompliancePolicy."
      }]
    }
  }
},

/* ====================== DAY 6 ====================== */
{
  id: 6, day: 6,
  title: "Dependency Injection Deep Dive",
  subtitle: "The pattern that makes ASP.NET Core testable, composable, and maintainable.",
  overview: "Lifetimes (transient/scoped/singleton), constructor injection, service resolution, and common traps.",
  csharpFocus: "Interfaces, generic type parameters, factory delegates, open/closed generics.",
  modes: {
    beginner: {
      concept: "Dependency Injection: instead of a class creating its collaborators (new DeviceRepository()), it receives them through its constructor. The DI container builds the object graph at runtime. Three lifetimes: Transient (new instance per resolve), Scoped (new per HTTP request), Singleton (one for the app's lifetime).",
      codeExamples: [{
        title: "Register and inject",
        lang: "csharp",
        code: `// Registration (Program.cs)
builder.Services.AddScoped<IDeviceRepository, DeviceRepository>();
builder.Services.AddSingleton<ITimeProvider, SystemTimeProvider>();
builder.Services.AddTransient<IEmailSender, SmtpEmailSender>();

// Usage (controller)
public class DevicesController : ControllerBase
{
    private readonly IDeviceRepository _repo;
    private readonly ITimeProvider _time;

    public DevicesController(IDeviceRepository repo, ITimeProvider time)
    {
        _repo = repo;
        _time = time;
    }
}`,
        explanation: "The container sees the constructor, resolves each parameter, and hands them in. You never `new` your dependencies. This is what makes the controller testable — swap in a fake repo in tests."
      }],
      flashcards: [
        { front: "Three DI lifetimes?", back: "Transient (new per resolve), Scoped (new per HTTP request — shared within the request), Singleton (one for the whole app)." },
        { front: "Why DI at all?", back: "Testability (swap in fakes), loose coupling (depend on interfaces), configurability (change wiring without changing code)." },
        { front: "What's constructor injection?", back: "Dependencies are parameters of the constructor; the container supplies them. The default pattern in ASP.NET Core." }
      ],
      challenges: [{
        title: "Wire up a service",
        difficulty: "Warm-up",
        prompt: "Register IDeviceService → DeviceService as scoped, IEmailSender → ConsoleEmailSender as singleton. Build a controller that uses both.",
        starterCode: `public interface IDeviceService { string Get(Guid id); }
public class DeviceService : IDeviceService { public string Get(Guid id) => $"Device {id}"; }
public interface IEmailSender { void Send(string to, string msg); }
public class ConsoleEmailSender : IEmailSender {
    public void Send(string to, string msg) => Console.WriteLine($"{to}: {msg}");
}
// TODO: register + controller`,
        solution: `// Program.cs
builder.Services.AddScoped<IDeviceService, DeviceService>();
builder.Services.AddSingleton<IEmailSender, ConsoleEmailSender>();

[ApiController, Route("api/[controller]")]
public class DevicesController : ControllerBase
{
    private readonly IDeviceService _svc;
    private readonly IEmailSender _email;

    public DevicesController(IDeviceService svc, IEmailSender email)
    {
        _svc = svc;
        _email = email;
    }

    [HttpGet("{id:guid}")]
    public IActionResult Get(Guid id)
    {
        _email.Send("ops@x.com", $"Get {id}");
        return Ok(_svc.Get(id));
    }
}`,
        explanation: "Two lifetimes chosen intentionally: scoped for per-request state (typical service), singleton for stateless, thread-safe operations (email/logging). Constructor injection is automatic.",
        hint: "AddScoped for stateful-per-request, AddSingleton for stateless."
      }]
    },
    mid: {
      concept: "Pick lifetimes based on state and thread-safety. Singleton: stateless, thread-safe services (IHttpClientFactory, loggers, caches). Scoped: anything holding per-request state (DbContext, current-user context). Transient: lightweight, stateless helpers. The big trap: capturing a scoped service in a singleton — the scoped service leaks to app-lifetime.",
      codeExamples: [{
        title: "Factory registration and IOptions",
        lang: "csharp",
        code: `builder.Services.Configure<CacheOptions>(
    builder.Configuration.GetSection("Cache"));

// Factory registration — needs runtime config
builder.Services.AddSingleton<IConnectionMultiplexer>(sp =>
{
    var opts = sp.GetRequiredService<IOptions<CacheOptions>>().Value;
    return ConnectionMultiplexer.Connect(opts.RedisConnection);
});

public class CacheService
{
    private readonly IConnectionMultiplexer _redis;
    private readonly CacheOptions _opts;

    public CacheService(IConnectionMultiplexer redis, IOptions<CacheOptions> opts)
    {
        _redis = redis;
        _opts = opts.Value;
    }
}`,
        explanation: "Factory registrations (lambdas taking IServiceProvider) let you compose services with resolved dependencies. IOptions<T> binds configuration to a strongly typed class."
      }],
      flashcards: [
        { front: "IServiceProvider inside a factory?", back: "Used to resolve dependencies at registration time. <code>AddSingleton&lt;IX&gt;(sp =&gt; new X(sp.GetRequiredService&lt;IY&gt;()))</code>." },
        { front: "Captive dependency?", back: "When a longer-lived service holds a reference to a shorter-lived one — e.g., singleton caching a scoped DbContext. The DbContext never gets disposed." },
        { front: "IOptions<T>?", back: "Strongly-typed configuration binding. Inject into services without passing IConfiguration around." },
        { front: "Why singleton for IHttpClientFactory?", back: "It pools HttpClientHandlers. Creating HttpClient directly per request exhausts sockets — classic production bug." }
      ],
      challenges: [{
        title: "Factory that reads config",
        difficulty: "Mid",
        prompt: "Register a singleton IMessageQueueClient whose constructor needs a connection string from configuration section 'Queue:ConnectionString'. Use a factory.",
        starterCode: `public interface IMessageQueueClient { Task SendAsync(string msg); }
public class ServiceBusClient : IMessageQueueClient
{
    public ServiceBusClient(string connectionString) { }
    public Task SendAsync(string msg) => Task.CompletedTask;
}
// TODO: register`,
        solution: `builder.Services.AddSingleton<IMessageQueueClient>(sp =>
{
    var config = sp.GetRequiredService<IConfiguration>();
    var cs = config["Queue:ConnectionString"]
        ?? throw new InvalidOperationException("Missing Queue:ConnectionString");
    return new ServiceBusClient(cs);
});`,
        explanation: "Factory registrations are the escape hatch when the constructor needs something more than registered services — a string, a URI, an assembled-at-startup object. Throw early if config is missing.",
        hint: "AddSingleton<IX>(sp => new X(configString))."
      }]
    },
    advanced: {
      concept: ".NET 8 added keyed services — multiple implementations of the same interface distinguished by a key. Useful for strategy-pattern dispatch. Also: TryAdd only registers if nothing's registered yet (handy in libraries). For open generics, register IRepository<> → Repository<> and the container resolves IRepository<Device> automatically.",
      codeExamples: [{
        title: "Keyed services + open generics",
        lang: "csharp",
        code: `// Keyed services (.NET 8+)
builder.Services.AddKeyedSingleton<INotifier, EmailNotifier>("email");
builder.Services.AddKeyedSingleton<INotifier, SmsNotifier>("sms");

public class AlertService
{
    public AlertService(
        [FromKeyedServices("email")] INotifier email,
        [FromKeyedServices("sms")] INotifier sms)
    {
        // both injected by key
    }
}

// Open generics
public interface IRepository<T> where T : class
{
    Task<T?> GetAsync(Guid id, CancellationToken ct);
}

builder.Services.AddScoped(typeof(IRepository<>), typeof(EfRepository<>));

// Consumer gets the closed generic
public class DeviceService
{
    public DeviceService(IRepository<Device> repo) { }
}`,
        explanation: "Open generics: one registration serves every T. The container closes it per request — IRepository<Device>, IRepository<User>, etc. Huge reduction in boilerplate."
      }],
      flashcards: [
        { front: "Keyed services?", back: ".NET 8 feature — multiple registrations of the same interface distinguished by a key. Resolve with [FromKeyedServices(key)] or GetRequiredKeyedService." },
        { front: "TryAdd vs Add?", back: "TryAdd only registers if the service isn't already registered. Libraries use TryAdd so the user's registration wins." },
        { front: "Open generic registration?", back: "<code>AddScoped(typeof(IRepository&lt;&gt;), typeof(EfRepository&lt;&gt;))</code>. Resolves IRepository&lt;Device&gt;, IRepository&lt;User&gt;, etc., from one registration." },
        { front: "Can you resolve IEnumerable<TService>?", back: "Yes — the container returns every registered implementation. Useful for 'plugin' patterns where you want to iterate all handlers." }
      ],
      challenges: [{
        title: "Strategy pattern via keyed services",
        difficulty: "Advanced",
        prompt: "Register IComplianceCheck keyed by PolicyType (Passcode, Encryption, OSVersion). Build an engine that, given a PolicyType, resolves the right check.",
        starterCode: `public enum PolicyType { Passcode, Encryption, OSVersion }
public interface IComplianceCheck { Task<bool> RunAsync(Guid deviceId); }
public class PasscodeCheck : IComplianceCheck { public Task<bool> RunAsync(Guid id) => Task.FromResult(true); }
public class EncryptionCheck : IComplianceCheck { public Task<bool> RunAsync(Guid id) => Task.FromResult(true); }
public class OSVersionCheck : IComplianceCheck { public Task<bool> RunAsync(Guid id) => Task.FromResult(true); }`,
        solution: `// Registration
builder.Services.AddKeyedScoped<IComplianceCheck, PasscodeCheck>(PolicyType.Passcode);
builder.Services.AddKeyedScoped<IComplianceCheck, EncryptionCheck>(PolicyType.Encryption);
builder.Services.AddKeyedScoped<IComplianceCheck, OSVersionCheck>(PolicyType.OSVersion);

public class ComplianceEngine
{
    private readonly IServiceProvider _sp;
    public ComplianceEngine(IServiceProvider sp) { _sp = sp; }

    public Task<bool> RunAsync(PolicyType type, Guid deviceId)
    {
        var check = _sp.GetRequiredKeyedService<IComplianceCheck>(type);
        return check.RunAsync(deviceId);
    }
}

builder.Services.AddScoped<ComplianceEngine>();`,
        explanation: "Keyed services replace the old 'switch statement + factory' pattern. The engine stays open/closed — adding a new PolicyType is just a new registration and a new class. Matches the Intune compliance check dispatch model.",
        hint: "AddKeyedScoped + GetRequiredKeyedService + enum key."
      }]
    },
    enterprise: {
      concept: "At enterprise scale, DI becomes architectural. Per-tenant scopes inject the current tenant's DbContext via a scoped ITenantContext resolved from the incoming request. Decorators add cross-cutting concerns (logging, caching, retry) without touching the real implementation. Scrutor helps: `services.Scan(...)` auto-registers assemblies; `services.Decorate<>()` wraps automatically.",
      codeExamples: [{
        title: "Per-tenant scope + Scrutor decoration",
        lang: "csharp",
        code: `// Scoped tenant context from middleware
public interface ITenantContext { TenantId TenantId { get; } }

public class TenantContext : ITenantContext
{
    public TenantId TenantId { get; set; }
}

public class TenantMiddleware
{
    private readonly RequestDelegate _next;
    public TenantMiddleware(RequestDelegate next) { _next = next; }

    public async Task InvokeAsync(HttpContext ctx, TenantContext tenant)
    {
        var header = ctx.Request.Headers["X-Tenant-Id"].ToString();
        if (!Guid.TryParse(header, out var id))
            throw new InvalidOperationException("Missing X-Tenant-Id");
        tenant.TenantId = new TenantId(id);
        await _next(ctx);
    }
}

// Registration
builder.Services.AddScoped<TenantContext>();
builder.Services.AddScoped<ITenantContext>(sp => sp.GetRequiredService<TenantContext>());

// Scrutor auto-register + decorate
builder.Services.Scan(s => s
    .FromAssemblyOf<IComplianceCheck>()
    .AddClasses(c => c.AssignableTo<IComplianceCheck>())
    .AsImplementedInterfaces()
    .WithScopedLifetime());

builder.Services.Decorate<IDeviceRepository, LoggingDeviceRepository>();
builder.Services.Decorate<IDeviceRepository, CachingDeviceRepository>();`,
        explanation: "Decorate calls layer in reverse order: the outer decorator is applied last. Here caching wraps logging wraps real. Scrutor.Scan cuts hundreds of registration lines in big solutions."
      }],
      flashcards: [
        { front: "Per-tenant scoped context?", back: "A scoped service populated by middleware from the incoming request. All downstream services depending on it get the correct tenant automatically." },
        { front: "Scrutor?", base: "community", back: "A NuGet package adding assembly scanning and decoration helpers to Microsoft.Extensions.DI. Saves hundreds of registration lines in big solutions." },
        { front: "Decorate order?", back: "Later Decorate calls wrap earlier ones. Last registered = outermost. Plan the order to match the pipeline you want." },
        { front: "Why resolve ITenantContext, not TenantContext?", back: "Consumers depend on the interface; middleware mutates the concrete class. The split keeps consumers immutable-from-their-view." }
      ],
      challenges: [{
        title: "Layer logging + caching decorators",
        difficulty: "Enterprise",
        prompt: "Given IDeviceRepository, Real, Logging wrapper, Caching wrapper — register so the outermost is Caching (fastest path), then Logging, then Real.",
        starterCode: `public interface IDeviceRepository { Task<Device?> GetAsync(Guid id); }
public class DeviceRepository : IDeviceRepository { /*...*/ }
public class LoggingDeviceRepository : IDeviceRepository {
    public LoggingDeviceRepository(IDeviceRepository inner, ILogger<LoggingDeviceRepository> log) { }
    public Task<Device?> GetAsync(Guid id) => throw new();
}
public class CachingDeviceRepository : IDeviceRepository {
    public CachingDeviceRepository(IDeviceRepository inner, IMemoryCache cache) { }
    public Task<Device?> GetAsync(Guid id) => throw new();
}`,
        solution: `// With Scrutor:
builder.Services.AddScoped<IDeviceRepository, DeviceRepository>();
builder.Services.Decorate<IDeviceRepository, LoggingDeviceRepository>();
builder.Services.Decorate<IDeviceRepository, CachingDeviceRepository>();

// Without Scrutor (manual factory):
builder.Services.AddScoped<DeviceRepository>();
builder.Services.AddScoped<IDeviceRepository>(sp =>
    new CachingDeviceRepository(
        new LoggingDeviceRepository(
            sp.GetRequiredService<DeviceRepository>(),
            sp.GetRequiredService<ILogger<LoggingDeviceRepository>>()),
        sp.GetRequiredService<IMemoryCache>()));`,
        explanation: "Order matters: Caching wraps Logging wraps Real. A cache hit short-circuits before logging runs. Scrutor's Decorate is much cleaner than manual nested factories — but understanding the manual form teaches you what Scrutor does.",
        hint: "Last Decorate call = outermost wrapper."
      }]
    }
  }
},

/* ====================== DAY 7 ====================== */
{
  id: 7, day: 7,
  title: "Middleware Pipeline",
  subtitle: "The request/response pipeline — where cross-cutting concerns live.",
  overview: "Use vs Run vs Map, custom middleware, order, and short-circuiting.",
  csharpFocus: "RequestDelegate, async lambdas, extension methods on IApplicationBuilder.",
  modes: {
    beginner: {
      concept: "Middleware are components that form a pipeline: each sees the HttpContext, does something, and either calls next() to pass control along, or short-circuits by not calling next. The pipeline is symmetric: on the way in, each middleware processes the request; on the way out (after await next()), each can process the response.",
      codeExamples: [{
        title: "Inline middleware",
        lang: "csharp",
        code: `app.Use(async (context, next) =>
{
    // Before the next middleware
    var sw = Stopwatch.StartNew();

    await next(context);

    // After the response has come back
    sw.Stop();
    context.Response.Headers["X-Elapsed-Ms"] = sw.ElapsedMilliseconds.ToString();
});

app.MapControllers();`,
        explanation: "The pipeline is onion-shaped. Code before await next() runs on the request; code after runs on the response. Middleware can read+write headers on either pass."
      }],
      flashcards: [
        { front: "Use vs Run vs Map?", back: "Use: middleware that optionally calls next. Run: terminal middleware (no next). Map: branches the pipeline by path prefix." },
        { front: "Short-circuiting?", back: "Not calling next() — middleware produces the full response on its own. Useful for auth denials, cached hits, health endpoints." },
        { front: "Why order matters?", back: "Each middleware sees the context in registration order. UseAuthentication must run before UseAuthorization, UseHttpsRedirection before authentication, etc." }
      ],
      challenges: [{
        title: "Stopwatch middleware",
        difficulty: "Warm-up",
        prompt: "Write inline middleware that measures the request duration and sets header X-Elapsed-Ms on the response.",
        starterCode: `var app = builder.Build();
// TODO
app.MapControllers();
app.Run();`,
        solution: `app.Use(async (ctx, next) =>
{
    var sw = Stopwatch.StartNew();
    await next(ctx);
    sw.Stop();
    ctx.Response.Headers["X-Elapsed-Ms"] = sw.ElapsedMilliseconds.ToString();
});`,
        explanation: "Classic before-and-after pattern. Note: setting response headers after next() requires the response to not have started yet — if a deeper middleware wrote to the body, headers are already sent. For safety in real code, use OnStarting callbacks.",
        hint: "Start a Stopwatch before next(), stop it after."
      }]
    },
    mid: {
      concept: "Extract reusable middleware as a class with InvokeAsync, then expose via an IApplicationBuilder extension method — the canonical UseXxx pattern. Middleware is constructor-injected with singletons only (the RequestDelegate is captured at build time). For scoped deps, add them as InvokeAsync parameters — the container resolves them per request.",
      codeExamples: [{
        title: "Class-based middleware + extension",
        lang: "csharp",
        code: `public class CorrelationIdMiddleware
{
    private const string HeaderName = "X-Correlation-Id";
    private readonly RequestDelegate _next;

    public CorrelationIdMiddleware(RequestDelegate next) { _next = next; }

    public async Task InvokeAsync(HttpContext ctx, ILogger<CorrelationIdMiddleware> log)
    {
        var id = ctx.Request.Headers[HeaderName].FirstOrDefault()
            ?? Guid.NewGuid().ToString();

        ctx.Items["CorrelationId"] = id;
        ctx.Response.Headers[HeaderName] = id;

        using (log.BeginScope(new Dictionary<string, object> { ["CorrelationId"] = id }))
        {
            await _next(ctx);
        }
    }
}

public static class CorrelationIdMiddlewareExtensions
{
    public static IApplicationBuilder UseCorrelationIds(this IApplicationBuilder app)
        => app.UseMiddleware<CorrelationIdMiddleware>();
}

// Program.cs
app.UseCorrelationIds();`,
        explanation: "ILogger is resolved per-request via the InvokeAsync parameter. BeginScope attaches CorrelationId to every log line emitted during this request — the most important logging feature for distributed systems."
      }],
      flashcards: [
        { front: "Why InvokeAsync and not constructor for scoped services?", back: "Middleware is instantiated once (like a singleton). Constructor can only take singletons. Scoped services must come through InvokeAsync parameters." },
        { front: "log.BeginScope pattern?", back: "Attaches properties to every log line inside the `using` block — so every log emitted during a request carries the CorrelationId." },
        { front: "UseXxx extension method convention?", back: "Package middleware behind a fluent extension. `app.UseCorrelationIds()` hides the UseMiddleware<T> call and feels native." }
      ],
      challenges: [{
        title: "Correlation ID middleware",
        difficulty: "Mid",
        prompt: "Write middleware that reads X-Correlation-Id header (or generates one), stores it in HttpContext.Items and echoes it back on the response. Expose as UseCorrelationIds extension.",
        starterCode: `// TODO`,
        solution: `public class CorrelationIdMiddleware
{
    private const string HeaderName = "X-Correlation-Id";
    private readonly RequestDelegate _next;

    public CorrelationIdMiddleware(RequestDelegate next) { _next = next; }

    public async Task InvokeAsync(HttpContext ctx)
    {
        var id = ctx.Request.Headers[HeaderName].FirstOrDefault() ?? Guid.NewGuid().ToString();
        ctx.Items["CorrelationId"] = id;
        ctx.Response.OnStarting(() =>
        {
            ctx.Response.Headers[HeaderName] = id;
            return Task.CompletedTask;
        });
        await _next(ctx);
    }
}

public static class CorrelationIdExtensions
{
    public static IApplicationBuilder UseCorrelationIds(this IApplicationBuilder app)
        => app.UseMiddleware<CorrelationIdMiddleware>();
}`,
        explanation: "OnStarting is a safer way to set response headers — it runs just before the response body is flushed, avoiding 'headers already sent' errors when something downstream already started writing.",
        hint: "ctx.Response.OnStarting(...) for safe response header writes."
      }]
    },
    advanced: {
      concept: "UseWhen and MapWhen branch the pipeline conditionally — e.g., apply heavy middleware only to /api paths. Terminal middleware (Run, Map + delegate) end the pipeline. IMiddleware is an alternative to conventional middleware that gets injected by DI — useful when you need scoped services in the constructor (less common post-.NET 6).",
      codeExamples: [{
        title: "Conditional branches",
        lang: "csharp",
        code: `// Apply rate limiting only to API routes
app.UseWhen(ctx => ctx.Request.Path.StartsWithSegments("/api"), branch =>
{
    branch.UseMiddleware<RateLimitMiddleware>();
});

// Mount a separate pipeline at /admin
app.Map("/admin", admin =>
{
    admin.UseAuthentication();
    admin.UseAuthorization();
    admin.UseEndpoints(e => e.MapControllers());
});

// IMiddleware version — scoped, DI-friendly
public class AuditMiddleware : IMiddleware
{
    private readonly IAuditLog _audit;
    public AuditMiddleware(IAuditLog audit) { _audit = audit; }

    public async Task InvokeAsync(HttpContext ctx, RequestDelegate next)
    {
        await _audit.RecordAsync(ctx.Request.Path);
        await next(ctx);
    }
}

// Requires explicit registration for IMiddleware variant
builder.Services.AddScoped<AuditMiddleware>();
app.UseMiddleware<AuditMiddleware>();`,
        explanation: "UseWhen branches inline; Map branches on path prefix. IMiddleware is injected by DI — useful when you want scoped dependencies in the constructor. Downside: must be explicitly registered in DI."
      }],
      flashcards: [
        { front: "UseWhen vs MapWhen?", back: "UseWhen runs a branch if predicate true but stays in the main pipeline. MapWhen branches away — the main pipeline doesn't continue after." },
        { front: "IMiddleware vs convention?", back: "IMiddleware is DI-resolved each request (scoped friendly). Convention-based is faster (singleton instance) but limited to singleton constructor deps. Convention is the default." },
        { front: "Terminal middleware?", back: "A middleware that doesn't call next — it ends the pipeline. Run() is explicitly terminal; Map()+delegate is terminal within the branch." }
      ],
      challenges: [{
        title: "Rate-limit /api paths only",
        difficulty: "Advanced",
        prompt: "Apply UseRateLimiter only to paths starting with /api, and a simpler UseRequestLogging to everything else.",
        starterCode: `// TODO in Program.cs`,
        solution: `app.UseWhen(ctx => ctx.Request.Path.StartsWithSegments("/api"), branch =>
{
    branch.UseRateLimiter();
});

app.UseWhen(ctx => !ctx.Request.Path.StartsWithSegments("/api"), branch =>
{
    branch.UseMiddleware<RequestLoggingMiddleware>();
});

app.MapControllers();`,
        explanation: "UseWhen gives you two distinct pipelines without splitting the whole app. Rate limiting is expensive, so you only pay for it on API paths; static files and health checks skip it entirely.",
        hint: "Two UseWhen blocks — one for /api, one for its complement."
      }]
    },
    enterprise: {
      concept: "Enterprise middleware composition is intentional: exception handler first (wraps everything), then logging/correlation, then tenant context, then auth, then the endpoint. Each layer should be its own UseXxx extension, named for what it does, not how. The 'policy' is the order in Program.cs; the 'mechanism' is each middleware class — clean separation.",
      codeExamples: [{
        title: "Intune-shaped middleware order",
        lang: "csharp",
        code: `// Program.cs (Production pipeline order)
app.UseExceptionHandler();          // catch-all, outermost
app.UseStatusCodePages();
app.UseHsts();                       // security headers
app.UseHttpsRedirection();
app.UseSerilogRequestLogging();      // log after redirect, before tenant
app.UseCorrelationIds();             // attach correlation to logs
app.UseTenantContext();              // populate ITenantContext from header
app.UseAuthentication();
app.UseAuthorization();
app.UseEndpoints(endpoints =>
{
    endpoints.MapControllers();
    endpoints.MapHealthChecks("/health/ready");
});`,
        explanation: "Reads like a playbook: unexpected failure handling outermost, security next, observability, tenancy, auth, endpoints. This order appears in virtually every large Microsoft-internal service."
      }],
      flashcards: [
        { front: "Why exception handler outermost?", back: "It must wrap every other middleware to convert thrown exceptions into proper error responses. Any middleware below it can throw safely." },
        { front: "Why correlation before tenant/auth?", back: "You want logs from tenant and auth to include the correlation ID. Correlation middleware must come first so BeginScope is active." },
        { front: "Why UseHsts before UseHttpsRedirection?", back: "Actually HSTS is typically set up to respond to HTTPS requests only, so ordering varies — both before routing. HSTS sends the Strict-Transport-Security header on responses." },
        { front: "Where does request logging fit?", back: "After HTTPS redirect (so you don't log bounced HTTP requests), but before tenant/auth so every request (even unauthenticated) is logged." }
      ],
      challenges: [{
        title: "Full pipeline order",
        difficulty: "Enterprise",
        prompt: "Order these middlewares correctly for a production API: UseCorrelationIds, UseAuthorization, UseExceptionHandler, UseAuthentication, UseTenantContext, UseSerilogRequestLogging, UseHttpsRedirection.",
        starterCode: `// Order these:
// UseCorrelationIds, UseAuthorization, UseExceptionHandler,
// UseAuthentication, UseTenantContext, UseSerilogRequestLogging,
// UseHttpsRedirection`,
        solution: `app.UseExceptionHandler();
app.UseHttpsRedirection();
app.UseSerilogRequestLogging();
app.UseCorrelationIds();
app.UseTenantContext();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();`,
        explanation: "Outermost to innermost: exception handler wraps everything. HTTPS redirect rejects plain HTTP early. Logging before correlation/tenant so the initial request line is logged, correlation attaches IDs, tenant context populates from header, auth reads the token, authz checks policies, then the endpoint runs.",
        hint: "Exception handler is outermost; authorization is just before endpoints."
      }]
    }
  }
},

/* ====================== DAY 8 ====================== */
{
  id: 8, day: 8,
  title: "Configuration & Options Pattern",
  subtitle: "Strongly-typed configuration from appsettings, environment, secrets, and Azure.",
  overview: "IConfiguration, IOptions<T> / IOptionsSnapshot<T> / IOptionsMonitor<T>, validation, and environment overrides.",
  csharpFocus: "Required members, DataAnnotations, generic IOptions<T>.",
  modes: {
    beginner: {
      concept: "Configuration in ASP.NET Core is a layered key/value store. Providers load values in order: appsettings.json → appsettings.{Environment}.json → user secrets → environment variables → command-line args. Later providers override earlier ones. Access via IConfiguration[\"Key:NestedKey\"] or bind a whole section to a typed class with IOptions<T>.",
      codeExamples: [{
        title: "Reading configuration",
        lang: "csharp",
        code: `// appsettings.json
// {
//   "Cache": { "RedisConnection": "localhost:6379", "DefaultTtlSeconds": 60 },
//   "ConnectionStrings": { "Default": "Server=..." }
// }

public class CacheOptions
{
    public const string SectionName = "Cache";
    public string RedisConnection { get; set; } = "";
    public int DefaultTtlSeconds { get; set; } = 60;
}

builder.Services.Configure<CacheOptions>(
    builder.Configuration.GetSection(CacheOptions.SectionName));

public class CacheService
{
    private readonly CacheOptions _opts;
    public CacheService(IOptions<CacheOptions> opts) { _opts = opts.Value; }
}`,
        explanation: "Configure<T> binds a section to a POCO. Inject IOptions<T> to consume. Constants like SectionName keep the section path in one place — grep-friendly, rename-safe."
      }],
      flashcards: [
        { front: "Configuration layering order?", back: "appsettings.json → appsettings.{Env}.json → user secrets (dev) → env vars → CLI args. Later wins." },
        { front: "What is IOptions<T>?", back: "Strongly-typed configuration binding. Inject it anywhere you need settings — no stringly-typed lookups." },
        { front: "How to reference environment variable?", back: "Set env var like `Cache__RedisConnection` (double underscore for nesting). ASP.NET Core maps it to `Cache:RedisConnection`." }
      ],
      challenges: [{
        title: "Bind a config section",
        difficulty: "Warm-up",
        prompt: "Bind section 'Email' to an EmailOptions class with SmtpHost, Port, FromAddress. Inject IOptions<EmailOptions> into a controller.",
        starterCode: `// appsettings.json has {"Email":{"SmtpHost":"...","Port":587,"FromAddress":"..."}}
// TODO`,
        solution: `public class EmailOptions
{
    public const string SectionName = "Email";
    public string SmtpHost { get; set; } = "";
    public int Port { get; set; }
    public string FromAddress { get; set; } = "";
}

builder.Services.Configure<EmailOptions>(
    builder.Configuration.GetSection(EmailOptions.SectionName));

public class EmailController : ControllerBase
{
    private readonly EmailOptions _email;
    public EmailController(IOptions<EmailOptions> email) { _email = email.Value; }
}`,
        explanation: "Configure<T> + IOptions<T> is the bread-and-butter pattern. Always use .Value to get the bound object — IOptions<T> is a wrapper.",
        hint: "Configure<T>(config.GetSection(\"Email\"))."
      }]
    },
    mid: {
      concept: "Three options interfaces for different lifetimes. IOptions<T>: singleton, read at startup — perfect for settings that don't change. IOptionsSnapshot<T>: scoped, reread per request — changes between requests. IOptionsMonitor<T>: singleton but gets notified on change, with OnChange callback — for singletons that must react to live config reloads.",
      codeExamples: [{
        title: "Pick the right options interface",
        lang: "csharp",
        code: `// 1. IOptions — singleton, startup-time value
public class StartupBoundService
{
    private readonly EmailOptions _opts;
    public StartupBoundService(IOptions<EmailOptions> opts) { _opts = opts.Value; }
}

// 2. IOptionsSnapshot — scoped, re-read each request
public class PerRequestService
{
    private readonly FeatureFlags _flags;
    public PerRequestService(IOptionsSnapshot<FeatureFlags> flags)
    { _flags = flags.Value; }
}

// 3. IOptionsMonitor — singleton with change callbacks
public class LiveReloadService
{
    private readonly IOptionsMonitor<CacheOptions> _monitor;

    public LiveReloadService(IOptionsMonitor<CacheOptions> monitor)
    {
        _monitor = monitor;
        _monitor.OnChange(updated =>
            Console.WriteLine($"Cache TTL changed to {updated.DefaultTtlSeconds}"));
    }

    public CacheOptions Current => _monitor.CurrentValue;
}`,
        explanation: "Pick by lifetime: if your consumer is a singleton and config can change at runtime, use IOptionsMonitor. If it's scoped and you want fresh values per request, IOptionsSnapshot. Otherwise IOptions."
      }],
      flashcards: [
        { front: "IOptions<T>?", back: "Singleton, read once at startup. Simplest, most common." },
        { front: "IOptionsSnapshot<T>?", back: "Scoped — re-binds per request. Only resolvable in scoped or transient services. Use for settings that can change between requests." },
        { front: "IOptionsMonitor<T>?", back: "Singleton wrapper with CurrentValue and OnChange callback. Use in singletons that must observe live config reloads." },
        { front: "Named options?", back: "<code>Configure&lt;T&gt;(\"name\", section)</code>. Inject <code>IOptionsSnapshot&lt;T&gt;</code> and call <code>.Get(\"name\")</code>. Useful for multiple configurations of the same type." }
      ],
      challenges: [{
        title: "Live-reloading cache options",
        difficulty: "Mid",
        prompt: "Build a singleton CacheService that uses IOptionsMonitor<CacheOptions> and logs every time the options change.",
        starterCode: `public class CacheOptions { public int DefaultTtlSeconds { get; set; } }
// TODO: CacheService as singleton`,
        solution: `public class CacheService
{
    private readonly IOptionsMonitor<CacheOptions> _monitor;
    private readonly ILogger<CacheService> _log;

    public CacheService(IOptionsMonitor<CacheOptions> monitor,
                        ILogger<CacheService> log)
    {
        _monitor = monitor;
        _log = log;
        _monitor.OnChange(updated =>
            _log.LogInformation("Cache TTL changed to {Ttl}s", updated.DefaultTtlSeconds));
    }

    public int Ttl => _monitor.CurrentValue.DefaultTtlSeconds;
}

builder.Services.Configure<CacheOptions>(builder.Configuration.GetSection("Cache"));
builder.Services.AddSingleton<CacheService>();`,
        explanation: "IOptionsMonitor lets a singleton consume config that can change (e.g., from appsettings reload or Azure App Configuration push). OnChange fires for every reload — idempotent observers only.",
        hint: "IOptionsMonitor<T>.OnChange(updated => ...)."
      }]
    },
    advanced: {
      concept: "Validation at startup: AddOptions<T>().ValidateDataAnnotations().ValidateOnStart() runs DataAnnotations before the app starts accepting traffic — misconfig fails fast, not on first request. For complex validation, use IValidateOptions<T> with custom logic. User secrets in development keep connection strings out of source control.",
      codeExamples: [{
        title: "Fluent options validation",
        lang: "csharp",
        code: `public class CacheOptions
{
    [Required]
    public string RedisConnection { get; set; } = default!;

    [Range(1, 3600)]
    public int DefaultTtlSeconds { get; set; } = 60;

    [Url]
    public string? DiagnosticsUri { get; set; }
}

builder.Services.AddOptions<CacheOptions>()
    .Bind(builder.Configuration.GetSection(CacheOptions.SectionName))
    .ValidateDataAnnotations()
    .Validate(o => o.RedisConnection.Contains(':'),
              "Redis connection must include port")
    .ValidateOnStart();`,
        explanation: "ValidateDataAnnotations handles declarative rules. .Validate(predicate) adds custom checks. .ValidateOnStart() runs it all during host startup — the app never serves traffic with bad config."
      }],
      flashcards: [
        { front: "ValidateOnStart?", back: "Runs options validation during host startup. Misconfigured envs fail fast instead of on first request. The production-safe default." },
        { front: "User secrets?", back: "A dev-machine file (outside source control) for connection strings and keys during development. `dotnet user-secrets set Key Value` → loaded automatically in Dev." },
        { front: "IValidateOptions<T>?", back: "Interface for custom, complex validation. Register as service; framework invokes it at startup if ValidateOnStart is enabled." },
        { front: "Configuration reload?", back: "appsettings changes trigger reload if `reloadOnChange: true`. IOptionsSnapshot and IOptionsMonitor see the new values; IOptions<T> does not." }
      ],
      challenges: [{
        title: "Fail-fast config validation",
        difficulty: "Advanced",
        prompt: "Validate CacheOptions: RedisConnection required, DefaultTtlSeconds 1–3600, and custom rule that DefaultTtlSeconds must be a multiple of 30. Validate on startup.",
        starterCode: `public class CacheOptions { public string RedisConnection { get; set; } = ""; public int DefaultTtlSeconds { get; set; } }
// TODO`,
        solution: `public class CacheOptions
{
    [Required]
    public string RedisConnection { get; set; } = default!;

    [Range(1, 3600)]
    public int DefaultTtlSeconds { get; set; } = 60;
}

builder.Services.AddOptions<CacheOptions>()
    .Bind(builder.Configuration.GetSection("Cache"))
    .ValidateDataAnnotations()
    .Validate(o => o.DefaultTtlSeconds % 30 == 0,
              "DefaultTtlSeconds must be a multiple of 30")
    .ValidateOnStart();`,
        explanation: "Layer validation: DataAnnotations for declarative rules, .Validate for anything custom. ValidateOnStart makes startup fail with a clear message instead of a mysterious first-request exception.",
        hint: ".Validate(predicate, errorMessage).ValidateOnStart()."
      }]
    },
    enterprise: {
      concept: "In production, secrets live in Azure Key Vault, with Managed Identity authentication — no credentials in code or pipelines. Dynamic configuration (feature flags, throttling knobs) lives in Azure App Configuration with push-reload. Use sentinels to coordinate multi-key updates atomically. Never put secrets in appsettings.json, ever — checked-in configuration is public in a breach.",
      codeExamples: [{
        title: "Azure Key Vault + App Configuration",
        lang: "csharp",
        code: `var builder = WebApplication.CreateBuilder(args);

if (!builder.Environment.IsDevelopment())
{
    // Key Vault for secrets
    builder.Configuration.AddAzureKeyVault(
        new Uri(builder.Configuration["KeyVault:Uri"]!),
        new DefaultAzureCredential());

    // App Configuration for dynamic settings + feature flags
    builder.Configuration.AddAzureAppConfiguration(options =>
    {
        options
            .Connect(new Uri(builder.Configuration["AppConfig:Endpoint"]!),
                     new DefaultAzureCredential())
            .Select(KeyFilter.Any, LabelFilter.Null)
            .Select(KeyFilter.Any, builder.Environment.EnvironmentName)
            .ConfigureRefresh(refresh => refresh
                .Register("Sentinel", refreshAll: true)
                .SetCacheExpiration(TimeSpan.FromSeconds(30)))
            .UseFeatureFlags();
    });
}

builder.Services.AddAzureAppConfiguration();
builder.Services.AddFeatureManagement();

app.UseAzureAppConfiguration();  // middleware triggers refresh`,
        explanation: "DefaultAzureCredential uses Managed Identity in Azure and falls back to developer auth locally — no secrets touch code. The 'Sentinel' key is a version marker: when Sentinel changes, the whole config refreshes atomically."
      }],
      flashcards: [
        { front: "DefaultAzureCredential?", back: "Credential chain: Managed Identity → VS → Azure CLI → environment. Same code locally and in Azure." },
        { front: "Sentinel key pattern?", back: "A versioned key (e.g., int that you bump). App Configuration refreshes everything when it changes — atomic multi-key update." },
        { front: "LabelFilter?", back: "Tag keys by environment (Development, Production). One App Config instance, multiple environments, cleanly separated." },
        { front: "Why never secrets in appsettings.json?", back: "Checked into source control. Visible in Docker image layers, build logs, diffs. Leakage blast radius is enormous." }
      ],
      challenges: [{
        title: "Production config bootstrap",
        difficulty: "Enterprise",
        prompt: "In Program.cs, add Azure Key Vault only in non-dev environments. Keep Development using local appsettings + user secrets. Use DefaultAzureCredential.",
        starterCode: `var builder = WebApplication.CreateBuilder(args);
// TODO
var app = builder.Build();
app.Run();`,
        solution: `var builder = WebApplication.CreateBuilder(args);

if (builder.Environment.IsDevelopment())
{
    builder.Configuration.AddUserSecrets<Program>();
}
else
{
    var kvUri = builder.Configuration["KeyVault:Uri"]
        ?? throw new InvalidOperationException("KeyVault:Uri required in non-Dev");
    builder.Configuration.AddAzureKeyVault(
        new Uri(kvUri),
        new DefaultAzureCredential());
}

var app = builder.Build();
app.Run();`,
        explanation: "Environment-gated config providers give you a clean story: developers use local secrets, production pulls from Key Vault via Managed Identity. Throwing early on missing KV:Uri in non-Dev environments prevents a silent fallback to appsettings (which wouldn't have secrets).",
        hint: "Check builder.Environment.IsDevelopment() and branch accordingly."
      }]
    }
  }
}

,

/* ====================== DAY 9 ====================== */
{
  id: 9, day: 9,
  title: "Repository Pattern",
  subtitle: "Abstracting data access so the domain doesn't care about storage.",
  overview: "Interfaces over persistence, generic repositories, specifications, and when the pattern helps vs hurts.",
  csharpFocus: "Generic interfaces, constraint clauses (where T : class), IQueryable vs IEnumerable.",
  modes: {
    beginner: {
      concept: "A repository is an interface over data access. Instead of controllers calling a DbContext directly, they call IDeviceRepository.GetByIdAsync(id). The concrete implementation could be EF Core, an in-memory dictionary (tests), or a web service call — and consumers don't know or care. This decouples domain logic from storage and makes unit testing trivial.",
      codeExamples: [{
        title: "A basic repository",
        lang: "csharp",
        code: `public interface IDeviceRepository
{
    Task<Device?> GetByIdAsync(Guid id, CancellationToken ct);
    Task<IReadOnlyList<Device>> GetAllAsync(CancellationToken ct);
    Task AddAsync(Device device, CancellationToken ct);
    Task<bool> DeleteAsync(Guid id, CancellationToken ct);
}

public class EfDeviceRepository : IDeviceRepository
{
    private readonly AppDbContext _db;
    public EfDeviceRepository(AppDbContext db) { _db = db; }

    public Task<Device?> GetByIdAsync(Guid id, CancellationToken ct)
        => _db.Devices.FirstOrDefaultAsync(d => d.Id == id, ct);

    public async Task<IReadOnlyList<Device>> GetAllAsync(CancellationToken ct)
        => await _db.Devices.ToListAsync(ct);

    public async Task AddAsync(Device device, CancellationToken ct)
    {
        _db.Devices.Add(device);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken ct)
    {
        var d = await GetByIdAsync(id, ct);
        if (d is null) return false;
        _db.Devices.Remove(d);
        await _db.SaveChangesAsync(ct);
        return true;
    }
}

builder.Services.AddScoped<IDeviceRepository, EfDeviceRepository>();`,
        explanation: "The interface is the contract. Swap to InMemoryDeviceRepository in unit tests; swap to CosmosDeviceRepository in production without changing any controller or service."
      }],
      flashcards: [
        { front: "What's the point of a repository?", back: "Decouple consumers from storage. The domain depends on an interface; tests inject fakes, production injects EF." },
        { front: "Why return IReadOnlyList<T>, not List<T>?", back: "Prevents callers from mutating the returned collection and accidentally 'saving' changes that aren't persisted." },
        { front: "Why async and CancellationToken on every method?", back: "All I/O should be async (don't block threads). CancellationToken lets callers abort long operations when the HTTP request is cancelled by the client." }
      ],
      challenges: [{
        title: "Define IProductRepository",
        difficulty: "Warm-up",
        prompt: "Define IProductRepository with async CRUD methods. Implement EfProductRepository using AppDbContext.",
        starterCode: `public class Product { public Guid Id { get; set; } public string Name { get; set; } = ""; }
public class AppDbContext : DbContext { public DbSet<Product> Products => Set<Product>(); }
// TODO`,
        solution: `public interface IProductRepository
{
    Task<Product?> GetByIdAsync(Guid id, CancellationToken ct);
    Task<IReadOnlyList<Product>> GetAllAsync(CancellationToken ct);
    Task AddAsync(Product product, CancellationToken ct);
    Task<bool> DeleteAsync(Guid id, CancellationToken ct);
}

public class EfProductRepository : IProductRepository
{
    private readonly AppDbContext _db;
    public EfProductRepository(AppDbContext db) { _db = db; }

    public Task<Product?> GetByIdAsync(Guid id, CancellationToken ct)
        => _db.Products.FirstOrDefaultAsync(p => p.Id == id, ct);

    public async Task<IReadOnlyList<Product>> GetAllAsync(CancellationToken ct)
        => await _db.Products.ToListAsync(ct);

    public async Task AddAsync(Product p, CancellationToken ct)
    { _db.Products.Add(p); await _db.SaveChangesAsync(ct); }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken ct)
    {
        var p = await GetByIdAsync(id, ct);
        if (p is null) return false;
        _db.Products.Remove(p);
        await _db.SaveChangesAsync(ct);
        return true;
    }
}`,
        explanation: "FirstOrDefaultAsync returns null if not found — hence the `?` on Task<Product?>. Always flow CancellationToken through: if the HTTP client disconnects, the DB query should be cancelled too.",
        hint: "Task<T?> for lookups, Task for commands."
      }]
    },
    mid: {
      concept: "A generic repository IRepository<T> cuts boilerplate when you have 10+ entity types with similar access patterns. Pair it with the specification pattern — objects that encapsulate a query (filtering + ordering + includes) so you don't expose IQueryable to callers (they'll build leaky, inefficient queries).",
      codeExamples: [{
        title: "Generic repo + specification",
        lang: "csharp",
        code: `public interface IRepository<T> where T : class
{
    Task<T?> GetByIdAsync(Guid id, CancellationToken ct);
    Task<IReadOnlyList<T>> FindAsync(ISpecification<T> spec, CancellationToken ct);
    Task AddAsync(T entity, CancellationToken ct);
}

public interface ISpecification<T>
{
    Expression<Func<T, bool>> Criteria { get; }
    List<Expression<Func<T, object>>> Includes { get; }
}

public class ActiveDevicesByOsSpec : ISpecification<Device>
{
    public ActiveDevicesByOsSpec(OsType os)
    {
        Criteria = d => d.OsType == os && d.IsActive;
        Includes = new() { d => d.Owner! };
    }
    public Expression<Func<Device, bool>> Criteria { get; }
    public List<Expression<Func<Device, object>>> Includes { get; }
}

public class EfRepository<T> : IRepository<T> where T : class
{
    private readonly AppDbContext _db;
    public EfRepository(AppDbContext db) { _db = db; }

    public Task<T?> GetByIdAsync(Guid id, CancellationToken ct)
        => _db.Set<T>().FindAsync(new object[] { id }, ct).AsTask();

    public async Task<IReadOnlyList<T>> FindAsync(
        ISpecification<T> spec, CancellationToken ct)
    {
        IQueryable<T> q = _db.Set<T>();
        foreach (var inc in spec.Includes) q = q.Include(inc);
        q = q.Where(spec.Criteria);
        return await q.ToListAsync(ct);
    }

    public async Task AddAsync(T entity, CancellationToken ct)
    { _db.Set<T>().Add(entity); await _db.SaveChangesAsync(ct); }
}`,
        explanation: "The specification is a typed, reusable query. Callers ask `repo.FindAsync(new ActiveDevicesByOsSpec(OsType.iOS))` — no IQueryable leakage, named queries they can grep for, and the repo only needs one Find method."
      }],
      flashcards: [
        { front: "Why NOT expose IQueryable from a repo?", back: "Callers can compose inefficient queries (.ToList() on a billion rows). The repo becomes leaky — storage details bleed into the domain." },
        { front: "Specification pattern?", back: "An object encapsulating a query — criteria, includes, ordering. Callers pass specs to a generic FindAsync without touching LINQ." },
        { front: "Generic repo trade-off?", back: "Less boilerplate for N entities; but you lose the ability to have entity-specific methods with good names (GetDevicesAssignedToPolicy)." },
        { front: "DbContext.Set<T>()?", back: "Generic accessor for any registered entity type. Lets a single generic repository work across entities." }
      ],
      challenges: [{
        title: "Implement IRepository<T>",
        difficulty: "Mid",
        prompt: "Create IRepository<T> with GetByIdAsync and FindAsync(ISpecification<T>). Implement EfRepository<T>. Register as open generic.",
        starterCode: `public interface ISpecification<T> { Expression<Func<T, bool>> Criteria { get; } }
// TODO`,
        solution: `public interface IRepository<T> where T : class
{
    Task<T?> GetByIdAsync(Guid id, CancellationToken ct);
    Task<IReadOnlyList<T>> FindAsync(ISpecification<T> spec, CancellationToken ct);
}

public class EfRepository<T> : IRepository<T> where T : class
{
    private readonly AppDbContext _db;
    public EfRepository(AppDbContext db) { _db = db; }

    public Task<T?> GetByIdAsync(Guid id, CancellationToken ct)
        => _db.Set<T>().FindAsync(new object[] { id }, ct).AsTask();

    public async Task<IReadOnlyList<T>> FindAsync(ISpecification<T> spec, CancellationToken ct)
        => await _db.Set<T>().Where(spec.Criteria).ToListAsync(ct);
}

// Open-generic registration
builder.Services.AddScoped(typeof(IRepository<>), typeof(EfRepository<>));`,
        explanation: "Open-generic registration: the container closes IRepository<T> per resolution — IRepository<Device>, IRepository<Policy>, etc. all served by one EfRepository<T>.",
        hint: "AddScoped(typeof(IRepository<>), typeof(EfRepository<>))."
      }]
    },
    advanced: {
      concept: "The uncomfortable truth: EF Core's DbContext already IS a repository + unit-of-work. A thin IRepository<T> over it adds ceremony without new value. Use the pattern when: (1) you have non-EF backends to swap in, (2) you want to enforce query-shape discipline via specs, (3) you need to intercept all data access for auditing. Otherwise, inject DbContext directly or use a service layer.",
      codeExamples: [{
        title: "Async streaming for large result sets",
        lang: "csharp",
        code: `public interface IComplianceEventRepository
{
    IAsyncEnumerable<ComplianceEvent> StreamSinceAsync(
        DateTime since, CancellationToken ct);
}

public class EfComplianceEventRepository : IComplianceEventRepository
{
    private readonly AppDbContext _db;
    public EfComplianceEventRepository(AppDbContext db) { _db = db; }

    public IAsyncEnumerable<ComplianceEvent> StreamSinceAsync(
        DateTime since, CancellationToken ct)
        => _db.ComplianceEvents
              .AsNoTracking()
              .Where(e => e.OccurredAt >= since)
              .OrderBy(e => e.OccurredAt)
              .AsAsyncEnumerable();
}

// Consumer — controller that streams NDJSON
[HttpGet("events/stream")]
public async IAsyncEnumerable<ComplianceEvent> StreamEvents(
    DateTime since,
    [EnumeratorCancellation] CancellationToken ct)
{
    await foreach (var ev in _repo.StreamSinceAsync(since, ct))
        yield return ev;
}`,
        explanation: "AsAsyncEnumerable streams rows one at a time — no ToListAsync pulling a million rows into memory. [EnumeratorCancellation] threads the cancellation token through the iterator. Response streams directly to the client."
      }],
      flashcards: [
        { front: "When is a thin repository over EF an anti-pattern?", back: "When EF is your only backend and you're just forwarding method calls. DbContext is already a repo+UoW. Injecting it directly is often cleaner." },
        { front: "IAsyncEnumerable<T>?", back: "An async-iterable sequence. Each item is awaited separately. Perfect for streaming large result sets without allocating the whole list." },
        { front: "AsNoTracking?", back: "Tells EF not to track the returned entities in the change tracker. Faster for reads; required for big queries where tracking would eat memory." },
        { front: "[EnumeratorCancellation]?", back: "Attribute on an async iterator parameter that binds the ambient CancellationToken into the state machine. Without it, cancellation doesn't propagate to iteration." }
      ],
      challenges: [{
        title: "Streaming repository",
        difficulty: "Advanced",
        prompt: "Add a StreamActiveAsync method to IDeviceRepository that returns IAsyncEnumerable<Device>. Use AsNoTracking. In the controller, consume it with await foreach.",
        starterCode: `public class Device { public Guid Id { get; set; } public bool IsActive { get; set; } }`,
        solution: `public interface IDeviceRepository
{
    IAsyncEnumerable<Device> StreamActiveAsync(CancellationToken ct);
}

public class EfDeviceRepository : IDeviceRepository
{
    private readonly AppDbContext _db;
    public EfDeviceRepository(AppDbContext db) { _db = db; }

    public IAsyncEnumerable<Device> StreamActiveAsync(CancellationToken ct)
        => _db.Devices
              .AsNoTracking()
              .Where(d => d.IsActive)
              .AsAsyncEnumerable();
}

[HttpGet("stream")]
public async IAsyncEnumerable<Device> Stream(
    [EnumeratorCancellation] CancellationToken ct)
{
    await foreach (var d in _repo.StreamActiveAsync(ct))
        yield return d;
}`,
        explanation: "ASP.NET Core's System.Text.Json serializer supports IAsyncEnumerable<T> natively — responses stream as JSON arrays without materializing the full list server-side. Essential for large exports.",
        hint: "Return IAsyncEnumerable<T>, not Task<IEnumerable<T>>."
      }]
    },
    enterprise: {
      concept: "At Intune scale, repositories enforce policy: every query is tenant-scoped, soft-deleted rows are invisible by default, reads flow through AsNoTracking, and every query has a cancellation token. EF Core query filters (HasQueryFilter) auto-apply predicates globally — impossible to forget. A ChangeTracker interceptor stamps CreatedBy/ModifiedBy from ITenantContext on every SaveChanges.",
      codeExamples: [{
        title: "Tenant-scoped repository with global filters",
        lang: "csharp",
        code: `public class AppDbContext : DbContext
{
    private readonly ITenantContext _tenant;
    public AppDbContext(DbContextOptions<AppDbContext> o, ITenantContext t)
        : base(o) { _tenant = t; }

    public DbSet<Device> Devices => Set<Device>();

    protected override void OnModelCreating(ModelBuilder mb)
    {
        mb.Entity<Device>()
            .HasQueryFilter(d =>
                d.TenantId == _tenant.TenantId &&
                !d.IsDeleted);
    }

    public override Task<int> SaveChangesAsync(CancellationToken ct = default)
    {
        StampAudit();
        return base.SaveChangesAsync(ct);
    }

    private void StampAudit()
    {
        foreach (var entry in ChangeTracker.Entries<AuditableEntity>())
        {
            if (entry.State == EntityState.Added)
                entry.Entity.MarkCreated(_tenant.UserId);
            else if (entry.State == EntityState.Modified)
                entry.Entity.Touch(_tenant.UserId);
        }
    }
}

public class EfDeviceRepository : IDeviceRepository
{
    private readonly AppDbContext _db;
    public EfDeviceRepository(AppDbContext db) { _db = db; }

    // The HasQueryFilter already filters by tenant — consumers can't forget
    public Task<Device?> GetByIdAsync(Guid id, CancellationToken ct)
        => _db.Devices.FirstOrDefaultAsync(d => d.Id == id, ct);
}`,
        explanation: "Safety via invariants, not vigilance. Developers literally cannot write a query that bypasses the tenant filter (unless they opt out with .IgnoreQueryFilters()). Auditing happens automatically in SaveChangesAsync."
      }],
      flashcards: [
        { front: "HasQueryFilter?", back: "EF Core fluent API. Applies a predicate to every query against an entity. Used for soft-delete and tenant isolation." },
        { front: "IgnoreQueryFilters?", back: "Per-query opt-out. Occasionally needed for admin tooling that sees across tenants or recovers soft-deleted rows. Grep-friendly red flag." },
        { front: "Why override SaveChangesAsync for auditing?", back: "Single funnel. Every persistence path goes through SaveChanges, so stamping CreatedBy/ModifiedBy there is impossible to bypass." },
        { front: "SaveChanges interceptor alternative?", back: "ISaveChangesInterceptor (EF Core 5+) is registered at DbContext config time, testable, and more composable than overriding SaveChangesAsync." }
      ],
      challenges: [{
        title: "Tenant + soft-delete filter",
        difficulty: "Enterprise",
        prompt: "Configure a global query filter on Device so only devices with matching TenantId (from ITenantContext) and !IsDeleted are returned by default.",
        starterCode: `public interface ITenantContext { Guid TenantId { get; } }
public class Device { public Guid Id { get; set; } public Guid TenantId { get; set; } public bool IsDeleted { get; set; } }
// TODO: DbContext`,
        solution: `public class AppDbContext : DbContext
{
    private readonly ITenantContext _tenant;
    public AppDbContext(DbContextOptions<AppDbContext> o, ITenantContext t)
        : base(o) { _tenant = t; }

    public DbSet<Device> Devices => Set<Device>();

    protected override void OnModelCreating(ModelBuilder mb)
    {
        mb.Entity<Device>()
            .HasQueryFilter(d => d.TenantId == _tenant.TenantId && !d.IsDeleted);
    }
}`,
        explanation: "The filter closes over _tenant via the DbContext's scoped lifetime — each request's DbContext has the right tenant. Soft-delete is folded into the same filter so 'deleted' rows are invisible everywhere.",
        hint: "HasQueryFilter accepts a lambda closing over DbContext instance state."
      }]
    }
  }
}

];

// Expose for index.js
if (typeof window !== 'undefined') window.DAYS_1_9 = DAYS_1_9;
