import { signal, type Signal } from "./signal";
import { effect } from "./effect";

export function computed<T>(fn: () => T): Signal<T> {
  const result = signal(fn());

  effect(() => {
    result.set(fn());
  });

  return result;
}
