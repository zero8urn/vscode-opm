# Plan: Agile Documentation Templates for Solo NuGet Package Manager Extension

Templates for epic, feature, and user story markdown files with hybrid ID/path linking, optional automation scripts, and freeform discovery document guidance for a solo developer building a VS Code NuGet package manager.

## Steps

1. **Create epic template** (`docs/templates/epic-template.md`) with auto-calculated progress table linking features by ID and relative path, high-level scope, discovery doc references

2. **Create feature template** (`docs/templates/feature-template.md`) with story progress tracking, acceptance criteria sections, best practices, technical doc links using hybrid ID system

3. **Create user story template** (`docs/templates/user-story-template.md`) with simple status (Not Started / In Progress / Done), INVEST format, implementation plan references

4. **Create AI generation instructions** (`docs/templates/README.md`) with ID conventions (`EPIC-###`, `FEAT-###-##`, `STORY-###-##-###`), naming patterns, template usage, consistency rules

5. **Add optional progress calculation script** (Node.js) that parses markdown status tables and updates parent progress percentages—minimal maintenance via strict markdown conventions

6. **Document discovery formats** (`docs/templates/discovery-formats.md`) covering lightweight Discovery Doc, PRD, and Technical Spike formats with when-to-use guidance

## Further Considerations

1. **ID format**: Use `EPIC-001-nuget-package-management`, `FEAT-001-01-browse-packages`, `STORY-001-01-001-search-nuget-api`? (ID-meaningful-name pattern)

2. **Status granularity**: Start with 3 states (Not Started / In Progress / Done) and add Blocked/Review later if needed?

3. **Script trigger**: Run progress calculation manually via npm script, or integrate as git pre-commit hook?
