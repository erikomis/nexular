export class TestBed {
  public static readonly providers: any[] = [];

  static configure(config: { providers?: any[] }): void {
    this.providers.length = 0;
    this.providers.push(...(config.providers || []));
  }
}
