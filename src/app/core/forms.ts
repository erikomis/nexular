/**
 * Nexular Forms — Angular-inspired reactive forms engine.
 *
 * Features:
 *  - FormControl with sync/async validators, updateOn modes, debounce/distinct
 *  - FormGroup with group validators, patchValue, submit lifecycle
 *  - FormArray  - Validators: required, minLength, email, compose, composeAsync, zod, zodGroup
 *  - Zod integration: createSchemaValidator, createSchemaGroupValidator
 *  - formBuilder() factory
 *  - bindFormAction() for server-action integration
 *  - ngForm / ngModelGroup Angular compatibility façades
 */

import { signal } from "./signals";

// ---------------------------------------------------------------------------
// Minimal Zod type contract (no hard dependency)
// ---------------------------------------------------------------------------

interface ZodIssue {
  path: (string | number)[];
  message: string;
}

interface ZodLike<T> {
  safeParse(input: unknown):
    | { success: true; data: T }
    | {
        success: false;
        error: {
          flatten(): { fieldErrors: Record<string, string[] | undefined> };
          issues: ZodIssue[];
        };
      };
}

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export type FormErrorMap = Record<string, string | string[]>;
export type ValidatorFn<T> = (value: T) => FormErrorMap | null;
export type AsyncValidatorFn<T> = (value: T) => Promise<FormErrorMap | null>;
export type GroupValidatorFn<T extends Record<string, unknown> = Record<string, unknown>> = (
  value: T
) => FormErrorMap | null;

export interface FormControlOptions<T> {
  validators?: ValidatorFn<T>[];
  asyncValidators?: AsyncValidatorFn<T>[];
  updateOn?: "change" | "blur" | "submit";
  asyncValidation?: { debounceMs?: number; distinct?: boolean };
  /** If true, setValue(null) throws a TypeError */
  nonNullable?: boolean;
}

// ---------------------------------------------------------------------------
// FormControl
// ---------------------------------------------------------------------------

export class FormControl<T = string> {
  private readonly _value;
  private readonly _errors;
  private readonly _touched;
  private readonly _opts: FormControlOptions<T>;
  private _lastAsyncValue: { v: T } | null = null;

  constructor(initial: T, options: FormControlOptions<T> = {}) {
    this._value = signal<T>(initial);
    this._errors = signal<FormErrorMap | null>(null);
    this._touched = signal(false);
    this._opts = options;

    if (options.updateOn !== "blur") {
      this._runSync();
    }
  }

  value(): T {
    return this._value();
  }

  errors(): FormErrorMap | null {
    return this._errors();
  }

  valid(): boolean {
    return this._errors() === null;
  }

  invalid(): boolean {
    return this._errors() !== null;
  }

  setValue(value: T): void {
    if (this._opts.nonNullable && (value === null || value === undefined)) {
      throw new TypeError("FormControl is non-nullable; cannot set null or undefined.");
    }
    this._value.set(value);
    if (this._opts.updateOn !== "blur") {
      this._runSync();
    }
  }

  setErrors(errors: FormErrorMap | null): void {
    this._errors.set(errors);
  }

  markAsTouched(): void {
    this._touched.set(true);
    if (this._opts.updateOn === "blur") {
      this._runSync();
    }
  }

  async updateValueAndValidity(): Promise<FormErrorMap | null> {
    this._runSync();

    const asyncVals = this._opts.asyncValidators;
    if (!asyncVals || asyncVals.length === 0) return this._errors();

    const current = this._value();
    const distinct = this._opts.asyncValidation?.distinct ?? false;

    if (distinct && this._lastAsyncValue !== null && this._lastAsyncValue.v === current) {
      return this._errors();
    }

    this._lastAsyncValue = { v: current };

    const results = await Promise.all(asyncVals.map((v) => v(current)));
    const merged: FormErrorMap = { ...(this._errors() ?? {}) };
    for (const r of results) {
      if (r) Object.assign(merged, r);
    }

    const final = Object.keys(merged).length > 0 ? merged : null;
    this._errors.set(final);
    return final;
  }

  /** Expose the value signal's subscribe for change tracking in FormGroup */
  _onValueChange(fn: () => void): () => void {
    return this._value.subscribe(fn);
  }

  private _runSync(): void {
    const vals = this._opts.validators;
    if (!vals || vals.length === 0) return;

    const v = this._value();
    const merged: FormErrorMap = {};
    for (const validator of vals) {
      const result = validator(v);
      if (result) Object.assign(merged, result);
    }
    this._errors.set(Object.keys(merged).length > 0 ? merged : null);
  }
}

// ---------------------------------------------------------------------------
// FormArray
// ---------------------------------------------------------------------------

export class FormArray<T = string> {
  private readonly _controls;
  private readonly _sig;

  constructor(controls: FormControl<T>[]) {
    this._controls = [...controls];
    this._sig = signal(this._controls.length);
  }

  length(): number {
    this._sig();
    return this._controls.length;
  }

  value(): T[] {
    this._sig();
    return this._controls.map((c) => c.value());
  }

  at(index: number): FormControl<T> {
    return this._controls[index]!;
  }

  push(control: FormControl<T>): void {
    this._controls.push(control);
    this._sig.set(this._controls.length);
  }

  removeAt(index: number): void {
    this._controls.splice(index, 1);
    this._sig.set(this._controls.length);
  }

  valid(): boolean {
    return this._controls.every((c) => c.valid());
  }

  invalid(): boolean {
    return !this.valid();
  }
}

// ---------------------------------------------------------------------------
// FormGroup
// ---------------------------------------------------------------------------

export interface FormGroupOptions {
  validators?: GroupValidatorFn[];
}

export class FormGroup<TValue extends Record<string, unknown> = Record<string, unknown>> {
  private readonly _controls: Record<string, FormControl<unknown>>;
  private readonly _groupValidators: GroupValidatorFn[];
  private readonly _errors;
  private readonly _submitState;
  private readonly _valueSignal;
  private _unsubscribers: Array<() => void> = [];

  constructor(controls: Record<string, FormControl<unknown>>, options: FormGroupOptions = {}) {
    this._controls = controls;
    this._groupValidators = options.validators ?? [];
    this._errors = signal<FormErrorMap | null>(null);
    this._submitState = signal<{ submitted: boolean; success: boolean; error?: string }>({
      submitted: false,
      success: false,
    });
    this._valueSignal = signal(0); // bump to notify ngForm observers

    // Subscribe to each control's value changes
    for (const ctrl of Object.values(controls)) {
      this._unsubscribers.push(
        (ctrl as FormControl<unknown>)._onValueChange(() => {
          this._valueSignal.update((n) => n + 1);
        })
      );
    }
  }

  get(name: string): FormControl<unknown> {
    const ctrl = this._controls[name];
    if (!ctrl) throw new Error(`FormGroup: control "${name}" not found`);
    return ctrl;
  }

  value(): TValue {
    this._valueSignal();
    const result: Record<string, unknown> = {};
    for (const [k, c] of Object.entries(this._controls)) {
      result[k] = c.value();
    }
    return result as TValue;
  }

  errors(): FormErrorMap | null {
    return this._errors();
  }

  valid(): boolean {
    const allControlsValid = Object.values(this._controls).every((c) => c.valid());
    return allControlsValid && this._errors() === null;
  }

  invalid(): boolean {
    return !this.valid();
  }

  patchValue(values: Partial<TValue>): void {
    for (const [k, v] of Object.entries(values)) {
      if (this._controls[k]) {
        this._controls[k]!.setValue(v);
      }
    }
  }

  validate(): void {
    for (const c of Object.values(this._controls)) {
      c.markAsTouched();
    }

    if (this._groupValidators.length === 0) {
      this._errors.set(null);
      return;
    }

    const currentValue = this.value();
    const merged: FormErrorMap = {};
    for (const validator of this._groupValidators) {
      const result = validator(currentValue as Record<string, unknown>);
      if (result) Object.assign(merged, result);
    }
    this._errors.set(Object.keys(merged).length > 0 ? merged : null);
  }

  async submit<R>(
    callback: (value: TValue) => Promise<R>
  ): Promise<R | null> {
    this.validate();

    if (this.invalid()) {
      this._submitState.set({ submitted: true, success: false, error: "Form invalid" });
      return null;
    }

    try {
      const result = await callback(this.value());
      this._submitState.set({ submitted: true, success: true });
      return result;
    } catch (e) {
      this._submitState.set({
        submitted: true,
        success: false,
        error: e instanceof Error ? e.message : "Unknown error",
      });
      return null;
    }
  }

  submitState(): { submitted: boolean; success: boolean; error?: string } {
    return this._submitState();
  }

  destroy(): void {
    this._unsubscribers.forEach((u) => u());
    this._unsubscribers = [];
  }
}

// ---------------------------------------------------------------------------
// FormErrors utility
// ---------------------------------------------------------------------------

export const FormErrors = {
  /**
   * Extracts errors for a dotted path from group.errors().
   * e.g. FormErrors.nested(group, "profile.city") => ["Cidade curta"]
   */
  nested(group: FormGroup, path: string): string[] {
    const errs = group.errors();
    if (!errs) return [];
    const val = errs[path];
    if (!val) return [];
    return Array.isArray(val) ? val : [val];
  },

  /** Returns the first error message from a nested errors array. */
  first(errors: string[]): string | undefined {
    return errors[0];
  },
};

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

export const Validators = {
  required(message = "Campo obrigatório"): ValidatorFn<unknown> {
    return (value) => {
      if (value === null || value === undefined || value === "") {
        return { required: message };
      }
      return null;
    };
  },

  minLength(min: number, message?: string): ValidatorFn<string> {
    return (value) => {
      const str = String(value ?? "");
      if (str.length < min) {
        return { minLength: message ?? `Mínimo de ${min} caracteres` };
      }
      return null;
    };
  },

  maxLength(max: number, message?: string): ValidatorFn<string> {
    return (value) => {
      const str = String(value ?? "");
      if (str.length > max) {
        return { maxLength: message ?? `Máximo de ${max} caracteres` };
      }
      return null;
    };
  },

  email(message = "Email inválido"): ValidatorFn<string> {
    return (value) => {
      const str = String(value ?? "");
      if (!str) return null;
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
      return ok ? null : { email: message };
    };
  },

  pattern(regex: RegExp, message = "Formato inválido"): ValidatorFn<string> {
    return (value) => {
      const str = String(value ?? "");
      return regex.test(str) ? null : { pattern: message };
    };
  },

  /** Merge multiple sync validators into one. */
  compose<T>(validators: ValidatorFn<T>[]): ValidatorFn<T> {
    return (value) => {
      const merged: FormErrorMap = {};
      for (const v of validators) {
        const r = v(value);
        if (r) Object.assign(merged, r);
      }
      return Object.keys(merged).length > 0 ? merged : null;
    };
  },

  /** Merge multiple async validators into one. */
  composeAsync<T>(validators: AsyncValidatorFn<T>[]): AsyncValidatorFn<T> {
    return async (value) => {
      const results = await Promise.all(validators.map((v) => v(value)));
      const merged: FormErrorMap = {};
      for (const r of results) {
        if (r) Object.assign(merged, r);
      }
      return Object.keys(merged).length > 0 ? merged : null;
    };
  },

  /** Zod schema validator for a single control value. */
  zod<T>(schema: ZodLike<T>, key = "zod"): ValidatorFn<T> {
    return (value) => {
      const result = schema.safeParse(value);
      if (result.success) return null;
      const first = result.error.issues[0]?.message ?? "Inválido";
      return { [key]: first };
    };
  },

  /** Zod schema validator for an entire FormGroup value. */
  zodGroup<T extends Record<string, unknown>>(schema: ZodLike<T>): GroupValidatorFn<T> {
    return (value) => {
      const result = schema.safeParse(value);
      if (result.success) return null;
      const errors: FormErrorMap = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (key) errors[key] = issue.message;
      }
      return Object.keys(errors).length > 0 ? errors : null;
    };
  },
};

// ---------------------------------------------------------------------------
// createSchemaValidator
// ---------------------------------------------------------------------------

/** Creates a sync or async validator from a Zod schema for use in FormControl. */
export function createSchemaValidator<T>(
  schema: ZodLike<T>,
  options?: { async?: false; rootKey?: string }
): ValidatorFn<T>;
export function createSchemaValidator<T>(
  schema: ZodLike<T>,
  options: { async: true; rootKey?: string }
): AsyncValidatorFn<T>;
export function createSchemaValidator<T>(
  schema: ZodLike<T>,
  options: { async?: boolean; rootKey?: string } = {}
): ValidatorFn<T> | AsyncValidatorFn<T> {
  const key = options.rootKey ?? "zod";

  if (options.async) {
    return async (value: T): Promise<FormErrorMap | null> => {
      const result = schema.safeParse(value);
      if (result.success) return null;
      const first = result.error.issues[0]?.message ?? "Inválido";
      return { [key]: first };
    };
  }

  return (value: T): FormErrorMap | null => {
    const result = schema.safeParse(value);
    if (result.success) return null;
    const first = result.error.issues[0]?.message ?? "Inválido";
    return { [key]: first };
  };
}

// ---------------------------------------------------------------------------
// createSchemaGroupValidator
// ---------------------------------------------------------------------------

/** Creates a group validator from a Zod object schema (supports nested paths). */
export function createSchemaGroupValidator<T extends Record<string, unknown>>(
  schema: ZodLike<T>,
  // rootKey is accepted for API compatibility but does not prefix field paths
  _options: { rootKey?: string } = {}
): GroupValidatorFn<T> {
  return (value: T): FormErrorMap | null => {
    const result = schema.safeParse(value);
    if (result.success) return null;

    const errors: FormErrorMap = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join(".");
      if (path) errors[path] = issue.message;
    }
    return Object.keys(errors).length > 0 ? errors : null;
  };
}

// ---------------------------------------------------------------------------
// formBuilder
// ---------------------------------------------------------------------------

type FormBuilderControls = Record<string, FormControl<unknown>>;

interface FormBuilderInstance {
  control<T>(value: T, options?: FormControlOptions<T>): FormControl<T>;
  group<T extends Record<string, unknown>>(
    controls: Record<string, FormControl<unknown>>,
    options?: FormGroupOptions
  ): FormGroup<T>;
  readonly nonNullable: {
    control<T>(value: T, options?: Omit<FormControlOptions<T>, "nonNullable">): FormControl<T>;
  };
}

export function formBuilder(): FormBuilderInstance {
  const instance: FormBuilderInstance = {
    control<T>(value: T, options: FormControlOptions<T> = {}): FormControl<T> {
      return new FormControl<T>(value, options);
    },
    group<T extends Record<string, unknown>>(
      controls: FormBuilderControls,
      options: FormGroupOptions = {}
    ): FormGroup<T> {
      return new FormGroup<T>(controls, options);
    },
    get nonNullable() {
      return {
        control<T>(
          value: T,
          options: Omit<FormControlOptions<T>, "nonNullable"> = {}
        ): FormControl<T> {
          return new FormControl<T>(value, { ...options, nonNullable: true });
        },
      };
    },
  };
  return instance;
}

// ---------------------------------------------------------------------------
// bindFormAction
// ---------------------------------------------------------------------------

export interface BindFormActionOptions<Input, Output> {
  form: FormGroup;
  action: {
    path: string;
    action: string;
  };
  onSuccess?: (result: Output) => void;
  onError?: (error: string) => void;
}

interface BoundFormAction<Output> {
  submit(): Promise<Output | null>;
  formState(): { submitted: boolean; success: boolean; error?: string };
  reset(values?: Record<string, unknown>): void;
}

export function bindFormAction<Input extends Record<string, unknown>, Output>(
  options: BindFormActionOptions<Input, Output>
): BoundFormAction<Output> {
  const state = signal<{ submitted: boolean; success: boolean; error?: string }>({
    submitted: false,
    success: false,
  });

  return {
    formState: () => state(),

    reset(values?: Record<string, unknown>): void {
      state.set({ submitted: false, success: false });
      if (values) options.form.patchValue(values);
    },

    async submit(): Promise<Output | null> {
      options.form.validate();

      if (options.form.invalid()) {
        state.set({ submitted: true, success: false, error: "Form invalid" });
        return null;
      }

      try {
        const response = await fetch("/_nexular/action", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: options.action.action,
            input: options.form.value(),
          }),
        });

        const data = (await response.json()) as { ok: boolean; result?: Output; error?: string };

        if (data.ok) {
          state.set({ submitted: true, success: true });
          options.onSuccess?.(data.result as Output);
          return data.result ?? null;
        } else {
          const errorMsg = data.error ?? "Action failed";
          state.set({ submitted: true, success: false, error: errorMsg });
          options.onError?.(errorMsg);
          return null;
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : "Network error";
        state.set({ submitted: true, success: false, error: errorMsg });
        options.onError?.(errorMsg);
        return null;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// ngForm
// ---------------------------------------------------------------------------

type StatusValue = "VALID" | "INVALID";

type StatusSignal = {
  (): StatusValue;
  subscribe(fn: () => void): () => void;
};

type ValueChangeObservable = {
  subscribe(fn: () => void): () => void;
};

interface NgFormInstance {
  submitted(): boolean;
  valid(): boolean;
  value(): Record<string, unknown>;
  onSubmit<R>(callback: (value: Record<string, unknown>) => Promise<R>): Promise<R | null>;
  resetForm(values?: Record<string, unknown>): void;
  valueChanges: ValueChangeObservable;
  statusChanges: StatusSignal;
  destroy(): void;
}

export function ngForm(group: FormGroup): NgFormInstance {
  const _submitted = signal(false);
  const _status = signal<StatusValue>(group.valid() ? "VALID" : "INVALID");

  // Access the internal value-change signal to wire up status and valueChanges
  type InternalGroup = { _valueSignal: { subscribe(fn: () => void): () => void } };
  const changeSignal = (group as unknown as InternalGroup)._valueSignal;

  // Keep _status in sync with form validity on any value change
  const unsubStatus = changeSignal.subscribe(() => {
    _status.set(group.valid() ? "VALID" : "INVALID");
  });

  const statusChanges: StatusSignal = Object.assign(() => _status(), {
    subscribe: (fn: () => void) => _status.subscribe(fn),
  });

  return {
    submitted: () => _submitted(),
    valid: () => group.valid(),
    value: () => group.value(),

    async onSubmit<R>(callback: (value: Record<string, unknown>) => Promise<R>): Promise<R | null> {
      _submitted.set(true);
      group.validate();
      if (group.invalid()) return null;
      try {
        return await callback(group.value());
      } catch {
        return null;
      }
    },

    resetForm(values?: Record<string, unknown>): void {
      _submitted.set(false);
      if (values) group.patchValue(values);
    },

    valueChanges: {
      subscribe: (fn: () => void) => changeSignal.subscribe(fn),
    },

    statusChanges,

    destroy(): void {
      unsubStatus();
      group.destroy();
    },
  };
}

// ---------------------------------------------------------------------------
// ngModelGroup
// ---------------------------------------------------------------------------

interface NgModelGroupInstance {
  name: string;
  value(): Record<string, unknown>;
  valid(): boolean;
  invalid(): boolean;
}

export function ngModelGroup(name: string, group: FormGroup): NgModelGroupInstance {
  return {
    name,
    value: () => group.value(),
    valid: () => group.valid(),
    invalid: () => group.invalid(),
  };
}

// ---------------------------------------------------------------------------
// Re-exports for backwards compat with the old stub
// ---------------------------------------------------------------------------

/** @deprecated Use validateWithZod from forms directly */
export function validateWithZod<T>(schema: ZodLike<T>): (input: unknown) => T {
  return (input: unknown): T => {
    const result = schema.safeParse(input);
    if (!result.success) {
      const first = result.error.issues[0]?.message ?? "Validation failed";
      throw new Error(first);
    }
    return result.data;
  };
}

export type FormValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: Record<string, string> };

export function validateWithZodSafe<T>(
  schema: ZodLike<T>,
  input: unknown
): FormValidationResult<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const errors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "root";
      errors[key] = issue.message;
    }
    return { success: false, errors };
  }
  return { success: true, data: result.data };
}

export function parseFormData(
  formData: FormData | URLSearchParams
): Record<string, string> {
  const result: Record<string, string> = {};
  formData.forEach((value, key) => {
    result[key] = String(value);
  });
  return result;
}

export type FormField<T = string> = {
  name: string;
  value: T;
  error?: string;
  touched?: boolean;
};

export type FormState<T extends Record<string, unknown> = Record<string, unknown>> = {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  isSubmitting: boolean;
  isDirty: boolean;
};

export function createFormState<T extends Record<string, unknown>>(defaults: T): FormState<T> {
  return { values: { ...defaults }, errors: {}, isSubmitting: false, isDirty: false };
}
