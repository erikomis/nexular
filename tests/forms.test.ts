import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  FormControl,
  FormArray,
  FormErrors,
  Validators,
  createSchemaValidator,
  createSchemaGroupValidator,
  formBuilder,
  bindFormAction,
  ngForm,
  ngModelGroup,
} from "../src/app/core/forms";
import { renderTemplate } from "../src/app/core/renderer";

describe("Forms - FormControl", () => {
  it("should validate required and minlength", () => {
    const control = new FormControl("", {
      validators: [Validators.required(), Validators.minLength(3)],
    });

    expect(control.invalid()).toBe(true);
    expect(control.errors()?.required).toBeDefined();

    control.setValue("ab");
    expect(control.errors()?.minLength).toBeDefined();

    control.setValue("abcd");
    expect(control.valid()).toBe(true);
    expect(control.errors()).toBeNull();
  });

  it("should support async validators", async () => {
    const control = new FormControl("test", {
      asyncValidators: [
        async (value) => (value === "blocked" ? { blocked: "Valor bloqueado" } : null),
      ],
    });

    control.setValue("blocked");
    const errors = await control.updateValueAndValidity();
    expect(errors?.blocked).toBeDefined();
    expect(control.invalid()).toBe(true);
  });

  it("should debounce and deduplicate async validators", async () => {
    const checker = vi.fn(async (value: string) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return value === "taken" ? { taken: "Ja existe" } : null;
    });

    const control = new FormControl("", {
      asyncValidators: [checker],
      asyncValidation: {
        debounceMs: 10,
        distinct: true,
      },
    });

    control.setValue("taken");
    await control.updateValueAndValidity();
    await control.updateValueAndValidity();

    expect(checker).toHaveBeenCalledTimes(1);
    expect(control.errors()?.taken).toBe("Ja existe");
  });

  it("should compose async validators", async () => {
    const asyncValidator = Validators.composeAsync<string>([
      async (value) => (value.includes("x") ? { hasX: "Contem x" } : null),
      async (value) => (value.length < 3 ? { short: "Curto" } : null),
    ]);

    const control = new FormControl("x", {
      asyncValidators: [asyncValidator],
    });

    await control.updateValueAndValidity();
    expect(control.errors()?.hasX).toBe("Contem x");
    expect(control.errors()?.short).toBe("Curto");
  });

  it("should validate on blur when updateOn is blur", () => {
    const control = new FormControl("", {
      validators: [Validators.required()],
      updateOn: "blur",
    });

    control.setValue("");
    // updateOn=blur should defer sync validation until touched/blur.
    control.setErrors(null);
    control.markAsTouched();
    expect(control.errors()?.required).toBeDefined();
  });

  it("should support composed validators", () => {
    const composed = Validators.compose<string>([
      Validators.required("required"),
      Validators.minLength(3, "min"),
    ]);

    const control = new FormControl("", { validators: [composed] });
    expect(control.errors()?.required).toBe("required");

    control.setValue("ab");
    expect(control.errors()?.minLength).toBe("min");
  });

  it("should validate with zod-backed validator", () => {
    const schema = z.string().min(3, "Minimo de 3 caracteres");
    const control = new FormControl("", {
      validators: [Validators.zod(schema)],
    });

    expect(control.invalid()).toBe(true);
    expect(control.errors()?.zod).toBe("Minimo de 3 caracteres");

    control.setValue("abcd");
    expect(control.valid()).toBe(true);
    expect(control.errors()).toBeNull();
  });

  it("should validate with createSchemaValidator helper", () => {
    const schemaValidator = createSchemaValidator(z.string().min(2, "curto"));
    const control = new FormControl("", { validators: [schemaValidator] });

    expect(control.invalid()).toBe(true);
    expect(control.errors()?.zod).toBe("curto");
  });

  it("should validate with async createSchemaValidator helper", async () => {
    const schemaValidator = createSchemaValidator(z.string().min(4, "async curto"), {
      async: true,
      rootKey: "schema",
    });
    const control = new FormControl("ab", { asyncValidators: [schemaValidator] });

    const errors = await control.updateValueAndValidity();
    expect(errors?.schema).toBe("async curto");
  });
});

describe("Forms - FormGroup", () => {
  it("should aggregate control validity", () => {
    const fb = formBuilder();
    const group = fb.group({
      name: fb.control("", { validators: [Validators.required()] }),
      email: fb.control("", { validators: [Validators.email()] }),
    });

    expect(group.invalid()).toBe(true);

    group.patchValue({ name: "Erik", email: "erik@example.com" });
    group.validate();

    expect(group.valid()).toBe(true);
    expect(group.value().name).toBe("Erik");
  });

  it("should run submit callback only when valid", async () => {
    const fb = formBuilder();
    const group = fb.group({
      name: fb.control("", { validators: [Validators.required()] }),
      email: fb.control("", { validators: [Validators.required(), Validators.email()] }),
    });

    const onValid = vi.fn(async () => ({ ok: true }));
    const invalidResult = await group.submit(onValid);
    expect(invalidResult).toBeNull();
    expect(onValid).not.toHaveBeenCalled();

    group.patchValue({ name: "Erik", email: "erik@example.com" });
    const validResult = await group.submit(onValid);
    expect(onValid).toHaveBeenCalledTimes(1);
    expect(validResult).toEqual({ ok: true });
    expect(group.submitState().submitted).toBe(true);
    expect(group.submitState().success).toBe(true);
  });

  it("should validate group value with zod-backed validator", () => {
    const fb = formBuilder();
    const schema = z.object({
      name: z.string().min(2, "Nome curto"),
      email: z.string().email("Email invalido"),
    });

    const group = fb.group(
      {
        name: fb.control(""),
        email: fb.control(""),
      },
      {
        validators: [Validators.zodGroup(schema)],
      }
    );

    group.patchValue({ name: "A", email: "x" });
    group.validate();

    expect(group.invalid()).toBe(true);
    expect(group.errors()?.name).toBe("Nome curto");
    expect(group.errors()?.email).toBe("Email invalido");

    group.patchValue({ name: "Erik", email: "erik@example.com" });
    group.validate();
    expect(group.valid()).toBe(true);
    expect(group.errors()).toBeNull();
  });

  it("should validate group with createSchemaGroupValidator helper", () => {
    const fb = formBuilder();
    const schema = z.object({
      city: z.string().min(3, "Cidade invalida"),
    });

    const group = fb.group(
      {
        city: fb.control("RJ"),
      },
      {
        validators: [createSchemaGroupValidator(schema, { rootKey: "groupSchema" })],
      }
    );

    group.validate();
    expect(group.invalid()).toBe(true);
    expect(group.errors()?.city).toBe("Cidade invalida");

    group.patchValue({ city: "Recife" });
    group.validate();
    expect(group.valid()).toBe(true);
  });

  it("should expose nested group errors through helpers", () => {
    const fb = formBuilder();
    const schema = z.object({
      profile: z.object({
        city: z.string().min(3, "Cidade curta"),
      }),
    });

    const group = fb.group(
      {
        profile: fb.control({ city: "RJ" }),
      },
      {
        validators: [createSchemaGroupValidator(schema)],
      }
    );

    group.validate();

    const nested = FormErrors.nested(group, "profile.city");
    expect(nested).toEqual(["Cidade curta"]);
    expect(FormErrors.first(nested)).toBe("Cidade curta");
  });
});

describe("Forms - Action binding", () => {
  it("should prevent action submit when form is invalid", async () => {
    const fb = formBuilder();
    const form = fb.group({
      name: fb.control("", { validators: [Validators.required()] }),
      email: fb.control("", { validators: [Validators.required(), Validators.email()] }),
    });

    const bound = bindFormAction({
      form,
      action: {
        path: "/forms",
        action: "submitContact",
      },
    });

    const result = await bound.submit();
    expect(result).toBeNull();
    expect(bound.formState().submitted).toBe(true);
    expect(bound.formState().error).toBe("Form invalid");
  });

  it("should provide declarative reset and state when submit succeeds", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, result: { ok: true } }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const fb = formBuilder();
    const form = fb.group({
      name: fb.control("Erik", { validators: [Validators.required()] }),
    });

    const bound = bindFormAction<{ name: string }, { ok: boolean }>({
      form,
      action: {
        path: "/forms",
        action: "submitContact",
      },
    });

    const result = await bound.submit();
    expect(result?.ok).toBe(true);
    expect(bound.formState().success).toBe(true);

    bound.reset({ name: "" });
    expect(form.get("name").value()).toBe("");
  });
});

describe("Forms - Angular modern patterns", () => {
  it("should provide nonNullable form builder", () => {
    const fb = formBuilder().nonNullable;
    const control = fb.control("abc");

    expect(control.value()).toBe("abc");
    expect(() => control.setValue(null as unknown as string)).toThrow();
  });

  it("should manage FormArray values", () => {
    const fb = formBuilder();
    const arr = new FormArray<string>([
      fb.control("a", { validators: [Validators.required()] }),
      fb.control("b", { validators: [Validators.required()] }),
    ]);

    expect(arr.length()).toBe(2);
    expect(arr.value()).toEqual(["a", "b"]);

    arr.push(fb.control("c"));
    expect(arr.value()).toEqual(["a", "b", "c"]);

    arr.removeAt(1);
    expect(arr.value()).toEqual(["a", "c"]);
  });

  it("should expose NgForm submitted lifecycle", async () => {
    const fb = formBuilder();
    const formGroup = fb.group({
      name: fb.control("Erik", { validators: [Validators.required()] }),
    });
    const form = ngForm(formGroup);

    const result = await form.onSubmit(async (value) => ({ ok: true, value }));

    expect(form.submitted()).toBe(true);
    expect(form.valid()).toBe(true);
    expect(result?.ok).toBe(true);

    form.resetForm({ name: "" });
    expect(form.submitted()).toBe(false);
  });

  it("should emit NgForm valueChanges and statusChanges", () => {
    const fb = formBuilder();
    const formGroup = fb.group({
      name: fb.control("", { validators: [Validators.required()] }),
    });
    const form = ngForm(formGroup);

    const valueEvents: string[] = [];
    const statusEvents: string[] = [];

    const unsubscribeValue = form.valueChanges.subscribe(() => {
      valueEvents.push(form.value().name);
    });
    const unsubscribeStatus = form.statusChanges.subscribe(() => {
      statusEvents.push(form.statusChanges());
    });

    formGroup.get("name").setValue("Erik");
    formGroup.get("name").setValue("");

    expect(valueEvents).toContain("Erik");
    expect(statusEvents).toContain("VALID");
    expect(statusEvents).toContain("INVALID");

    unsubscribeValue();
    unsubscribeStatus();
    form.destroy();
  });

  it("should expose NgModelGroup facade", () => {
    const fb = formBuilder();
    const group = fb.group({
      city: fb.control("Sao Paulo", { validators: [Validators.required()] }),
    });
    const modelGroup = ngModelGroup("address", group);

    expect(modelGroup.name).toBe("address");
    expect(modelGroup.value().city).toBe("Sao Paulo");
    expect(modelGroup.valid()).toBe(true);
  });

  it("should rewrite ngModel paths inside ngModelGroup", () => {
    const template = `
      <form>
        <section ngModelGroup="preview">
          <input [(ngModel)]="name" />
          <input [(ngModel)]="preview.email" />
        </section>
      </form>
    `;

    const html = renderTemplate(template, {
      preview: {
        name: "Erik",
        email: "erik@example.com",
      },
    });

    expect(html).toContain('data-nx-model-group="preview"');
    expect(html).toContain('data-nx-model="preview.name"');
    expect(html).toContain('data-nx-model="preview.email"');
  });
});
