export function deduplicateOperationsReal<T extends Readonly<{ operationId: string }>>(
  operations: readonly T[],
): readonly T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const op of operations) {
    if (seen.has(op.operationId)) {
      continue;
    }
    seen.add(op.operationId);
    result.push(op);
  }
  return result;
}
