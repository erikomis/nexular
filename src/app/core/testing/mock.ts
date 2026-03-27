export function mock<T extends new (...args: any[]) => any>(
  service: T,
  impl: Partial<InstanceType<T>>,
): InstanceType<T> {
  return Object.assign(new service(), impl);
}
