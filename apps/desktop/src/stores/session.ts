import { acceptHMRUpdate, defineStore } from "pinia";
import { ref, shallowRef } from "vue";
import type { PineAgentEvent, PineJsonValue } from "@/shared/agent";
import type {
  PineSessionSummary,
  PineTextMessage,
  PineToolCall,
  SessionSearchResult,
} from "@/shared/sessions";

export interface PineTranscriptMessage extends PineTextMessage {
  status: "complete" | "streaming";
  thinkingStatus?: "complete" | "streaming";
  thinkingStartedAt?: number;
}

function messageRole(value: PineJsonValue): "assistant" | "user" | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value.role === "assistant" || value.role === "user"
    ? value.role
    : null;
}

function messageText(value: PineJsonValue): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .flatMap((part) => {
      if (typeof part !== "object" || part === null || Array.isArray(part)) {
        return [];
      }
      return typeof part.text === "string" ? [part.text] : [];
    })
    .join("\n");
}

function messageThinking(value: PineJsonValue): string {
  if (!Array.isArray(value)) return "";
  return value
    .flatMap((part) => {
      if (typeof part !== "object" || part === null || Array.isArray(part)) {
        return [];
      }
      return typeof part.thinking === "string" ? [part.thinking] : [];
    })
    .join("\n");
}

function messageToolCalls(value: PineJsonValue): PineToolCall[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((part) => {
    if (
      typeof part !== "object" ||
      part === null ||
      Array.isArray(part) ||
      part.type !== "toolCall" ||
      typeof part.id !== "string" ||
      typeof part.name !== "string"
    ) {
      return [];
    }
    return [
      {
        id: part.id,
        name: part.name,
        status: "pending" as const,
        ...(part.arguments !== undefined ? { input: part.arguments } : {}),
      },
    ];
  });
}

function mergeToolCalls(
  content: PineJsonValue,
  previous: readonly PineToolCall[] = [],
): PineToolCall[] | undefined {
  const parsed = messageToolCalls(content);
  if (parsed.length === 0)
    return previous.length > 0 ? [...previous] : undefined;
  return parsed.map((toolCall) => {
    const existing = previous.find((candidate) => candidate.id === toolCall.id);
    return existing ? { ...toolCall, ...existing } : toolCall;
  });
}

function messageContent(value: PineJsonValue): PineJsonValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }
  return value.content ?? null;
}

function messageCreatedAt(value: PineJsonValue): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return new Date().toISOString();
  }
  return typeof value.timestamp === "number"
    ? new Date(value.timestamp).toISOString()
    : new Date().toISOString();
}

function eventUpdateType(value: PineJsonValue): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return typeof value.type === "string" ? value.type : undefined;
}

export const useSessionStore = defineStore("session", () => {
  const activeSession = shallowRef<PineSessionSummary | null>(null);
  const messages = ref<PineTranscriptMessage[]>([]);
  const recentSessions = shallowRef<SessionSearchResult[]>([]);
  const searchResults = shallowRef<SessionSearchResult[]>([]);
  const isLoadingRecent = ref(false);
  const isSearching = ref(false);
  const isLoadingMessages = ref(false);
  const isRunning = ref(false);
  const hasEarlierMessages = ref(false);
  const nextBefore = ref<string | undefined>();
  let currentSessionId: string | null = null;
  let stopAgentEvents: (() => void) | null = null;
  let searchSequence = 0;
  let recentSequence = 0;
  let activationSequence = 0;
  let isStartingPrompt = false;

  function mergeSessionSummary(
    session: PineSessionSummary,
    previous?: PineSessionSummary,
  ): PineSessionSummary {
    return {
      ...previous,
      ...session,
      ...(session.name || previous?.name
        ? { name: session.name || previous?.name }
        : {}),
      ...(session.preview || previous?.preview
        ? { preview: session.preview || previous?.preview }
        : {}),
    };
  }

  function upsertRecentSession(
    session: PineSessionSummary,
  ): SessionSearchResult {
    recentSequence += 1;
    isLoadingRecent.value = false;
    const previous = recentSessions.value.find(
      (candidate) => candidate.id === session.id,
    );
    const nextSession = mergeSessionSummary(session, previous);
    recentSessions.value = [
      nextSession,
      ...recentSessions.value.filter(
        (candidate) => candidate.id !== session.id,
      ),
    ].sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() -
        new Date(left.updatedAt).getTime(),
    );
    return nextSession;
  }

  async function loadRecent(): Promise<SessionSearchResult[]> {
    const sequence = ++recentSequence;
    isLoadingRecent.value = true;

    try {
      const result = await window.pine.searchSessions({ query: "" });
      if (sequence === recentSequence) recentSessions.value = result.sessions;
      return result.sessions;
    } finally {
      if (sequence === recentSequence) isLoadingRecent.value = false;
    }
  }

  async function search(query: string): Promise<SessionSearchResult[]> {
    const sequence = ++searchSequence;
    isSearching.value = true;

    try {
      const sessions = query.trim()
        ? (await window.pine.searchSessions({ query })).sessions
        : await loadRecent();
      if (sequence === searchSequence) searchResults.value = sessions;
      return sessions;
    } finally {
      if (sequence === searchSequence) isSearching.value = false;
    }
  }

  async function resume(sessionId: string): Promise<PineSessionSummary> {
    const sequence = ++activationSequence;
    currentSessionId = sessionId;
    isStartingPrompt = false;
    activeSession.value = null;
    messages.value = [];
    hasEarlierMessages.value = false;
    nextBefore.value = undefined;
    isLoadingMessages.value = true;

    try {
      const result = await window.pine.resumeSession({ sessionId });
      const session = upsertRecentSession(result.session);
      if (sequence !== activationSequence) return result.session;

      activeSession.value = session;
      currentSessionId = session.id;
      await loadInitialMessages(session.id);
      return session;
    } catch (error) {
      if (sequence === activationSequence) {
        currentSessionId = null;
        isLoadingMessages.value = false;
      }
      throw error;
    }
  }

  async function loadInitialMessages(sessionId: string): Promise<void> {
    isLoadingMessages.value = true;
    try {
      const result = await window.pine.loadSessionMessages({
        sessionId,
        limit: 50,
      });
      if (currentSessionId !== sessionId) return;
      messages.value = result.messages.map((message) => ({
        ...message,
        status: "complete",
        ...(message.thinking ? { thinkingStatus: "complete" as const } : {}),
      }));
      hasEarlierMessages.value = result.hasMore;
      nextBefore.value = result.nextBefore;
    } finally {
      if (currentSessionId === sessionId) isLoadingMessages.value = false;
    }
  }

  async function loadEarlierMessages(): Promise<void> {
    if (
      !currentSessionId ||
      !hasEarlierMessages.value ||
      !nextBefore.value ||
      isLoadingMessages.value
    ) {
      return;
    }

    const sessionId = currentSessionId;
    isLoadingMessages.value = true;
    try {
      const result = await window.pine.loadSessionMessages({
        before: nextBefore.value,
        sessionId,
        limit: 50,
      });
      if (currentSessionId !== sessionId) return;
      messages.value = [
        ...result.messages.map((message): PineTranscriptMessage => ({
          ...message,
          status: "complete",
          ...(message.thinking ? { thinkingStatus: "complete" as const } : {}),
        })),
        ...messages.value,
      ];
      hasEarlierMessages.value = result.hasMore;
      nextBefore.value = result.nextBefore;
    } finally {
      if (currentSessionId === sessionId) isLoadingMessages.value = false;
    }
  }

  async function prompt(
    message: string,
    sessionId?: string,
  ): Promise<PineSessionSummary> {
    const sequence = ++activationSequence;
    currentSessionId = sessionId ?? null;
    isStartingPrompt = sessionId === undefined;
    isRunning.value = true;
    try {
      const result = await window.pine.promptSession({
        message,
        target: sessionId ? { kind: "session", sessionId } : { kind: "new" },
      });
      const session = {
        ...result.session,
        preview: result.session.preview || message,
      };
      const nextSession = upsertRecentSession(session);
      if (sequence !== activationSequence) return nextSession;

      isStartingPrompt = false;
      activeSession.value = nextSession;
      currentSessionId = nextSession.id;
      return nextSession;
    } catch (error) {
      if (sequence === activationSequence) {
        isStartingPrompt = false;
        isRunning.value = false;
      }
      throw error;
    }
  }

  async function abort(): Promise<void> {
    await window.pine.abortSession();
  }

  async function deleteSession(sessionId: string): Promise<boolean> {
    const { deleted } = await window.pine.deleteSession({ sessionId });
    if (!deleted) return false;

    recentSequence += 1;
    isLoadingRecent.value = false;
    recentSessions.value = recentSessions.value.filter(
      (session) => session.id !== sessionId,
    );
    searchResults.value = searchResults.value.filter(
      (session) => session.id !== sessionId,
    );
    if (currentSessionId === sessionId) startDraft();
    return true;
  }

  function handleAgentEvent(event: PineAgentEvent): void {
    if (event.type === "run-state") {
      if (
        event.state === "running" &&
        isStartingPrompt &&
        currentSessionId === null
      ) {
        currentSessionId = event.sessionId;
      }
      if (currentSessionId !== event.sessionId) return;
      isRunning.value = event.state === "running" || event.state === "aborting";
      return;
    }
    if (event.type === "session-updated") {
      if (currentSessionId !== event.sessionId) return;
      const previous =
        activeSession.value?.id === event.sessionId
          ? activeSession.value
          : recentSessions.value.find(
              (session) => session.id === event.sessionId,
            );
      const summary = mergeSessionSummary(event.summary, previous);
      activeSession.value = summary;
      upsertRecentSession(summary);
      return;
    }
    if (
      (event.type === "tool-start" ||
        event.type === "tool-update" ||
        event.type === "tool-end") &&
      currentSessionId === event.sessionId
    ) {
      const now = Date.now();
      let messageIndex = messages.value.findIndex((message) =>
        message.toolCalls?.some((toolCall) => toolCall.id === event.toolCallId),
      );
      if (messageIndex < 0) {
        messages.value.push({
          createdAt: new Date(now).toISOString(),
          id: `tool-${event.toolCallId}`,
          role: "assistant",
          status: "complete",
          text: "",
          toolCalls: [
            {
              id: event.toolCallId,
              name: event.toolName,
              status: "pending",
            },
          ],
        });
        messageIndex = messages.value.length - 1;
      }

      const message = messages.value[messageIndex];
      const toolCalls = (message.toolCalls ?? []).map((toolCall) => {
        if (toolCall.id !== event.toolCallId) return toolCall;
        const startedAt =
          toolCall.startedAt ??
          (event.type === "tool-start"
            ? new Date(now).toISOString()
            : undefined);
        return {
          ...toolCall,
          name: event.toolName,
          status:
            event.type === "tool-end"
              ? event.isError
                ? ("error" as const)
                : ("complete" as const)
              : ("running" as const),
          ...(event.type === "tool-start" && event.payload !== undefined
            ? { input: event.payload }
            : {}),
          ...(event.type !== "tool-start" && event.payload !== undefined
            ? { output: event.payload }
            : {}),
          ...(startedAt ? { startedAt } : {}),
          ...(event.type === "tool-end" && startedAt
            ? {
                durationMs: Math.max(0, now - new Date(startedAt).getTime()),
              }
            : {}),
        };
      });
      messages.value[messageIndex] = { ...message, toolCalls };
      return;
    }
    if (
      (event.type !== "message-start" &&
        event.type !== "message-update" &&
        event.type !== "message-end") ||
      currentSessionId !== event.sessionId
    ) {
      return;
    }

    const role = messageRole(event.message);
    if (!role) return;
    const content = messageContent(event.message);
    const thinking = messageThinking(content);
    const previous = messages.value.find(
      (message) => message.id === event.messageId,
    );
    const now = Date.now();
    const thinkingStartedAt = thinking
      ? (previous?.thinkingStartedAt ?? now)
      : undefined;
    const updateType =
      event.type === "message-update"
        ? eventUpdateType(event.update)
        : undefined;
    const thinkingEnded =
      event.type === "message-end" || updateType === "thinking_end";
    const thinkingStatus = thinking
      ? thinkingEnded || previous?.thinkingStatus === "complete"
        ? ("complete" as const)
        : ("streaming" as const)
      : undefined;
    const toolCalls = mergeToolCalls(content, previous?.toolCalls);
    const nextMessage: PineTranscriptMessage = {
      createdAt: messageCreatedAt(event.message),
      id: event.messageId,
      role,
      status: event.type === "message-end" ? "complete" : "streaming",
      text: messageText(content),
      ...(thinking ? { thinking } : {}),
      ...(thinkingStatus ? { thinkingStatus } : {}),
      ...(thinkingStartedAt ? { thinkingStartedAt } : {}),
      ...(thinkingStartedAt && thinkingStatus === "complete"
        ? {
            thinkingDurationMs:
              previous?.thinkingDurationMs ??
              Math.max(0, now - thinkingStartedAt),
          }
        : {}),
      ...(toolCalls ? { toolCalls } : {}),
    };
    const index = messages.value.findIndex(
      (message) => message.id === event.messageId,
    );
    if (index < 0) messages.value.push(nextMessage);
    else messages.value[index] = nextMessage;
  }

  function connectAgentEvents(): void {
    if (stopAgentEvents || !window.pine.onSessionEvent) return;
    stopAgentEvents = window.pine.onSessionEvent(handleAgentEvent);
  }

  function startDraft(): void {
    activationSequence += 1;
    isStartingPrompt = false;
    activeSession.value = null;
    currentSessionId = null;
    messages.value = [];
    hasEarlierMessages.value = false;
    nextBefore.value = undefined;
    isRunning.value = false;
    isLoadingMessages.value = false;
  }

  function reset(): void {
    activationSequence += 1;
    searchSequence += 1;
    recentSequence += 1;
    activeSession.value = null;
    currentSessionId = null;
    messages.value = [];
    recentSessions.value = [];
    searchResults.value = [];
    isLoadingRecent.value = false;
    isSearching.value = false;
    isLoadingMessages.value = false;
    isRunning.value = false;
    isStartingPrompt = false;
    hasEarlierMessages.value = false;
    nextBefore.value = undefined;
  }

  return {
    activeSession,
    abort,
    connectAgentEvents,
    deleteSession,
    hasEarlierMessages,
    isLoadingRecent,
    isLoadingMessages,
    isRunning,
    isSearching,
    loadRecent,
    loadEarlierMessages,
    messages,
    prompt,
    recentSessions,
    reset,
    resume,
    search,
    searchResults,
    startDraft,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSessionStore, import.meta.hot));
}
