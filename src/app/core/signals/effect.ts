import { trackEffect, type Subscriber } from "./signal";

export function effect(fn: Subscriber): void {
  const cleanup = trackEffect(fn);
  try {
    fn();
  } finally {
    cleanup();
  }
}
