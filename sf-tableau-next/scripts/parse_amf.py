#!/usr/bin/env python3
"""Walk an AMF JSON-LD spec from developer.salesforce.com and print endpoints + schemas.

Usage: python3 parse_amf.py <spec.amf.json> [--max-depth N]
"""
import json, sys, argparse

def val(x):
    if isinstance(x, list) and x: return val(x[0])
    if isinstance(x, dict) and '@value' in x: return x['@value']
    if isinstance(x, dict) and '@id' in x: return x['@id']
    return x

def load_spec(path):
    spec = json.load(open(path))
    if isinstance(spec, list): spec = spec[0]
    return spec

def build_index(spec):
    by_id = {}
    def index(node):
        if isinstance(node, list):
            for x in node: index(x)
        elif isinstance(node, dict):
            if '@id' in node and len(node) > 1:
                by_id[node['@id']] = node
            for v in node.values(): index(v)
    index(spec)
    return by_id

def make_resolver(by_id):
    def resolve(node):
        if isinstance(node, list) and node: node = node[0]
        if isinstance(node, dict) and '@id' in node and len(node) == 1:
            return by_id.get(node['@id'], node)
        return node
    return resolve

def enum_values(decl):
    vals = []
    def walk(n):
        if isinstance(n, list):
            for x in n: walk(x)
        elif isinstance(n, dict):
            if 'data:value' in n:
                v = val(n['data:value'])
                if isinstance(v, str): vals.append(v)
            for v in n.values(): walk(v)
    walk(decl.get('shacl:in', []))
    return vals

def shape_props(shape, resolve, depth=0, max_depth=4, _seen=None):
    if _seen is None: _seen = set()
    if not isinstance(shape, dict): return shape
    sid = shape.get('@id')
    if sid in _seen or depth > max_depth:
        return {'$ref': val(shape.get('shacl:name')) or sid}
    _seen = _seen | {sid}
    name = val(shape.get('shacl:name'))
    desc = val(shape.get('core:description'))
    # AND merge
    if 'shacl:and' in shape:
        return {'name': name, 'description': desc,
                'composed': [shape_props(resolve(s), resolve, depth+1, max_depth, _seen) for s in shape['shacl:and']]}
    # OR (union)
    if 'shacl:or' in shape:
        return {'name': name, 'description': desc,
                'oneOf': [shape_props(resolve(s), resolve, depth+1, max_depth, _seen) for s in shape['shacl:or']]}
    # Array
    if 'raml-shapes:items' in shape:
        items = resolve(shape['raml-shapes:items'])
        return {'name': name, 'description': desc, 'type': 'array',
                'items': shape_props(items, resolve, depth+1, max_depth, _seen)}
    # Enum
    if 'shacl:in' in shape:
        return {'name': name, 'description': desc, 'enum': enum_values(shape)}
    # Scalar
    if 'shacl:datatype' in shape:
        return {'name': name, 'description': desc,
                'type': val(shape['shacl:datatype']).split('#')[-1]}
    # Node shape with properties
    out = {'name': name, 'description': desc, 'properties': {}}
    for p in shape.get('shacl:property', []):
        p = resolve(p)
        path = p.get('shacl:path')
        if isinstance(path, list) and path: path = path[0]
        pname = (path.get('@id','').split('#')[-1] if isinstance(path, dict) else None) or val(p.get('shacl:name'))
        rng = resolve(p.get('raml-shapes:range') or p.get('shacl:node'))
        min_count = val(p.get('shacl:minCount'))
        required = bool(min_count and int(min_count) > 0)
        sub = shape_props(rng, resolve, depth+1, max_depth, _seen) if rng else None
        out['properties'][pname] = {'required': required, 'shape': sub}
    return out

def parse(path, max_depth=4):
    spec = load_spec(path)
    by_id = build_index(spec)
    resolve = make_resolver(by_id)
    declares = spec.get('doc:declares', [])
    api = spec['doc:encodes']
    if isinstance(api, list): api = api[0]
    api_name = val(api.get('core:name'))
    api_desc = val(api.get('core:description'))
    api_version = val(api.get('core:version'))
    server = api.get('apiContract:server')
    if isinstance(server, list) and server: server = server[0]
    base_url = val(server.get('core:urlTemplate')) if isinstance(server, dict) else None

    print(f"\n{'#'*70}")
    print(f"# {api_name} (v{api_version})")
    if api_desc: print(f"# {api_desc}")
    if base_url: print(f"# base: {base_url}")
    print(f"{'#'*70}")

    # Endpoints
    for ep in api.get('apiContract:endpoint', []):
        path_str = val(ep.get('apiContract:path'))
        print(f"\n--- {path_str} ---")
        for op in ep.get('apiContract:supportedOperation', []):
            method = (val(op.get('apiContract:method')) or '?').upper()
            op_name = val(op.get('core:name'))
            op_desc = val(op.get('core:description'))
            print(f"\n  {method}  {op_name}")
            if op_desc: print(f"    {op_desc}")
            # Path params
            for r in (op.get('apiContract:request') or []):
                params = r.get('apiContract:parameter', []) if isinstance(r, dict) else []
                for prm in params:
                    pn = val(prm.get('core:name'))
                    print(f"    param: {pn}")
            # Request body
            for req in op.get('apiContract:expects', []):
                for pl in req.get('apiContract:payload', []):
                    mt = val(pl.get('core:mediaType'))
                    s = pl.get('raml-shapes:schema')
                    if isinstance(s, list) and s: s = s[0]
                    sname = val(s.get('shacl:name')) if isinstance(s, dict) else None
                    print(f"    REQUEST body ({mt}) → {sname}")
            # Responses
            for resp in op.get('apiContract:returns', []):
                sc = val(resp.get('apiContract:statusCode'))
                for pl in resp.get('apiContract:payload', []):
                    mt = val(pl.get('core:mediaType'))
                    s = pl.get('raml-shapes:schema')
                    if isinstance(s, list) and s: s = s[0]
                    sname = val(s.get('shacl:name')) if isinstance(s, dict) else None
                    print(f"    RESPONSE {sc} ({mt}) → {sname}")

    # All Input/Output schemas (resolved)
    print(f"\n{'='*70}\nFULL SCHEMAS (depth={max_depth})\n{'='*70}")
    schemas = {}
    for d in declares:
        n = val(d.get('shacl:name'))
        if n:
            schemas[n] = d
    # Dump only Input shapes + a few key output shapes
    for n in sorted(schemas):
        if n.endswith('Input') or n in ('Visualization','Workspace','SemanticModel','SemanticDefinition'):
            print(f"\n### {n}")
            print(json.dumps(shape_props(schemas[n], resolve, max_depth=max_depth), indent=2, default=str))

    # Print enums summary
    print(f"\n{'='*70}\nENUMS\n{'='*70}")
    for n in sorted(schemas):
        vals = enum_values(schemas[n])
        if vals:
            print(f"  {n}: {vals}")

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('path')
    ap.add_argument('--max-depth', type=int, default=4)
    args = ap.parse_args()
    parse(args.path, args.max_depth)
