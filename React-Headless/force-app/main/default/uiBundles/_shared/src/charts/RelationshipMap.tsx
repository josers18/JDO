export interface RelationNode {
  id: string;
  label: string;
  sublabel?: string;
  /** relative importance 0..1 → node size */
  weight?: number;
  color?: string;
}

interface RelationshipMapProps {
  centerLabel: string;
  nodes: RelationNode[];
  width?: number;
  height?: number;
}

/**
 * Radial relationship/network graph — central client with satellite nodes
 * (family, accounts, products, related orgs) connected by lines. The tasteful,
 * de-cluttered version of the reference "relationship map" (not the busy orbit).
 */
export function RelationshipMap({ centerLabel, nodes, width = 520, height = 300 }: RelationshipMapProps) {
  const cx = width / 2;
  const cy = height / 2;
  const rx = width * 0.34;
  const ry = height * 0.34;
  const n = nodes.length;

  const positioned = nodes.map((node, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    return {
      ...node,
      x: cx + rx * Math.cos(angle),
      y: cy + ry * Math.sin(angle),
      r: 18 + (node.weight ?? 0.5) * 14,
    };
  });

  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      {/* connectors */}
      {positioned.map(p => (
        <line key={`l-${p.id}`} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="var(--wp-border-strong)" strokeWidth={1.5} />
      ))}
      {/* satellite nodes */}
      {positioned.map(p => (
        <g key={p.id}>
          <circle cx={p.x} cy={p.y} r={p.r} fill="var(--wp-surface-raised)" stroke={p.color ?? 'var(--wp-accent)'} strokeWidth={2} />
          <text x={p.x} y={p.y + p.r + 12} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--wp-text)">
            {p.label}
          </text>
          {p.sublabel && (
            <text x={p.x} y={p.y + p.r + 24} textAnchor="middle" fontSize="9" fill="var(--wp-text-faint)">
              {p.sublabel}
            </text>
          )}
        </g>
      ))}
      {/* center */}
      <circle cx={cx} cy={cy} r={30} fill="var(--wp-gradient, var(--wp-accent))" />
      <circle cx={cx} cy={cy} r={30} fill="var(--wp-accent)" />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="11" fontWeight="800" fill="var(--wp-on-accent)">
        {centerLabel}
      </text>
    </svg>
  );
}
