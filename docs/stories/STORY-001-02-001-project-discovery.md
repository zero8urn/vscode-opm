# STORY-001-02-001-project-discovery (Superseded)

This original story has been split into three focused stories to align with the solution-scoped discovery architecture:

- `STORY-001-02-001a` — Solution Discovery & `SolutionContextService` (Tier 1)
- `STORY-001-02-001b` — CLI-Based Project Parsing (authoritative MSBuild evaluation)
- `STORY-001-02-001c` — Workspace-wide depth-limited `.csproj` discovery (Tier 2 fallback)

Please see the new stories for detailed acceptance criteria and technical approach. The original XML-only parsing approach is deprecated—use the CLI-based parsing in `STORY-001-02-001b`.
