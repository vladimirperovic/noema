# Product

## Register

Product reference and customization guide.

## Intended users

Noema is primarily a single-user, self-hosted workspace for tasks, notes, documents, saved links, research collections, and visual project records.

The public repository is intended for developers and technically comfortable users who want a working foundation they can adapt to a specific profession, workflow, or personal system. It is not presented as a universal multi-user SaaS product or a finished solution for every deployment.

A customized installation may also expose selected read-only Inspiration or Building Sites collections to collaborators or guests. Anyone adding broader sharing, accounts, or client access should design an explicit authorization model for that use case.

## Product purpose

Noema reduces the active task horizon to three meaningful positions: **yesterday, today, and tomorrow**.

- **Yesterday** shows unfinished or recently completed work that still deserves attention.
- **Today** is the immediate working surface.
- **Tomorrow** is the near-term commitment space.
- Older tasks leave the active board but remain available in **Archive**.

The surrounding modules provide examples of how one compact self-hosted application can combine structured tasks with notes, documents, saved resources, image collections, location-based records, backups, analytics, and machine integrations.

Each module is intentionally replaceable. Building Sites can become field inspections, property records, maintenance logs, event documentation, travel journals, inventory locations, or any other photo-based collection. Inspiration, AI Projects, Links, Documents, and Notes can likewise be renamed or reshaped for a different domain.

## Product character

Calm, precise, focused, and content-first. The interface should feel like a dependable working tool rather than a decorative portfolio or a crowded administration panel.

## Anti-references

Noema should not become:

- a noisy social feed;
- a generic dashboard filled with unrelated metrics;
- a multi-tenant product without proper authorization;
- a system that hides important actions behind decorative interactions;
- an application that silently sends private workspace data to external services.

## Design principles

1. The three-day task horizon remains immediately understandable.
2. Archive preserves history without overwhelming the active board.
3. Privacy boundaries are explicit rather than assumed.
4. Content has priority over controls and decoration.
5. Familiar actions and consistent components reduce daily friction.
6. Public or shared views expose only content intentionally selected for guests.
7. Modules remain separable and easy to repurpose.
8. External integrations remain optional and configuration-driven.

## Accessibility and inclusion

The target is WCAG AA contrast for text and controls, complete keyboard navigation, visible focus states, semantic structure, and support for `prefers-reduced-motion`.

Important functions must not depend only on color, pointer hover, or precise mouse interaction.
