# Agile Documentation Templates

This directory contains templates for managing epics, features, and user stories in a minimal, trackable format suitable for solo development with AI assistance.

## Template Files

- **`epic-template.md`** - High-level epic template with feature progress tracking
- **`feature-template.md`** - Feature template with user story tracking and acceptance criteria
- **`user-story-template.md`** - User story template with INVEST criteria and implementation links
- **`discovery-formats.md`** - Guide for discovery document formats

## ID Conventions

### Format Pattern
Use the pattern: `TYPE-###-{meaningful-name}` where:
- `TYPE` = EPIC, FEAT, STORY
- `###` = Zero-padded numbers
- `{meaningful-name}` = Kebab-case descriptive name

### Epic IDs
**Format**: `EPIC-###-{epic-name}`  
**Example**: `EPIC-001-nuget-package-management`

- Use sequential 3-digit numbers starting from 001
- Epic name should be brief, descriptive, kebab-case

### Feature IDs
**Format**: `FEAT-###-##-{feature-name}`  
**Example**: `FEAT-001-01-browse-packages`

- First 3 digits match parent epic (001 = EPIC-001)
- Next 2 digits are sequential within epic (01, 02, 03...)
- Feature name should be action-oriented, kebab-case

### Story IDs
**Format**: `STORY-###-##-###-{story-name}`  
**Example**: `STORY-001-01-001-search-nuget-api`

- First 5 characters match parent feature (001-01 = FEAT-001-01)
- Next 3 digits are sequential within feature (001, 002, 003...)
- Story name should be specific, kebab-case

## File Naming & Organization

### Directory Structure
```
docs/
├── templates/          # This directory (templates only)
├── epics/             # Epic documents
│   ├── EPIC-001-nuget-package-management.md
│   └── EPIC-002-{another-epic}.md
├── features/          # Feature documents
│   ├── FEAT-001-01-browse-packages.md
│   ├── FEAT-001-02-install-packages.md
│   └── ...
├── stories/           # User story documents
│   ├── STORY-001-01-001-search-nuget-api.md
│   ├── STORY-001-01-002-display-search-results.md
│   └── ...
├── discovery/         # Discovery documents
│   ├── DISC-001-{discovery-name}.md
│   └── ...
└── technical/         # Technical implementation docs
    ├── TECH-001-01-{tech-doc-name}.md
    ├── IMPL-001-01-001-{implementation-doc}.md
    └── ...
```

### File Naming Rules
1. **Filename = ID**: File name should exactly match the document ID
2. **Extension**: Always use `.md` for markdown files
3. **Case**: Use kebab-case for the meaningful name portion
4. **Consistency**: ID in filename must match ID in document header

## Using the Templates

### Creating a New Epic
1. Copy `epic-template.md` to `docs/epics/EPIC-###-{epic-name}.md`
2. Replace `###` with next sequential epic number (e.g., 001)
3. Replace `{epic-name}` with kebab-case epic name
4. Fill in all template sections
5. Update dates (Created, Last Updated)
6. Add features to the Features table as they are identified

### Creating a New Feature
1. Copy `feature-template.md` to `docs/features/FEAT-###-##-{feature-name}.md`
2. Match first 3 digits to parent epic (e.g., 001 for EPIC-001)
3. Use next sequential 2-digit number within that epic (01, 02, etc.)
4. Replace `{feature-name}` with kebab-case feature name
5. Fill in all template sections
6. Link back to parent epic
7. Add user stories to the User Stories table as they are defined
8. Update parent epic's Features table with this feature

### Creating a New User Story
1. Copy `user-story-template.md` to `docs/stories/STORY-###-##-###-{story-name}.md`
2. Match first 5 characters to parent feature (e.g., 001-01 for FEAT-001-01)
3. Use next sequential 3-digit number within that feature (001, 002, etc.)
4. Replace `{story-name}` with kebab-case story name
5. Fill in all template sections
6. Link back to parent feature and epic
7. Complete INVEST checklist
8. Update parent feature's User Stories table with this story

## Status Values

Use consistent status values across all document types:

- **Not Started** - Work has not begun
- **In Progress** - Currently being worked on
- **Done** - Completed and verified

## Progress Tracking

### Manual Updates
When a story/feature changes status, update:
1. The story/feature document status field
2. The parent feature/epic progress table
3. The parent feature/epic progress percentage
4. The "Last Updated" date field

### Automated Updates (Optional)
Run the progress calculation script:
```bash
npm run update-progress
```

This script will:
- Parse all epic, feature, and story markdown files
- Calculate completion percentages based on child statuses
- Update progress fields in parent documents
- Preserve all other content

## Linking Strategy

### Use Both Relative Paths and IDs
- **In text**: Use the full ID for clarity: "This relates to FEAT-001-01"
- **In tables**: Use markdown links: `[FEAT-001-01](../features/FEAT-001-01-browse-packages.md)`
- **Cross-references**: Always include both ID and descriptive text

### Link Format Examples
```markdown
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)
**Feature**: [FEAT-001-01-browse-packages](../features/FEAT-001-01-browse-packages.md)
**Related Story**: [STORY-001-01-001](../stories/STORY-001-01-001-search-nuget-api.md)
```

## AI Generation Instructions

When asking AI to generate agile documentation using these templates:

### Be Specific About Document Type
❌ "Create documentation for package browsing"  
✅ "Create a feature document using feature-template.md for package browsing"

### Provide Context
Include:
- Parent epic/feature ID and name
- Target functionality description
- Any technical constraints
- Related features or dependencies

### Request Complete Documents
Ask for:
- Filled-in template with all sections completed
- Proper ID assignment following conventions
- Updated parent document progress tables
- Linked supporting documentation

### Example AI Prompts

**For Epic Creation:**
```
Create an epic document using epic-template.md for NuGet package management 
in VS Code. This should be EPIC-001. Include 5 major features covering 
browse, install, update, uninstall, and configuration. Reference Visual 
Studio 2022 package manager as the target feature parity.
```

**For Feature Creation:**
```
Create a feature document using feature-template.md for browsing NuGet packages.
This is FEAT-001-01 under EPIC-001-nuget-package-management. Include acceptance 
criteria for search, filtering, and package details display. Generate 10-15 
user stories covering the complete browse workflow.
```

**For Story Creation:**
```
Create a user story document using user-story-template.md for implementing 
NuGet API search integration. This is STORY-001-01-001 under FEAT-001-01-browse-packages.
Include technical implementation details for calling the NuGet.org API v3, parsing 
results, and error handling.
```

### Consistency Checklist

When AI generates documents, verify:
- [ ] ID format follows conventions (EPIC-###, FEAT-###-##, STORY-###-##-###)
- [ ] Filename matches document ID exactly
- [ ] All template sections are filled (no placeholders like [TODO])
- [ ] Links use correct relative paths
- [ ] Status is set (default: Not Started)
- [ ] Dates are populated (Created, Last Updated)
- [ ] Parent documents are referenced with working links
- [ ] Progress fields are initialized (0/0, 0%)

## Best Practices

### Keep It Minimal
- Don't add sections that aren't needed
- Use bullet points over paragraphs when possible
- Link to external docs rather than duplicating content
- Update only what changes (don't regenerate entire documents)

### Stay Consistent
- Use the same terminology across all documents
- Follow the ID conventions strictly
- Update dates when making changes
- Keep status values uniform

### Link Everything
- Every feature links to its epic
- Every story links to its feature and epic
- Every technical doc links to its story
- Use relative paths for portability

### Review Regularly
- Check that progress percentages are accurate
- Verify that all links still work
- Archive completed epics to a separate directory
- Update "Last Updated" dates when reviewing

## Scripts

### Update Progress (Optional)
```bash
npm run update-progress
```

Automatically calculates and updates progress fields in epic and feature documents based on child document statuses.

### Validate Documents (Future)
```bash
npm run validate-agile-docs
```

Validates that all documents follow the template structure and ID conventions.

---

**Last Updated**: 2025-11-14  
**Maintained By**: Solo Developer with AI Assistance
