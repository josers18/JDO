# How-to — Prediction Model

**Audience:** Admins. Flow JSON detail: **[FLOW_GUIDE.md](FLOW_GUIDE.md)**.

## Install without the CLI

See **[DEPLOY.md](DEPLOY.md)** or deploy `force-app` via change set / pipeline.

## Choose percent vs number on the card

In App Builder, set **Prediction output format**:

- **`percent`** → semicircle **gauge** (0–100 style).  
- **`integer`**, **`decimal`**, or **`currency`** → **large number** panel.

Your Flow’s prediction output should match the format you pick.

## Add the card to an Account page

1. Autolaunched Flow with record Id in and prediction + driver/recommendation outputs per **FLOW_GUIDE**.  
2. Assign **DC Prediction Model User**.  
3. App Builder → **Account** page → **Prediction Model** → set Flow API name and variable names.  
4. **Save** and **Activate**.

## Turn on the AI summary

Prompt template per **[PROMPT_TEMPLATE_GUIDE.md](PROMPT_TEMPLATE_GUIDE.md)**; set template Id on the component; ensure Einstein is enabled for your users.

## Home page without a record

Without **`recordId`**, the component does not call the Flow. Use **record** pages or a host that passes an Id.

---

[INDEX.md](INDEX.md) · [README.md](../README.md)
