# OPM Elegant Redesign - Master Implementation Plan

> Comprehensive implementation roadmap for rewriting vscode-opm with Gang of Four patterns while preserving all current functionality.

**Status:** Planning  
**Start Date:** TBD  
**Target Completion:** TBD  
**Design Document:** [ELEGANT-REDESIGN.md](../technical/ELEGANT-REDESIGN.md)

---

## Executive Summary

This master plan orchestrates the incremental migration of OPM from its current architecture to an elegant, pattern-based design leveraging 11 Gang of Four patterns. The migration is structured into 6 phases, each delivering a working, tested extension.

**Critical Success Factors:**
- ✅ Zero functional regressions — all current features work identically
- ✅ All existing tests pass (unit, integration, E2E)
- ✅ Each phase is independently deployable
- ✅ Test coverage increases with each phase
- ✅ No big-bang rewrites — continuous integration

**Key Metrics:**
| Metric | Current | Target | Improvement |
|--------|---------|--------|-------------|
| Largest file | 1,376 LOC | 200 LOC max | 86% reduction |
| Code duplication | ~300 LOC (install/uninstall) | 0 LOC | 100% elimination |
| Extensibility | Modify 6+ files | Implement 1 interface | 600% better |
| Total LOC (core areas) | ~3,274 | ~2,070 | 37% reduction |

---

## Consolidated Implementation Checklist

### Phase 1: Foundation (Weeks 1-2) — Low Risk
**Objectives:** Establish core abstractions, eliminate dead code, unify result types  
**Files Changed:** ~10 new, ~5 modified, ~2 deleted  
**Tests:** 20 new unit tests

- [ ] **IMPL-01-01** Create unified `Result<T, E>` type system → [§foundation-result-type](#foundation-result-type)
- [ ] **IMPL-01-02** Implement typed `EventBus` (Observer pattern) → [§foundation-event-bus](#foundation-event-bus)
- [ ] **IMPL-01-03** Create `VsCodeRuntime` adapter (Adapter pattern) → [§foundation-vscode-adapter](#foundation-vscode-adapter)
- [ ] **IMPL-01-04** Delete dead abstractions (`DomainProvider`, `DomainProviderService`) → [§foundation-cleanup](#foundation-cleanup)
- [ ] **IMPL-01-05** Migrate all result types to unified `Result<T, AppError>` → [§foundation-result-migration](#foundation-result-migration)
- [ ] **IMPL-01-06** Unit test suite for core abstractions → [§foundation-tests](#foundation-tests)
- [ ] **IMPL-01-07** Update architectural documentation → [§foundation-docs](#foundation-docs)
- [ ] **IMPL-01-08** Verify all existing E2E/integration tests pass → [§foundation-validation](#foundation-validation)

**Deliverable:** [IMPL-REDESIGN-01-FOUNDATION.md](IMPL-REDESIGN-01-FOUNDATION.md)  
**Risk:** Low — Purely additive + cleanup  
**Rollback:** Revert commits (no behavioral changes)

---

### Phase 2: Command Template Method (Weeks 3-4) — Medium Risk
**Objectives:** Eliminate 70% code duplication in install/uninstall commands  
**Files Changed:** ~4 new, ~2 refactored  
**Tests:** 15 new unit tests, update 10 existing command tests

- [ ] **IMPL-02-01** Design `PackageOperationCommand<TParams, TResult>` abstract base → [§template-base-design](#template-base-design)
- [ ] **IMPL-02-02** Extract shared workflow logic (validation, batching, caching) → [§template-shared-logic](#template-shared-logic)
- [ ] **IMPL-02-03** Refactor `InstallPackageCommand` as subclass → [§template-install-refactor](#template-install-refactor)
- [ ] **IMPL-02-04** Refactor `UninstallPackageCommand` as subclass → [§template-uninstall-refactor](#template-uninstall-refactor)
- [ ] **IMPL-02-05** Update all command unit tests → [§template-unit-tests](#template-unit-tests)
- [ ] **IMPL-02-06** Update E2E tests (no behavior changes expected) → [§template-e2e-tests](#template-e2e-tests)
- [ ] **IMPL-02-07** Measure LOC reduction (target: 63% for commands) → [§template-metrics](#template-metrics)
- [ ] **IMPL-02-08** Create `UpdatePackageCommand` as proof of extensibility → [§template-update-command](#template-update-command)

**Deliverable:** [IMPL-REDESIGN-02-COMMAND-TEMPLATE.md](IMPL-REDESIGN-02-COMMAND-TEMPLATE.md)  
**Risk:** Medium — Control flow changes, must preserve exact behavior  
**Rollback:** Keep old commands, switch registration in `extension.ts`

---

### Phase 3: API Decomposition (Weeks 5-7) — Medium Risk
**Objectives:** Decompose 1,376 LOC `NuGetApiClient` into 4 focused services + Facade + Strategy adapters  
**Files Changed:** ~15 new, ~1 massive refactor, ~3 modified  
**Tests:** 30 new unit tests, 10 integration tests, update existing API tests

- [ ] **IMPL-03-01** Extract `ServiceIndexResolver` (~150 LOC) → [§api-service-index](#api-service-index)
- [ ] **IMPL-03-02** Extract `SearchExecutor` (~200 LOC) → [§api-search-executor](#api-search-executor)
- [ ] **IMPL-03-03** Extract `MetadataFetcher` (~150 LOC) → [§api-metadata-fetcher](#api-metadata-fetcher)
- [ ] **IMPL-03-04** Extract `ReadmeFetcher` (~100 LOC) → [§api-readme-fetcher](#api-readme-fetcher)
- [ ] **IMPL-03-05** Implement `NuGetFacade` (delegates to 4 services) → [§api-facade](#api-facade)
- [ ] **IMPL-03-06** Design `ISourceAdapter` interface (Strategy) → [§api-source-adapter](#api-source-adapter)
- [ ] **IMPL-03-07** Implement source adapters (NuGet.org, Azure, GitHub, Generic) → [§api-adapters](#api-adapters)
- [ ] **IMPL-03-08** Integrate HTTP pipeline middleware → [§api-pipeline-integration](#api-pipeline-integration)
- [ ] **IMPL-03-09** Add `LruCache` with bounded size → [§api-lru-cache](#api-lru-cache)
- [ ] **IMPL-03-10** Update all API unit tests (mock new structure) → [§api-unit-tests](#api-unit-tests)
- [ ] **IMPL-03-11** Update integration tests (real NuGet.org calls) → [§api-integration-tests](#api-integration-tests)
- [ ] **IMPL-03-12** Performance benchmarking (ensure no regressions) → [§api-performance](#api-performance)
- [ ] **IMPL-03-13** Verify webview search/details still work end-to-end → [§api-e2e-validation](#api-e2e-validation)

**Deliverable:** [IMPL-REDESIGN-03-API-DECOMPOSITION.md](IMPL-REDESIGN-03-API-DECOMPOSITION.md)  
**Risk:** Medium — Core API shape changes, complex multi-source logic  
**Rollback:** Feature flag to switch between old/new client implementations

---

### Phase 4: Webview Mediator (Weeks 8-10) — Medium Risk
**Objectives:** Decompose 1,034 LOC webview router into Mediator + 9 Command handlers  
**Files Changed:** ~12 new, ~1 massive refactor  
**Tests:** 25 new handler unit tests, update 5 E2E webview tests

- [ ] **IMPL-04-01** Implement `WebviewMessageMediator` → [§mediator-core](#mediator-core)
- [ ] **IMPL-04-02** Extract 9 message handlers (one per IPC type) → [§mediator-handlers](#mediator-handlers)
- [ ] **IMPL-04-03** Create `WebviewBuilder` (Builder pattern) → [§mediator-builder](#mediator-builder)
- [ ] **IMPL-04-04** Implement generic type guard factory → [§mediator-type-guards](#mediator-type-guards)
- [ ] **IMPL-04-05** Refactor `packageBrowserWebview.ts` to ~80 LOC → [§mediator-webview-refactor](#mediator-webview-refactor)
- [ ] **IMPL-04-06** Unit test each handler in isolation → [§mediator-handler-tests](#mediator-handler-tests)
- [ ] **IMPL-04-07** Update E2E tests (webview integration) → [§mediator-e2e-tests](#mediator-e2e-tests)
- [ ] **IMPL-04-08** Verify IPC contract unchanged (no protocol breaks) → [§mediator-protocol-validation](#mediator-protocol-validation)
- [ ] **IMPL-04-09** Test error scenarios (invalid messages, handler failures) → [§mediator-error-tests](#mediator-error-tests)

**Deliverable:** [IMPL-REDESIGN-04-WEBVIEW-MEDIATOR.md](IMPL-REDESIGN-04-WEBVIEW-MEDIATOR.md)  
**Risk:** Medium — IPC routing changes, must preserve message semantics  
**Rollback:** Keep old webview file, conditionally import new/old

---

### Phase 5: Service Container (Weeks 11-12) — Low Risk
**Objectives:** Replace manual DI wiring with Abstract Factory + ServiceContainer  
**Files Changed:** ~5 new, ~1 major refactor (extension.ts)  
**Tests:** 10 new container tests, update E2E to use TestServiceFactory

- [ ] **IMPL-05-01** Design `IServiceFactory` interface → [§container-factory-interface](#container-factory-interface)
- [ ] **IMPL-05-02** Implement `NodeServiceFactory` (production) → [§container-node-factory](#container-node-factory)
- [ ] **IMPL-05-03** Implement `TestServiceFactory` (E2E/mocks) → [§container-test-factory](#container-test-factory)
- [ ] **IMPL-05-04** Create `ServiceContainer` with lifecycle management → [§container-implementation](#container-implementation)
- [ ] **IMPL-05-05** Create `CommandRegistry` for auto-registration → [§container-command-registry](#container-command-registry)
- [ ] **IMPL-05-06** Refactor `extension.ts` to ~20 LOC → [§container-extension-refactor](#container-extension-refactor)
- [ ] **IMPL-05-07** Update all E2E tests to use test factory → [§container-e2e-updates](#container-e2e-updates)
- [ ] **IMPL-05-08** Test activation/deactivation lifecycle → [§container-lifecycle-tests](#container-lifecycle-tests)
- [ ] **IMPL-05-09** Verify deterministic disposal order → [§container-disposal-tests](#container-disposal-tests)

**Deliverable:** [IMPL-REDESIGN-05-SERVICE-CONTAINER.md](IMPL-REDESIGN-05-SERVICE-CONTAINER.md)  
**Risk:** Low — Structural change with no behavior delta  
**Rollback:** Revert to manual wiring in extension.ts

---

### Phase 6: Polish & Optimization (Weeks 13-14) — Low Risk
**Objectives:** Final refinements, documentation, performance tuning  
**Files Changed:** ~8 modified (Lit components, caches)  
**Tests:** 10 new performance tests, update docs

- [ ] **IMPL-06-01** Decompose `<package-browser-app>` into controllers → [§polish-lit-controllers](#polish-lit-controllers)
- [ ] **IMPL-06-02** Apply `LruCache` to all remaining unbounded caches → [§polish-cache-bounds](#polish-cache-bounds)
- [ ] **IMPL-06-03** Wire `EventBus` for cache invalidation → [§polish-event-bus](#polish-event-bus)
- [ ] **IMPL-06-04** Performance audit (memory, response times) → [§polish-performance](#polish-performance)
- [ ] **IMPL-06-05** Update all architectural documentation → [§polish-docs](#polish-docs)
- [ ] **IMPL-06-06** Create developer onboarding guide → [§polish-onboarding](#polish-onboarding)
- [ ] **IMPL-06-07** Final E2E regression suite (all features) → [§polish-final-validation](#polish-final-validation)
- [ ] **IMPL-06-08** Measure final LOC reduction and extensibility → [§polish-metrics](#polish-metrics)

**Deliverable:** [IMPL-REDESIGN-06-POLISH.md](IMPL-REDESIGN-06-POLISH.md)  
**Risk:** Low — Refinements and non-functional improvements  
**Rollback:** N/A (no breaking changes)

---

## Cross-Phase Quality Gates

### Continuous Requirements (All Phases)

**Functional Preservation:**
- [ ] All existing commands execute with identical results
- [ ] Package search returns same results (order may differ)
- [ ] Package details fetch same metadata
- [ ] Install/uninstall modify `.csproj` files identically
- [ ] Project discovery finds same projects
- [ ] Solution context manages same state

**Test Coverage:**
- [ ] Unit test coverage ≥ 80% (current baseline maintained)
- [ ] All integration tests pass (NuGet.org API calls succeed)
- [ ] All E2E tests pass (VS Code Extension Host)
- [ ] No test skips or xfails introduced
- [ ] Performance tests show <5% regression tolerance

**Code Quality:**
- [ ] ESLint passes (no new violations)
- [ ] TypeScript strict mode (no `any` escapes)
- [ ] No file exceeds 300 LOC (target: 200 LOC max)
- [ ] All public APIs have JSDoc comments
- [ ] README and CHANGELOG updated per phase

**Security:**
- [ ] CSP remains strict (`default-src 'none'`)
- [ ] HTML sanitization applied to all external content
- [ ] Credentials never logged or exposed
- [ ] Auth headers stripped on cross-origin redirects
- [ ] No new dependencies without security review

---

## Testing Strategy

### Test Pyramid Per Phase

```
                    ┌──────────┐
                    │   E2E    │  5-10 tests (slow, integration)
                    └──────────┘
                  ┌──────────────┐
                  │ Integration  │  10-20 tests (real APIs)
                  └──────────────┘
              ┌────────────────────┐
              │   Unit Tests       │  50-100 tests (fast, isolated)
              └────────────────────┘
```

**Phase-Specific Test Plans:**
| Phase | Unit Tests | Integration | E2E | Total New |
|-------|-----------|-------------|-----|-----------|
| 1 - Foundation | 20 | 0 | 0 | 20 |
| 2 - Commands | 15 | 0 | 5 (update) | 15 |
| 3 - API | 30 | 10 | 5 (validation) | 40 |
| 4 - Webview | 25 | 0 | 5 (update) | 25 |
| 5 - Container | 10 | 0 | 10 (update) | 10 |
| 6 - Polish | 10 | 0 | 10 (regression) | 10 |
| **Total** | **110** | **10** | **35 updates** | **120** |

### Test Refactoring Principles

1. **Migrate tests with code** — Don't leave orphaned tests
2. **Update mocks to match new interfaces** — Keep test doubles synchronized
3. **Preserve test intent** — Same behavior assertions, new structure
4. **Add pattern-specific tests** — Test abstract base classes, adapters, mediators
5. **Test failure paths** — Error handling in new Result<T, E> types

---

## Risk Mitigation

### High-Risk Areas

| Risk | Mitigation | Owner | Status |
|------|------------|-------|--------|
| Multi-source search deduplication breaks | Extensive integration tests with 3+ sources | Phase 3 | Planned |
| Webview IPC protocol breaks | Protocol compatibility tests, message snapshots | Phase 4 | Planned |
| Performance regression (caching) | Benchmark suite, memory profiling | Phase 3, 6 | Planned |
| Template Method doesn't fit future commands | Abstract factory for command creation | Phase 2 | Planned |
| Service Container lifetime issues | Deterministic disposal order tests | Phase 5 | Planned |

### Rollback Strategy

Each phase includes a rollback mechanism:
- **Phase 1-2:** Revert commits (no external behavior change)
- **Phase 3:** Feature flag toggles old/new API client
- **Phase 4:** Conditional import of old/new webview handler
- **Phase 5-6:** Revert extension.ts activation logic

**Rollback Triggers:**
- Test failure rate >5%
- Performance regression >10%
- Critical bug in production
- Schedule overrun >2 weeks per phase

---

## Success Criteria

### Phase Completion Criteria

**Each phase must meet ALL criteria before proceeding:**
- ✅ All new code merged to main branch
- ✅ All tests passing (unit, integration, E2E)
- ✅ Code review approved by 2+ maintainers
- ✅ Documentation updated (inline + architectural)
- ✅ CHANGELOG entry added
- ✅ No open P0/P1 bugs introduced
- ✅ Performance benchmarks within tolerance
- ✅ Manual smoke test completed

### Final Success Criteria (Phase 6 Complete)

- ✅ **37% LOC reduction** in identified areas (3,274 → 2,070 LOC)
- ✅ **Zero functional regressions** (100% feature parity)
- ✅ **Extensibility demonstrated** — New source added in <2 hours
- ✅ **Extensibility demonstrated** — New command added in <1 hour
- ✅ **Extensibility demonstrated** — New webview added in <4 hours
- ✅ **11 GoF patterns** correctly applied and documented
- ✅ **All caches bounded** (no memory leaks)
- ✅ **No file >200 LOC** (strict SRP adherence)
- ✅ **Test coverage ≥80%** maintained or improved

---

## Timeline & Milestones

**Estimated Duration:** 14 weeks (3.5 months)  
**Team Size:** 1-2 developers  
**Sprint Cadence:** 2-week sprints

| Week | Phase | Milestone | Deliverable |
|------|-------|-----------|-------------|
| 1-2 | Foundation | Core abstractions | Unified Result, EventBus, VsCodeAdapter |
| 3-4 | Commands | Template Method | Install/Uninstall refactored |
| 5-7 | API | Facade + Strategy | NuGet client decomposed |
| 8-10 | Webview | Mediator + Command | Message handlers extracted |
| 11-12 | Container | Abstract Factory | ServiceContainer + factories |
| 13-14 | Polish | Optimization | Final tuning + docs |

**Checkpoints:**
- **Week 4:** Mid-point review (Phases 1-2 complete)
- **Week 8:** Architecture review (Phases 1-4 complete)
- **Week 12:** Pre-release review (Phase 5 complete)
- **Week 14:** Final release review (all phases complete)

---

## Additional Context Sections

### <a name="foundation-result-type"></a>§ Foundation: Result Type
Create `src/core/result.ts` with unified `Result<T, E = AppError>` discriminated union. Replace all usages of `DomainResult<T>` and `NuGetResult<T>` with the unified type. Include helpers `ok()`, `fail()`, `mapResult()`, `flatMapResult()` for functional composition.

**Acceptance Criteria:**
- Single source of truth for all error codes in `AppError` union
- TypeScript type narrowing works correctly
- All existing result-returning functions compile without changes
- ~50 LOC, 20 unit tests

### <a name="foundation-event-bus"></a>§ Foundation: Event Bus
Implement typed event bus with `EventMap` defining all event shapes. Support `emit()`, `on()`, `once()` with `Disposable` cleanup. Events: `projects:changed`, `cache:invalidated`, `config:changed`, `package:installed`, `package:uninstalled`, `source:discovered`.

**Acceptance Criteria:**
- Type-safe event emission and subscription
- Observers don't crash emitters (try/catch in emit)
- Auto-cleanup via Disposable pattern
- ~60 LOC, 15 unit tests

### <a name="foundation-vscode-adapter"></a>§ Foundation: VS Code Adapter
Create `IVsCodeRuntime` interface wrapping all VS Code API access. Implement `VsCodeRuntime` (production) and `MockVsCodeRuntime` (tests). This becomes the single gateway to `vscode` module.

**Acceptance Criteria:**
- Only one file contains `require('vscode')` at runtime
- All services receive `IVsCodeRuntime` via constructor
- Mock implementation enables full testability
- ~80 LOC, 10 unit tests

### <a name="foundation-cleanup"></a>§ Foundation: Cleanup
Delete `src/domain/domainProvider.ts`, `src/domain/domainProviderService.ts`, and any references. Remove unused `DomainResult` type (will be replaced by unified Result).

**Acceptance Criteria:**
- Zero references to deleted files
- Build succeeds
- All tests pass

### <a name="foundation-result-migration"></a>§ Foundation: Result Migration
Update all files using `NuGetResult<T>` or `DomainResult<T>` to use `Result<T, AppError>`. Update error code mappings. Preserve exact behavior.

**Acceptance Criteria:**
- All result types unified
- Error codes mapped to AppError union
- No behavior changes (tests prove this)

### <a name="foundation-tests"></a>§ Foundation: Tests
Create unit tests for `result.ts` (helpers, combinators), `eventBus.ts` (emit/subscribe/cleanup), `vscodeRuntime.ts` (adapter behavior).

**Acceptance Criteria:**
- 20 new unit tests
- Coverage >90% for core modules
- Tests run in <1 second

### <a name="foundation-docs"></a>§ Foundation: Docs
Update `ARCHITECTURE-OVERVIEW.md`, `QUICK-REFERENCE.md` to document new core layer. Add JSDoc to all public APIs.

**Acceptance Criteria:**
- Core layer documented
- Architecture diagram updated
- Examples provided

### <a name="foundation-validation"></a>§ Foundation: Validation
Run full test suite (unit, integration, E2E) to ensure no regressions from additive changes.

**Acceptance Criteria:**
- 100% test pass rate
- No new warnings or errors
- Extension activates successfully

---

### <a name="template-base-design"></a>§ Template: Base Design
Design `PackageOperationCommand<TParams, TOperationResult>` abstract base class with `execute()` template method and abstract hooks: `validate()`, `executeOnProject()`, `getProgressTitle()`, `getProjectMessage()`.

**Acceptance Criteria:**
- Shared workflow extracted (validation, batching, caching, progress)
- Subclasses only implement operation-specific logic
- Generic over params and result types
- ~120 LOC

### <a name="template-shared-logic"></a>§ Template: Shared Logic
Extract duplicated code from install/uninstall: project deduplication, cache invalidation, result aggregation, error summary formatting.

**Acceptance Criteria:**
- Zero duplication between install/uninstall
- Shared code unit tested independently
- Behavior unchanged

### <a name="template-install-refactor"></a>§ Template: Install Refactor
Refactor `InstallPackageCommand` to extend `PackageOperationCommand`. Implement abstract methods. Verify identical behavior.

**Acceptance Criteria:**
- ~60 LOC (down from 328)
- All existing install tests pass
- Behavior byte-for-byte identical

### <a name="template-uninstall-refactor"></a>§ Template: Uninstall Refactor
Refactor `UninstallPackageCommand` to extend `PackageOperationCommand`. Implement abstract methods. Verify identical behavior.

**Acceptance Criteria:**
- ~60 LOC (down from 316)
- All existing uninstall tests pass
- Behavior byte-for-byte identical

### <a name="template-unit-tests"></a>§ Template: Unit Tests
Update command unit tests to mock base class dependencies. Test abstract base class with a concrete test subclass.

**Acceptance Criteria:**
- 15 new tests for base class
- All existing command tests updated
- Test base class template method execution order

### <a name="template-e2e-tests"></a>§ Template: E2E Tests
Run E2E tests for install/uninstall commands. Verify webview integration unchanged.

**Acceptance Criteria:**
- All E2E tests pass
- Install flow works end-to-end
- Uninstall flow works end-to-end

### <a name="template-metrics"></a>§ Template: Metrics
Measure LOC reduction. Target: 644 LOC → 240 LOC (63% reduction).

**Acceptance Criteria:**
- LOC reduction documented
- Cyclomatic complexity reduced
- Duplication eliminated

### <a name="template-update-command"></a>§ Template: Update Command
Create `UpdatePackageCommand` as proof of extensibility. Should be ~40 LOC subclass.

**Acceptance Criteria:**
- Update command works
- ~40 LOC total
- Demonstrates template reusability

---

### <a name="api-service-index"></a>§ API: Service Index Resolver
Extract service index resolution logic. Implement `ServiceIndexResolver` with caching (LRU, 1-hour TTL). Resolve search, registration, flat container URLs.

**Acceptance Criteria:**
- ~150 LOC
- Caches service index per source
- Handles 401/403 with auth hints
- 10 unit tests

### <a name="api-search-executor"></a>§ API: Search Executor
Extract search logic. Implement `SearchExecutor` for single-source and multi-source search with deduplication.

**Acceptance Criteria:**
- ~200 LOC
- Single-source search identical to current
- Multi-source deduplication by package ID
- Handles partial failures gracefully
- 15 unit tests

### <a name="api-metadata-fetcher"></a>§ API: Metadata Fetcher
Extract metadata logic. Implement `MetadataFetcher` for package index and version details.

**Acceptance Criteria:**
- ~150 LOC
- Fetches package index
- Fetches version details
- Parses dependencies correctly
- 10 unit tests

### <a name="api-readme-fetcher"></a>§ API: README Fetcher
Extract README logic. Implement `ReadmeFetcher` for flat container README retrieval.

**Acceptance Criteria:**
- ~100 LOC
- Fetches README from flat container
- Returns empty string on 404 (not error)
- 5 unit tests

### <a name="api-facade"></a>§ API: Facade
Implement `NuGetFacade` implementing `INuGetApiClient`. Delegates to 4 sub-services.

**Acceptance Criteria:**
- ~80 LOC
- Implements full `INuGetApiClient` contract
- Pure delegation (no logic)
- Drop-in replacement for old client

### <a name="api-source-adapter"></a>§ API: Source Adapter
Design `ISourceAdapter` interface for source-specific behaviors: auth, URL construction, capabilities, config.

**Acceptance Criteria:**
- Clean interface
- Strategy pattern correctly applied
- Supports all current sources

### <a name="api-adapters"></a>§ API: Adapters
Implement 4 source adapters: `NuGetOrgAdapter`, `AzureArtifactsAdapter`, `GitHubPackagesAdapter`, `GenericAdapter`.

**Acceptance Criteria:**
- ~100 LOC each
- Source-specific auth handling
- Provider capabilities exposed
- 20 unit tests total

### <a name="api-pipeline-integration"></a>§ API: Pipeline Integration
Wire existing `pipeline.ts` middleware into all fetchers. Chain: auth → retry → cache → timeout → log.

**Acceptance Criteria:**
- All HTTP requests go through pipeline
- Middleware configurable per source
- Logging shows middleware execution
- 10 unit tests

### <a name="api-lru-cache"></a>§ API: LRU Cache
Implement `LruCache<K, V>` with bounded size + TTL. Apply to service index, HTTP responses.

**Acceptance Criteria:**
- Max entries enforced
- LRU eviction works
- TTL expiration works
- 10 unit tests

### <a name="api-unit-tests"></a>§ API: Unit Tests
Update all API unit tests to mock new structure. Test each service in isolation.

**Acceptance Criteria:**
- 30 new unit tests
- All existing API tests updated
- Mock HTTP pipeline

### <a name="api-integration-tests"></a>§ API: Integration Tests
Update integration tests to use new facade. Test real NuGet.org, Azure, GitHub sources.

**Acceptance Criteria:**
- 10 integration tests
- Real network calls succeed
- Multi-source search works

### <a name="api-performance"></a>§ API: Performance
Benchmark search, details, README fetching. Ensure no regression vs old client.

**Acceptance Criteria:**
- Search <5% slower
- Details <5% slower
- README <5% slower

### <a name="api-e2e-validation"></a>§ API: E2E Validation
Run full webview E2E tests. Verify search, details, install flows work.

**Acceptance Criteria:**
- All E2E tests pass
- Webview functionality unchanged

---

### <a name="mediator-core"></a>§ Mediator: Core
Implement `WebviewMessageMediator` with `IMessageHandler` interface. Support handler registration and message dispatching.

**Acceptance Criteria:**
- ~40 LOC
- Type-safe handler registration
- Unknown message types logged (not crashed)
- 5 unit tests

### <a name="mediator-handlers"></a>§ Mediator: Handlers
Extract 9 handlers: Ready, SearchRequest, LoadMoreRequest, PackageDetailsRequest, GetProjectsRequest, InstallPackageRequest, UninstallPackageRequest, GetPackageSourcesRequest, RefreshProjectCacheRequest.

**Acceptance Criteria:**
- ~50 LOC each
- Focused, single-responsibility
- Testable in isolation
- 25 unit tests total

### <a name="mediator-builder"></a>§ Mediator: Builder
Implement `WebviewBuilder` with fluent API for panel creation. Auto-wires CSP, sanitization, mediator.

**Acceptance Criteria:**
- ~100 LOC
- Fluent API (withTitle, withScript, etc.)
- Auto-generates HTML with CSP
- 5 unit tests

### <a name="mediator-type-guards"></a>§ Mediator: Type Guards
Implement `createMessageGuard<T>(schema)` factory. Generate guards for 16 message types.

**Acceptance Criteria:**
- ~30 LOC total (down from 130)
- All guards generated via factory
- Runtime validation correct
- 5 unit tests

### <a name="mediator-webview-refactor"></a>§ Mediator: Webview Refactor
Refactor `packageBrowserWebview.ts` to ~80 LOC. Use builder + mediator.

**Acceptance Criteria:**
- ~80 LOC (down from 1,034)
- Pure wiring logic
- No message handling logic

### <a name="mediator-handler-tests"></a>§ Mediator: Handler Tests
Unit test each handler in isolation. Mock dependencies.

**Acceptance Criteria:**
- 25 unit tests
- Each handler tested independently
- Mock webview context

### <a name="mediator-e2e-tests"></a>§ Mediator: E2E Tests
Update E2E tests for webview integration. Verify IPC still works.

**Acceptance Criteria:**
- All webview E2E tests pass
- Search flow works
- Install flow works

### <a name="mediator-protocol-validation"></a>§ Mediator: Protocol Validation
Verify IPC message contract unchanged. No protocol breaks.

**Acceptance Criteria:**
- Message shapes identical
- Response shapes identical
- Timing unchanged

### <a name="mediator-error-tests"></a>§ Mediator: Error Tests
Test error scenarios: invalid messages, handler exceptions, unknown message types.

**Acceptance Criteria:**
- Invalid messages logged (not crashed)
- Handler exceptions caught
- Unknown types handled gracefully

---

### <a name="container-factory-interface"></a>§ Container: Factory Interface
Design `IServiceFactory` interface with methods for all services.

**Acceptance Criteria:**
- Complete service creation API
- Environment-agnostic
- Clear method signatures

### <a name="container-node-factory"></a>§ Container: Node Factory
Implement `NodeServiceFactory` creating production services.

**Acceptance Criteria:**
- ~100 LOC
- Creates real implementations
- Uses VS Code APIs correctly

### <a name="container-test-factory"></a>§ Container: Test Factory
Implement `TestServiceFactory` creating test doubles.

**Acceptance Criteria:**
- ~80 LOC
- Creates mocks/fakes
- No VS Code dependencies

### <a name="container-implementation"></a>§ Container: Implementation
Implement `ServiceContainer` with lifecycle management.

**Acceptance Criteria:**
- ~80 LOC
- Service registration
- Deterministic disposal order
- 10 unit tests

### <a name="container-command-registry"></a>§ Container: Command Registry
Implement `CommandRegistry` for auto-discovering and registering commands.

**Acceptance Criteria:**
- ~40 LOC
- Auto-registers all commands
- Uses container for dependencies

### <a name="container-extension-refactor"></a>§ Container: Extension Refactor
Refactor `extension.ts` to ~20 LOC using container + registry.

**Acceptance Criteria:**
- ~20 LOC (down from 90)
- Activates successfully
- All commands registered

### <a name="container-e2e-updates"></a>§ Container: E2E Updates
Update E2E tests to use `TestServiceFactory`.

**Acceptance Criteria:**
- All E2E tests updated
- Tests use test factory
- No VS Code mocks needed

### <a name="container-lifecycle-tests"></a>§ Container: Lifecycle Tests
Test activation, initialization, disposal lifecycle.

**Acceptance Criteria:**
- Services initialized in order
- Disposal in reverse order
- No resource leaks

### <a name="container-disposal-tests"></a>§ Container: Disposal Tests
Test deterministic disposal order and cleanup.

**Acceptance Criteria:**
- Disposables called in reverse
- No errors during cleanup
- Memory released

---

### <a name="polish-lit-controllers"></a>§ Polish: Lit Controllers
Extract controller logic from `<package-browser-app>` into separate classes.

**Acceptance Criteria:**
- ~200 LOC for root component (down from 771)
- Controllers: SearchController, DetailsController, InstallController
- Each ~50 LOC

### <a name="polish-cache-bounds"></a>§ Polish: Cache Bounds
Apply `LruCache` to all remaining caches (project parser, search service).

**Acceptance Criteria:**
- All caches bounded
- No memory leaks
- Performance maintained

### <a name="polish-event-bus"></a>§ Polish: Event Bus
Wire `EventBus` for cache invalidation events across components.

**Acceptance Criteria:**
- Project changes flow via events
- Cache invalidation decoupled
- 5 unit tests

### <a name="polish-performance"></a>§ Polish: Performance
Audit memory usage, response times, startup time. Optimize hot paths.

**Acceptance Criteria:**
- Memory usage stable
- Search <2s for 20 results
- Startup <500ms

### <a name="polish-docs"></a>§ Polish: Documentation
Update all docs: README, ARCHITECTURE, QUICK-REFERENCE, AGENTS.md.

**Acceptance Criteria:**
- All patterns documented
- Examples updated
- Architecture diagrams current

### <a name="polish-onboarding"></a>§ Polish: Onboarding
Create developer onboarding guide for new contributors.

**Acceptance Criteria:**
- "How to add a command" guide
- "How to add a source" guide
- "How to add a webview" guide

### <a name="polish-final-validation"></a>§ Polish: Final Validation
Run full regression suite. Manual smoke test of all features.

**Acceptance Criteria:**
- All tests pass
- All features work
- No known bugs

### <a name="polish-metrics"></a>§ Polish: Metrics
Measure final LOC reduction, extensibility improvements, test coverage.

**Acceptance Criteria:**
- 37% LOC reduction achieved
- Extensibility demonstrated
- Coverage ≥80%

---

## Related Documents

- **Design:** [ELEGANT-REDESIGN.md](../technical/ELEGANT-REDESIGN.md)
- **Architecture:** [ARCHITECTURE-OVERVIEW.md](../architecture/ARCHITECTURE-OVERVIEW.md)
- **Quick Reference:** [QUICK-REFERENCE.md](../architecture/QUICK-REFERENCE.md)
- **Phase Implementations:**
  - [IMPL-REDESIGN-01-FOUNDATION.md](IMPL-REDESIGN-01-FOUNDATION.md)
  - [IMPL-REDESIGN-02-COMMAND-TEMPLATE.md](IMPL-REDESIGN-02-COMMAND-TEMPLATE.md)
  - [IMPL-REDESIGN-03-API-DECOMPOSITION.md](IMPL-REDESIGN-03-API-DECOMPOSITION.md)
  - [IMPL-REDESIGN-04-WEBVIEW-MEDIATOR.md](IMPL-REDESIGN-04-WEBVIEW-MEDIATOR.md)
  - [IMPL-REDESIGN-05-SERVICE-CONTAINER.md](IMPL-REDESIGN-05-SERVICE-CONTAINER.md)
  - [IMPL-REDESIGN-06-POLISH.md](IMPL-REDESIGN-06-POLISH.md)

---

*This master plan orchestrates the complete redesign while ensuring zero regressions, full test coverage, and continuous delivery of working software.*
