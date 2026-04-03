# How-to — DC AgentForce Output

For **admins** and **process owners**. Full Flow contract: **[FLOW_GUIDE.md](FLOW_GUIDE.md)**.

## Deploy without the CLI

Share **[DEPLOY.md](DEPLOY.md)** with your release team or use change sets from `force-app`.

## Show AI (or automation) output on a page

1. Build an **autolaunched** Flow (no screens) that produces **text** (and optionally a **generation Id**).  
2. Deploy this package and assign **DC AgentForce Output User**.  
3. In **Lightning App Builder**, add **DC AgentForce Output**.  
4. Set **Autolaunched Flow API name** and match **input/output** variable names to your Flow.  
5. **Save** and **Activate** the page.

## Turn on auto-run

In App Builder, enable **Auto-run flow on load** so the card runs the Flow when the page opens.

## Let users give thumbs up/down

Your Flow must write a **Models API generation Id** into a **Text** output; map that output in the component. If the field is blank, thumbs stay hidden.

## Copy, print, or full screen

Users use the card toolbar: **Copy**, **Expand** (large view), **Print** (browser print / save as PDF).

---

[INDEX.md](INDEX.md) · [SETUP_GUIDE.md](SETUP_GUIDE.md)
