/* ============================================================
   data/days-10-17.js — Days 10-12 so far; more added in later passes
   ============================================================ */

const DAYS_10_17 = [

/* ====================== DAY 10 ====================== */
{
  id: 10, day: 10,
  title: "Unit of Work & Service Layer",
  subtitle: "Coordinating multiple operations as one transactional unit.",
  overview: "The service layer wraps business logic; UoW commits multiple changes atomically.",
  csharpFocus: "Disposable pattern, using statements, async transaction scopes.",
  modes: {
    beginner: {
      concept: "A service layer sits between controllers and repositories. Controllers handle HTTP (binding, status codes); services handle business rules; repositories handle storage. Unit of Work (UoW) is the pattern for committing multiple repository changes as one atomic transaction — all or nothing.",
      codeExamples: [{
        title: "Service layer over repositories",
        lang: "csharp",
        code: `public interface IDeviceService
{
    Task<DeviceResponse> EnrollAsync(EnrollDeviceRequest req, CancellationToken ct);
}

public class DeviceService : IDeviceService
{
    private readonly IDeviceRepository _devices;
    private readonly ILogger<DeviceService> _log;

    public DeviceService(IDeviceRepository devices, ILogger<DeviceService> log)
    { _devices = devices; _log = log; }

    public async Task<DeviceResponse> EnrollAsync(
        EnrollDeviceRequest req, CancellationToken ct)
    {
        if (await _devices.ExistsBySerialAsync(req.SerialNumber, ct))
            throw new DuplicateDeviceException(req.SerialNumber);

        var device = new Device
        {
            Id = Guid.NewGuid(),
            Name = req.Name,
            SerialNumber = req.SerialNumber,
            EnrolledAt = DateTime.UtcNow
        };

        await _devices.AddAsync(device, ct);
        _log.LogInformation("Enrolled device {DeviceId}", device.Id);
        return device.ToResponse();
    }
}`,
        explanation: "Controllers become thin — call the service, map the result. Services own the 'what'; repositories own the 'how'. Business rules (duplicate check) live in the service so they're unit-testable without HTTP or DB."
      }],
      flashcards: [
        { front: "Why a service layer between controllers and repos?", back: "Controllers handle HTTP; services handle business; repos handle storage. Three focused layers, easy to test independently." },
        { front: "Where do business rules live?", back: "In the service layer, not controllers. Controllers shouldn't know what 'duplicate' means." },
        { front: "What does 'thin controller' mean?", back: "Bind input, call service, map output. Under ~15 lines. Any branching/rule lives in the service." }
      ],
      challenges: [{
        title: "Thin controller, rich service",
        difficulty: "Warm-up",
        prompt: "Refactor: controller has validation + DB logic. Extract business logic into IOrderService.",
        starterCode: `[HttpPost]
public async Task<IActionResult> Create([FromBody] CreateOrderRequest req)
{
    if (req.Amount <= 0) return BadRequest("Amount must be positive");
    if (await _db.Orders.AnyAsync(o => o.IdempotencyKey == req.IdempotencyKey))
        return Conflict();
    var order = new Order { Id = Guid.NewGuid(), Amount = req.Amount };
    _db.Orders.Add(order);
    await _db.SaveChangesAsync();
    return CreatedAtAction(nameof(Get), new { id = order.Id }, order);
}`,
        solution: `public class OrderService : IOrderService
{
    private readonly AppDbContext _db;
    public OrderService(AppDbContext db) { _db = db; }

    public async Task<Order> CreateAsync(CreateOrderRequest req, CancellationToken ct)
    {
        if (req.Amount <= 0)
            throw new ValidationException("Amount must be positive");
        if (await _db.Orders.AnyAsync(o => o.IdempotencyKey == req.IdempotencyKey, ct))
            throw new DuplicateOrderException();

        var order = new Order { Id = Guid.NewGuid(), Amount = req.Amount };
        _db.Orders.Add(order);
        await _db.SaveChangesAsync(ct);
        return order;
    }
}

[HttpPost]
public async Task<IActionResult> Create(
    [FromBody] CreateOrderRequest req, CancellationToken ct)
{
    var order = await _service.CreateAsync(req, ct);
    return CreatedAtAction(nameof(Get), new { id = order.Id }, order);
}`,
        explanation: "Controller is now 3 lines. Exception middleware maps domain exceptions to HTTP status (Day 14).",
        hint: "Throw domain exceptions; middleware maps them."
      }]
    },
    mid: {
      concept: "DbContext is already a unit of work — every repository sharing the same DbContext instance participates in one SaveChangesAsync. For explicit transaction control (multiple SaveChanges calls that must be atomic), use IDbContextTransaction. Mostly, the ambient DbContext scope suffices.",
      codeExamples: [{
        title: "Explicit transaction across operations",
        lang: "csharp",
        code: `public async Task TransferAsync(
    Guid fromId, Guid toId, decimal amount, CancellationToken ct)
{
    await using var tx = await _db.Database.BeginTransactionAsync(ct);
    try
    {
        var from = await _db.Accounts.FindAsync(new object[] { fromId }, ct)
            ?? throw new NotFoundException(nameof(Account), fromId);
        var to = await _db.Accounts.FindAsync(new object[] { toId }, ct)
            ?? throw new NotFoundException(nameof(Account), toId);

        if (from.Balance < amount)
            throw new InsufficientFundsException();

        from.Balance -= amount;
        to.Balance += amount;

        await _db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }
    catch
    {
        await tx.RollbackAsync(ct);
        throw;
    }
}`,
        explanation: "`await using` disposes the transaction automatically. Commit on success, rollback on exception. For single-SaveChanges work this is rarely needed — SaveChanges is already atomic."
      }],
      flashcards: [
        { front: "DbContext as UoW?", back: "One DbContext = one unit of work. All changes tracked across repos sharing it commit atomically on SaveChangesAsync." },
        { front: "When do you need BeginTransactionAsync?", back: "Multiple SaveChanges calls that must be atomic, coordinating across DbContexts, or commit decisions based on post-save logic." },
        { front: "await using?", back: "Async disposal. Calls DisposeAsync at end of scope." },
        { front: "Why scoped DbContext?", back: "All services in a request share the same DbContext. Any repo you inject joins the same UoW." }
      ],
      challenges: [{
        title: "Multi-entity transaction",
        difficulty: "Mid",
        prompt: "Write ApproveOrderAsync: mark Order as Approved, create a Shipment, deduct Product.Stock. All atomic.",
        starterCode: `public enum OrderStatus { Pending, Approved, Shipped }
public class Order { public Guid Id { get; set; } public OrderStatus Status { get; set; } public int Quantity { get; set; } public Guid ProductId { get; set; } }
public class Shipment { public Guid Id { get; set; } public Guid OrderId { get; set; } public DateTime CreatedAt { get; set; } }
public class Product { public Guid Id { get; set; } public int Stock { get; set; } }`,
        solution: `public async Task ApproveOrderAsync(Guid orderId, CancellationToken ct)
{
    var order = await _db.Orders.FindAsync(new object[] { orderId }, ct)
        ?? throw new NotFoundException(nameof(Order), orderId);

    if (order.Status != OrderStatus.Pending)
        throw new InvalidOperationException("Only pending orders can be approved");

    var product = await _db.Products.FindAsync(new object[] { order.ProductId }, ct)
        ?? throw new NotFoundException(nameof(Product), order.ProductId);

    if (product.Stock < order.Quantity)
        throw new InsufficientStockException();

    order.Status = OrderStatus.Approved;
    product.Stock -= order.Quantity;
    _db.Shipments.Add(new Shipment
    {
        Id = Guid.NewGuid(),
        OrderId = order.Id,
        CreatedAt = DateTime.UtcNow
    });

    await _db.SaveChangesAsync(ct);
}`,
        explanation: "All three mutations tracked in the DbContext; one SaveChanges commits them in a single DB transaction. No BeginTransaction needed.",
        hint: "Single SaveChangesAsync — EF handles atomicity."
      }]
    },
    advanced: {
      concept: "CQRS-lite: split read services from command services. Read services project DTOs directly via EF Select (no entity tracking, no mapping round-trip). Command services load entities, mutate, save. Not full CQRS (same DB) but unlocks read-side performance.",
      codeExamples: [{
        title: "Read projection vs command",
        lang: "csharp",
        code: `public interface IDeviceReadService
{
    Task<DeviceSummaryDto?> GetSummaryAsync(Guid id, CancellationToken ct);
}

public class DeviceReadService : IDeviceReadService
{
    private readonly AppDbContext _db;
    public DeviceReadService(AppDbContext db) { _db = db; }

    public Task<DeviceSummaryDto?> GetSummaryAsync(Guid id, CancellationToken ct)
        => _db.Devices
              .AsNoTracking()
              .Where(d => d.Id == id)
              .Select(d => new DeviceSummaryDto(
                  d.Id, d.Name, d.OsType, d.Owner!.DisplayName))
              .FirstOrDefaultAsync(ct);
}

public interface IDeviceCommandService
{
    Task<Device> EnrollAsync(EnrollDeviceCommand cmd, CancellationToken ct);
}`,
        explanation: "EF translates Select into SELECT with only needed columns. No entity tracking overhead, no separate mapping pass. Often 5-10x faster on large lists."
      }],
      flashcards: [
        { front: "Projection via Select?", back: "EF generates SELECT with only projected columns. Less memory, faster than loading full entities and mapping in-memory." },
        { front: "Why CQRS-lite?", back: "Reads and writes have different shape and performance needs. Splitting lets each be optimal." },
        { front: "When use full CQRS (separate stores)?", back: "When reads and writes scale independently, or when the read model is materially different (denormalized, cached, search-optimized)." },
        { front: "MediatR?", back: "Library routing Command/Query objects to handlers. Useful in large solutions; overhead for small ones." }
      ],
      challenges: [{
        title: "Projection speedup",
        difficulty: "Advanced",
        prompt: "Rewrite to project in SQL instead of loading full entities.",
        starterCode: `public async Task<IReadOnlyList<DeviceListItemDto>> ListAsync(CancellationToken ct)
{
    var devices = await _db.Devices.ToListAsync(ct);
    return devices.Select(d => new DeviceListItemDto(d.Id, d.Name, d.OsType)).ToList();
}`,
        solution: `public async Task<IReadOnlyList<DeviceListItemDto>> ListAsync(CancellationToken ct)
    => await _db.Devices
        .AsNoTracking()
        .Select(d => new DeviceListItemDto(d.Id, d.Name, d.OsType))
        .ToListAsync(ct);`,
        explanation: "SQL becomes SELECT Id, Name, OsType FROM Devices. No tracking, no full-entity allocation. Significantly faster on large tables.",
        hint: "Move Select before ToListAsync."
      }]
    },
    enterprise: {
      concept: "Intune-style services are coordination layers: fetch devices, evaluate policies, write results, raise events to a message bus. One service method per business operation (not per CRUD). Every mutation emits a domain event. Publish AFTER SaveChanges so consumers never see rolled-back events.",
      codeExamples: [{
        title: "Compliance recalculation service",
        lang: "csharp",
        code: `public class ComplianceRecalculationService
{
    private readonly AppDbContext _db;
    private readonly IComplianceCheckEngine _engine;
    private readonly IMessagePublisher _bus;
    private readonly ILogger<ComplianceRecalculationService> _log;

    public ComplianceRecalculationService(AppDbContext db,
        IComplianceCheckEngine engine, IMessagePublisher bus,
        ILogger<ComplianceRecalculationService> log)
    { _db = db; _engine = engine; _bus = bus; _log = log; }

    public async Task<RecalcResult> RecalculateAsync(
        Guid deviceId, CancellationToken ct)
    {
        using var scope = _log.BeginScope(new Dictionary<string, object>
        {
            ["DeviceId"] = deviceId,
            ["Operation"] = "ComplianceRecalculation"
        });

        var device = await _db.Devices
            .Include(d => d.AppliedPolicies)
            .FirstOrDefaultAsync(d => d.Id == deviceId, ct)
            ?? throw new NotFoundException(nameof(Device), deviceId);

        var results = await _engine.EvaluateAsync(device, ct);

        device.ComplianceState = results.Any(r => !r.Passed)
            ? ComplianceState.NonCompliant
            : ComplianceState.Compliant;
        device.LastRecalculatedAt = DateTime.UtcNow;

        _db.ComplianceResults.AddRange(results);
        await _db.SaveChangesAsync(ct);

        await _bus.PublishAsync(
            new ComplianceRecalculatedEvent(deviceId, device.ComplianceState), ct);

        _log.LogInformation("Recalc complete: {State}", device.ComplianceState);
        return new RecalcResult(device.ComplianceState, results.Count);
    }
}`,
        explanation: "Coordination, not CRUD. Log scope attaches DeviceId to every line. Include eagerly loads policies to avoid N+1. Event publication decouples downstream consumers."
      }],
      flashcards: [
        { front: "One service method per business operation?", back: "Yes — not per CRUD. RecalculateAsync, ApproveOrderAsync, EnrollDeviceAsync." },
        { front: "Why publish events from services?", back: "Decouples downstream consumers (reporting, notifications, search). Your service doesn't need to know who cares." },
        { front: "Why publish AFTER SaveChanges?", back: "If save fails, you don't want consumers reacting to a rolled-back event." },
        { front: "N+1 query problem?", back: "Loading a parent and accessing a navigation per parent in a loop → N queries. Include() fixes it." }
      ],
      challenges: [{
        title: "Deactivate + publish event",
        difficulty: "Enterprise",
        prompt: "DeactivateAsync: load device, mark IsActive=false, set DeactivatedAt, save, publish DeviceDeactivatedEvent. Idempotent — if already inactive, log warning and return.",
        starterCode: `public record DeviceDeactivatedEvent(Guid DeviceId, DateTime DeactivatedAt);`,
        solution: `public async Task DeactivateAsync(Guid deviceId, string reason, CancellationToken ct)
{
    using var scope = _log.BeginScope(new Dictionary<string, object>
    {
        ["DeviceId"] = deviceId,
        ["Operation"] = "Deactivate"
    });

    var device = await _db.Devices.FirstOrDefaultAsync(d => d.Id == deviceId, ct)
        ?? throw new NotFoundException(nameof(Device), deviceId);

    if (!device.IsActive)
    {
        _log.LogWarning("Deactivation requested on already-inactive device");
        return;
    }

    device.IsActive = false;
    device.DeactivatedAt = DateTime.UtcNow;
    device.DeactivationReason = reason;

    await _db.SaveChangesAsync(ct);

    await _bus.PublishAsync(
        new DeviceDeactivatedEvent(device.Id, device.DeactivatedAt.Value), ct);

    _log.LogInformation("Device deactivated");
}`,
        explanation: "Idempotency check makes retries safe. Publish after save so consumers never see rolled-back events.",
        hint: "Check current state, mutate, save, publish."
      }]
    }
  }
},

/* ====================== DAY 11 ====================== */
{
  id: 11, day: 11,
  title: "Entity Framework Core Basics",
  subtitle: "DbContext, DbSet, LINQ queries, SaveChanges — EF Core's core loop.",
  overview: "Configuring DbContext, querying with LINQ, tracking vs no-tracking, eager loading.",
  csharpFocus: "LINQ (Where, Select, FirstOrDefault), lambda expressions, async query operators.",
  modes: {
    beginner: {
      concept: "EF Core is Microsoft's ORM — it translates LINQ queries into SQL and maps rows to C# objects. Define entities, declare a DbContext with DbSet<T> properties, register in DI, query with LINQ, call SaveChangesAsync. Most code reads like plain C# — SQL is generated at runtime.",
      codeExamples: [{
        title: "DbContext, query, save",
        lang: "csharp",
        code: `public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Device> Devices => Set<Device>();
    public DbSet<User> Users => Set<User>();
}

// Program.cs
builder.Services.AddDbContext<AppDbContext>(opt =>
    opt.UseSqlServer(builder.Configuration.GetConnectionString("Default")));

[HttpGet("{id:guid}")]
public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
{
    var device = await _db.Devices.FirstOrDefaultAsync(d => d.Id == id, ct);
    if (device is null) return NotFound();
    return Ok(device);
}

[HttpPost]
public async Task<IActionResult> Create(Device device, CancellationToken ct)
{
    _db.Devices.Add(device);
    await _db.SaveChangesAsync(ct);
    return CreatedAtAction(nameof(GetById), new { id = device.Id }, device);
}`,
        explanation: "LINQ syntax, SQL underneath. FirstOrDefaultAsync → SELECT TOP 1; Add schedules an INSERT; SaveChangesAsync commits."
      }],
      flashcards: [
        { front: "What is DbContext?", back: "EF Core's session with the DB — manages connections, tracks changes, coordinates SaveChanges. One per HTTP request (scoped)." },
        { front: "DbSet<T>?", back: "A queryable collection of entities of type T. Queries translate to SQL at execution time." },
        { front: "When is the query actually executed?", back: "On enumeration: ToListAsync, FirstOrDefaultAsync, CountAsync, etc." },
        { front: "SaveChangesAsync?", back: "Commits all tracked changes (Add, Update, Remove) as one transaction. Returns rows affected." }
      ],
      challenges: [{
        title: "First EF Core query",
        difficulty: "Warm-up",
        prompt: "Return all active Devices ordered by name. Async.",
        starterCode: `public class Device { public Guid Id { get; set; } public string Name { get; set; } = ""; public bool IsActive { get; set; } }`,
        solution: `public async Task<IReadOnlyList<Device>> GetActiveAsync(CancellationToken ct)
{
    return await _db.Devices
        .Where(d => d.IsActive)
        .OrderBy(d => d.Name)
        .ToListAsync(ct);
}`,
        explanation: "Where + OrderBy + ToListAsync → SELECT * FROM Devices WHERE IsActive = 1 ORDER BY Name. LINQ is lazy — nothing hits DB until ToListAsync.",
        hint: "Where + OrderBy + ToListAsync."
      }]
    },
    mid: {
      concept: "Change tracking is EF's memory of what entities look like. Queries you'll mutate need tracking (default). Read-only queries should use AsNoTracking for speed. Eager loading (Include) pulls related entities in one query to avoid N+1. Lazy loading exists but is dangerous — it can fire a query per property access in a loop.",
      codeExamples: [{
        title: "Tracking, no-tracking, eager loading",
        lang: "csharp",
        code: `// Tracked — for mutations
var device = await _db.Devices.FirstOrDefaultAsync(d => d.Id == id, ct);
if (device != null)
{
    device.LastSeenAt = DateTime.UtcNow;
    await _db.SaveChangesAsync(ct);
}

// No-tracking — for reads
var devices = await _db.Devices
    .AsNoTracking()
    .Where(d => d.IsActive)
    .ToListAsync(ct);

// Eager load — related data in one query
var withOwner = await _db.Devices
    .Include(d => d.Owner)
    .Include(d => d.AppliedPolicies)
        .ThenInclude(p => p.Policy)
    .AsNoTracking()
    .FirstOrDefaultAsync(d => d.Id == id, ct);`,
        explanation: "The query with Include generates one JOIN-heavy SQL. Without Include, accessing device.Owner is either null or triggers a separate query. Eager loading is predictable."
      }],
      flashcards: [
        { front: "When use AsNoTracking?", back: "Read-only queries. Skips the change tracker — saves memory and time. Essential for large list endpoints." },
        { front: "Include vs ThenInclude?", back: "Include pulls a direct navigation; ThenInclude chains into the included entity's navigations." },
        { front: "N+1 problem?", back: "Loading parent, looping, accessing a navigation per parent → N separate queries. Fix with Include or projection." },
        { front: "Why avoid lazy loading in web apps?", back: "A loop over 100 devices accessing .Owner fires 100 DB round-trips. Eager/explicit is predictable; lazy hides the cost." }
      ],
      challenges: [{
        title: "Fix N+1 with Include",
        difficulty: "Mid",
        prompt: "Code triggers N+1 accessing order.Customer. Fix it.",
        starterCode: `var orders = await _db.Orders.Where(o => o.Status == OrderStatus.Paid).ToListAsync(ct);
foreach (var o in orders)
    Console.WriteLine($"{o.Id} — {o.Customer.Name}");  // N+1`,
        solution: `var orders = await _db.Orders
    .Include(o => o.Customer)
    .Where(o => o.Status == OrderStatus.Paid)
    .AsNoTracking()
    .ToListAsync(ct);

foreach (var o in orders)
    Console.WriteLine($"{o.Id} — {o.Customer.Name}");`,
        explanation: "Include generates a JOIN. All customers come back with orders in one round-trip. AsNoTracking because we're just reading.",
        hint: "Include(o => o.Customer)."
      }]
    },
    advanced: {
      concept: "Change tracker internals: EF compares entity state to a snapshot. EntityState (Added/Modified/Deleted/Unchanged/Detached) controls what SaveChanges does. Attach treats entity as Unchanged. Update marks it Modified (all columns written). For high-write paths, manipulate state explicitly to control exactly what SQL runs.",
      codeExamples: [{
        title: "Explicit state manipulation",
        lang: "csharp",
        code: `// Update without a round-trip — 'stub' pattern
public async Task UpdateNameAsync(Guid id, string newName, CancellationToken ct)
{
    var stub = new Device { Id = id, Name = newName };
    _db.Devices.Attach(stub);
    _db.Entry(stub).Property(d => d.Name).IsModified = true;
    await _db.SaveChangesAsync(ct);
    // UPDATE Devices SET Name = @p0 WHERE Id = @p1
}

// Disconnected entity update
public async Task UpsertAsync(Device incoming, CancellationToken ct)
{
    var existing = await _db.Devices.FindAsync(new object[] { incoming.Id }, ct);
    if (existing is null)
        _db.Devices.Add(incoming);
    else
        _db.Entry(existing).CurrentValues.SetValues(incoming);
    await _db.SaveChangesAsync(ct);
}`,
        explanation: "Attach + set IsModified writes only the changed column — no SELECT first. SetValues copies values onto a tracked entity, triggering EF to mark only changed columns."
      }],
      flashcards: [
        { front: "EntityState values?", back: "Added, Modified, Deleted, Unchanged, Detached." },
        { front: "Attach vs Add vs Update?", back: "Attach: Unchanged (you'll mutate). Add: new row. Update: Modified with ALL properties written (heavy-handed)." },
        { front: "Why write just one property?", back: "Bandwidth + concurrency. Less data in UPDATE = fewer lost-update conflicts and less traffic." },
        { front: "SetValues?", back: "Copies values from a source object onto a tracked entity. EF writes only what actually changed." }
      ],
      challenges: [{
        title: "Update one column, no SELECT",
        difficulty: "Advanced",
        prompt: "Update Device.LastSeenAt given only the Id. No SELECT — only UPDATE.",
        starterCode: `// TODO`,
        solution: `public async Task UpdateLastSeenAsync(Guid id, CancellationToken ct)
{
    var stub = new Device { Id = id };
    _db.Devices.Attach(stub);
    stub.LastSeenAt = DateTime.UtcNow;
    await _db.SaveChangesAsync(ct);
}

// EF Core 7+ even better:
public Task UpdateLastSeenAsync7Plus(Guid id, CancellationToken ct)
    => _db.Devices
        .Where(d => d.Id == id)
        .ExecuteUpdateAsync(s => s.SetProperty(d => d.LastSeenAt, DateTime.UtcNow), ct);`,
        explanation: "Attach-then-mutate avoids loading the row. EF Core 7's ExecuteUpdateAsync is even faster — bulk updates without tracking.",
        hint: "Attach stub, mutate, save — or ExecuteUpdateAsync in EF 7+."
      }]
    },
    enterprise: {
      concept: "At Intune scale, EF performance tuning is continuous. Compiled queries cache LINQ-to-SQL translation. ExecuteUpdateAsync/ExecuteDeleteAsync bulk-mutate without materializing. Split queries avoid Cartesian explosions. TagWith stamps SQL comments so ops can find slow queries in traces.",
      codeExamples: [{
        title: "Compiled queries + tagging + bulk update",
        lang: "csharp",
        code: `public class DeviceQueries
{
    private static readonly Func<AppDbContext, Guid, CancellationToken, Task<Device?>>
        _getById = EF.CompileAsyncQuery(
            (AppDbContext db, Guid id, CancellationToken ct) =>
                db.Devices.FirstOrDefault(d => d.Id == id));

    public static Task<Device?> GetByIdAsync(AppDbContext db, Guid id, CancellationToken ct)
        => _getById(db, id, ct);
}

// Tagged split query
var device = await _db.Devices
    .AsSplitQuery()
    .Include(d => d.AppliedPolicies)
    .Include(d => d.ComplianceResults)
    .TagWith("ComplianceDetails.GetById")
    .FirstOrDefaultAsync(d => d.Id == id, ct);

// Bulk update
await _db.Devices
    .Where(d => d.LastSeenAt < DateTime.UtcNow.AddDays(-30))
    .ExecuteUpdateAsync(s => s
        .SetProperty(d => d.IsActive, false)
        .SetProperty(d => d.DeactivatedAt, DateTime.UtcNow), ct);`,
        explanation: "Compiled queries help hot paths. TagWith adds a SQL comment visible in traces. Split queries replace one JOIN-heavy query with multiple smaller ones — often faster than Cartesian duplication."
      }],
      flashcards: [
        { front: "Compiled query?", back: "Cache the LINQ translation. Useful in hot paths where the same query runs constantly." },
        { front: "Cartesian explosion?", back: "Including two collections multiplies rows: 10 policies × 50 results = 500 rows transferred. Split query issues separate queries instead." },
        { front: "ExecuteUpdateAsync?", back: "EF 7+ bulk update — no SELECT, no tracking, no SaveChanges. Translates to UPDATE SQL directly." },
        { front: "TagWith?", back: "Adds a SQL comment. Findable in DB traces, App Insights SQL dependencies, extended events." }
      ],
      challenges: [{
        title: "Bulk deactivate stale devices",
        difficulty: "Enterprise",
        prompt: "Deactivate all devices with LastSeenAt older than 30 days using ExecuteUpdateAsync. Don't load them first. Tag the query.",
        starterCode: `// TODO`,
        solution: `public Task<int> DeactivateStaleDevicesAsync(CancellationToken ct)
{
    var cutoff = DateTime.UtcNow.AddDays(-30);
    return _db.Devices
        .Where(d => d.LastSeenAt < cutoff && d.IsActive)
        .TagWith("Stale device deactivation")
        .ExecuteUpdateAsync(s => s
            .SetProperty(d => d.IsActive, false)
            .SetProperty(d => d.DeactivatedAt, DateTime.UtcNow), ct);
}`,
        explanation: "One UPDATE for thousands of rows. No allocation, no tracking, no SaveChanges. Returns rows affected. The pattern for maintenance jobs against large tables.",
        hint: "ExecuteUpdateAsync with SetProperty chains."
      }]
    }
  }
},

/* ====================== DAY 12 ====================== */
{
  id: 12, day: 12,
  title: "EF Core Advanced",
  subtitle: "Migrations, relationships, concurrency, and production config.",
  overview: "Fluent API, migrations workflow, relationship configuration, concurrency tokens.",
  csharpFocus: "Fluent configuration, IEntityTypeConfiguration<T>.",
  modes: {
    beginner: {
      concept: "Migrations are the source-controlled evolution of your schema. Every change to entity classes is captured as a code file (Add-Migration) and applied to the DB. Migration files live in source control so every environment applies the same sequence.",
      codeExamples: [{
        title: "Migration workflow",
        lang: "csharp",
        code: `// 1. Install EF tools once
// $ dotnet tool install --global dotnet-ef

// 2. Add a property
public class Device
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string? SerialNumber { get; set; }  // new
}

// 3. Generate migration
// $ dotnet ef migrations add AddSerialNumberToDevice

// 4. Review generated Up/Down methods in Migrations/
// 5. Apply locally:
// $ dotnet ef database update

// Or apply in code at startup (CI-deployed envs)
using var scope = app.Services.CreateScope();
var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
await db.Database.MigrateAsync();`,
        explanation: "Each migration is a C# file with Up (apply) and Down (rollback) methods. Commit them with your entity changes. Never edit a migration once it's on a shared branch — write a new one."
      }],
      flashcards: [
        { front: "Migration?", back: "Source-controlled schema change: Up applies, Down reverses. Generated by Add-Migration from entity diff." },
        { front: "Apply at startup or in CI?", back: "CI is safer (no race between instances, clear audit). Startup works for dev/small apps." },
        { front: "Never edit committed migrations?", back: "Teammates may have applied the old version. Editing creates divergence. Add a new migration instead." },
        { front: "dotnet ef commands?", back: "migrations add, migrations list, database update, migrations remove, migrations script (for DBAs)." }
      ],
      challenges: [{
        title: "Migration commands",
        difficulty: "Warm-up",
        prompt: "You added Description to Policy. Give CLI commands to: generate migration, apply locally, and produce an idempotent SQL script for prod release.",
        starterCode: `// Commands only`,
        solution: `# Generate
dotnet ef migrations add AddDescriptionToPolicy

# Apply locally
dotnet ef database update

# Idempotent SQL script for DBAs
dotnet ef migrations script --idempotent > migrate.sql`,
        explanation: "--idempotent makes the script safe to run against any DB state. Hand this to DBAs for prod releases.",
        hint: "migrations add <n> → database update."
      }]
    },
    mid: {
      concept: "The Fluent API configures entities at modelCreating time. Attributes work for simple constraints; fluent API handles composite keys, relationship navigation, value converters, indexes, owned types. Split configurations into IEntityTypeConfiguration<T> per entity for maintainability.",
      codeExamples: [{
        title: "IEntityTypeConfiguration per entity",
        lang: "csharp",
        code: `public class DeviceConfiguration : IEntityTypeConfiguration<Device>
{
    public void Configure(EntityTypeBuilder<Device> builder)
    {
        builder.ToTable("Devices");
        builder.HasKey(d => d.Id);

        builder.Property(d => d.Name)
               .HasMaxLength(200)
               .IsRequired();
        builder.Property(d => d.OsType)
               .HasConversion<string>()
               .HasMaxLength(20);

        builder.HasIndex(d => d.SerialNumber).IsUnique();

        // 1:N
        builder.HasOne(d => d.Owner)
               .WithMany(u => u.Devices)
               .HasForeignKey(d => d.OwnerId)
               .OnDelete(DeleteBehavior.Restrict);

        // Owned value object
        builder.OwnsOne(d => d.Address, addr =>
        {
            addr.Property(a => a.City).HasMaxLength(100);
            addr.Property(a => a.Country).HasMaxLength(2);
        });
    }
}

public class AppDbContext : DbContext
{
    protected override void OnModelCreating(ModelBuilder mb)
    {
        mb.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
    }
}`,
        explanation: "ApplyConfigurationsFromAssembly finds every IEntityTypeConfiguration<T> and applies it. One file per entity, reviewable as a unit."
      }],
      flashcards: [
        { front: "Fluent API vs attributes?", back: "Attributes are terse but limited. Fluent handles complex things: keys, relationships, converters, indexes." },
        { front: "IEntityTypeConfiguration<T>?", back: "One class per entity's fluent config. Keeps OnModelCreating small; makes config reviewable in isolation." },
        { front: "OnDelete(DeleteBehavior.Restrict)?", back: "Prevents cascade delete — you must remove children first. Safer default than Cascade." },
        { front: "OwnsOne?", back: "Configures a value object that shares its owner's table. For types like Address." }
      ],
      challenges: [{
        title: "Configure a 1:N",
        difficulty: "Mid",
        prompt: "Configure 1:N between Policy and PolicyAssignment (via PolicyId FK). Deleting Policy should restrict if assignments exist.",
        starterCode: `public class Policy { public Guid Id { get; set; } public ICollection<PolicyAssignment> Assignments { get; set; } = new List<PolicyAssignment>(); }
public class PolicyAssignment { public Guid Id { get; set; } public Guid PolicyId { get; set; } public Policy Policy { get; set; } = default!; }`,
        solution: `public class PolicyAssignmentConfiguration : IEntityTypeConfiguration<PolicyAssignment>
{
    public void Configure(EntityTypeBuilder<PolicyAssignment> builder)
    {
        builder.HasKey(pa => pa.Id);

        builder.HasOne(pa => pa.Policy)
               .WithMany(p => p.Assignments)
               .HasForeignKey(pa => pa.PolicyId)
               .OnDelete(DeleteBehavior.Restrict);
    }
}`,
        explanation: "HasOne/WithMany declares the 1:N shape. OnDelete.Restrict makes the DB enforce the rule — policy with assignments can't be deleted.",
        hint: "HasOne(Policy).WithMany(Assignments).HasForeignKey."
      }]
    },
    advanced: {
      concept: "Concurrency tokens prevent lost updates. Add a RowVersion (byte[]) property with [Timestamp] or IsRowVersion() fluent config. EF includes the current RowVersion in every UPDATE's WHERE clause; mismatch → DbUpdateConcurrencyException. Catch it, return 412, or reload and retry.",
      codeExamples: [{
        title: "Concurrency token + conflict handling",
        lang: "csharp",
        code: `public class Device
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public int Version { get; set; }

    [Timestamp]
    public byte[] RowVersion { get; set; } = default!;
}

public async Task UpdateNameAsync(Guid id, string name, byte[] expectedRowVersion)
{
    var device = await _db.Devices.FindAsync(id);
    if (device is null) throw new NotFoundException();

    _db.Entry(device).Property(d => d.RowVersion).OriginalValue = expectedRowVersion;
    device.Name = name;
    device.Version++;

    try
    {
        await _db.SaveChangesAsync();
    }
    catch (DbUpdateConcurrencyException)
    {
        throw new ConcurrencyException();
    }
}`,
        explanation: "Setting OriginalValue to the client's ETag forces EF to compare against it in the UPDATE WHERE clause. Mismatch → 0 rows → DbUpdateConcurrencyException."
      }],
      flashcards: [
        { front: "RowVersion / [Timestamp]?", back: "byte[] property auto-managed by SQL Server — incremented on every row update. EF uses as optimistic concurrency token." },
        { front: "DbUpdateConcurrencyException?", back: "Thrown when UPDATE's WHERE matches zero rows because RowVersion changed." },
        { front: "Retry vs 412?", back: "Retry: pull fresh state (idempotent merge). 412 to client: preserves user intent." },
        { front: "Optimistic vs pessimistic?", back: "Pessimistic blocks readers. Optimistic plays well with stateless HTTP." }
      ],
      challenges: [{
        title: "412 on concurrency conflict",
        difficulty: "Advanced",
        prompt: "PUT endpoint takes If-Match header with expected RowVersion. Return 412 on concurrency exception; include new ETag on success.",
        starterCode: `// TODO`,
        solution: `[HttpPut("{id:guid}")]
public async Task<IActionResult> Update(Guid id,
    [FromBody] UpdateDeviceRequest req, CancellationToken ct)
{
    var ifMatch = Request.Headers.IfMatch.ToString().Trim('"');
    if (string.IsNullOrEmpty(ifMatch))
        return StatusCode(StatusCodes.Status428PreconditionRequired);

    var expectedRowVersion = Convert.FromBase64String(ifMatch);

    var device = await _db.Devices.FindAsync(new object[] { id }, ct);
    if (device is null) return NotFound();

    _db.Entry(device).Property(d => d.RowVersion).OriginalValue = expectedRowVersion;
    device.Name = req.Name;

    try { await _db.SaveChangesAsync(ct); }
    catch (DbUpdateConcurrencyException)
    {
        return StatusCode(StatusCodes.Status412PreconditionFailed);
    }

    Response.Headers.ETag = $"\\"{Convert.ToBase64String(device.RowVersion)}\\"";
    return NoContent();
}`,
        explanation: "ETag carries RowVersion (base64). If-Match sends it back. OriginalValue seeds EF's expected prior value. On success, emit new ETag so client can retry immediately.",
        hint: "Set OriginalValue before SaveChanges."
      }]
    },
    enterprise: {
      concept: "Production EF needs resilience: retry policies (EnableRetryOnFailure), connection pooling (AddDbContextPool), and instrumentation. Intune-scale systems also use sharding or read replicas with explicit read/write contexts.",
      codeExamples: [{
        title: "Resilient pooled context",
        lang: "csharp",
        code: `builder.Services.AddDbContextPool<AppDbContext>(opt =>
{
    opt.UseSqlServer(
        builder.Configuration.GetConnectionString("Default"),
        sql =>
        {
            sql.EnableRetryOnFailure(
                maxRetryCount: 3,
                maxRetryDelay: TimeSpan.FromSeconds(5),
                errorNumbersToAdd: null);
            sql.CommandTimeout(30);
            sql.MigrationsAssembly("YourApp.Migrations");
        });

    if (builder.Environment.IsDevelopment())
        opt.EnableSensitiveDataLogging();
}, poolSize: 128);

// Read vs write split
public class ReadOnlyAppDbContext : AppDbContext { }
public class WriteAppDbContext : AppDbContext { }

builder.Services.AddDbContextPool<ReadOnlyAppDbContext>(opt =>
    opt.UseSqlServer(builder.Configuration.GetConnectionString("ReadReplica")));
builder.Services.AddDbContextPool<WriteAppDbContext>(opt =>
    opt.UseSqlServer(builder.Configuration.GetConnectionString("Primary")));`,
        explanation: "AddDbContextPool reuses DbContext instances — saves allocation at high QPS. EnableRetryOnFailure handles transient Azure SQL throttling. Read replicas offload reporting."
      }],
      flashcards: [
        { front: "AddDbContextPool vs AddDbContext?", back: "Pool reuses DbContext instances (reset between requests). Faster at high QPS." },
        { front: "EnableRetryOnFailure?", back: "Built-in retry for transient errors (deadlocks, Azure SQL throttling)." },
        { front: "Read/write context split?", back: "Two DbContext types on different connection strings. Offloads reporting load from primary." },
        { front: "EnableSensitiveDataLogging?", back: "Logs parameter values in SQL. NEVER in production — PII leakage. Dev-only." }
      ],
      challenges: [{
        title: "Configure a pooled context",
        difficulty: "Enterprise",
        prompt: "Register AppDbContext as pool: retry-on-failure (3 retries, 5s delay), 30s command timeout, pool size 128, sensitive-data-logging only in Dev.",
        starterCode: `// TODO`,
        solution: `builder.Services.AddDbContextPool<AppDbContext>(opt =>
{
    var cs = builder.Configuration.GetConnectionString("Default")
        ?? throw new InvalidOperationException("Missing connection string");

    opt.UseSqlServer(cs, sql =>
    {
        sql.EnableRetryOnFailure(
            maxRetryCount: 3,
            maxRetryDelay: TimeSpan.FromSeconds(5),
            errorNumbersToAdd: null);
        sql.CommandTimeout(30);
    });

    if (builder.Environment.IsDevelopment())
        opt.EnableSensitiveDataLogging();
}, poolSize: 128);`,
        explanation: "Connection string from configuration (Dev: appsettings; Prod: Key Vault, from Day 8). Same registration, different sources.",
        hint: "AddDbContextPool + UseSqlServer(retry + timeout)."
      }]
    }
  }
}

,

/* ====================== DAY 13 ====================== */
{
  id: 13, day: 13,
  title: "Validation",
  subtitle: "Enforcing request shape and business rules at the boundary.",
  overview: "DataAnnotations, FluentValidation, custom validators, and where validation belongs.",
  csharpFocus: "Attributes, IValidatableObject, FluentValidation rule builders.",
  modes: {
    beginner: {
      concept: "Validation rejects bad input early with clear messages. DataAnnotations ([Required], [Range], [EmailAddress], [StringLength]) attach rules to properties. [ApiController] auto-validates — invalid models return 400 with ProblemDetails. Validation happens before your action runs.",
      codeExamples: [{
        title: "DataAnnotations on a DTO",
        lang: "csharp",
        code: `public record CreateUserRequest
{
    [Required, EmailAddress]
    public string Email { get; init; } = "";

    [Required, MinLength(8), MaxLength(100)]
    public string Password { get; init; } = "";

    [Required, StringLength(50, MinimumLength = 2)]
    public string DisplayName { get; init; } = "";

    [Range(13, 120)]
    public int Age { get; init; }

    [Url]
    public string? AvatarUrl { get; init; }
}

[HttpPost]
public IActionResult Create([FromBody] CreateUserRequest req)
{
    // If we get here, model is valid — [ApiController] handled invalid already
    return Ok();
}`,
        explanation: "If client sends Email='not-an-email', the pipeline returns 400 with { errors: { Email: ['...'] }} before Create runs. Zero validation code in the controller."
      }],
      flashcards: [
        { front: "Most common DataAnnotations?", back: "[Required], [StringLength], [Range], [EmailAddress], [Url], [Phone], [RegularExpression], [Compare]." },
        { front: "What does [ApiController] do with invalid models?", back: "Auto-returns 400 with ProblemDetails listing errors per property." },
        { front: "Why validate at the controller boundary?", back: "Fail fast. Bad input never reaches business logic — services can assume well-formed input." },
        { front: "Range for non-numeric?", back: "[Range(typeof(DateTime), \"2024-01-01\", \"2099-12-31\")] for dates. Strings need RegularExpression or custom attributes." }
      ],
      challenges: [{
        title: "Annotate a DTO",
        difficulty: "Warm-up",
        prompt: "Annotate CreateDeviceRequest: Name required (2-100), OsType required, SerialNumber regex alphanumeric 10-20, PurchaseDate optional but if present must be past.",
        starterCode: `public record CreateDeviceRequest { public string Name { get; init; } = ""; public OsType OsType { get; init; } public string SerialNumber { get; init; } = ""; public DateTime? PurchaseDate { get; init; } }`,
        solution: `public record CreateDeviceRequest
{
    [Required, StringLength(100, MinimumLength = 2)]
    public string Name { get; init; } = "";

    [Required]
    public OsType OsType { get; init; }

    [Required]
    [RegularExpression("^[A-Za-z0-9]{10,20}$",
        ErrorMessage = "Serial must be 10-20 alphanumeric characters")]
    public string SerialNumber { get; init; } = "";

    [PastDate]
    public DateTime? PurchaseDate { get; init; }
}

public class PastDateAttribute : ValidationAttribute
{
    public override bool IsValid(object? value) =>
        value is null || (value is DateTime dt && dt <= DateTime.UtcNow);

    public override string FormatErrorMessage(string name)
        => $"{name} must be in the past.";
}`,
        explanation: "No built-in 'in the past' — a ValidationAttribute covers it.",
        hint: "Custom ValidationAttribute for 'in the past'."
      }]
    },
    mid: {
      concept: "FluentValidation separates validation logic from DTOs. Rules live in a validator class with fluent syntax handling cross-field conditions, async checks (DB uniqueness), and DI. Most Intune-scale teams use it — rule sets stay maintainable as DTOs grow.",
      codeExamples: [{
        title: "FluentValidation with DI",
        lang: "csharp",
        code: `// NuGet: FluentValidation.AspNetCore
builder.Services.AddFluentValidationAutoValidation();
builder.Services.AddValidatorsFromAssemblyContaining<CreateUserRequestValidator>();

public class CreateUserRequestValidator : AbstractValidator<CreateUserRequest>
{
    public CreateUserRequestValidator(IUserRepository users)
    {
        RuleFor(r => r.Email)
            .NotEmpty()
            .EmailAddress()
            .MustAsync(async (email, ct) => !await users.ExistsByEmailAsync(email, ct))
                .WithMessage("Email is already registered");

        RuleFor(r => r.Password)
            .NotEmpty()
            .MinimumLength(8)
            .Matches("[A-Z]").WithMessage("Password needs an uppercase letter")
            .Matches("[0-9]").WithMessage("Password needs a digit");

        When(r => r.AvatarUrl is not null, () =>
        {
            RuleFor(r => r.AvatarUrl).Must(u => Uri.TryCreate(u, UriKind.Absolute, out _));
        });
    }
}`,
        explanation: "Validator takes deps via constructor — IUserRepository for async uniqueness. When clauses group conditionals. AddFluentValidationAutoValidation hooks into MVC; 400s fire automatically."
      }],
      flashcards: [
        { front: "FluentValidation AbstractValidator<T>?", back: "Base for a DTO's validator. Constructor-injectable; RuleFor per property; MustAsync for async." },
        { front: "When FluentValidation over DataAnnotations?", back: "Cross-field rules, async validation, DI, complex conditionals." },
        { front: "MustAsync?", back: "Async custom rule — for DB-dependent checks (email uniqueness) impossible in DataAnnotations." },
        { front: "Auto-validation vs explicit?", back: "Auto hooks MVC → 400 automatic. Explicit (ValidateAsync) gives full control." }
      ],
      challenges: [{
        title: "FluentValidation with DI",
        difficulty: "Mid",
        prompt: "CreateOrderRequestValidator: Amount > 0, CustomerId exists (async via ICustomerRepository), if Amount > 10000 Notes non-empty.",
        starterCode: `public record CreateOrderRequest(Guid CustomerId, decimal Amount, string? Notes);
public interface ICustomerRepository { Task<bool> ExistsAsync(Guid id, CancellationToken ct); }`,
        solution: `public class CreateOrderRequestValidator : AbstractValidator<CreateOrderRequest>
{
    public CreateOrderRequestValidator(ICustomerRepository customers)
    {
        RuleFor(r => r.Amount)
            .GreaterThan(0)
            .WithMessage("Amount must be positive");

        RuleFor(r => r.CustomerId)
            .MustAsync(async (id, ct) => await customers.ExistsAsync(id, ct))
            .WithMessage("Customer does not exist");

        When(r => r.Amount > 10_000, () =>
        {
            RuleFor(r => r.Notes)
                .NotEmpty()
                .WithMessage("Notes are required for orders over 10,000");
        });
    }
}`,
        explanation: "Constructor DI, async rule, conditional block. Scales to complex DTOs without one monster method.",
        hint: "MustAsync for async, When for conditional."
      }]
    },
    advanced: {
      concept: "IValidatableObject runs cross-field logic inside the DTO itself. Returns IEnumerable<ValidationResult> — one per violation, scoped to named members so errors show under the right fields. For complex cross-cutting rules, extract to a domain service the validator calls via DI.",
      codeExamples: [{
        title: "IValidatableObject for cross-field",
        lang: "csharp",
        code: `public record DateRangeRequest(DateTime Start, DateTime End) : IValidatableObject
{
    public IEnumerable<ValidationResult> Validate(ValidationContext ctx)
    {
        if (End <= Start)
            yield return new ValidationResult(
                "End must be after Start",
                new[] { nameof(End) });

        if ((End - Start).TotalDays > 365)
            yield return new ValidationResult(
                "Range cannot exceed one year",
                new[] { nameof(Start), nameof(End) });
    }
}

public class FutureDateAttribute : ValidationAttribute
{
    public override ValidationResult? IsValid(object? value, ValidationContext ctx)
    {
        if (value is null) return ValidationResult.Success;
        if (value is DateTime dt && dt > DateTime.UtcNow)
            return ValidationResult.Success;

        return new ValidationResult(
            ErrorMessage ?? $"{ctx.DisplayName} must be a future date",
            new[] { ctx.MemberName! });
    }
}`,
        explanation: "IValidatableObject runs AFTER property-level validations and can return multiple results keyed to member names (so errors appear under the right fields in the 400 response)."
      }],
      flashcards: [
        { front: "IValidatableObject?", back: "Interface with Validate method for cross-field rules inside the DTO. Runs after property-level validation." },
        { front: "Why specify member names?", back: "So errors appear under the right property in the 400's errors dictionary — clients map to form fields." },
        { front: "Where do business invariants belong?", back: "Domain/service layer, not the validator. Validators are for shape; services for rules." },
        { front: "ValidationContext?", back: "Exposes member name, display name, injected services via GetService." }
      ],
      challenges: [{
        title: "Cross-field validation",
        difficulty: "Advanced",
        prompt: "CreateEventRequest: End > Start, (End - Start) <= 8 hours. Use IValidatableObject.",
        starterCode: `public record CreateEventRequest(string Title, DateTime Start, DateTime End) : IValidatableObject
{
    public IEnumerable<ValidationResult> Validate(ValidationContext ctx) { /* TODO */ }
}`,
        solution: `public record CreateEventRequest(string Title, DateTime Start, DateTime End) : IValidatableObject
{
    public IEnumerable<ValidationResult> Validate(ValidationContext ctx)
    {
        if (End <= Start)
            yield return new ValidationResult(
                "End must be after Start",
                new[] { nameof(End) });

        if ((End - Start).TotalHours > 8)
            yield return new ValidationResult(
                "Event cannot exceed 8 hours",
                new[] { nameof(Start), nameof(End) });
    }
}`,
        explanation: "yield return emits results lazily. Framework collects all and returns 400 with each error keyed to named members.",
        hint: "yield return ValidationResult with member names."
      }]
    },
    enterprise: {
      concept: "In enterprise systems validation is layered: DTO shape, cross-field, business invariants. Tenant-specific rules resolve limits from config per tenant. Shared validators between frontend and backend keep rules consistent.",
      codeExamples: [{
        title: "Tenant-aware validator",
        lang: "csharp",
        code: `public class CreatePolicyRequestValidator : AbstractValidator<CreatePolicyRequest>
{
    public CreatePolicyRequestValidator(
        ITenantContext tenant,
        IOptionsSnapshot<TenantLimits> limits)
    {
        var tenantLimits = limits.Get(tenant.TenantId.ToString());

        RuleFor(r => r.Name)
            .NotEmpty()
            .MaximumLength(tenantLimits.MaxPolicyNameLength);

        RuleFor(r => r.Rules)
            .Must(rules => rules.Count <= tenantLimits.MaxRulesPerPolicy)
            .WithMessage(r => $"Cannot exceed {tenantLimits.MaxRulesPerPolicy} rules");

        RuleForEach(r => r.Rules).SetValidator(new PolicyRuleValidator());
    }
}

public class TenantLimits
{
    public int MaxPolicyNameLength { get; set; } = 100;
    public int MaxRulesPerPolicy { get; set; } = 50;
}

builder.Services.Configure<TenantLimits>(
    "tenant-abc", builder.Configuration.GetSection("TenantLimits:tenant-abc"));`,
        explanation: "Validator gets current tenant's limits from named options. Different tenants, different caps. RuleForEach applies a child validator to every collection element."
      }],
      flashcards: [
        { front: "Named options for multi-tenant?", back: "IOptionsSnapshot<T>.Get(\"key\") resolves a specific configured instance. Perfect for per-tenant limits." },
        { front: "RuleForEach?", back: "FluentValidation for collections — applies a validator to every element. Errors include the index." },
        { front: "Where sanitize input?", back: "Don't sanitize — encode on output (HTML/JSON context). Sanitizing destroys data fidelity." },
        { front: "Why share validators frontend/backend?", back: "Instant client-side errors + server re-validates. Shared source = no rule drift." }
      ],
      challenges: [{
        title: "Validator with DI and collection",
        difficulty: "Enterprise",
        prompt: "CreatePolicyRequestValidator: Name required max 100, Rules max 20, each rule Description required max 500.",
        starterCode: `public record PolicyRule(string Description, int Priority);
public record CreatePolicyRequest(string Name, IList<PolicyRule> Rules);`,
        solution: `public class PolicyRuleValidator : AbstractValidator<PolicyRule>
{
    public PolicyRuleValidator()
    {
        RuleFor(r => r.Description).NotEmpty().MaximumLength(500);
        RuleFor(r => r.Priority).InclusiveBetween(1, 10);
    }
}

public class CreatePolicyRequestValidator : AbstractValidator<CreatePolicyRequest>
{
    public CreatePolicyRequestValidator()
    {
        RuleFor(r => r.Name).NotEmpty().MaximumLength(100);

        RuleFor(r => r.Rules)
            .NotNull()
            .Must(rules => rules.Count <= 20)
            .WithMessage("Cannot have more than 20 rules");

        RuleForEach(r => r.Rules).SetValidator(new PolicyRuleValidator());
    }
}`,
        explanation: "Composition via SetValidator lets each item's errors appear properly scoped (Rules[3].Description).",
        hint: "RuleForEach(...).SetValidator(childValidator)."
      }]
    }
  }
},

/* ====================== DAY 14 ====================== */
{
  id: 14, day: 14,
  title: "Error Handling",
  subtitle: "Turning exceptions into consistent, observable HTTP responses.",
  overview: "Exception middleware, domain exceptions, IExceptionHandler, mapping to status codes.",
  csharpFocus: "Exception hierarchies, throw/rethrow, pattern matching in catch.",
  modes: {
    beginner: {
      concept: "Don't wrap every controller action in try/catch. Register one exception handler middleware that catches unhandled exceptions, logs them, returns a consistent ProblemDetails. Let exceptions bubble up — middleware converts them into HTTP errors at the boundary.",
      codeExamples: [{
        title: "UseExceptionHandler pattern",
        lang: "csharp",
        code: `// Program.cs — simplest built-in handler
app.UseExceptionHandler("/error");

[ApiController]
public class ErrorController : ControllerBase
{
    [Route("/error")]
    public IActionResult Handle()
    {
        var feature = HttpContext.Features.Get<IExceptionHandlerFeature>();
        var ex = feature?.Error;

        return Problem(
            title: "An unexpected error occurred",
            detail: ex?.Message,
            statusCode: StatusCodes.Status500InternalServerError);
    }
}`,
        explanation: "Exceptions below UseExceptionHandler are caught. Error endpoint reads the exception via IExceptionHandlerFeature. Controllers stay clean — no try/catch."
      }],
      flashcards: [
        { front: "Why not try/catch in every action?", back: "Duplicates error handling, couples controllers to error format. Centralize in middleware." },
        { front: "IExceptionHandlerFeature?", back: "Feature exposing the caught exception. Read via HttpContext.Features.Get<IExceptionHandlerFeature>()." },
        { front: "When should a controller handle an exception itself?", back: "Almost never. By definition 'unexpected' means middleware's consistent handling applies." },
        { front: "throw vs throw ex?", back: "Always `throw;` — preserves stack trace. `throw ex;` resets it." }
      ],
      challenges: [{
        title: "Basic exception handler",
        difficulty: "Warm-up",
        prompt: "UseExceptionHandler with lambda returning JSON {error, traceId} status 500.",
        starterCode: `// TODO`,
        solution: `app.UseExceptionHandler(errApp =>
{
    errApp.Run(async ctx =>
    {
        var feature = ctx.Features.Get<IExceptionHandlerFeature>();
        ctx.Response.StatusCode = StatusCodes.Status500InternalServerError;
        ctx.Response.ContentType = "application/json";
        await ctx.Response.WriteAsJsonAsync(new
        {
            error = "An unexpected error occurred",
            traceId = ctx.TraceIdentifier,
            message = feature?.Error.Message
        });
    });
});`,
        explanation: "The lambda overload lets you inline the handler. For production, prefer a dedicated endpoint or ProblemDetails.",
        hint: "app.UseExceptionHandler(errApp => errApp.Run(async ctx => ...))."
      }]
    },
    mid: {
      concept: "Create domain-specific exceptions — NotFoundException, ConflictException, ValidationException — and map them to HTTP statuses in one place. Services throw domain exceptions; controllers stay thin; the mapping lives in one reviewable location. The 'fail with meaning' pattern.",
      codeExamples: [{
        title: "Domain exceptions + middleware mapping",
        lang: "csharp",
        code: `public class NotFoundException : Exception
{
    public NotFoundException(string entity, object id)
        : base($"{entity} '{id}' was not found") { }
}

public class ConflictException : Exception
{
    public ConflictException(string message) : base(message) { }
}

public class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _log;

    public ExceptionHandlingMiddleware(
        RequestDelegate next, ILogger<ExceptionHandlingMiddleware> log)
    { _next = next; _log = log; }

    public async Task InvokeAsync(HttpContext ctx)
    {
        try { await _next(ctx); }
        catch (NotFoundException ex) { await Write(ctx, 404, ex.Message); }
        catch (ConflictException ex) { await Write(ctx, 409, ex.Message); }
        catch (ValidationException ex) { await Write(ctx, 400, ex.Message); }
        catch (Exception ex)
        {
            _log.LogError(ex, "Unhandled exception");
            await Write(ctx, 500, "An unexpected error occurred");
        }
    }

    private static Task Write(HttpContext ctx, int status, string message)
    {
        ctx.Response.StatusCode = status;
        return ctx.Response.WriteAsJsonAsync(new ProblemDetails
        {
            Status = status, Title = message
        });
    }
}`,
        explanation: "Services throw NotFoundException with no HTTP knowledge. Middleware maps to 404. Changing the mapping is one line."
      }],
      flashcards: [
        { front: "Why domain exceptions?", back: "They carry meaning independent of HTTP. Service code reads naturally; mapping isolated to middleware." },
        { front: "Order of catch blocks?", back: "Most specific first, Exception catch-all last. First match wins." },
        { front: "Why log only unknown exceptions?", back: "Known domain exceptions are expected signals, not bugs. Logging them creates noise." },
        { front: "Middleware vs exception filter?", back: "Middleware catches everything. Filters are MVC-specific. Middleware more general." }
      ],
      challenges: [{
        title: "Exception middleware with mapping",
        difficulty: "Mid",
        prompt: "Map NotFoundException→404, DuplicateException→409, ValidationException→400, else→500. Log only 500s.",
        starterCode: `public class NotFoundException : Exception { public NotFoundException(string m) : base(m) { } }
public class DuplicateException : Exception { public DuplicateException(string m) : base(m) { } }
public class ValidationException : Exception { public ValidationException(string m) : base(m) { } }`,
        solution: `public class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _log;

    public ExceptionHandlingMiddleware(
        RequestDelegate next, ILogger<ExceptionHandlingMiddleware> log)
    { _next = next; _log = log; }

    public async Task InvokeAsync(HttpContext ctx)
    {
        try { await _next(ctx); }
        catch (Exception ex)
        {
            var (status, title) = ex switch
            {
                NotFoundException => (404, ex.Message),
                DuplicateException => (409, ex.Message),
                ValidationException => (400, ex.Message),
                _ => (500, "An unexpected error occurred")
            };

            if (status == 500) _log.LogError(ex, "Unhandled exception");

            ctx.Response.StatusCode = status;
            ctx.Response.ContentType = "application/problem+json";
            await ctx.Response.WriteAsJsonAsync(new ProblemDetails
            {
                Status = status, Title = title, Instance = ctx.Request.Path
            });
        }
    }
}

app.UseMiddleware<ExceptionHandlingMiddleware>();`,
        explanation: "Switch expression over exception type — compact, exhaustive, readable. Only 500s are logged as errors.",
        hint: "Pattern match on ex with switch expression."
      }]
    },
    advanced: {
      concept: "IExceptionHandler (.NET 8+) is a modern, DI-friendly alternative. Register multiple handlers; framework tries each until one returns true. Cleaner composition than one big middleware switch. Each handler is one class, one concern — testable and reviewable.",
      codeExamples: [{
        title: "IExceptionHandler composition",
        lang: "csharp",
        code: `public class NotFoundExceptionHandler : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext ctx, Exception ex, CancellationToken ct)
    {
        if (ex is not NotFoundException nf) return false;

        ctx.Response.StatusCode = StatusCodes.Status404NotFound;
        await ctx.Response.WriteAsJsonAsync(new ProblemDetails
        {
            Status = 404, Title = nf.Message, Instance = ctx.Request.Path
        }, ct);
        return true;
    }
}

public class GlobalExceptionHandler : IExceptionHandler
{
    private readonly ILogger<GlobalExceptionHandler> _log;
    public GlobalExceptionHandler(ILogger<GlobalExceptionHandler> log) { _log = log; }

    public async ValueTask<bool> TryHandleAsync(
        HttpContext ctx, Exception ex, CancellationToken ct)
    {
        _log.LogError(ex, "Unhandled exception");
        ctx.Response.StatusCode = StatusCodes.Status500InternalServerError;
        await ctx.Response.WriteAsJsonAsync(new ProblemDetails
        {
            Status = 500, Title = "Internal server error"
        }, ct);
        return true;
    }
}

builder.Services.AddExceptionHandler<NotFoundExceptionHandler>();
builder.Services.AddExceptionHandler<ConflictExceptionHandler>();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails();

app.UseExceptionHandler();`,
        explanation: "Each handler is its own class with its own deps. Framework iterates; first to return true handles."
      }],
      flashcards: [
        { front: "IExceptionHandler (.NET 8+)?", back: "Interface for DI-registered exception handlers. Register multiple; first true handles." },
        { front: "Return value semantics?", back: "true = handled, stop. false = try next handler." },
        { front: "IExceptionHandler vs middleware?", back: "IExceptionHandler is one class per concern, composable. Middleware is a single place. Both valid; IExceptionHandler is modern preference." },
        { front: "Exception filters vs IExceptionHandler?", back: "Filters are MVC-only. IExceptionHandler is framework-wide." }
      ],
      challenges: [{
        title: "Composed handlers",
        difficulty: "Advanced",
        prompt: "ValidationExceptionHandler (400) and GlobalExceptionHandler (500). Register and wire.",
        starterCode: `public class ValidationException : Exception { public ValidationException(string m) : base(m) { } }`,
        solution: `public class ValidationExceptionHandler : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext ctx, Exception ex, CancellationToken ct)
    {
        if (ex is not ValidationException ve) return false;

        ctx.Response.StatusCode = StatusCodes.Status400BadRequest;
        await ctx.Response.WriteAsJsonAsync(new ProblemDetails
        {
            Status = 400, Title = ve.Message, Instance = ctx.Request.Path
        }, ct);
        return true;
    }
}

public class GlobalExceptionHandler : IExceptionHandler
{
    private readonly ILogger<GlobalExceptionHandler> _log;
    public GlobalExceptionHandler(ILogger<GlobalExceptionHandler> log) { _log = log; }

    public async ValueTask<bool> TryHandleAsync(
        HttpContext ctx, Exception ex, CancellationToken ct)
    {
        _log.LogError(ex, "Unhandled exception");
        ctx.Response.StatusCode = StatusCodes.Status500InternalServerError;
        await ctx.Response.WriteAsJsonAsync(new ProblemDetails
        {
            Status = 500, Title = "Internal server error"
        }, ct);
        return true;
    }
}

builder.Services.AddExceptionHandler<ValidationExceptionHandler>();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails();
app.UseExceptionHandler();`,
        explanation: "Registration order = handling order. Specific first, fallback last.",
        hint: "AddExceptionHandler<T> for each; specific before fallback."
      }]
    },
    enterprise: {
      concept: "Production error contracts must be consistent across every endpoint. Emit correlation IDs, trace IDs, support links in every error response. Never leak stack traces in production. Log structured events at error boundaries so ops can alert on specific types.",
      codeExamples: [{
        title: "Production-safe error handler",
        lang: "csharp",
        code: `builder.Services.AddProblemDetails(opts =>
{
    opts.CustomizeProblemDetails = ctx =>
    {
        ctx.ProblemDetails.Instance = ctx.HttpContext.Request.Path;
        ctx.ProblemDetails.Extensions["traceId"] =
            Activity.Current?.Id ?? ctx.HttpContext.TraceIdentifier;
    };
});

public class GlobalExceptionHandler : IExceptionHandler
{
    private readonly ILogger<GlobalExceptionHandler> _log;
    private readonly IHostEnvironment _env;

    public GlobalExceptionHandler(
        ILogger<GlobalExceptionHandler> log, IHostEnvironment env)
    { _log = log; _env = env; }

    public async ValueTask<bool> TryHandleAsync(
        HttpContext ctx, Exception ex, CancellationToken ct)
    {
        var traceId = Activity.Current?.Id ?? ctx.TraceIdentifier;

        using (_log.BeginScope(new Dictionary<string, object> { ["TraceId"] = traceId }))
        {
            _log.LogError(ex, "Unhandled exception on {Path}", ctx.Request.Path);
        }

        ctx.Response.StatusCode = StatusCodes.Status500InternalServerError;
        var problem = new ProblemDetails
        {
            Status = 500,
            Title = "An unexpected error occurred",
            Detail = _env.IsDevelopment() ? ex.Message : null,
            Instance = ctx.Request.Path
        };
        problem.Extensions["traceId"] = traceId;

        await ctx.Response.WriteAsJsonAsync(problem, ct);
        return true;
    }
}`,
        explanation: "Detail exposed only in Development. Production clients get a generic title and the trace ID for support. Every error body correlates to logs."
      }],
      flashcards: [
        { front: "Why no stack traces in prod?", back: "Info leakage — stack frames reveal internal structure, SQL, file paths. Useful for attackers." },
        { front: "Activity.Current?.Id?", back: "OpenTelemetry's distributed trace ID. Cross-service correlation." },
        { front: "UseStatusCodePages?", back: "For non-exception 4xx/5xx (404 routing miss) — ensures they return ProblemDetails too." },
        { front: "Alerting on error types?", back: "Structured logs with stable event IDs let ops write KQL queries like 'count by eventId where severity=Error'." }
      ],
      challenges: [{
        title: "Production-safe handler",
        difficulty: "Enterprise",
        prompt: "GlobalExceptionHandler returning ProblemDetails with traceId. Exception.Message only in Development. Log 500s with correlation scope.",
        starterCode: `// TODO`,
        solution: `public class GlobalExceptionHandler : IExceptionHandler
{
    private readonly ILogger<GlobalExceptionHandler> _log;
    private readonly IHostEnvironment _env;

    public GlobalExceptionHandler(
        ILogger<GlobalExceptionHandler> log, IHostEnvironment env)
    { _log = log; _env = env; }

    public async ValueTask<bool> TryHandleAsync(
        HttpContext ctx, Exception ex, CancellationToken ct)
    {
        var traceId = Activity.Current?.Id ?? ctx.TraceIdentifier;

        using (_log.BeginScope(new Dictionary<string, object> { ["TraceId"] = traceId }))
        {
            _log.LogError(ex, "Unhandled exception on {Path}", ctx.Request.Path);
        }

        ctx.Response.StatusCode = StatusCodes.Status500InternalServerError;
        var problem = new ProblemDetails
        {
            Status = 500,
            Title = "An unexpected error occurred",
            Detail = _env.IsDevelopment() ? ex.Message : null,
            Instance = ctx.Request.Path
        };
        problem.Extensions["traceId"] = traceId;

        await ctx.Response.WriteAsJsonAsync(problem, ct);
        return true;
    }
}`,
        explanation: "Environment-gated detail, structured logging, trace ID in both logs and response.",
        hint: "IHostEnvironment + Activity.Current.Id."
      }]
    }
  }
}

,

/* ====================== DAY 15 ====================== */
{
  id: 15, day: 15,
  title: "Logging",
  subtitle: "Structured logs as the primary observability signal.",
  overview: "ILogger<T>, log levels, structured templates, scopes, choosing a sink.",
  csharpFocus: "Generic type parameters, source-generated logging, LoggerMessage.",
  modes: {
    beginner: {
      concept: "ASP.NET Core has built-in logging via ILogger<T>. Inject it, call _logger.LogInformation with a message template and arguments. Structured logging means the args are preserved as fields in the log record — you can filter and search by them.",
      codeExamples: [{
        title: "Structured logging basics",
        lang: "csharp",
        code: `public class DeviceController : ControllerBase
{
    private readonly ILogger<DeviceController> _log;
    private readonly IDeviceService _svc;

    public DeviceController(ILogger<DeviceController> log, IDeviceService svc)
    { _log = log; _svc = svc; }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        _log.LogInformation("Fetching device {DeviceId}", id);

        var device = await _svc.GetAsync(id, ct);
        if (device is null)
        {
            _log.LogWarning("Device {DeviceId} not found", id);
            return NotFound();
        }

        return Ok(device);
    }
}`,
        explanation: "Use PascalCase placeholders ({DeviceId}). NEVER string-concatenate values into the template — structured sinks lose the ability to index them."
      }],
      flashcards: [
        { front: "Log levels?", back: "Trace, Debug, Information, Warning, Error, Critical." },
        { front: "Why message templates?", back: "Template args become structured fields — searchable, filterable. Interpolation produces a string; you lose the structure." },
        { front: "ILogger<T>?", back: "Generic marker — T becomes the log category. 'All logs from DeviceController' is a trivial filter." },
        { front: "Never log PII at Info?", back: "Correct. Info goes to shared systems. Tokens, emails, passwords must be redacted or never logged." }
      ],
      challenges: [{
        title: "Structured template",
        difficulty: "Warm-up",
        prompt: "Convert concatenation to structured logging.",
        starterCode: `_log.LogInformation("Fetched user " + userId + " with " + deviceCount + " devices");`,
        solution: `_log.LogInformation("Fetched user {UserId} with {DeviceCount} devices",
    userId, deviceCount);`,
        explanation: "UserId and DeviceCount are distinct fields. Queryable in Seq/App Insights without parsing.",
        hint: "PascalCase placeholders matching argument order."
      }]
    },
    mid: {
      concept: "BeginScope attaches properties to every log line inside a `using` block. Perfect for request-scoped context. For hot paths, use LoggerMessage source generator — zero-allocation, compile-time-safe log methods. Filter logs per category via appsettings.",
      codeExamples: [{
        title: "Scopes and LoggerMessage source-gen",
        lang: "csharp",
        code: `public partial class DeviceService
{
    private readonly ILogger<DeviceService> _log;

    [LoggerMessage(
        EventId = 1001,
        Level = LogLevel.Information,
        Message = "Enrolled device {DeviceId} for tenant {TenantId}")]
    private partial void LogEnrolled(Guid deviceId, Guid tenantId);

    public async Task EnrollAsync(Guid deviceId, Guid tenantId, CancellationToken ct)
    {
        using var scope = _log.BeginScope(new Dictionary<string, object>
        {
            ["DeviceId"] = deviceId,
            ["TenantId"] = tenantId,
            ["Operation"] = "Enroll"
        });

        _log.LogInformation("Starting enrollment");
        LogEnrolled(deviceId, tenantId);
    }
}`,
        explanation: "BeginScope properties flow through every log inside the using. Source-generated logging avoids reflection/boxing — critical for high-QPS services."
      }],
      flashcards: [
        { front: "BeginScope?", back: "Attaches properties to every log inside a using block. Structured sinks make them searchable per scope." },
        { front: "LoggerMessage source generator?", back: "Roslyn generates efficient log method at compile time. Zero allocation. Use for hot paths." },
        { front: "EventId?", back: "Stable integer ID for a log event. Lets ops alert like 'alert when EventId 5003 fires >10/min'." },
        { front: "Filtering by category?", back: "appsettings Logging:LogLevel:<Category>. Defaults to class name. Quiets noisy components (EF, Microsoft.*)." }
      ],
      challenges: [{
        title: "Source-gen logger",
        difficulty: "Mid",
        prompt: "Add LoggerMessage to DeviceService logging 'Device enrolled' with DeviceId and Source. EventId 1001, Information.",
        starterCode: `public partial class DeviceService { private readonly ILogger<DeviceService> _log; public DeviceService(ILogger<DeviceService> log) { _log = log; } }`,
        solution: `public partial class DeviceService
{
    private readonly ILogger<DeviceService> _log;
    public DeviceService(ILogger<DeviceService> log) { _log = log; }

    [LoggerMessage(
        EventId = 1001,
        Level = LogLevel.Information,
        Message = "Device {DeviceId} enrolled from {Source}")]
    public partial void LogDeviceEnrolled(Guid deviceId, string source);

    public void Enroll(Guid id, string source) => LogDeviceEnrolled(id, source);
}`,
        explanation: "`partial` on both class and method required. 10-100x faster than reflection-based LogInformation on hot paths.",
        hint: "Class and method both need `partial`."
      }]
    },
    advanced: {
      concept: "Built-in logging is basic. Enterprise apps use Serilog (or NLog) for structured sinks: Seq (local dev), Application Insights, Elasticsearch. Serilog.AspNetCore hooks UseSerilogRequestLogging for one structured line per request. Destructure complex objects with @ prefix to log as JSON.",
      codeExamples: [{
        title: "Serilog bootstrap",
        lang: "csharp",
        code: `using Serilog;

Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .WriteTo.Seq("http://localhost:5341")
    .CreateBootstrapLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);

    builder.Host.UseSerilog((ctx, services, cfg) => cfg
        .ReadFrom.Configuration(ctx.Configuration)
        .ReadFrom.Services(services)
        .Enrich.FromLogContext()
        .Enrich.WithProperty("Service", "IntuneComplianceApi")
        .WriteTo.Console()
        .WriteTo.ApplicationInsights(
            services.GetRequiredService<TelemetryConfiguration>(),
            TelemetryConverter.Traces));

    var app = builder.Build();
    app.UseSerilogRequestLogging();
    app.MapControllers();
    app.Run();
}
catch (Exception ex) { Log.Fatal(ex, "App crashed at startup"); }
finally { Log.CloseAndFlush(); }

// Destructuring
_log.LogInformation("Enrolled {@Device}", device);  // full object as JSON
_log.LogInformation("Enrolled {$Device}", device);   // ToString()`,
        explanation: "UseSerilogRequestLogging emits one structured line per request. Enrich.FromLogContext pulls BeginScope props. Bootstrap logger catches startup crashes."
      }],
      flashcards: [
        { front: "Why Serilog over built-in?", back: "Structured sinks, enrichers, destructuring. Built-in great for simple apps; enterprise wants more." },
        { front: "{@Obj} vs {$Obj}?", back: "{@} serializes structure (queryable fields). {$} calls ToString(). Use @ for observability." },
        { front: "UseSerilogRequestLogging?", back: "Middleware logging one structured line per request: duration, path, status, size." },
        { front: "Bootstrap logger?", back: "Logger configured before DI is ready. Catches startup crashes." }
      ],
      challenges: [{
        title: "Destructured log",
        difficulty: "Advanced",
        prompt: "Log 'Policy evaluated' with full ComplianceResult as structured JSON.",
        starterCode: `public record ComplianceResult(Guid DeviceId, Guid PolicyId, bool Passed, string? Reason);`,
        solution: `public async Task EvaluateAsync(Device device, CancellationToken ct)
{
    var result = await _engine.EvaluateAsync(device, ct);
    _log.LogInformation("Policy evaluated {@Result}", result);
}`,
        explanation: "@ prefix destructures. In Seq/App Insights, Result appears as nested object with DeviceId, PolicyId, Passed, Reason as queryable fields.",
        hint: "{@Result} — the @ is the key."
      }]
    },
    enterprise: {
      concept: "Intune-scale logging faces volume (billions/day), cost, and sensitive data. Solutions: sampling (1% normal, 100% errors), strict redaction of PII, separate streams for audit vs operational, correlation IDs through async flow. Activity (System.Diagnostics) is the standard for distributed tracing — auto-propagates across HttpClient calls.",
      codeExamples: [{
        title: "Sampling + redaction + Activity",
        lang: "csharp",
        code: `public class RedactingEnricher : ILogEventEnricher
{
    private static readonly Regex TokenRe =
        new(@"""(access_token|password|api_key)""\\s*:\\s*""[^""]+""",
            RegexOptions.Compiled);

    public void Enrich(LogEvent evt, ILogEventPropertyFactory pf)
    {
        foreach (var prop in evt.Properties.ToList())
        {
            if (prop.Value is ScalarValue sv && sv.Value is string s)
            {
                var redacted = TokenRe.Replace(s, @"""$1"":""[REDACTED]""");
                if (redacted != s)
                    evt.AddOrUpdateProperty(pf.CreateProperty(prop.Key, redacted));
            }
        }
    }
}

builder.Host.UseSerilog((ctx, svc, cfg) => cfg
    .ReadFrom.Configuration(ctx.Configuration)
    .Enrich.With<RedactingEnricher>()
    .Enrich.WithProperty("Service", "Intune-Compliance")
    .Filter.ByExcluding(e =>
        e.Level < LogEventLevel.Warning && Random.Shared.Next(100) >= 1)
    .WriteTo.ApplicationInsights(
        svc.GetRequiredService<TelemetryConfiguration>(),
        TelemetryConverter.Traces));

using var activity = MyActivitySource.StartActivity("EnrollDevice");
activity?.SetTag("DeviceId", deviceId);
activity?.SetTag("TenantId", tenantId);
// Any log inside inherits Activity.Current.Id as TraceId`,
        explanation: "Sampling cuts cost 100x while keeping errors fully visible. Redaction enrichers run on every event. Activity is the OpenTelemetry primitive."
      }],
      flashcards: [
        { front: "Why sample logs?", back: "Cost + noise. At Intune volume, storing every trace burns millions/year. Sample happy path; keep errors 100%." },
        { front: "Redaction enricher?", back: "Runs on every log event, rewriting sensitive values. Centralized — zero chance to forget on individual statements." },
        { front: "Activity vs Scope?", back: "Activity spans a single operation, auto-propagates across HttpClient calls. Scope is logging-specific." },
        { front: "Audit vs operational logs?", back: "Audit (who did what): immutable, long retention. Operational: debug info, shorter retention." }
      ],
      challenges: [{
        title: "Activity correlation",
        difficulty: "Enterprise",
        prompt: "EnrollAsync: start Activity 'EnrollDevice' tagged with DeviceId, TenantId. Logs inside inherit trace ID.",
        starterCode: `public static class Telemetry { public static readonly ActivitySource Source = new("Intune.Compliance"); }`,
        solution: `public async Task EnrollAsync(Guid deviceId, Guid tenantId, CancellationToken ct)
{
    using var activity = Telemetry.Source.StartActivity("EnrollDevice");
    activity?.SetTag("DeviceId", deviceId);
    activity?.SetTag("TenantId", tenantId);

    _log.LogInformation("Starting enrollment");
    _log.LogInformation("Enrollment complete");
}`,
        explanation: "Activity.Current.Id becomes the TraceId on every log inside the using. Tags become span attributes in the distributed trace view.",
        hint: "ActivitySource.StartActivity + SetTag."
      }]
    }
  }
},

/* ====================== DAY 16 ====================== */
{
  id: 16, day: 16,
  title: "Authentication (JWT)",
  subtitle: "Proving who the caller is — bearer tokens and signed claims.",
  overview: "JWT structure, AddJwtBearer, claims, issuing tokens, Microsoft.Identity.Web.",
  csharpFocus: "Claims, ClaimsPrincipal, JWT handler configuration.",
  modes: {
    beginner: {
      concept: "Authentication figures out who the caller is. In APIs, the standard is JWT sent as Bearer: `Authorization: Bearer eyJhb...`. A JWT is a signed JSON blob with claims. Server validates signature and expiry, exposes HttpContext.User as a ClaimsPrincipal.",
      codeExamples: [{
        title: "AddJwtBearer setup",
        lang: "csharp",
        code: `builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(opt =>
    {
        opt.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidateAudience = true,
            ValidAudience = builder.Configuration["Jwt:Audience"],
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Key"]!))
        };
    });

builder.Services.AddAuthorization();

app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

[Authorize]
[HttpGet("me")]
public IActionResult Me()
{
    var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
    return Ok(new { userId });
}`,
        explanation: "AddJwtBearer validates the token on every request. [Authorize] requires authentication; ClaimsPrincipal exposes claims via User.FindFirstValue."
      }],
      flashcards: [
        { front: "JWT structure?", back: "Three base64url parts: header.payload.signature. Payload carries claims." },
        { front: "Bearer header?", back: "`Authorization: Bearer <jwt>`. Space between 'Bearer' and token." },
        { front: "TokenValidationParameters?", back: "Controls what gets validated: issuer, audience, lifetime, signing key." },
        { front: "HttpContext.User?", back: "ClaimsPrincipal populated by auth middleware. Null-safe for anonymous." }
      ],
      challenges: [{
        title: "Protect an endpoint",
        difficulty: "Warm-up",
        prompt: "[Authorize] + return user's sub claim.",
        starterCode: `[ApiController, Route("api/me")]
public class MeController : ControllerBase { /* TODO */ }`,
        solution: `[ApiController, Route("api/me")]
[Authorize]
public class MeController : ControllerBase
{
    [HttpGet]
    public IActionResult Get()
    {
        var sub = User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue("sub");
        return Ok(new { userId = sub });
    }
}`,
        explanation: "ClaimTypes.NameIdentifier is .NET's mapping of JWT 'sub'. Fallback to raw 'sub' is defensive.",
        hint: "[Authorize] + User.FindFirstValue."
      }]
    },
    mid: {
      concept: "Claims are key/value pairs about the user (sub, email, role, tenantId). Issuing a JWT: sign a set of claims with the server's key. Use TokenValidationParameters.NameClaimType/RoleClaimType if your tokens use non-default claim names (common with Entra).",
      codeExamples: [{
        title: "Issuing a JWT",
        lang: "csharp",
        code: `public class TokenService
{
    private readonly JwtOptions _opts;
    public TokenService(IOptions<JwtOptions> opts) { _opts = opts.Value; }

    public string IssueToken(User user)
    {
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(JwtRegisteredClaimNames.Email, user.Email),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new("tenantId", user.TenantId.ToString()),
        };
        foreach (var role in user.Roles)
            claims.Add(new Claim(ClaimTypes.Role, role));

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_opts.Key));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _opts.Issuer,
            audience: _opts.Audience,
            claims: claims,
            expires: DateTime.UtcNow.AddHours(1),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}`,
        explanation: "jti is unique token ID for revocation. tenantId custom claim — anything beyond the standard set is app-defined."
      }],
      flashcards: [
        { front: "JwtRegisteredClaimNames?", back: "Constants for standard claims: Sub, Email, Jti, Iat, Exp." },
        { front: "Why a jti claim?", back: "Token ID for revocation. Logout a specific token by denylisting its jti." },
        { front: "RoleClaimType?", back: "Which claim authz reads as roles. Default ClaimTypes.Role; Entra uses 'roles'." },
        { front: "HMAC vs RSA signing?", back: "HMAC: same key signs and verifies. RSA: private signs, public verifies — scales to many verifiers." }
      ],
      challenges: [{
        title: "Issue a JWT",
        difficulty: "Mid",
        prompt: "TokenService.IssueToken(User): sub, email, tenantId, roles, 1-hour expiry, HMAC-SHA256.",
        starterCode: `public record User(Guid Id, string Email, Guid TenantId, string[] Roles);
public class JwtOptions { public string Key { get; set; } = ""; public string Issuer { get; set; } = ""; public string Audience { get; set; } = ""; }`,
        solution: `public class TokenService
{
    private readonly JwtOptions _opts;
    public TokenService(IOptions<JwtOptions> opts) { _opts = opts.Value; }

    public string IssueToken(User user)
    {
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(JwtRegisteredClaimNames.Email, user.Email),
            new("tenantId", user.TenantId.ToString())
        };
        claims.AddRange(user.Roles.Select(r => new Claim(ClaimTypes.Role, r)));

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_opts.Key));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _opts.Issuer,
            audience: _opts.Audience,
            claims: claims,
            expires: DateTime.UtcNow.AddHours(1),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}`,
        explanation: "Claims list → SigningCredentials → JwtSecurityToken → WriteToken. Consumers validate with same key/issuer/audience.",
        hint: "Claims → SigningCredentials → JwtSecurityToken → WriteToken."
      }]
    },
    advanced: {
      concept: "Refresh tokens extend sessions without re-login. Flow: short access token (15 min) + long refresh token (weeks). On 401, exchange refresh for new access. Store refresh tokens hashed in DB for revocation. Rotate on every use — detects replay.",
      codeExamples: [{
        title: "Refresh with rotation",
        lang: "csharp",
        code: `[HttpPost("refresh")]
public async Task<IActionResult> Refresh(
    [FromBody] RefreshRequest req, CancellationToken ct)
{
    var hash = HashToken(req.RefreshToken);
    var record = await _store.FindAsync(hash);

    if (record is null || record.ExpiresAt < DateTime.UtcNow)
        return Unauthorized();

    await _store.RevokeAsync(hash);

    var user = await _users.GetAsync(record.UserId, ct);
    if (user is null) return Unauthorized();

    var newAccess = _tokens.IssueAccess(user);
    var newRefresh = Guid.NewGuid().ToString("N");
    await _store.StoreAsync(user.Id, HashToken(newRefresh),
        DateTime.UtcNow.AddDays(30));

    return Ok(new { access = newAccess, refresh = newRefresh, expiresIn = 900 });
}

private static string HashToken(string t) =>
    Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(t)));`,
        explanation: "Refresh tokens are opaque random strings, hashed in DB. Rotation on use prevents replay."
      }],
      flashcards: [
        { front: "Why refresh tokens?", back: "Balance security (short access) with UX (long sessions)." },
        { front: "Why hash refresh tokens in DB?", back: "DB leak → attackers can't use hashes as tokens." },
        { front: "Rotation on refresh?", back: "Every refresh generates new token, invalidates old. Replay attempts fail." },
        { front: "Key rotation?", back: "IssuerSigningKeys accepts a list. Publish new alongside old, retire the old. No downtime." }
      ],
      challenges: [{
        title: "Refresh with rotation",
        difficulty: "Advanced",
        prompt: "POST /refresh: hash input, lookup, check expiry, revoke, issue new pair.",
        starterCode: `public interface IRefreshTokenStore {
    Task<RefreshRecord?> FindAsync(string hash);
    Task RevokeAsync(string hash);
    Task StoreAsync(Guid userId, string hash, DateTime expiresAt);
}
public record RefreshRecord(Guid UserId, string Hash, DateTime ExpiresAt);`,
        solution: `[HttpPost("refresh")]
public async Task<IActionResult> Refresh(
    [FromBody] RefreshRequest req, CancellationToken ct)
{
    var hash = HashToken(req.RefreshToken);
    var record = await _store.FindAsync(hash);

    if (record is null || record.ExpiresAt < DateTime.UtcNow)
        return Unauthorized();

    await _store.RevokeAsync(hash);

    var user = await _users.GetAsync(record.UserId, ct);
    if (user is null) return Unauthorized();

    var newAccess = _tokens.IssueAccess(user);
    var newRefresh = Guid.NewGuid().ToString("N");
    await _store.StoreAsync(user.Id, HashToken(newRefresh),
        DateTime.UtcNow.AddDays(30));

    return Ok(new { access = newAccess, refresh = newRefresh, expiresIn = 900 });
}

private static string HashToken(string t) =>
    Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(t)));`,
        explanation: "Hash lookup, expiry check, revoke-then-issue-new.",
        hint: "Hash → lookup → expiry → revoke → issue new."
      }]
    },
    enterprise: {
      concept: "At Microsoft, AAD/Entra is the identity provider. Use Microsoft.Identity.Web — wraps AddJwtBearer with Entra defaults, handles key rotation, multi-tenant. For service-to-service, on-behalf-of (OBO) exchanges a user's token for a downstream service token. Never issue your own tokens in MS-internal services.",
      codeExamples: [{
        title: "Microsoft.Identity.Web",
        lang: "csharp",
        code: `builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddMicrosoftIdentityWebApi(builder.Configuration.GetSection("AzureAd"));

// OBO to call downstream
builder.Services
    .AddMicrosoftIdentityWebApiAuthentication(builder.Configuration, "AzureAd")
    .EnableTokenAcquisitionToCallDownstreamApi()
    .AddDownstreamApi("GraphApi", builder.Configuration.GetSection("Graph"))
    .AddInMemoryTokenCaches();

public class DeviceService
{
    private readonly IDownstreamApi _downstream;
    public DeviceService(IDownstreamApi downstream) { _downstream = downstream; }

    public Task<User?> GetUserFromGraphAsync(string userId)
        => _downstream.GetForUserAsync<User>("GraphApi",
            opts => opts.RelativePath = $"users/{userId}");
}`,
        explanation: "AddMicrosoftIdentityWebApi handles validation, JWKS discovery, rotation. EnableTokenAcquisition sets up OBO."
      }],
      flashcards: [
        { front: "Microsoft.Identity.Web?", back: "Official MS SDK for ASP.NET Core + Entra. Wraps JWT validation, OBO, caching, multi-tenant." },
        { front: "OBO?", back: "Your API receives a user's token, exchanges it for a downstream-service token." },
        { front: "Why never hand-roll tokens in MS-internal?", back: "Federation + audit + rotation. Entra handles everything." },
        { front: "JWKS?", back: "/.well-known/jwks.json — public signing keys. Validators fetch periodically; rotation is automatic." }
      ],
      challenges: [{
        title: "Microsoft.Identity.Web bootstrap",
        difficulty: "Enterprise",
        prompt: "Configure AddMicrosoftIdentityWebApi from AzureAd section. [Authorize] endpoint returns oid claim.",
        starterCode: `// TODO`,
        solution: `builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddMicrosoftIdentityWebApi(builder.Configuration.GetSection("AzureAd"));

builder.Services.AddAuthorization();

var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.Run();

[ApiController, Route("api/me"), Authorize]
public class MeController : ControllerBase
{
    [HttpGet]
    public IActionResult Get()
    {
        var oid = User.FindFirstValue("http://schemas.microsoft.com/identity/claims/objectidentifier")
               ?? User.FindFirstValue("oid");
        var tenantId = User.FindFirstValue("http://schemas.microsoft.com/identity/claims/tenantid");
        return Ok(new { oid, tenantId });
    }
}`,
        explanation: "Entra tokens carry 'oid' (user's directory ID). Microsoft.Identity.Web maps to long URI by default — checking both is defensive.",
        hint: "AddMicrosoftIdentityWebApi + [Authorize] + User.FindFirstValue(\"oid\")."
      }]
    }
  }
}

,

/* ====================== DAY 17 ====================== */
{
  id: 17, day: 17,
  title: "Authorization",
  subtitle: "Deciding what an authenticated caller is allowed to do.",
  overview: "Roles, claims, policies, handlers, resource-based authorization.",
  csharpFocus: "Attribute composition, AuthorizationHandler<T>, async predicates.",
  modes: {
    beginner: {
      concept: "Authentication = 'who are you?'. Authorization = 'what can you do?'. Simplest: [Authorize(Roles=\"Admin\")]. For finer control, build policies — named rules combining claims, roles, requirements — applied via [Authorize(Policy=\"...\")].",
      codeExamples: [{
        title: "Roles and policies",
        lang: "csharp",
        code: `builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("AdminOnly", p => p.RequireRole("Admin"));
    options.AddPolicy("ComplianceReader", p =>
        p.RequireClaim("permissions", "compliance.read"));
    options.AddPolicy("ActiveUser", p =>
        p.RequireAuthenticatedUser()
         .RequireClaim("accountStatus", "active"));
});

[Authorize(Policy = "ComplianceReader")]
[HttpGet("policies")]
public IActionResult GetPolicies() => Ok();

[Authorize(Roles = "Admin")]
[HttpDelete("{id:guid}")]
public IActionResult Delete(Guid id) => NoContent();`,
        explanation: "Policies beat scattered role strings: named, centralized, reusable. Change the rule once — updates everywhere."
      }],
      flashcards: [
        { front: "Role vs claim?", back: "Role is a special claim (ClaimTypes.Role). Other claims carry any key/value." },
        { front: "Why policies over inline roles?", back: "Named, centralized, testable. 'AdminOnly' is a contract." },
        { front: "RequireAuthenticatedUser?", back: "Requires non-anonymous ClaimsPrincipal. Baseline for authenticated-only resources." },
        { front: "[AllowAnonymous]?", back: "Overrides [Authorize] on a specific action. For public endpoints on protected controllers." }
      ],
      challenges: [{
        title: "Build a policy",
        difficulty: "Warm-up",
        prompt: "Policies ManagePolicies (claim 'policies.write') and ReadPolicies (claim 'policies.read'). Apply to actions.",
        starterCode: `// TODO`,
        solution: `builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("ReadPolicies", p =>
        p.RequireClaim("permissions", "policies.read"));
    options.AddPolicy("ManagePolicies", p =>
        p.RequireClaim("permissions", "policies.write"));
});

[Authorize(Policy = "ReadPolicies")]
[HttpGet]
public IActionResult Get() => Ok();

[Authorize(Policy = "ManagePolicies")]
[HttpPost]
public IActionResult Create() => NoContent();`,
        explanation: "RequireClaim scales better than cramming everything into roles.",
        hint: "AddPolicy + RequireClaim."
      }]
    },
    mid: {
      concept: "Complex rules don't fit into RequireClaim chains — they need custom authorization handlers. Define an IAuthorizationRequirement (marker) and a handler inheriting AuthorizationHandler<TRequirement>. Inject dependencies, call context.Succeed() when the rule passes.",
      codeExamples: [{
        title: "Custom requirement + handler",
        lang: "csharp",
        code: `public class MinimumAgeRequirement : IAuthorizationRequirement
{
    public int MinimumAge { get; }
    public MinimumAgeRequirement(int age) { MinimumAge = age; }
}

public class MinimumAgeHandler : AuthorizationHandler<MinimumAgeRequirement>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        MinimumAgeRequirement requirement)
    {
        var dobClaim = context.User.FindFirst(c => c.Type == ClaimTypes.DateOfBirth);
        if (dobClaim is null) return Task.CompletedTask;

        if (!DateTime.TryParse(dobClaim.Value, out var dob))
            return Task.CompletedTask;

        var age = DateTime.UtcNow.Year - dob.Year;
        if (dob > DateTime.UtcNow.AddYears(-age)) age--;

        if (age >= requirement.MinimumAge)
            context.Succeed(requirement);

        return Task.CompletedTask;
    }
}

builder.Services.AddAuthorization(opt =>
{
    opt.AddPolicy("Over18", p =>
        p.AddRequirements(new MinimumAgeRequirement(18)));
});
builder.Services.AddSingleton<IAuthorizationHandler, MinimumAgeHandler>();`,
        explanation: "Requirements carry parameters; handlers encode logic. context.Succeed marks the requirement met."
      }],
      flashcards: [
        { front: "IAuthorizationRequirement?", back: "Marker interface on a class carrying data for a rule (MinimumAge, PermissionName)." },
        { front: "AuthorizationHandler<T>?", back: "Implements the rule. Override HandleRequirementAsync; call context.Succeed(req) to pass." },
        { front: "Why context.Succeed not return bool?", back: "Multiple handlers can evaluate a requirement. Any Succeed is sufficient — OR semantics." },
        { front: "Register handlers as singleton?", back: "Usually yes — stateless. Scoped only if they depend on scoped services." }
      ],
      challenges: [{
        title: "Permission handler",
        difficulty: "Mid",
        prompt: "PermissionRequirement(string) + handler checking 'permissions' claim. Policy 'RequirePolicies_Read' needing 'policies.read'.",
        starterCode: `// TODO`,
        solution: `public class PermissionRequirement : IAuthorizationRequirement
{
    public string Permission { get; }
    public PermissionRequirement(string perm) { Permission = perm; }
}

public class PermissionHandler : AuthorizationHandler<PermissionRequirement>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context, PermissionRequirement req)
    {
        var hasPerm = context.User.Claims
            .Any(c => c.Type == "permissions" && c.Value == req.Permission);

        if (hasPerm) context.Succeed(req);
        return Task.CompletedTask;
    }
}

builder.Services.AddAuthorization(opt =>
{
    opt.AddPolicy("RequirePolicies_Read", p =>
        p.AddRequirements(new PermissionRequirement("policies.read")));
});
builder.Services.AddSingleton<IAuthorizationHandler, PermissionHandler>();`,
        explanation: "Generic requirement — one handler serves any permission string.",
        hint: "Requirement carries the permission; handler reads the claim."
      }]
    },
    advanced: {
      concept: "Resource-based authorization handles 'can this user edit THIS specific resource?'. The check needs both user and resource instance. Inject IAuthorizationService, call AuthorizeAsync(User, resource, policyName) after loading the resource.",
      codeExamples: [{
        title: "Resource-based — user owns document",
        lang: "csharp",
        code: `public class OwnerRequirement : IAuthorizationRequirement { }

public class DocumentOwnerHandler
    : AuthorizationHandler<OwnerRequirement, Document>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext ctx,
        OwnerRequirement req,
        Document resource)
    {
        var userId = ctx.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (userId is not null && resource.OwnerId.ToString() == userId)
            ctx.Succeed(req);
        return Task.CompletedTask;
    }
}

builder.Services.AddAuthorization(opt =>
{
    opt.AddPolicy("DocumentOwner", p => p.AddRequirements(new OwnerRequirement()));
});
builder.Services.AddSingleton<IAuthorizationHandler, DocumentOwnerHandler>();

[HttpGet("{id:guid}")]
public async Task<IActionResult> Get(
    Guid id, [FromServices] IAuthorizationService authz, CancellationToken ct)
{
    var doc = await _docs.GetAsync(id, ct);
    if (doc is null) return NotFound();

    var result = await authz.AuthorizeAsync(User, doc, "DocumentOwner");
    if (!result.Succeeded) return Forbid();

    return Ok(doc);
}`,
        explanation: "AuthorizationHandler<T, TResource> — second type is the resource. Load → authorize → return."
      }],
      flashcards: [
        { front: "Why resource-based authz?", back: "Attribute authz doesn't know the resource. Owner/team-member checks need the actual entity." },
        { front: "Forbid() vs NotFound()?", back: "Forbid reveals existence but denies access (403). NotFound hides existence (privacy)." },
        { front: "AuthorizationHandler<TReq, TResource>?", back: "Two-param overload. Handler receives the resource as third parameter." },
        { front: "IAuthorizationService?", back: "Programmatic entry point. Inject; call AuthorizeAsync(user, resource, policy)." }
      ],
      challenges: [{
        title: "Owner check",
        difficulty: "Advanced",
        prompt: "Document.OwnerId vs User.NameIdentifier. Policy 'DocumentOwner' used in GET.",
        starterCode: `public class Document { public Guid Id { get; set; } public Guid OwnerId { get; set; } }`,
        solution: `public class DocumentOwnerRequirement : IAuthorizationRequirement { }

public class DocumentOwnerHandler
    : AuthorizationHandler<DocumentOwnerRequirement, Document>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext ctx,
        DocumentOwnerRequirement req,
        Document resource)
    {
        var userIdClaim = ctx.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (Guid.TryParse(userIdClaim, out var userId) && resource.OwnerId == userId)
            ctx.Succeed(req);
        return Task.CompletedTask;
    }
}

builder.Services.AddAuthorization(opt =>
{
    opt.AddPolicy("DocumentOwner", p =>
        p.AddRequirements(new DocumentOwnerRequirement()));
});
builder.Services.AddSingleton<IAuthorizationHandler, DocumentOwnerHandler>();

[HttpGet("{id:guid}")]
public async Task<IActionResult> Get(
    Guid id, [FromServices] IAuthorizationService authz, CancellationToken ct)
{
    var doc = await _docs.GetAsync(id, ct);
    if (doc is null) return NotFound();

    var result = await authz.AuthorizeAsync(User, doc, "DocumentOwner");
    if (!result.Succeeded) return Forbid();

    return Ok(doc);
}`,
        explanation: "Guid.TryParse for the claim is defensive. Load → authorize → return is standard.",
        hint: "Guid.TryParse the claim, compare to OwnerId."
      }]
    },
    enterprise: {
      concept: "Intune-scale authz is attribute-based (ABAC): combine user attributes, resource attributes, environment. Per-tenant policies. Decisions logged for audit. Combined with Entra app roles (static) + permission claims (dynamic from a policy engine).",
      codeExamples: [{
        title: "Tenant-scoped ABAC",
        lang: "csharp",
        code: `public class TenantPermissionRequirement : IAuthorizationRequirement
{
    public string Permission { get; }
    public TenantPermissionRequirement(string p) { Permission = p; }
}

public class TenantPermissionHandler<TResource>
    : AuthorizationHandler<TenantPermissionRequirement, TResource>
    where TResource : ITenantScoped
{
    private readonly IPermissionService _perms;
    private readonly ITenantContext _tenant;
    private readonly ILogger<TenantPermissionHandler<TResource>> _log;

    public TenantPermissionHandler(IPermissionService perms,
        ITenantContext tenant, ILogger<TenantPermissionHandler<TResource>> log)
    { _perms = perms; _tenant = tenant; _log = log; }

    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext ctx,
        TenantPermissionRequirement req,
        TResource resource)
    {
        if (resource.TenantId != _tenant.TenantId)
        {
            _log.LogWarning("Cross-tenant access denied for {Resource}",
                typeof(TResource).Name);
            return;
        }

        var userId = Guid.Parse(ctx.User.FindFirstValue("oid")!);
        if (await _perms.HasPermissionAsync(userId, req.Permission, _tenant.TenantId))
        {
            ctx.Succeed(req);
            _log.LogInformation("Access granted: {Permission} on {Resource}",
                req.Permission, typeof(TResource).Name);
        }
    }
}

public interface ITenantScoped { Guid TenantId { get; } }`,
        explanation: "Cross-tenant check first, then permission. Every decision logged. Generic handler works with any ITenantScoped resource."
      }],
      flashcards: [
        { front: "ABAC vs RBAC?", back: "RBAC: role → permissions. ABAC: combine attributes in a policy. ABAC more flexible." },
        { front: "Why log authz decisions?", back: "Security audits, incident response, compliance. 'Who accessed what when' answered by authz logs." },
        { front: "Entra app roles vs permission claims?", back: "App roles static (admin-assigned). Permission claims can be dynamic. Often combined." },
        { front: "Why generic handler per TResource?", back: "DRY: one handler implements tenant-boundary + permission for any TenantScoped resource." }
      ],
      challenges: [{
        title: "Tenant-scoped authz",
        difficulty: "Enterprise",
        prompt: "TenantPermissionRequirement + generic handler over ITenantScoped. Policy 'CanReadDevices' needing 'devices.read'. Reject cross-tenant.",
        starterCode: `public interface ITenantScoped { Guid TenantId { get; } }
public class Device : ITenantScoped { public Guid Id { get; set; } public Guid TenantId { get; set; } }
public interface IPermissionService { Task<bool> HasPermissionAsync(Guid userId, string permission, Guid tenantId); }
public interface ITenantContext { Guid TenantId { get; } }`,
        solution: `public class TenantPermissionRequirement : IAuthorizationRequirement
{
    public string Permission { get; }
    public TenantPermissionRequirement(string p) { Permission = p; }
}

public class TenantPermissionHandler<TResource>
    : AuthorizationHandler<TenantPermissionRequirement, TResource>
    where TResource : ITenantScoped
{
    private readonly IPermissionService _perms;
    private readonly ITenantContext _tenant;

    public TenantPermissionHandler(IPermissionService perms, ITenantContext tenant)
    { _perms = perms; _tenant = tenant; }

    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext ctx,
        TenantPermissionRequirement req,
        TResource resource)
    {
        if (resource.TenantId != _tenant.TenantId) return;

        var userIdClaim = ctx.User.FindFirstValue("oid");
        if (!Guid.TryParse(userIdClaim, out var userId)) return;

        if (await _perms.HasPermissionAsync(userId, req.Permission, _tenant.TenantId))
            ctx.Succeed(req);
    }
}

builder.Services.AddAuthorization(opt =>
{
    opt.AddPolicy("CanReadDevices", p =>
        p.AddRequirements(new TenantPermissionRequirement("devices.read")));
});
builder.Services.AddScoped(typeof(IAuthorizationHandler),
    typeof(TenantPermissionHandler<Device>));`,
        explanation: "Cross-tenant check first (silent deny). Permission check via policy engine. Generic handler for any ITenantScoped.",
        hint: "where T : ITenantScoped + check TenantId first."
      }]
    }
  }
}

];

if (typeof window !== 'undefined') window.DAYS_10_17 = DAYS_10_17;
