export type Subscriber = () => void;

const activeEffects = new Set<Subscriber>();

export type Signal<T> = {
  (): T;
  set: (newValue: T) => void;
  update: (updater: (value: T) => T) => void;
  subscribe: (fn: Subscriber) => () => void;
};

export function signal<T>(initial: T): Signal<T> {
  let value = initial;
  const subscribers = new Set<Subscriber>();

  function getter(): T {
    activeEffects.forEach((effectFn) => subscribers.add(effectFn));
    return value;
  }

  getter.set = (newValue: T) => {
    value = newValue;
    subscribers.forEach((fn) => fn());
  };

  getter.update = (updater: (current: T) => T) => {
    value = updater(value);
    subscribers.forEach((fn) => fn());
  };

  getter.subscribe = (fn: Subscriber) => {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  };

  return getter as Signal<T>;
}

export function trackEffect(effectFn: Subscriber): () => void {
  activeEffects.add(effectFn);
  return () => activeEffects.delete(effectFn);
}
