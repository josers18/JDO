# Flow guide — Customer Profile Widget

This widget can talk to Salesforce **Flow** in **three separate ways**. All Flows must be **autolaunched** (no screens—nothing for the user to click inside the Flow while the page loads).

**Think of it as:** (1) a Flow that **fills the card**, (2) a Flow that **feeds the Insight tab**, (3) up to three small Flows that **feed the three rings** on AI Signals.

---

## The three Flow roles (at a glance)

| Role | What you set in App Builder | What it does |
|------|----------------------------|--------------|
| **Profile assembly** | Profile assembly flow + **[Asm flow output]** / JSON map | Puts values into the profile (name, scores, branches, map coordinates, etc.). Salesforce data can still fill gaps. |
| **Insight / prediction** | Autolaunched flow API name (predictions) + output names | Supplies the **prediction** line and **recommendations** list (and optional AI context). |
| **AI Signals gauges (×3)** | Inference flow API name on gauge 1 / 2 / 3 | Each ring can call its own Flow that returns a **number**. If left blank, the ring uses scores already on the profile. |

---

## 1. Profile assembly Flow

### When Salesforce runs it

All of the following must be true:

- There is a valid **Account or Contact** Id on the page.  
- **Profile assembly flow API name** is filled in.  
- At least one **output mapping** exists (from **[Asm flow output]** fields and/or **Profile output map JSON**).

If the map is empty, the assembly Flow is **skipped** and the card uses **Salesforce fields only** (plus optional Insight Flow).

### Inputs

Create a Flow input that holds the **current record Id**. Its API name should match **Assembly flow input: record Id** (default `recordId`).

### Outputs

Use **Assignments** (or formulas, Get Records, subflows) to set **output variables**. Tell the widget which output goes to which slot:

- **Simple:** type the Flow variable’s API name into each **[Asm flow output] …** field you need.  
- **Advanced:** one JSON object in **Profile output map JSON** ([example](samples/profile-output-map.sample.json)). Per-slot fields **override** the same key in JSON.

**Special cases (often stored as long text / JSON):**

- **Nearby branches** — list of branch objects ([example](samples/nearby-branches.sample.json)).  
- **Financial accounts** — list for the Portfolio tab ([example](samples/financial-accounts.sample.json)).  
- **Map** — latitude and longitude numbers for the pin.  
- **Photo** — image URL (`https://…` or org-relative path).

### After the Flow runs

Flow values **win** when set. Anything still **empty** can be filled from the normal Salesforce query.

---

## 2. Prediction Flow (Insight tab)

**Settings:** prediction Flow API name, record Id input name, and the two **output** names (defaults often `prediction` and `recommendations`).

**If something goes wrong:** errors are **hidden** so the rest of the card still shows—use **debug logs** if Insight is blank.

### One Flow instead of two

If the **prediction** Flow has the **same API name** as the **profile assembly** Flow, Salesforce runs that Flow **once** and reads **both** profile outputs and prediction outputs from the same run.

---

## 3. Gauge Flows (AI Signals)

Each of the three rings can call **`runSignalGaugeFlow`** after the main profile loads.

| Setting | Meaning |
|---------|---------|
| **Inference flow API name** empty | Ring uses **propensity / engagement / churn** from the profile (Flow or Salesforce). |
| **Inference flow API name** set | Runs that Flow; the **prediction** output must be a **number** (percent, dollars, etc. depending on format). |

Failures show as an error state on that ring (tooltip); they do **not** break the whole page.

---

## Checklist before go-live

1. Flow type = **autolaunched** only.  
2. Record Id **input** name matches the widget.  
3. **Output** API names match what you typed in App Builder (spelling and capitalization).  
4. For JSON text outputs, validate JSON in a text editor first.  
5. Test the Flow in **Flow Builder** with a real record Id before publishing the page.

**Related:** [samples/](samples/README.md) · [COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md) · [ARCHITECTURE.md](ARCHITECTURE.md)
