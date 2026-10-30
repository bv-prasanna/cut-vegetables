import type { Variant } from './domain.js';

/** PostgreSQL size fields: a numeric measurement and a descriptive grade are mutually exclusive. */
export function toSqlSizeFields(size: Variant['size']) {
 if (size.kind === 'numeric') {
  return { kind: 'numeric' as const, number: size.value, unit: size.unit, label: null };
 }
 return { kind: 'label' as const, number: null, unit: null, label: size.value };
}
