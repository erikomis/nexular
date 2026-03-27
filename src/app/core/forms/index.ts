import { computed, signal, type Signal } from "../signals";
import { createActionClient, type ActionClientConfig } from "../actions-client";
import type { ZodIssue, ZodType } from "zod";

export type ValidationErrors = Record<string, string | true>;

export type ValidatorFn<T> = (value: T, control: FormControl<T>) => ValidationErrors | null;
export type AsyncValidatorFn<T> = (
  value: T,
  control: FormControl<T>
) => Promise<ValidationErrors | null>;

type ControlState = "VALID" | "INVALID" | "PENDING";
export type UpdateOn = "change" | "blur" | "submit";

export type FormControlOptions<T> = {
  validators?: ValidatorFn<T>[];
  asyncValidators?: AsyncValidatorFn<T>[];
  disabled?: boolean;
  nonNullable?: boolean;
  updateOn?: UpdateOn;
  asyncValidation?: {
    debounceMs?: number;
    timeoutMs?: number;
    distinct?: boolean;
  };
};

export type FormSubmitState<Output = unknown> = {
  submitting: boolean;
  submitted: boolean;
  submitCount: number;
  success: boolean;
  error: string | null;
  lastResult: Output | null;
};

export class FormControl<T> {
  readonly value: Signal<T>;
  readonly touched = signal(false);
  readonly dirty = signal(false);
  readonly pending = signal(false);
  readonly disabled = signal(false);
  readonly errors = signal<ValidationErrors | null>(null);
  readonly status = computed<ControlState>(() => {
    if (this.disabled()) return "VALID";
    if (this.pending()) return "PENDING";
    return this.errors() ? "INVALID" : "VALID";
  });
  readonly valid = computed(() => this.status() === "VALID");
  readonly invalid = computed(() => this.status() === "INVALID");

  private validators: ValidatorFn<T>[];
  private asyncValidators: AsyncValidatorFn<T>[];
  private readonly initialValue: T;
  private readonly nonNullable: boolean;
  private readonly updateOn: UpdateOn;
  private readonly asyncValidationOptions: {
    debounceMs: number;
    timeoutMs: number;
    distinct: boolean;
  };
  private asyncValidationVersion = 0;
  private lastAsyncValue?: T;
  private syncErrors: ValidationErrors | null = null;
  private asyncErrors: ValidationErrors | null = null;

  constructor(initialValue: T, options: FormControlOptions<T> = {}) {
    if (options.nonNullable && (initialValue === null || initialValue === undefined)) {
      throw new Error("nonNullable control cannot be initialized with null or undefined");
    }

    this.initialValue = initialValue;
    this.value = signal(initialValue);
    this.validators = options.validators ?? [];
    this.asyncValidators = options.asyncValidators ?? [];
    this.nonNullable = Boolean(options.nonNullable);
    this.updateOn = options.updateOn ?? "change";
    this.asyncValidationOptions = {
      debounceMs: options.asyncValidation?.debounceMs ?? 0,
      timeoutMs: options.asyncValidation?.timeoutMs ?? 5000,
      distinct: options.asyncValidation?.distinct ?? true,
    };
    this.disabled.set(Boolean(options.disabled));
    this.validateSync();
  }

  setValue(value: T): void {
    if (this.nonNullable && (value === null || value === undefined)) {
      throw new Error("Cannot set null or undefined on nonNullable control");
    }

    this.value.set(value);
    this.markAsDirty();
    if (this.updateOn === "change") {
      this.validateSync();
    }
  }

  patchValue(value: T): void {
    this.setValue(value);
  }

  markAsTouched(): void {
    this.touched.set(true);
    if (this.updateOn === "blur") {
      this.validateSync();
    }
  }

  markAsUntouched(): void {
    this.touched.set(false);
  }

  markAsDirty(): void {
    this.dirty.set(true);
  }

  markAsPristine(): void {
    this.dirty.set(false);
  }

  setErrors(errors: ValidationErrors | null): void {
    this.errors.set(errors);
  }

  setValidators(validators: ValidatorFn<T>[]): void {
    this.validators = validators;
    this.validateSync();
  }

  addValidators(...validators: ValidatorFn<T>[]): void {
    this.validators.push(...validators);
    this.validateSync();
  }

  setAsyncValidators(validators: AsyncValidatorFn<T>[]): void {
    this.asyncValidators = validators;
    this.lastAsyncValue = undefined;
  }

  addAsyncValidators(...validators: AsyncValidatorFn<T>[]): void {
    this.asyncValidators.push(...validators);
    this.lastAsyncValue = undefined;
  }

  disable(): void {
    this.disabled.set(true);
    this.syncErrors = null;
    this.asyncErrors = null;
    this.errors.set(null);
  }

  enable(): void {
    this.disabled.set(false);
    this.validateSync();
  }

  reset(value: T = this.initialValue): void {
    const nextValue =
      this.nonNullable && (value === null || value === undefined) ? this.initialValue : value;
    this.value.set(nextValue);
    this.markAsPristine();
    this.markAsUntouched();
    this.pending.set(false);
    this.lastAsyncValue = undefined;
    this.syncErrors = null;
    this.asyncErrors = null;
    this.asyncValidationVersion += 1;
    this.validateSync();
  }

  getRawValue(): T {
    return this.value();
  }

  validateSync(): ValidationErrors | null {
    if (this.disabled()) {
      this.syncErrors = null;
      this.errors.set(null);
      return null;
    }

    const merged: ValidationErrors = {};
    for (const validator of this.validators) {
      const errors = validator(this.value(), this);
      if (errors) {
        Object.assign(merged, errors);
      }
    }

    this.syncErrors = Object.keys(merged).length > 0 ? merged : null;
    const result = mergeValidationErrors(this.syncErrors, this.asyncErrors);
    this.errors.set(result);
    return result;
  }

  async validateAsync(): Promise<ValidationErrors | null> {
    if (this.disabled() || this.asyncValidators.length === 0) {
      return this.errors();
    }

    const currentValue = this.value();
    if (
      this.asyncValidationOptions.distinct &&
      this.lastAsyncValue !== undefined &&
      Object.is(this.lastAsyncValue, currentValue)
    ) {
      const result = mergeValidationErrors(this.syncErrors, this.asyncErrors);
      this.errors.set(result);
      return result;
    }

    const runId = ++this.asyncValidationVersion;

    if (this.asyncValidationOptions.debounceMs > 0) {
      await delay(this.asyncValidationOptions.debounceMs);
      if (runId !== this.asyncValidationVersion) {
        return this.errors();
      }
    }

    this.pending.set(true);
    const merged: ValidationErrors = {};
    for (const validator of this.asyncValidators) {
      const errors = await withTimeout(
        validator(this.value(), this),
        this.asyncValidationOptions.timeoutMs,
        "Async validator timed out"
      );

      if (runId !== this.asyncValidationVersion) {
        return this.errors();
      }

      if (errors) {
        Object.assign(merged, errors);
      }
    }

    this.lastAsyncValue = currentValue;
    this.pending.set(false);

    this.asyncErrors = Object.keys(merged).length > 0 ? merged : null;
    const result = mergeValidationErrors(this.syncErrors, this.asyncErrors);
    this.errors.set(result);
    return result;
  }

  async updateValueAndValidity(): Promise<ValidationErrors | null> {
    this.validateSync();
    return this.validateAsync();
  }
}

type ControlsOf<T extends Record<string, unknown>> = {
  [K in keyof T]: FormControl<T[K]>;
};

export type FormGroupOptions<T extends Record<string, unknown>> = {
  validators?: Array<(value: T, group: FormGroup<T>) => ValidationErrors | null>;
  asyncValidators?: Array<(value: T, group: FormGroup<T>) => Promise<ValidationErrors | null>>;
};

function mapZodIssuesToErrors(issues: ZodIssue[], rootKey = "zod"): ValidationErrors {
  const errors: ValidationErrors = {};

  issues.forEach((issue, index) => {
    const pathKey = issue.path.map(String).join(".");
    const key = pathKey || (index === 0 ? rootKey : `${rootKey}.${index}`);
    errors[key] = issue.message || true;
  });

  return errors;
}

export class FormGroup<T extends Record<string, unknown>> {
  readonly controls: ControlsOf<T> = {} as ControlsOf<T>;
  readonly errors = signal<ValidationErrors | null>(null);
  readonly submitting = signal(false);
  readonly submitted = signal(false);
  readonly submitCount = signal(0);
  readonly submitError = signal<string | null>(null);
  readonly submitSuccess = signal(false);
  readonly lastSubmitResult = signal<unknown | null>(null);
  private readonly asyncPending = signal(false);
  readonly submitState = computed<FormSubmitState>(() => ({
    submitting: this.submitting(),
    submitted: this.submitted(),
    submitCount: this.submitCount(),
    success: this.submitSuccess(),
    error: this.submitError(),
    lastResult: this.lastSubmitResult(),
  }));

  value = (): T => {
    const next = {} as T;
    for (const [key, control] of Object.entries(this.controls)) {
      (next as Record<string, unknown>)[key] = control.value();
    }
    return next;
  };

  getRawValue = (): T => this.value();

  pending = (): boolean => {
    return this.asyncPending() || Object.values(this.controls).some((control) => control.pending());
  };

  touched = (): boolean => {
    return Object.values(this.controls).some((control) => control.touched());
  };

  dirty = (): boolean => {
    return Object.values(this.controls).some((control) => control.dirty());
  };

  valid = (): boolean => {
    if (this.errors()) return false;
    return Object.values(this.controls).every((control) => control.valid());
  };

  invalid = (): boolean => {
    return !this.valid();
  };

  private validators: Array<(value: T, group: FormGroup<T>) => ValidationErrors | null>;
  private asyncValidators: Array<
    (value: T, group: FormGroup<T>) => Promise<ValidationErrors | null>
  >;
  private asyncValidationVersion = 0;

  constructor(controls: ControlsOf<T>, options: FormGroupOptions<T> = {}) {
    this.controls = controls;
    this.validators = options.validators ?? [];
    this.asyncValidators = options.asyncValidators ?? [];
    this.validate();
  }

  get<K extends keyof T>(key: K): FormControl<T[K]> {
    return this.controls[key];
  }

  setValue(value: T): void {
    for (const [key, next] of Object.entries(value)) {
      const control = (this.controls as Record<string, FormControl<unknown>>)[key];
      if (control) {
        control.setValue(next);
      }
    }
    this.validate();
  }

  patchValue(value: Partial<T>): void {
    for (const [key, next] of Object.entries(value)) {
      const control = (this.controls as Record<string, FormControl<unknown>>)[key];
      if (control && next !== undefined) {
        control.patchValue(next);
      }
    }
    this.validate();
  }

  markAllAsTouched(): void {
    Object.values(this.controls).forEach((control) => control.markAsTouched());
  }

  reset(value?: Partial<T>): void {
    Object.entries(this.controls).forEach(([key, control]) => {
      const maybeValue = value?.[key as keyof T];
      if (maybeValue !== undefined) {
        (control as FormControl<unknown>).reset(maybeValue);
      } else {
        control.reset();
      }
    });
    this.errors.set(null);
    this.asyncPending.set(false);
    this.submitting.set(false);
    this.submitted.set(false);
    this.submitCount.set(0);
    this.submitError.set(null);
    this.submitSuccess.set(false);
    this.lastSubmitResult.set(null);
    this.asyncValidationVersion += 1;
    this.validate();
  }

  validate(): ValidationErrors | null {
    Object.values(this.controls).forEach((control) => control.validateSync());

    const merged: ValidationErrors = {};
    for (const validator of this.validators) {
      const result = validator(this.value(), this);
      if (result) {
        Object.assign(merged, result);
      }
    }
    const finalErrors = Object.keys(merged).length > 0 ? merged : null;
    this.errors.set(finalErrors);
    return finalErrors;
  }

  async validateAsync(): Promise<boolean> {
    const results = await Promise.all(
      Object.values(this.controls).map((control) => control.updateValueAndValidity())
    );

    const syncErrors = this.validate();

    if (this.asyncValidators.length > 0) {
      const runId = ++this.asyncValidationVersion;
      this.asyncPending.set(true);
      const merged: ValidationErrors = { ...(syncErrors ?? {}) };

      for (const validator of this.asyncValidators) {
        const result = await validator(this.value(), this);
        if (runId !== this.asyncValidationVersion) {
          this.asyncPending.set(false);
          return false;
        }

        if (result) {
          Object.assign(merged, result);
        }
      }

      this.asyncPending.set(false);
      this.errors.set(Object.keys(merged).length > 0 ? merged : null);
    }

    return !results.some((errors) => Boolean(errors)) && !this.errors();
  }

  async submit<Output>(onValid: (value: T) => Promise<Output> | Output): Promise<Output | null> {
    this.submitting.set(true);
    this.submitted.set(true);
    this.submitCount.update((count) => count + 1);
    this.submitError.set(null);
    this.submitSuccess.set(false);
    this.markAllAsTouched();
    const isValid = await this.validateAsync();
    if (!isValid) {
      this.submitting.set(false);
      this.submitError.set("Form invalid");
      return null;
    }

    try {
      const result = await onValid(this.value());
      this.lastSubmitResult.set(result as unknown);
      this.submitSuccess.set(true);
      this.submitting.set(false);
      return result;
    } catch (error) {
      this.submitError.set(error instanceof Error ? error.message : "Unknown submit error");
      this.submitSuccess.set(false);
      this.submitting.set(false);
      throw error;
    }
  }

  addAsyncValidators(
    ...validators: Array<(value: T, group: FormGroup<T>) => Promise<ValidationErrors | null>>
  ): void {
    this.asyncValidators.push(...validators);
  }
}

export class NgModelGroup<T extends Record<string, unknown>> {
  constructor(
    public readonly name: string,
    public readonly form: FormGroup<T>
  ) {}

  value = (): T => this.form.value();
  getRawValue = (): T => this.form.getRawValue();
  valid = (): boolean => this.form.valid();
  invalid = (): boolean => this.form.invalid();
  touched = (): boolean => this.form.touched();
  dirty = (): boolean => this.form.dirty();
}

export class NgForm<T extends Record<string, unknown>> {
  readonly submitted = signal(false);
  readonly submitting = computed(() => this.form.submitting());
  readonly submitError = computed(() => this.form.submitError());
  readonly submitSuccess = computed(() => this.form.submitSuccess());
  readonly submitCount = computed(() => this.form.submitCount());
  readonly valueChanges: Signal<T>;
  readonly statusChanges: Signal<ControlState>;

  private subscriptions: Array<() => void> = [];

  constructor(public readonly form: FormGroup<T>) {
    this.valueChanges = signal(this.form.value());
    this.statusChanges = signal(this.resolveStatus());

    Object.values(this.form.controls).forEach((control) => {
      this.subscriptions.push(
        control.value.subscribe(() => {
          this.valueChanges.set(this.form.value());
        })
      );

      this.subscriptions.push(
        control.status.subscribe(() => {
          this.statusChanges.set(this.resolveStatus());
        })
      );
    });

    this.subscriptions.push(
      this.form.errors.subscribe(() => {
        this.statusChanges.set(this.resolveStatus());
      })
    );
  }

  value = (): T => this.form.value();
  getRawValue = (): T => this.form.getRawValue();
  valid = (): boolean => this.form.valid();
  invalid = (): boolean => this.form.invalid();
  touched = (): boolean => this.form.touched();
  dirty = (): boolean => this.form.dirty();

  markAsSubmitted(): void {
    this.submitted.set(true);
  }

  resetForm(value?: Partial<T>): void {
    this.form.reset(value);
    this.submitted.set(false);
    this.valueChanges.set(this.form.value());
    this.statusChanges.set(this.resolveStatus());
  }

  async onSubmit<Output>(onValid: (value: T) => Promise<Output> | Output): Promise<Output | null> {
    this.markAsSubmitted();
    const result = await this.form.submit(onValid);
    this.statusChanges.set(this.resolveStatus());
    return result;
  }

  destroy(): void {
    this.subscriptions.forEach((unsubscribe) => unsubscribe());
    this.subscriptions = [];
  }

  private resolveStatus(): ControlState {
    if (this.form.pending()) {
      return "PENDING";
    }
    return this.form.valid() ? "VALID" : "INVALID";
  }
}

export const Validators = {
  required: <T>(message = "Campo obrigatorio"): ValidatorFn<T> => {
    return (value) => {
      if (value === null || value === undefined || value === "") {
        return { required: message };
      }
      return null;
    };
  },

  minLength: (min: number, message?: string): ValidatorFn<string> => {
    return (value) => {
      if ((value ?? "").length < min) {
        return { minLength: message ?? `Minimo de ${min} caracteres` };
      }
      return null;
    };
  },

  maxLength: (max: number, message?: string): ValidatorFn<string> => {
    return (value) => {
      if ((value ?? "").length > max) {
        return { maxLength: message ?? `Maximo de ${max} caracteres` };
      }
      return null;
    };
  },

  email: (message = "Email invalido"): ValidatorFn<string> => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return (value) => {
      if (!value) return null;
      return regex.test(value) ? null : { email: message };
    };
  },

  pattern: (regex: RegExp, message = "Formato invalido"): ValidatorFn<string> => {
    return (value) => {
      if (!value) return null;
      return regex.test(value) ? null : { pattern: message };
    };
  },

  compose: <T>(validators: Array<ValidatorFn<T> | null | undefined>): ValidatorFn<T> => {
    const active = validators.filter((validator): validator is ValidatorFn<T> =>
      Boolean(validator)
    );

    return (value, control) => {
      const merged: ValidationErrors = {};
      for (const validator of active) {
        const errors = validator(value, control);
        if (errors) {
          Object.assign(merged, errors);
        }
      }

      return Object.keys(merged).length > 0 ? merged : null;
    };
  },

  zod: <T>(schema: ZodType<T>, rootKey = "zod"): ValidatorFn<T> => {
    return (value) => {
      const parsed = schema.safeParse(value);
      if (parsed.success) {
        return null;
      }

      return mapZodIssuesToErrors(parsed.error.issues, rootKey);
    };
  },

  zodAsync: <T>(schema: ZodType<T>, rootKey = "zod"): AsyncValidatorFn<T> => {
    return async (value) => {
      const parsed = await schema.safeParseAsync(value);
      if (parsed.success) {
        return null;
      }

      return mapZodIssuesToErrors(parsed.error.issues, rootKey);
    };
  },

  zodGroup: <T extends Record<string, unknown>>(
    schema: ZodType<T>,
    rootKey = "zod"
  ): ((value: T, group: FormGroup<T>) => ValidationErrors | null) => {
    return (value) => {
      const parsed = schema.safeParse(value);
      if (parsed.success) {
        return null;
      }

      return mapZodIssuesToErrors(parsed.error.issues, rootKey);
    };
  },

  composeAsync: <T>(
    validators: Array<AsyncValidatorFn<T> | null | undefined>
  ): AsyncValidatorFn<T> => {
    const active = validators.filter((validator): validator is AsyncValidatorFn<T> =>
      Boolean(validator)
    );

    return async (value, control) => {
      const merged: ValidationErrors = {};

      for (const validator of active) {
        const errors = await validator(value, control);
        if (errors) {
          Object.assign(merged, errors);
        }
      }

      return Object.keys(merged).length > 0 ? merged : null;
    };
  },

  asyncUnique: <T>(options: {
    check: (value: T) => Promise<boolean>;
    key?: string;
    message?: string;
  }): AsyncValidatorFn<T> => {
    const key = options.key ?? "notUnique";
    const message = options.message ?? "Valor ja utilizado";

    return async (value) => {
      const isUnique = await options.check(value);
      return isUnique ? null : { [key]: message };
    };
  },
};

export function createSchemaValidator<T>(
  schema: ZodType<T>,
  options: { rootKey?: string; async: true }
): AsyncValidatorFn<T>;
export function createSchemaValidator<T>(
  schema: ZodType<T>,
  options?: { rootKey?: string; async?: false }
): ValidatorFn<T>;
export function createSchemaValidator<T>(
  schema: ZodType<T>,
  options: { rootKey?: string; async?: boolean } = {}
): ValidatorFn<T> | AsyncValidatorFn<T> {
  const rootKey = options.rootKey ?? "zod";
  if (options.async) {
    return Validators.zodAsync(schema, rootKey);
  }
  return Validators.zod(schema, rootKey);
}

export function createSchemaGroupValidator<T extends Record<string, unknown>>(
  schema: ZodType<T>,
  options: { rootKey?: string } = {}
): (value: T, group: FormGroup<T>) => ValidationErrors | null {
  return Validators.zodGroup(schema, options.rootKey ?? "zod");
}

export class FormArray<T> {
  readonly controls: FormControl<T>[];
  readonly errors = signal<ValidationErrors | null>(null);

  constructor(
    controls: FormControl<T>[] = [],
    private validators: Array<(value: T[], array: FormArray<T>) => ValidationErrors | null> = []
  ) {
    this.controls = controls;
    this.validate();
  }

  at(index: number): FormControl<T> | undefined {
    return this.controls[index];
  }

  push(control: FormControl<T>): void {
    this.controls.push(control);
    this.validate();
  }

  removeAt(index: number): void {
    this.controls.splice(index, 1);
    this.validate();
  }

  clear(): void {
    this.controls.splice(0, this.controls.length);
    this.validate();
  }

  length(): number {
    return this.controls.length;
  }

  value(): T[] {
    return this.controls.map((control) => control.value());
  }

  getRawValue(): T[] {
    return this.value();
  }

  valid(): boolean {
    if (this.errors()) return false;
    return this.controls.every((control) => control.valid());
  }

  invalid(): boolean {
    return !this.valid();
  }

  validate(): ValidationErrors | null {
    this.controls.forEach((control) => control.validateSync());

    const merged: ValidationErrors = {};
    for (const validator of this.validators) {
      const result = validator(this.value(), this);
      if (result) {
        Object.assign(merged, result);
      }
    }

    const finalErrors = Object.keys(merged).length > 0 ? merged : null;
    this.errors.set(finalErrors);
    return finalErrors;
  }
}

export class NonNullableFormBuilder {
  control<T>(
    initialValue: NonNullable<T>,
    options: Omit<FormControlOptions<NonNullable<T>>, "nonNullable"> = {}
  ): FormControl<NonNullable<T>> {
    return new FormControl<NonNullable<T>>(initialValue, {
      ...options,
      nonNullable: true,
    });
  }

  group<T extends Record<string, unknown>>(
    controls: ControlsOf<T>,
    options: FormGroupOptions<T> = {}
  ): FormGroup<T> {
    return new FormGroup(controls, options);
  }

  array<T>(
    controls: Array<FormControl<NonNullable<T>>> = [],
    validators: Array<
      (value: NonNullable<T>[], array: FormArray<NonNullable<T>>) => ValidationErrors | null
    > = []
  ): FormArray<NonNullable<T>> {
    return new FormArray<NonNullable<T>>(controls, validators);
  }
}

export class FormBuilder {
  control<T>(initialValue: T, options: FormControlOptions<T> = {}): FormControl<T> {
    return new FormControl(initialValue, options);
  }

  group<T extends Record<string, unknown>>(
    controls: ControlsOf<T>,
    options: FormGroupOptions<T> = {}
  ): FormGroup<T> {
    return new FormGroup(controls, options);
  }

  array<T>(
    controls: FormControl<T>[] = [],
    validators: Array<(value: T[], array: FormArray<T>) => ValidationErrors | null> = []
  ): FormArray<T> {
    return new FormArray<T>(controls, validators);
  }

  get nonNullable(): NonNullableFormBuilder {
    return new NonNullableFormBuilder();
  }
}

export function ngForm<T extends Record<string, unknown>>(form: FormGroup<T>): NgForm<T> {
  return new NgForm(form);
}

export function ngModelGroup<T extends Record<string, unknown>>(
  name: string,
  form: FormGroup<T>
): NgModelGroup<T> {
  return new NgModelGroup(name, form);
}

export function formBuilder(): FormBuilder {
  return new FormBuilder();
}

export function bindFormAction<Input extends Record<string, unknown>, Output>(params: {
  form: FormGroup<Input>;
  action: ActionClientConfig<Input>;
}) {
  const client = createActionClient<Input, Output>(params.action);

  async function submit(): Promise<Output | null> {
    return params.form.submit(async (value) => {
      return await client.execute(value);
    });
  }

  return {
    submit,
    reset: (value?: Partial<Input>) => {
      params.form.reset(value);
    },
    pending: client.pending,
    error: client.error,
    data: client.data,
    formState: computed<FormSubmitState<Output>>(() => ({
      submitting: params.form.submitting() || client.pending(),
      submitted: params.form.submitted(),
      submitCount: params.form.submitCount(),
      success: params.form.submitSuccess() && !client.error(),
      error: client.error() ?? params.form.submitError(),
      lastResult: (params.form.lastSubmitResult() as Output | null) ?? client.data(),
    })),
  };
}

export const FormErrors = {
  control(control: FormControl<unknown>, key?: string): string[] {
    const errors = control.errors() ?? {};
    const entries = Object.entries(errors);
    if (key) {
      const value = errors[key];
      return value ? [String(value)] : [];
    }

    return entries.map(([, value]) => String(value));
  },

  group<T extends Record<string, unknown>>(group: FormGroup<T>, key?: string): string[] {
    const errors = group.errors() ?? {};
    if (key) {
      const value = errors[key];
      return value ? [String(value)] : [];
    }

    return Object.values(errors).map((value) => String(value));
  },

  nested<T extends Record<string, unknown>>(group: FormGroup<T>, path: string): string[] {
    const errors = group.errors() ?? {};
    const keys = Object.keys(errors).filter((key) => key === path || key.startsWith(`${path}.`));
    return keys.map((key) => String(errors[key]));
  },

  first(values: string[]): string | null {
    return values[0] ?? null;
  },
};

function mergeValidationErrors(
  left: ValidationErrors | null,
  right: ValidationErrors | null
): ValidationErrors | null {
  const merged: ValidationErrors = {
    ...(left ?? {}),
    ...(right ?? {}),
  };

  return Object.keys(merged).length > 0 ? merged : null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  if (timeoutMs <= 0) {
    return promise;
  }

  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}
