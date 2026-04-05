# Documentation index — DC Person Profile Widget

This page lists every guide in **plain language**. The main project overview is **[README.md](../README.md)**.

## Read these first

| Order | Document | Who it is for | What you will learn |
|-------|----------|---------------|---------------------|
| 1 | [DEPLOY.md](DEPLOY.md) | Admin or developer installing the package | How to deploy, what ships with it, what to do if deploy fails |
| 2 | [SETUP.md](SETUP.md) | Admin configuring the org | Permission set, Lightning page, save/activate, smoke test |
| 3 | [HOW_TO.md](HOW_TO.md) | Admin or business analyst | Step-by-step tasks (page, Flow, map, theme, AI) |

## Deeper topics

| Document | Who it is for | What you will learn |
|----------|---------------|---------------------|
| [FLOW_GUIDE.md](FLOW_GUIDE.md) | Whoever builds or reviews Flows | The three ways this widget uses Flow (profile data, Insight, gauge rings) |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Anyone who wants the full picture | How data is loaded and merged; sequence diagram |
| [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md) | Admin in App Builder | Every property name and what it does |
| [APEX_REFERENCE.md](APEX_REFERENCE.md) | Developer or technical admin | Server methods and allowed field keys |
| [PROMPT_TEMPLATE.md](PROMPT_TEMPLATE.md) | Admin setting up Einstein | What JSON is sent to the prompt template |
| [DIAGRAMS.md](DIAGRAMS.md) | Presentations or reviews | Extra diagrams (tabs, map, theme) |

## When things go wrong

| Document | Use it when |
|----------|-------------|
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Deploy errors, blank tabs, wrong theme, map not showing |

## Examples and file list

| Resource | Use it when |
|----------|-------------|
| [samples/](samples/README.md) | You need example JSON for Flow or App Builder |
| [artifacts.md](../artifacts.md) | You want a checklist of what is in `force-app/` |
| [GIT.md](GIT.md) | You are cloning the repo or naming components |

## Theme reference (PDF)

| Resource | Use it when |
|----------|-------------|
| [Widget theme catalog (PDF)](../../docs/assets/widget_theme_catalog.pdf) | **Visual guide** to all **42 themes** (names match App Builder). Summary page: [THEME_CATALOG.md](../../docs/THEME_CATALOG.md). |

## Related package (business accounts)

| Package | Role |
|---------|------|
| [DC_BusinessProfileWidget](../DC_BusinessProfileWidget/README.md) | **Business Profile Widget** — Account-only card; field mappings use **`flow:`** or Account paths ([index](../DC_BusinessProfileWidget/docs/INDEX.md)). |
