# Redesign Proposal: OPM Evolution (v2 Architecture)

## 1. Executive Summary

The current OPM architecture is a highly disciplined implementation of SOLID principles and Gang of Four patterns. However, as the feature set expands, the "Centralized Orchestration" model (ServiceContainer + ServiceFactory) has become a scaling bottleneck. Every new capability requires manual wiring across multiple files, violating the Open/Closed Principle and increasing maintenance friction.

**OPM Evolution** proposes moving from a **Command-and-Control** architecture to a **Reactive Micro-kernel** architecture. This shift will transition the extension from a system that *executes instructions* to a system that *reacts to state changes*.

---

## 2. Current State Audit: The Scaling Bottlenecks

### A. Rigid Orchestration (The "Wiring" Problem)
Currently, adding a single command requires updates to:
1. `package.json` (Contribution)
2. `IServiceFactory.ts` (Interface definition)
3. `NodeServiceFactory.ts` (Implementation)
4. `ServiceId.ts` / `ServiceTypeMap.ts` (Type definitions)
5. `ServiceContainer.ts` (Manual instantiation/wiring)

This creates a high "Tax on Innovation." Developers spend more time wiring dependencies than writing business logic.

### B. Pull-Based Data Flow
The current flow is: `UI Request` $\rightarrow$ `Command` $\rightarrow$ `Service` $\rightarrow$ `API` $\rightarrow$ `Result`. 
While predictable, this causes the "Latency vs. Depth" tension. The UI remains disconnected from the underlying data state except during the transient lifecycle of a single command execution.

### C. Fragmented State
State is scattered across specialized classes (`SearchState`, `ProjectsState`, etc.). While good for encapsulation, there is no unified "Domain Truth," making it difficult to keep the Webview and Extension Host perfectly synchronized without complex manual IPC messaging.

---

## 3. The Proposed Architecture: Reactive Micro-kernel

The redesign focuses on three fundamental shifts: **Discovery over Registration**, **Reactivity over Commands**, and **Streams over Results**.

### Pillar 1: The Micro-kernel (Plugin Registry)
Instead of a `ServiceContainer` that knows about every service, we implement a **Kernel** that manages **Providers**.

*   **The Kernel**: A minimal registry for `Commands`, `Services`, and `DataProviders`.
*   **Self-Registration**: New features (e.g., a new NuGet Source or a new Command) are implemented as "Plugins." Upon activation, they register themselves with the Kernel using a standardized interface:
    ```typescript
    interface IPlugin {
      readonly id: string;
      activate(kernel: IKernel): Promise<void>;
    }
    ```
*   **Benefit**: The core extension code never changes when new features are added.

### Pillar 2: Reactive Domain Store (The Single Source of Truth)
We replace transient `Result<T>` objects with a centralized, observable **Domain Store**.

*   **Architecture**: The Domain Layer becomes a set of **Reactive Stores** (e.g., `PackageStore`, `ProjectStore`, `ConfigurationStore`).
*   **Flow**: 
    1. A user performs an action (e.g., "Install Package").
    2. The command does not return a result to the UI; it sends an **Intent** to the Store.
    3. The Store updates its internal state (e.g., `status: 'installing'`).
    4. All observers (the Webview, the Status Bar, etc.) automatically react to the state change via a stream.
*   **Benefit**: Eliminates "State Drift" between the UI and the host. The UI is simply a visual representation of the Store.

### Pillar 3: Stream-Oriented I/O (Progressive Hydration)
To solve the Latency vs. Depth problem, we move from `Promise<T>` to `AsyncIterable<T>`.

*   **Implementation**: API calls and CLI parsing will return streams of data.
*   **Example (Search)**: As NuGet returns partial results, the `PackageStore` is updated incrementally. The UI renders "Live" as packets arrive.
*   **Benefit**: Dramatically improves perceived performance through **Progressive Hydration**.

---

## 4. Component Mapping: Old vs. New

| Feature | Current (v1) | Evolution (v2) |
| :--- | :--- | :--- |
| **Dependency Injection** | Manual `ServiceContainer` wiring | Automatic Plugin Discovery via Kernel |
| **Command Execution** | Command $\rightarrow$ Result $\rightarrow$ UI Update | Intent $\rightarrow$ Store Update $\rightarrow$ Reactive UI |
| **Data Fetching** | Single monolithic `Promise<Result>` | Streaming `AsyncIterable` (Progressive) |
| **Webview Sync** | Manual IPC Message Handlers | Subscription to Domain Store Streams |
| **New Feature Cost** | High (5+ files modified) | Low (1 new plugin file) |

---

## 5. Migration & Implementation Roadmap

### Phase 1: The Foundation (Kernel & Stores)
*   Implement the `IKernel` and the base `Store<T>` class using a lightweight reactivity engine (e.g., Signals or RxJS).
*   Migrate core configuration to the first `ConfigurationStore`.

### Phase 2: The Hybrid Bridge
*   Introduce the Kernel alongside the existing `ServiceContainer`.
*   Wrap current services as "Legacy Plugins" so they can be used by new reactive components while the migration is in progress.

### Phase 3: Full Reactive Transition
*   Rewrite the `NuGetApiClient` to return streams.
*   Rebuild the Package Browser Webview using a pure-reactive model (data flows one way: Store $\rightarrow$ UI).
*   Deprecate and remove `ServiceContainer`.
