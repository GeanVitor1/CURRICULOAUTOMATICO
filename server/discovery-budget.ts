import { AsyncLocalStorage } from "node:async_hooks";

const budget = new AsyncLocalStorage<AbortSignal>();

export function withDiscoveryBudget<T>(
  milliseconds: number,
  run: () => Promise<T>,
) {
  return budget.run(AbortSignal.timeout(milliseconds), run);
}

export function discoverySignal(milliseconds: number) {
  const signal = budget.getStore();
  signal?.throwIfAborted();
  const timeout = AbortSignal.timeout(milliseconds);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export const discoveryBudgetExpired = () => budget.getStore()?.aborted ?? false;
