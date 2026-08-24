import type {
  AgentWorkerMessage,
  AgentWorkerRequest,
  AgentWorkerResult,
} from "./agent/protocol";
import { toErrorMessage } from "./agent/protocol";
import { PineAgentRuntime } from "./agent/runtime";

const parentPort = process.parentPort;
if (!parentPort)
  throw new Error("Pine agent must run as an Electron utility process.");

const runtime = new PineAgentRuntime({
  emit: (event) => parentPort.postMessage({ type: "event", event }),
});

async function handleRequest(request: AgentWorkerRequest): Promise<void> {
  let result: AgentWorkerResult;
  switch (request.type) {
    case "session:create":
      result = await runtime.createSession(request.location);
      break;
    case "session:open":
      result = await runtime.openSession(request.location, request.sessionFile);
      break;
    case "session:prompt":
      result = await runtime.prompt(
        request.sessionId,
        request.message,
        request.streamingBehavior,
      );
      break;
    case "session:abort":
      result = await runtime.abort(request.sessionId);
      break;
    case "session:dispose":
      result = await runtime.disposeSession(request.sessionId);
      break;
    case "runtime:dispose":
      result = await runtime.dispose();
      break;
  }

  parentPort.postMessage({
    type: "response",
    id: request.id,
    ok: true,
    result,
  } satisfies AgentWorkerMessage);
}

parentPort.on("message", (event) => {
  const request = event.data as AgentWorkerRequest;
  void handleRequest(request).catch((error: unknown) => {
    parentPort.postMessage({
      type: "response",
      id: request.id,
      ok: false,
      error: { message: toErrorMessage(error) },
    } satisfies AgentWorkerMessage);
  });
});

parentPort.postMessage({ type: "ready" } satisfies AgentWorkerMessage);
