// This module must be eliminated from production, including its marker and URL parser.
export function debugSeedOverride(): number | undefined {
  const marker = '__SQL_DESK_DEV_ONLY__';
  const value = new URLSearchParams(window.location.search).get('seed');
  if (value === null || !/^\d{1,9}$/.test(value)) return undefined;
  console.info(marker, 'Using deterministic development seed.');
  return Number(value);
}
