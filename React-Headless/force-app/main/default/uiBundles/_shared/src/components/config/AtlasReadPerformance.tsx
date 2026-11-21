import { useState } from 'react';
import { readStatistics } from '../../data/atlasReadCache';

export function AtlasReadPerformance() {
  const [rows, setRows] = useState(readStatistics);
  return <section className="atlas-read-performance">
    <h2>Data request timings</h2>
    <p>Reads in this tab for the current book. CRM and record summaries can be reused for 15 seconds, Data 360 for 60 seconds, and the Commercial daily brief for five minutes when its evidence and settings match.</p>
    <table><thead><tr>
      {['Source', 'Requests sent', 'From cache', 'Joined in flight', 'Failed', 'Average successful request'].map(title => <th key={title} scope="col">{title}</th>)}
    </tr></thead><tbody>{rows.map(row => <tr key={row.source}>
      <th scope="row">{row.source}</th><td>{row.requests}</td><td>{row.hits}</td><td>{row.joined}</td><td>{row.failures}</td>
      <td>{row.completed ? (row.totalMs / row.completed / 1000).toFixed(2) + ' s' : '—'}</td>
    </tr>)}</tbody></table>
    <button type="button" onClick={() => setRows(readStatistics())}>Refresh timings</button>
  </section>;
}
