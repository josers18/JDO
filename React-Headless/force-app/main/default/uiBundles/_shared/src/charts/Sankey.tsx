export interface SankeyNode {
  id: string;
  label: string;
  value: number;
  side: 'in' | 'out';
  color: string;
}

interface SankeyProps {
  /** left-side inflows */
  inflows: SankeyNode[];
  /** right-side outflows */
  outflows: SankeyNode[];
  centerLabel: string;
  width?: number;
  height?: number;
}

/**
 * Cash-flow Sankey: inflows (left) → a central node → outflows (right), with
 * proportional flow ribbons. Hand-rolled with SVG cubic-bezier bands.
 */
export function Sankey({ inflows, outflows, centerLabel, width = 520, height = 260 }: SankeyProps) {
  const totalIn = inflows.reduce((s, n) => s + n.value, 0) || 1;
  const totalOut = outflows.reduce((s, n) => s + n.value, 0) || 1;
  const total = Math.max(totalIn, totalOut);
  const pad = 10;
  const usableH = height - pad * 2;
  const cx = width / 2;
  const nodeW = 12;
  const leftX = 4;
  const rightX = width - nodeW - 4;

  // stack helper — lay nodes vertically, band height proportional to value
  function stack(nodes: SankeyNode[]) {
    let y = pad;
    return nodes.map(n => {
      const band = (n.value / total) * usableH;
      const rec = { node: n, y, h: band };
      y += band + 4;
      return rec;
    });
  }
  const left = stack(inflows);
  const right = stack(outflows);

  const ribbon = (x1: number, y1: number, x2: number, y2: number, thickness: number, color: string, key: string) => {
    const mx = (x1 + x2) / 2;
    const d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
    return <path key={key} d={d} fill="none" stroke={color} strokeWidth={Math.max(thickness, 2)} strokeOpacity={0.32} strokeLinecap="round" />;
  };

  let inCursor = pad;
  let outCursor = pad;

  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      {/* ribbons in → center */}
      {left.map(l => {
        const thick = l.h;
        const y1 = l.y + l.h / 2;
        const y2 = inCursor + thick / 2;
        inCursor += thick + 2;
        return ribbon(leftX + nodeW, y1, cx - 6, y2, thick, l.node.color, `in-${l.node.id}`);
      })}
      {/* ribbons center → out */}
      {right.map(r => {
        const thick = r.h;
        const y1 = outCursor + thick / 2;
        const y2 = r.y + r.h / 2;
        outCursor += thick + 2;
        return ribbon(cx + 6, y1, rightX, y2, thick, r.node.color, `out-${r.node.id}`);
      })}

      {/* center node */}
      <rect x={cx - 6} y={pad} width={12} height={usableH} rx={6} fill="var(--wp-accent)" />
      <text x={cx} y={pad - 3} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--wp-text-muted)">
        {centerLabel}
      </text>

      {/* left nodes + labels */}
      {left.map(l => (
        <g key={`ln-${l.node.id}`}>
          <rect x={leftX} y={l.y} width={nodeW} height={l.h} rx={3} fill={l.node.color} />
          <text x={leftX + nodeW + 4} y={l.y + l.h / 2 + 3} fontSize="10" fill="var(--wp-text)">
            {l.node.label}
          </text>
        </g>
      ))}
      {/* right nodes + labels */}
      {right.map(r => (
        <g key={`rn-${r.node.id}`}>
          <rect x={rightX} y={r.y} width={nodeW} height={r.h} rx={3} fill={r.node.color} />
          <text x={rightX - 4} y={r.y + r.h / 2 + 3} fontSize="10" textAnchor="end" fill="var(--wp-text)">
            {r.node.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
