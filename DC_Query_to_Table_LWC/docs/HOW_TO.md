# How-to — DC Query to Table

Short tasks for **admins**. Technical detail lives in **[COMPONENT_REFERENCE.md](COMPONENT_REFERENCE.md)**.

## Deploy without using the command line

Send **[DEPLOY.md](DEPLOY.md)** to whoever runs releases, or export metadata as a **change set** / pipeline from this project’s `force-app` folder.

## Put the table on a page

1. **Lightning App Builder** → open an **app**, **home**, or **record** page.  
2. Drag **DC Query to Table** onto the layout.  
3. Paste your **Data Cloud SQL** (usually `SELECT` …).  
4. Set **Max rows**, **Auto-run query on load**, and table options.  
5. **Save** and **Activate**.

## Run the query only when the user clicks

In App Builder, **uncheck** **Auto-run query on load**. Users will see a **Run query** button.

## Fix an empty table

1. Run the **same SQL** in Data Cloud’s query tool as the same user.  
2. Confirm **DC Query to Table User** (Apex) and **Data Cloud query** rights.  
3. See **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** for parser and `LIMIT` notes.

## Use on a phone

**Home** pages often **hide** custom components on phone. Prefer an **app** or **record** page — see **[MOBILE_AND_FORM_FACTORS.md](../../docs/MOBILE_AND_FORM_FACTORS.md)**.

---

[INDEX.md](INDEX.md) · [SETUP_GUIDE.md](SETUP_GUIDE.md)
