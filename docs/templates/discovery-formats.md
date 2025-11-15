# Discovery Document Formats

This guide describes recommended formats for discovery and research documents used during the planning and investigation phases of feature development.

## When to Use Discovery Documents

Discovery documents are **freeform** and should be created when:
- Exploring a new problem space or opportunity
- Investigating technical feasibility before committing to implementation
- Researching user needs, competitive features, or best practices
- Validating assumptions or gathering requirements
- Documenting architectural decisions or technology evaluations

Unlike epics, features, and stories (which follow strict templates), discovery documents are flexible and adapt to the research needs.

## Discovery Document Types

### 1. Lightweight Discovery Document

**Purpose**: Early-stage exploration to understand problems, users, and opportunities before defining features.

**When to Use**:
- Beginning of a new epic or major feature area
- Investigating user pain points
- Exploring competitive or industry solutions
- Validating whether a feature is worth building

**Recommended Structure**:

```markdown
# Discovery: {Topic Name}

**Date**: YYYY-MM-DD  
**Author**: [Your Name]  
**Related Epic/Feature**: [Link if applicable]

## Problem Statement

[1-2 paragraphs describing the problem or opportunity]

## User Needs / Use Cases

- [User need or use case 1]
- [User need or use case 2]
- [User need or use case 3]
- [User need or use case 4]
- [User need or use case 5]

## Research Findings

### Competitive Analysis
- **[Competitor/Tool 1]**: [How they solve this problem]
- **[Competitor/Tool 2]**: [How they solve this problem]

### Industry Best Practices
- [Best practice 1]
- [Best practice 2]

### User Feedback / Insights
- [Insight from user research, forums, GitHub issues, etc.]

## Technical Constraints / Dependencies

- [Constraint 1: e.g., "VS Code API limitation"]
- [Constraint 2: e.g., "Requires C# Dev Kit extension"]
- [Dependency 1: e.g., "NuGet.org API v3"]

## Opportunities / Proposed Solutions

1. **[Opportunity/Solution 1]**
   - Description: [What it is]
   - Value: [Why it matters]
   - Effort: [High/Medium/Low estimate]

2. **[Opportunity/Solution 2]**
   - Description: [What it is]
   - Value: [Why it matters]
   - Effort: [High/Medium/Low estimate]

## Success Criteria

- [Measurable success criterion 1]
- [Measurable success criterion 2]

## Open Questions

- [Question 1 requiring further investigation]
- [Question 2 requiring further investigation]

## Recommendations

[Summary paragraph with 2-3 recommendations for next steps]

## References

- [Link to research source]
- [Link to documentation]
- [Link to competitive tool]
```

---

### 2. Product Requirements Document (PRD)

**Purpose**: Define functional specifications and detailed feature requirements after initial discovery is complete.

**When to Use**:
- After problem validation when you're ready to define "what to build"
- When a feature is complex and needs detailed specification
- When multiple implementation approaches need to be compared
- As a bridge between discovery and feature definition

**Recommended Structure**:

```markdown
# PRD: {Feature Name}

**Date**: YYYY-MM-DD  
**Author**: [Your Name]  
**Status**: Draft | Review | Approved  
**Related Epic/Feature**: [Link]

## Objective

[1-2 paragraphs: What are we building and why?]

## Background / Context

[Why now? What discovery or research led to this?]

## Target Users

- **Primary**: [User type 1 - description]
- **Secondary**: [User type 2 - description]

## User Stories / Use Cases

### Use Case 1: [Name]
**Actor**: [User type]  
**Goal**: [What they want to accomplish]  
**Flow**:
1. [Step 1]
2. [Step 2]
3. [Step 3]

### Use Case 2: [Name]
[Similar structure]

## Functional Requirements

### Core Features
- [Feature 1]: [Description]
- [Feature 2]: [Description]
- [Feature 3]: [Description]

### Nice-to-Have Features
- [Feature 4]: [Description]
- [Feature 5]: [Description]

## UX / Interaction Flow

[Wireframes, mockups, or text descriptions of user flows]

```
User opens command palette → Selects "Browse NuGet Packages" → 
Webview opens with search UI → User types query → Results display → 
User selects package → Package details view → User clicks Install
```

## Non-Functional Requirements

- **Performance**: [Specific requirement, e.g., "Search results in <2s"]
- **Accessibility**: [Requirements]
- **Error Handling**: [How errors should be handled]
- **Compatibility**: [VS Code versions, OS requirements]

## System Requirements / Dependencies

- [System requirement 1]
- [External dependency 1]

## Assumptions

- [Assumption 1]
- [Assumption 2]

## Out of Scope

- [Explicitly excluded feature 1]
- [Explicitly excluded feature 2]

## Success Metrics

- [Metric 1: e.g., "80% of users can complete search in <3 clicks"]
- [Metric 2: e.g., "Package install success rate >95%"]

## Open Questions

- [Question to resolve]

## Appendix

### References
- [Link to discovery doc]
- [Link to research]

### Revision History
| Date | Change | Author |
|---|---|---|
| YYYY-MM-DD | Initial draft | [Name] |
```

---

### 3. Technical Spike Report

**Purpose**: Document time-boxed technical investigations to reduce risk and uncertainty before implementation.

**When to Use**:
- Evaluating new technologies, libraries, or APIs
- Proof-of-concept validation
- Investigating performance or scalability concerns
- Assessing technical feasibility of a proposed solution
- Comparing implementation approaches

**Recommended Structure**:

```markdown
# Technical Spike: {Investigation Topic}

**Date**: YYYY-MM-DD  
**Author**: [Your Name]  
**Time Box**: [e.g., "4 hours", "1 day"]  
**Related Story/Feature**: [Link]

## Research Question

[Clear, specific question to answer. Example: "Can we use the NuGet.org API v3 to search packages and retrieve metadata without authentication?"]

## Approach / Methodology

[How you investigated this. What you built, tested, or researched.]

Example:
- Created proof-of-concept script in Node.js
- Called NuGet.org API endpoints: /search, /registration
- Tested pagination, filtering, and error scenarios
- Measured response times with 10 sample queries

## Findings

### What Works
- [Finding 1: e.g., "API v3 supports unauthenticated search queries"]
- [Finding 2: e.g., "Response times average 800ms for basic searches"]
- [Finding 3: e.g., "Pagination works with skip/take parameters"]

### What Doesn't Work
- [Finding 1: e.g., "Rate limiting kicks in at ~100 requests/min"]
- [Finding 2: e.g., "No support for dependency graph queries in v3"]

### Limitations / Constraints
- [Constraint 1]
- [Constraint 2]

## Code Samples / Proof of Concept

[Link to branch, gist, or inline code snippet demonstrating key findings]

```typescript
// Example: Basic NuGet search query
const response = await fetch(
  'https://api-v2v3search-0.nuget.org/query?q=newtonsoft&take=20'
);
const results = await response.json();
```

## Performance / Scalability

- [Observation 1: e.g., "Average response time: 800ms"]
- [Observation 2: e.g., "Rate limit: ~100 req/min"]

## Feasibility Assessment

**Overall**: ✅ Feasible | ⚠️ Feasible with caveats | ❌ Not feasible

**Reasoning**: [1-2 sentence explanation]

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| [Risk 1] | High/Med/Low | [Mitigation approach] |

## Recommendations

### Recommended Approach
[What you recommend based on findings]

### Alternative Approaches
1. **[Alternative 1]**: [Description, pros/cons]
2. **[Alternative 2]**: [Description, pros/cons]

## Next Steps

- [ ] [Action item 1]
- [ ] [Action item 2]

## References

- [API documentation link]
- [Library/tool documentation]
- [Related spike or research]

## Appendix

[Any additional data, test results, or detailed logs]
```

---

## File Naming for Discovery Documents

### Location
Store discovery documents in `docs/discovery/`

### Naming Convention
Use descriptive, kebab-case names with optional prefixes:

- **Discovery Docs**: `DISC-###-{topic-name}.md`
  - Example: `DISC-001-nuget-api-capabilities.md`

- **PRDs**: `PRD-###-{feature-name}.md`
  - Example: `PRD-001-package-browser.md`

- **Spikes**: `SPIKE-###-{investigation-topic}.md`
  - Example: `SPIKE-001-nuget-api-performance.md`

**Numbering**: Use sequential numbers, but they don't need to match epic/feature IDs since discovery is exploratory.

## Linking Discovery to Agile Documents

### From Epic to Discovery
In `epic-template.md`:
```markdown
## Supporting Documentation

### Discovery Documents
- [NuGet API Capabilities Research](../discovery/DISC-001-nuget-api-capabilities.md) - Validates API v3 supports required features
```

### From Feature to PRD
In `feature-template.md`:
```markdown
## Supporting Documentation

### Product Requirements
- [Package Browser PRD](../discovery/PRD-001-package-browser.md) - Detailed functional requirements and UX flows
```

### From Story to Spike
In `user-story-template.md`:
```markdown
## Technical Implementation

### Implementation Plan
- [NuGet API Performance Spike](../discovery/SPIKE-001-nuget-api-performance.md) - Validates API response times meet requirements
```

## Best Practices for Discovery Documents

### Keep Them Freeform
- Don't force every section if it's not relevant
- Add sections as needed for your specific research
- Focus on capturing insights and decisions, not bureaucracy

### Time-Box Investigations
- Set a clear time limit for spikes (e.g., 2-4 hours)
- Document what you learned, even if incomplete
- Note what still needs investigation

### Link to Decisions
- Reference discovery docs when making feature decisions
- Update discovery docs if new information emerges
- Archive outdated discovery docs with a note

### Use Discovery to Feed Features
- Discovery docs inform epic/feature planning
- PRD content can be extracted into feature acceptance criteria
- Spike findings become technical implementation notes in stories

---

**Last Updated**: 2025-11-14  
**Purpose**: Guide for creating flexible discovery documents that support agile planning
