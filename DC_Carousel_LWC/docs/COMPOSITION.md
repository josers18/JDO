# Composition: nesting LWCs in DC Carousel

## Intended pattern

**DC Carousel** exposes a **default `<slot>`**. In supported setups, **Lightning App Builder** lets you place **child** Lightning components **inside** the carousel instance. Each **assigned root element** becomes **one slide**; the carousel translates the horizontal track so only one slide is visible at a time.

You would typically deploy **DC_Carousel_LWC** together with packages such as **DC_Prediction_Model_LWC** or **DC_Query_to_Table_LWC** so those bundles exist in the org before you add them as children.

## Platform variability

Whether **drag-and-drop nesting** appears for a **custom** parent LWC depends on Salesforce **page type**, **template**, and **release** behavior. If the builder only lets you place components as **siblings** in a column, you cannot use the slot visually—but the carousel still deploys and you can use **Fallback slides (JSON)** for static HTML slides.

## JSON fallback

When **no** components are assigned to the slot, **Fallback slides (JSON)** is parsed. Example:

```json
[
  {
    "title": "Summary",
    "content": "<p>First slide body.</p>"
  },
  {
    "title": "Details",
    "content": "<p>Second slide body.</p>"
  }
]
```

As soon as **any** nested component is assigned to the slot, **composition mode** wins and JSON slides are ignored for that instance.

## Record pages

Nested LWCs on a record page still receive **`recordId`** from the page when the platform wires standard inputs—verify each child’s **object** allow list in its own `js-meta.xml`.
