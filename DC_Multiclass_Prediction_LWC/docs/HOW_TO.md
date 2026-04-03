# How-to — Multiclass Prediction

**Audience:** Admins. Technical JSON shapes: **[FLOW_GUIDE.md](FLOW_GUIDE.md)**.

## Install without the CLI

Use **[DEPLOY.md](DEPLOY.md)** or your release process with the `force-app` folder.

## Put the card on an Account page

1. Build an **autolaunched** Flow that outputs **text** `prediction` (e.g. segment code) and **recommendations** (JSON string).  
2. Deploy this package; assign **DC Multiclass Prediction User**.  
3. **Lightning App Builder** → **Account** record page → drag **Multiclass Prediction**.  
4. Set **Autolaunched flow API name** and matching **input/output** names.  
5. **Save** and **Activate**.

## Add the AI summary

1. Create a **Prompt template** per **[PROMPT_TEMPLATE_GUIDE.md](PROMPT_TEMPLATE_GUIDE.md)**.  
2. Set **Prompt template Id or API name** on the component.  
3. Ensure users have Einstein access where required.

## Use on Home without a record

Standard **Home** does not pass a **record Id**; the card stays idle unless something else supplies `recordId`. Prefer **record** pages or custom hosting.

## Compare to “Prediction Model”

| Multiclass Prediction | Prediction Model |
|----------------------|------------------|
| Text **class** label | **Percent gauge** or big **number** |
| Diverging **bars** for improvements | Driver list + gauge layout |

Both use Flows but **different** outputs and packages.

---

[INDEX.md](INDEX.md) · [README.md](../README.md)
