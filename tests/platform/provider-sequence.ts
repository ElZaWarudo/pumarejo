import type { W3cClient } from "./w3c-client.js";

export type ProviderMode = "visible" | "background";

export type ProviderEvidence = {
  mode: ProviderMode;
  commands: string[];
  windowPresented: boolean;
  screenshot: boolean;
  actions: boolean;
};

function valueOf(body: Record<string, unknown>): unknown {
  return body.value;
}

function requireScriptResult(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const value = valueOf(body);
  if (!value || typeof value !== "object") {
    throw new Error("provider returned no script result");
  }
  return value as Record<string, unknown>;
}

async function waitForFixtureDocument(
  client: W3cClient,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 15_000;
  let lastTitle: unknown;
  let lastReady: unknown;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      lastTitle = valueOf(await client.command("GET", "/title"));
      const initial = requireScriptResult(
        await client.command("POST", "/execute/sync", {
          script:
            "return { ready: document.readyState, active: document.activeElement?.id ?? null }",
          args: [],
        }),
      );
      lastReady = initial.ready;
      if (
        lastTitle === "Isolated control fixture" &&
        lastReady === "complete"
      ) {
        return initial;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (lastError) throw lastError;
  throw new Error(
    `fixture document did not become ready (title=${String(lastTitle)}, ready=${String(lastReady)})`,
  );
}

export async function runProviderSequence(
  mode: ProviderMode,
  endpoint?: { port: number; nonce: string },
): Promise<ProviderEvidence> {
  const rawPort =
    endpoint?.port.toString() ?? process.env.PUMAREJO_PROVIDER_PORT;
  if (!rawPort) {
    throw new Error(
      "PUMAREJO_PROVIDER_PORT is required for live provider proof",
    );
  }
  const nonce = endpoint?.nonce ?? process.env.PUMAREJO_SESSION_NONCE;
  if (!nonce) {
    throw new Error(
      "PUMAREJO_SESSION_NONCE is required for authenticated provider proof",
    );
  }
  const { W3cClient } = await import("./w3c-client.js");
  const client = new W3cClient(Number(rawPort), "127.0.0.1", nonce);
  const commands: string[] = [];
  await client.status();
  commands.push("status");
  await client.newSession();
  commands.push("session");
  try {
    const handles = valueOf(await client.command("GET", "/window/handles"));
    if (!Array.isArray(handles) || handles.length === 0) {
      throw new Error("provider returned no window handles");
    }
    commands.push("window");
    await waitForFixtureDocument(client);
    commands.push("script");
    const screenshot = await client.command("GET", "/screenshot");
    commands.push("screenshot");
    const screenshotValue = screenshot.value;
    if (typeof screenshotValue !== "string") {
      throw new Error("provider returned no screenshot payload");
    }
    const png = Buffer.from(screenshotValue, "base64");
    if (!png.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
      throw new Error("provider screenshot is not a PNG");
    }
    const found = await client.command("POST", "/element", {
      using: "css selector",
      value: "#focus-probe",
    });
    const elementValue = found.value as Record<string, unknown> | undefined;
    const elementId = String(
      elementValue?.["element-6066-11e4-a52e-4f735466cecf"] ??
        elementValue?.ELEMENT ??
        "",
    );
    if (!elementId) throw new Error("provider returned no focus-probe element");
    await client.command(
      "POST",
      `/element/${encodeURIComponent(elementId)}/click`,
    );
    const afterClick = requireScriptResult(
      await client.command("POST", "/execute/sync", {
        script:
          "return { active: document.activeElement?.id ?? null, status: document.querySelector('#status')?.textContent ?? null }",
        args: [],
      }),
    );
    if (
      afterClick.active !== "focus-probe" ||
      afterClick.status !== "Focused: focus-probe"
    ) {
      throw new Error(
        `click did not produce the expected focus effect: ${JSON.stringify(afterClick)}`,
      );
    }
    commands.push("click");
    const input = await client.command("POST", "/element", {
      using: "css selector",
      value: "#name",
    });
    const inputValue = input.value as Record<string, unknown> | undefined;
    const inputId = String(
      inputValue?.["element-6066-11e4-a52e-4f735466cecf"] ??
        inputValue?.ELEMENT ??
        "",
    );
    if (!inputId) throw new Error("provider returned no name element");
    await client.command(
      "POST",
      `/element/${encodeURIComponent(inputId)}/click`,
    );
    await client.command(
      "POST",
      `/element/${encodeURIComponent(inputId)}/value`,
      {
        text: "provider-proof",
        value: [
          "p",
          "r",
          "o",
          "v",
          "i",
          "d",
          "e",
          "r",
          "-",
          "p",
          "r",
          "o",
          "o",
          "f",
        ],
      },
    );
    commands.push("type");
    const afterType = requireScriptResult(
      await client.command("POST", "/execute/sync", {
        script:
          "return { value: document.querySelector('#name')?.value ?? null, active: document.activeElement?.id ?? null }",
        args: [],
      }),
    );
    if (afterType.value !== "provider-proof" || afterType.active !== "name") {
      throw new Error(
        `typing did not update/focus the fixture input: ${JSON.stringify(afterType)}`,
      );
    }
    await client.command("POST", "/actions", {
      actions: [
        {
          type: "key",
          id: "proof",
          actions: [
            { type: "keyDown", value: "\uE007" },
            { type: "keyUp", value: "\uE007" },
          ],
        },
      ],
    });
    commands.push("key");
    const afterSubmit = requireScriptResult(
      await client.command("POST", "/execute/sync", {
        script:
          "return { status: document.querySelector('#status')?.textContent ?? null, result: document.querySelector('#result')?.textContent ?? null }",
        args: [],
      }),
    );
    if (
      afterSubmit.status !== "Applied for provider-proof" ||
      afterSubmit.result !== "Applied for provider-proof"
    ) {
      throw new Error(
        `Enter action did not submit the fixture form: ${JSON.stringify(afterSubmit)}`,
      );
    }
    return {
      mode,
      commands: [...commands, "delete-session"],
      windowPresented: process.env.PUMAREJO_WINDOW_PRESENTED === "1",
      screenshot: true,
      actions: true,
    };
  } finally {
    await client.deleteSession();
  }
}

export async function runOwnedProviderSequence(
  mode: ProviderMode,
): Promise<ProviderEvidence> {
  const { launchOwnedProvider } = await import("./owned-launch.js");
  const { findFreeLoopbackPort, nativeLaunchDependencies } = await import(
    "./native-runtime.js"
  );
  const launch = await launchOwnedProvider(
    { mode, providerPort: await findFreeLoopbackPort() },
    nativeLaunchDependencies,
  );
  try {
    const bypass = await fetch(
      `http://127.0.0.1:${launch.lease.providerPort}/status`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (bypass.status !== 401) {
      throw new Error(
        `provider accepted an unauthenticated direct request (${bypass.status})`,
      );
    }
    return await runProviderSequence(mode, {
      port: launch.lease.proxyPort,
      nonce: launch.lease.nonce,
    });
  } finally {
    await launch.cleanup();
  }
}
