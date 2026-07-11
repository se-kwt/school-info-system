export function resolveActiveChild<T extends { id: number }>(
  children: T[],
  requestedId: number | undefined
): T {
  return children.find((child) => child.id === requestedId) ?? children[0];
}
