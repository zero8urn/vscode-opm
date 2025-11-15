# Agile Documentation System - Quick Reference

This workspace now has a complete agile documentation system for solo developers building VS Code extensions.

## 📁 Structure Created

```
docs/
├── templates/              # Documentation templates
│   ├── README.md          # Complete usage guide
│   ├── epic-template.md   # Epic template
│   ├── feature-template.md    # Feature template
│   ├── user-story-template.md # User story template
│   └── discovery-formats.md   # Discovery document formats guide
├── epics/                 # Epic documents (EPIC-###-{name}.md)
├── features/              # Feature documents (FEAT-###-##-{name}.md)
├── stories/               # User story documents (STORY-###-##-###-{name}.md)
├── discovery/             # Discovery/research documents
└── technical/             # Technical implementation docs
```

## 🚀 Quick Start

### 1. Create Your First Epic

```bash
cp docs/templates/epic-template.md docs/epics/EPIC-001-nuget-package-management.md
```

Then fill in:
- Replace `###` with `001`
- Replace `{epic-name}` with `nuget-package-management`
- Update the description and scope sections
- Add your 5 expected features to the Features table

### 2. Create Features

```bash
cp docs/templates/feature-template.md docs/features/FEAT-001-01-browse-packages.md
```

Then fill in:
- First 3 digits match epic: `001`
- Next 2 digits are feature number: `01`
- Update description, acceptance criteria
- Add 10-20 user stories to the table

### 3. Create User Stories

```bash
cp docs/templates/user-story-template.md docs/stories/STORY-001-01-001-search-nuget-api.md
```

Then fill in:
- First 5 characters match feature: `001-01`
- Next 3 digits are story number: `001`
- Write user story, acceptance criteria
- Complete INVEST checklist

### 4. Update Progress

After marking stories/features as "Done", run:

```bash
bun run update-progress
```

This automatically updates progress percentages in all parent documents.

## 📋 ID Conventions

| Type | Format | Example |
|------|--------|---------|
| Epic | `EPIC-###-{name}` | `EPIC-001-nuget-package-management` |
| Feature | `FEAT-###-##-{name}` | `FEAT-001-01-browse-packages` |
| Story | `STORY-###-##-###-{name}` | `STORY-001-01-001-search-nuget-api` |
| Discovery | `DISC-###-{name}` | `DISC-001-nuget-api-capabilities` |
| Technical | `TECH-###-##-{name}` | `TECH-001-01-nuget-integration` |

## 🤖 AI Generation Prompts

### Generate an Epic

```
Using docs/templates/epic-template.md, create EPIC-001-nuget-package-management 
for a VS Code extension that provides NuGet package management with feature 
parity to Visual Studio 2022. Include 5 features: browse packages, install 
packages, update packages, uninstall packages, and package configuration.
```

### Generate a Feature

```
Using docs/templates/feature-template.md, create FEAT-001-01-browse-packages 
under EPIC-001-nuget-package-management. This feature should allow users to 
search, filter, and view NuGet package details. Generate 10-15 user stories 
covering the complete browse workflow including search, filtering by version, 
viewing dependencies, and package details.
```

### Generate User Stories

```
Using docs/templates/user-story-template.md, create STORY-001-01-001-search-nuget-api 
under FEAT-001-01-browse-packages. This story should cover calling the NuGet.org 
API v3 to search for packages, parsing results, and handling errors. Include 
technical implementation details and test scenarios.
```

## 📊 Status Values

Use these consistently across all documents:

- `Not Started` - Work has not begun
- `In Progress` - Currently being worked on
- `Done` - Completed and verified

## 🔗 Linking Documents

Always link child → parent and related documents:

```markdown
**Epic**: [EPIC-001-nuget-package-management](../epics/EPIC-001-nuget-package-management.md)
**Feature**: [FEAT-001-01-browse-packages](../features/FEAT-001-01-browse-packages.md)
```

## 📝 Discovery Documents

Three formats available (see `docs/templates/discovery-formats.md`):

1. **Lightweight Discovery Doc** - Early exploration, problem understanding
2. **Product Requirements Doc (PRD)** - Detailed functional specifications
3. **Technical Spike Report** - Time-boxed technical investigations

Use freeform - adapt to your needs!

## 🔄 Workflow

1. **Discovery** → Research and document findings
2. **Epic Planning** → Define high-level scope using epic template
3. **Feature Breakdown** → Create features with acceptance criteria
4. **Story Definition** → Write detailed user stories
5. **Implementation** → Build and mark stories as "Done"
6. **Progress Update** → Run `npm run update-progress`
7. **Review** → Check epic/feature completion status

## 💡 Tips for Solo Developers

### Keep It Minimal
- Don't create documents you won't reference
- Use bullet points over long paragraphs
- Link to external docs rather than duplicating

### Stay Consistent
- Always use the ID conventions
- Update dates when making changes
- Run progress script regularly

### AI-First Approach
- Use templates for AI generation prompts
- Ask AI to fill in templates completely
- Review and refine AI-generated content

### Progressive Refinement
- Start with epics and features
- Add stories as you're ready to implement
- Update acceptance criteria as you learn

## 📚 Key Files

| File | Purpose |
|------|---------|
| `docs/templates/README.md` | Complete documentation and AI instructions |
| `docs/templates/epic-template.md` | Template for epics |
| `docs/templates/feature-template.md` | Template for features |
| `docs/templates/user-story-template.md` | Template for stories |
| `docs/templates/discovery-formats.md` | Guide for research documents |
| `scripts/update-progress.mjs` | Auto-update progress percentages |

## 🎯 Next Steps for Your NuGet Extension Epic

1. **Research Phase**
   - Create discovery doc: `DISC-001-vs2022-nuget-comparison.md`
   - Document Visual Studio 2022 NuGet features
   - Identify C# Dev Kit limitations

2. **Epic Creation**
   - Create `EPIC-001-nuget-package-management.md`
   - Define 5 main features
   - Set success criteria

3. **Feature Planning**
   - Break each feature into 10-20 stories
   - Define acceptance criteria
   - Link technical dependencies

4. **Start Building**
   - Pick first story to implement
   - Mark as "In Progress"
   - Implement and test
   - Mark as "Done"
   - Run `npm run update-progress`

---

**Created**: 2025-11-14  
**System Version**: 1.0  
**For**: Solo VS Code Extension Development
