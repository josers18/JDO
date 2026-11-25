"""Build the checked-in catalog from Salesforce's Connect OpenAPI definition in JSON format."""
import json
import re
import sys
from pathlib import Path

spec = json.loads(Path(sys.argv[1]).read_text())
schemas = spec["components"]["schemas"]
examples = spec["components"]["examples"]


def description(node):
    text = node.get("description", "").split("\n\n")[0]
    # Keep angle-bracket placeholders inside inline code.
    return re.sub(r"`[^`]*`|<[^>]+>", lambda m: m[0] if m[0].startswith("`") else "", text).strip()


def flatten(node):
    result = {}
    if "$ref" in node:
        result.update(flatten(schemas[node["$ref"].split("/")[-1]]))
    for part in node.get("allOf", []):
        parent = flatten(part)
        result = {**result, **parent, "properties": {**result.get("properties", {}), **parent.get("properties", {})},
                  "required": result.get("required", []) + parent.get("required", [])}
    return {**result, **node}


def documented_choices(name, text):
    # Only look at the values clause; later backticks often name defaults or response fields.
    text = text.split("**Available Version")[0].replace(r"\u200B", "").replace("\u200b", "")
    marker = re.search(r"(?:values (?:are(?: supported)?|include)|values for sorting are|fields for sorting are|one of these values)\s*:\s*\n((?:[ \t]*- [^\n]+\n?)+)", text, re.I)
    choices = re.findall(r"^\s*- `([\w.-]+)`", marker[1], re.M) if marker else []
    if name.lower() == "orderby":
        if "for ascending or `DESC` for descending" in text:
            if choices:
                return [], ["ASC", "DESC"] + [v + suffix for v in choices for suffix in ("", " ASC", " DESC")]
            return ["ASC", "DESC"], []
        if choices:
            return [], [v + suffix for v in choices for suffix in ("", " ASC", " DESC")]
        if "Supported field names are" in text:
            return [], re.findall(r"`(\w+)`", text.split("Supported field names are", 1)[1])
        if "by the field name `label` or `name`" in text:
            return [], [v + suffix for v in ("label", "name") for suffix in ("", " ASC", " DESC")]
        if "`createdDate`" in text:
            return [], ["createdDate", "createdDate ASC", "createdDate DESC"]
        # Sort expressions given as examples can be extended with org-specific fields.
        samples = re.findall(r"`([\w. ,\u200b]+(?:asc|desc))`", text, re.I)
        if not samples:
            samples = re.findall(r'"(\w+ (?:ASC|DESC))"', text, re.I)
        return [], list(dict.fromkeys(s.replace("\u200b", "") for s in samples))
    if choices:
        return ([], choices) if re.search(r"values include", text, re.I) else (choices, [])
    if name == "pageToken":
        return [], []
    inline = re.search(r"(?:values are|either|such as|connector types are|type of clean room member,|refresh type for the activation,|type of the search index)[: (]*"
                       r"(`[\w.-]+`(?:(?:,\s*(?:(?:and|or) )?| (?:and|or) )`[\w.-]+`)+)", text, re.I)
    if inline:
        values = re.findall(r"`([\w.-]+)`", inline[1])
        return ([], values) if re.search(r"such as|for example", text[:inline.end()], re.I) else (values, [])
    return [], []


def field(name, node, required, docs=None):
    prop = flatten(node)
    out = dict(name=name, type=prop.get("type", "object"), description=description(prop))
    if required:
        out["required"] = True
    for key in ("enum", "minimum", "maximum", "format", "default"):
        if key in prop:
            out[key] = prop[key]
    if out["type"] == "array":
        items = flatten(prop.get("items", {}))
        if items.get("enum"):
            out["itemEnum"] = items["enum"]
    if out["type"] == "string" and "enum" not in out:
        fixed, presets = documented_choices(name, (prop if docs is None else docs).get("description", ""))
        if fixed:
            out["enum"] = fixed
        if presets:
            out["presets"] = presets
    return out


def requirement(field, method):
    # Shared input schemas can describe different obligations for POST and PATCH.
    text = field["description"]
    if re.search(rf"not supported for {method}\b", text, re.I):
        return None
    if re.search(rf"required for {method}\b", text, re.I):
        field["required"] = True
    elif re.search(rf"optional for {method}\b", text, re.I):
        field.pop("required", None)
    elif re.search(r"(?:^|[.\n]\s*(?:-\s*)?|\b(?:property|parameter) is )required (?:if|when|for (?!POST\b|PATCH\b|PUT\b|DELETE\b|GET\b))|either .+? must be present", text, re.I):
        field.pop("required", None)
        field["conditional"] = True
    return field


operations = []
for path, verbs in spec["paths"].items():
    for method, op in verbs.items():
        if method == "parameters":
            continue
        params = {}
        for param in verbs.get("parameters", []) + op.get("parameters", []):
            item = field(param["name"], param.get("schema", {}), param.get("required") or param["in"] == "path", param)
            item.update(location=param["in"], description=description(param))
            if param["in"] == "path" or requirement(item, method):
                params[(param["in"], param["name"])] = item
        for name in re.findall(r"{([^}]+)}", path):
            params.setdefault(("path", name), dict(name=name, type="string", location="path", required=True, description=""))
        version = re.search(r"Available Version[^\d]*(\d+)", op["description"])
        item = dict(method=method.upper(), path=path, families=op["tags"], title=op["summary"],
                    description=description(op), since=int(version[1]), parameters=list(params.values()))
        if "requestBody" in op:
            body = op["requestBody"]
            media = body["content"]["application/json"]
            schema = flatten(media["schema"])
            fields = [field(k, v, k in schema.get("required", [])) for k, v in schema.get("properties", {}).items()]
            fields = [f for f in fields if requirement(f, method)]
            samples = {}
            for name, sample in media.get("examples", {}).items():
                if "$ref" in sample:
                    sample = examples[sample["$ref"].split("/")[-1]]
                if "value" in sample:
                    val = sample["value"]
                    if isinstance(val, str):
                        try:
                            val = json.loads(val)
                        except ValueError:
                            pass
                    samples[name] = val
            item["body"] = dict(required=body.get("required", False), fields=fields, examples=samples)
        operations.append(item)

out = Path(__file__).resolve().parents[1] / "server/connect-catalog.json"
with out.open("w") as f:
    f.write('{"version": ' + json.dumps(spec["info"]["version"]) + ', "operations": [\n')
    f.write(",\n".join(json.dumps(op, ensure_ascii=False, separators=(",", ":")) for op in operations))
    f.write("\n]}\n")
