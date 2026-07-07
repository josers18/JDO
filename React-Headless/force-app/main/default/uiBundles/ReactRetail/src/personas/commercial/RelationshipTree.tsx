import type { RelationshipNode } from '../types';

/**
 * Corporate hierarchy visualization — indented tree with accent connectors,
 * grouped by depth. The signature element of the Commercial cockpit; in
 * production it renders the CumulusSynthRelationshipGraph / account hierarchy.
 */
export function RelationshipTree({ nodes }: { nodes: RelationshipNode[] }) {
  if (!nodes.length) return <div style={{ color: 'var(--wp-text-faint)' }}>No relationship data.</div>;
  const sorted = [...nodes].sort((a, b) => a.depth - b.depth);

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.4rem' }}>
      {sorted.map((n, i) => (
        <li
          key={n.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            marginLeft: n.depth * 20,
            animation: `wp-fade-up 0.45s ease ${i * 0.05}s both`,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 10,
              height: 10,
              borderRadius: 3,
              flexShrink: 0,
              background: n.relation === 'Self' ? 'var(--wp-accent)' : 'transparent',
              border: `2px solid ${n.relation === 'Self' ? 'var(--wp-accent)' : 'var(--wp-border-strong)'}`,
              boxShadow: n.relation === 'Self' ? '0 0 10px var(--wp-accent)' : 'none',
            }}
          />
          <span
            style={{
              flex: 1,
              fontSize: '0.9rem',
              fontWeight: n.relation === 'Self' ? 700 : 500,
              color: n.relation === 'Self' ? 'var(--wp-text)' : 'var(--wp-text-muted)',
            }}
          >
            {n.name}
          </span>
          <span
            style={{
              fontSize: '0.68rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--wp-text-faint)',
              border: '1px solid var(--wp-border)',
              borderRadius: 999,
              padding: '0.1rem 0.5rem',
            }}
          >
            {n.relation}
          </span>
        </li>
      ))}
    </ul>
  );
}
