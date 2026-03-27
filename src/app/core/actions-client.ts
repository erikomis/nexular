import { signal, type Signal } from "./signals";

export type ActionRequest<Input> = {
  path: string;
  action: string;
  input: Input;
  locale?: string;
};

export type ActionSuccess<Output> = {
  ok: true;
  result: Output;
};

export type ActionFailure = {
  ok: false;
  error: string;
};

export type ActionResponse<Output> = ActionSuccess<Output> | ActionFailure;

export type ActionClientState<Output> = {
  pending: Signal<boolean>;
  error: Signal<string | null>;
  data: Signal<Output | null>;
};

export type ActionClientConfig<Input> = {
  path: string;
  action: string;
  locale?: string;
  endpoint?: string;
  optimistic?: (input: Input) => void | (() => void);
};

export async function invokeServerAction<Input, Output>(
  payload: ActionRequest<Input>,
  endpoint = "/_nexular/action",
): Promise<Output> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const json = (await response.json()) as ActionResponse<Output>;

  if (!response.ok || !json.ok) {
    throw new Error(json.ok ? "Unknown action error" : json.error);
  }

  return json.result;
}

export function createActionClient<Input, Output>(
  config: ActionClientConfig<Input>,
): ActionClientState<Output> & { execute: (input: Input) => Promise<Output> } {
  const pending = signal(false);
  const error = signal<string | null>(null);
  const data = signal<Output | null>(null);

  async function execute(input: Input): Promise<Output> {
    pending.set(true);
    error.set(null);

    let rollback: void | (() => void) = undefined;

    try {
      rollback = config.optimistic?.(input);

      const result = await invokeServerAction<Input, Output>(
        {
          path: config.path,
          action: config.action,
          input,
          locale: config.locale,
        },
        config.endpoint,
      );

      data.set(result);
      return result;
    } catch (err) {
      if (typeof rollback === "function") {
        rollback();
      }

      error.set(err instanceof Error ? err.message : "Action failed");
      throw err;
    } finally {
      pending.set(false);
    }
  }

  return {
    pending,
    error,
    data,
    execute,
  };
}
