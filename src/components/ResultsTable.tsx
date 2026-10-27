import type { QueryResult } from '../core/types';
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value, (_, item: unknown) => typeof item === 'bigint' ? item.toString() : item);
  return String(value);
}
export default function ResultsTable({ result, label = 'Query results', maxRows = 50 }: { result: QueryResult; label?: string; maxRows?: number }) {
  return <>
    <div className="result-scroll" role="region" aria-label={label} tabIndex={0}>
      <table><thead><tr>{result.fields.map((field, index) => <th key={`${field.name}-${index}`} scope="col">{field.name}</th>)}</tr></thead><tbody>
        {result.rows.slice(0, maxRows).map((row, index) => <tr key={index}>{row.map((value, cell) => <td key={cell} className={value === null ? 'null-value' : ''}>{cellText(value).slice(0, 500)}</td>)}</tr>)}
      </tbody></table>
      {result.rows.length === 0 && <p className="empty-result">No rows returned. An empty result can still be correct.</p>}
    </div>
    {result.rows.length > maxRows && <p className="table-caption">Showing {maxRows} of {result.rows.length} rows. Grading checks every returned row.</p>}
  </>;
}
