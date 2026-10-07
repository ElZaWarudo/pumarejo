/**
 * Default snapshot traversal depth. Nested component layouts (docking panels,
 * virtualized lists) routinely exceed 32 DOM levels; the node and traversal
 * budgets still bound the cost of a deeper walk.
 */
export const DEFAULT_SNAPSHOT_MAX_DEPTH = 128;
