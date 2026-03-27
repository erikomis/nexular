/**
 * SSR State Serialization System
 * Type-safe serialization and hydration of state between SSR and client
 */

export type SerializationSchema = {
  [key: string]: SerializationRule;
};

export type SerializationRule = {
  type: "string" | "number" | "boolean" | "date" | "json" | "custom" | "array";
  optional?: boolean;
  customSerializer?: (value: any) => string;
  customDeserializer?: (value: string) => any;
  schema?: SerializationSchema;
  items?: SerializationRule;
};

export class SSRState {
  private schema: SerializationSchema = {};
  private state: Record<string, any> = {};

  constructor(schema: SerializationSchema = {}) {
    this.schema = schema;
  }

  /**
   * Set state with validation against schema
   */
  setState(key: string, value: any): void {
    const rule = this.schema[key];

    if (!rule && Object.keys(this.schema).length > 0) {
      throw new Error(
        `State key "${key}" not defined in schema. Allowed keys: ${Object.keys(this.schema).join(", ")}`
      );
    }

    if (rule) {
      this.validateValue(key, value, rule);
    }

    this.state[key] = value;
  }

  /**
   * Get state by key
   */
  getState(key: string): any {
    return this.state[key];
  }

  /**
   * Get all state
   */
  getAllState(): Record<string, any> {
    return { ...this.state };
  }

  /**
   * Serialize state to JSON with custom serializers
   */
  serialize(): string {
    const serialized: Record<string, any> = {};

    for (const [key, value] of Object.entries(this.state)) {
      const rule = this.schema[key];
      serialized[key] = rule ? this.serializeValue(value, rule) : value;
    }

    return JSON.stringify(serialized);
  }

  /**
   * Deserialize state from JSON with custom deserializers
   */
  hydrate(serialized: string): void {
    try {
      const data = JSON.parse(serialized);

      for (const [key, value] of Object.entries(data)) {
        const rule = this.schema[key];
        this.state[key] = rule ? this.deserializeValue(value as any, rule) : value;
      }
    } catch (error) {
      throw new Error(
        `Failed to hydrate state: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Create a partial state snapshot (useful for incremental rendering)
   */
  snapshot(keys: string[]): Record<string, any> {
    return keys.reduce(
      (acc, key) => {
        if (key in this.state) {
          acc[key] = this.state[key];
        }
        return acc;
      },
      {} as Record<string, any>
    );
  }

  /**
   * Merge external state (from streaming chunks)
   */
  merge(partial: Record<string, any>): void {
    for (const [key, value] of Object.entries(partial)) {
      const rule = this.schema[key];
      if (rule) {
        this.validateValue(key, value, rule);
      }
      this.state[key] = value;
    }
  }

  private validateValue(key: string, value: any, rule: SerializationRule): void {
    if (value === undefined || value === null) {
      if (!rule.optional) {
        throw new Error(`State key "${key}" is required but got ${value}`);
      }
      return;
    }

    switch (rule.type) {
      case "string":
        if (typeof value !== "string") {
          throw new Error(`State key "${key}" must be string, got ${typeof value}`);
        }
        break;

      case "number":
        if (typeof value !== "number") {
          throw new Error(`State key "${key}" must be number, got ${typeof value}`);
        }
        break;

      case "boolean":
        if (typeof value !== "boolean") {
          throw new Error(`State key "${key}" must be boolean, got ${typeof value}`);
        }
        break;

      case "date":
        if (!(value instanceof Date)) {
          throw new Error(`State key "${key}" must be Date, got ${typeof value}`);
        }
        break;

      case "array":
        if (!Array.isArray(value)) {
          throw new Error(`State key "${key}" must be array, got ${typeof value}`);
        }
        if (rule.items) {
          value.forEach((item: any, idx: number) => {
            try {
              this.validateValue(`${key}[${idx}]`, item, rule.items!);
            } catch (error) {
              throw error;
            }
          });
        }
        break;

      case "json":
      case "custom":
        // No type validation for complex objects
        break;
    }
  }

  private serializeValue(value: any, rule: SerializationRule): any {
    if (rule.customSerializer) {
      const serialized = rule.customSerializer(value);
      // If custom serializer returns a string, it might be JSON or plain string
      // Return as-is and let outer JSON.stringify handle it
      return typeof serialized === "string" ? serialized : serialized;
    }

    switch (rule.type) {
      case "date":
        return (value as Date).toISOString();

      case "array":
        return (value as any[]).map((item) =>
          rule.items ? this.serializeValue(item, rule.items) : item
        );

      case "json":
      case "custom":
      case "string":
      case "number":
      case "boolean":
      default:
        return value;
    }
  }

  private deserializeValue(value: any, rule: SerializationRule): any {
    if (rule.customDeserializer) {
      return rule.customDeserializer(value);
    }

    switch (rule.type) {
      case "date":
        return new Date(value);

      case "array":
        return (value as any[]).map((item) =>
          rule.items ? this.deserializeValue(item, rule.items) : item
        );

      case "json":
      case "custom":
      case "string":
      case "number":
      case "boolean":
      default:
        return value;
    }
  }
}

/**
 * Create a state manager with strict schema validation
 */
export function createSSRStateManager<T extends SerializationSchema>(schema: T): SSRState {
  return new SSRState(schema);
}

/**
 * Type-safe SSR state builder
 */
export class SSRStateBuilder {
  private schema: SerializationSchema = {};

  addString(key: string, optional = false): this {
    this.schema[key] = { type: "string", optional };
    return this;
  }

  addNumber(key: string, optional = false): this {
    this.schema[key] = { type: "number", optional };
    return this;
  }

  addBoolean(key: string, optional = false): this {
    this.schema[key] = { type: "boolean", optional };
    return this;
  }

  addDate(key: string, optional = false): this {
    this.schema[key] = { type: "date", optional };
    return this;
  }

  addArray(key: string, itemsRule: SerializationRule, optional = false): this {
    this.schema[key] = { type: "array", items: itemsRule, optional };
    return this;
  }

  addCustom(
    key: string,
    serializer: (value: any) => string,
    deserializer: (value: string) => any,
    optional = false
  ): this {
    this.schema[key] = {
      type: "custom",
      customSerializer: serializer,
      customDeserializer: deserializer,
      optional,
    };
    return this;
  }

  build(): SSRState {
    return new SSRState(this.schema);
  }
}
