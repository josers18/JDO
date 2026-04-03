# Documentation index — DC Person Profile Widget

Use this page as the table of contents. The project root [README.md](../README.md) is the entry point for quick deploy and feature overview.

## Start here

| Document | Audience | What it covers |
|----------|----------|----------------|
| [SETUP.md](SETUP.md) | Admins / implementers | Permissions, App Builder, optional Flow and Einstein, smoke test |
| [HOW_TO.md](HOW_TO.md) | Admins / builders | Step-by-step recipes (minimal page, Flow-backed profile, gauges, map, AI summary) |
| [FLOW_GUIDE.md](FLOW_GUIDE.md) | Flow authors | Assembly vs prediction vs gauge flows, variables, merge rules, pitfalls |

## Reference

| Document | Content |
|----------|---------|
| [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md) | Every designer property group: data source, assembly slots, gauges, theme presets, typography |
| [APEX_REFERENCE.md](APEX_REFERENCE.md) | `CustomerProfileWidgetController` public API and data shapes |
| [PROMPT_TEMPLATE.md](PROMPT_TEMPLATE.md) | Einstein payload, template binding, Insight behavior |
| [artifacts.md](../artifacts.md) | Inventory of everything under `force-app/` |

## Diagrams and architecture

| Document | Content |
|----------|---------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | End-to-end behavior, merge semantics, main sequence diagram |
| [DIAGRAMS.md](DIAGRAMS.md) | Additional Mermaid figures (sourcing, tabs, geocode, gauges) |

## Operations

| Document | Content |
|----------|---------|
| [DEPLOY.md](DEPLOY.md) | CLI deploy, scope, remote sites, optional metadata |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Common deploy and runtime issues |
| [GIT.md](GIT.md) | Monorepo path and naming |

## Sample payloads

Copy or adapt JSON from [samples/](samples/README.md) for **Core custom fields**, **Profile output map**, **nearby branches**, **financial accounts**, and **recommendations**.
