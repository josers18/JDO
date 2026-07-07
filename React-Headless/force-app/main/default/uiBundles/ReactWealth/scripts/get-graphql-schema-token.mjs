/**
 * Same introspection→build→prune→print pipeline as get-graphql-schema.mjs, but
 * takes the bearer token + instance URL from env vars instead of getOrgInfo()
 * (which returns a redacted token for this org). Use when the SDK auth helper
 * can't resolve a live token.
 *
 * Usage:
 *   SF_TOKEN=<bearer> SF_URL=https://...my.salesforce.com \
 *     node scripts/get-graphql-schema-token.mjs [output-path]
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildClientSchema, getIntrospectionQuery, printSchema } from 'graphql';
import { pruneSchema } from '@graphql-tools/utils';

const DEFAULT_SCHEMA_PATH = '../../../../../schema.graphql';
const API_VERSION = '67.0';

const token = process.env.SF_TOKEN;
const instanceUrl = process.env.SF_URL;
if (!token || !instanceUrl) {
  console.error('Set SF_TOKEN and SF_URL env vars.');
  process.exit(1);
}

try {
  const targetUrl = `${instanceUrl}/services/data/v${API_VERSION}/graphql`;
  console.log(`Introspecting ${targetUrl}`);
  const response = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Chatter-Entity-Encoding': 'false',
    },
    body: JSON.stringify({ query: getIntrospectionQuery(), variables: {}, operationName: 'IntrospectionQuery' }),
  });
  if (!response.ok) {
    throw new Error(`GraphQL request failed: ${response.status} ${response.statusText} - ${await response.text()}`);
  }
  const result = await response.json();
  if (!result.data) {
    throw new Error(`No introspection data. errors=${JSON.stringify(result.errors)}`);
  }
  const schema = buildClientSchema(result.data);
  const sdl = printSchema(pruneSchema(schema));
  const outputPath = resolve(process.argv[2] || DEFAULT_SCHEMA_PATH);
  writeFileSync(outputPath, sdl);
  console.log(`Schema saved to ${outputPath} (${sdl.length} chars)`);
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
