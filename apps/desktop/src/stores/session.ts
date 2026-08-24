import { acceptHMRUpdate, defineStore } from "pinia";
import { ref, shallowRef } from "vue";
import type { PineAgentEvent, PineJsonValue } from "@/shared/agent";
import type {
  PineSessionSummary,
  PineTextMessage,
  SessionSearchResult,
} from "@/shared/sessions";

export interface PineTranscriptMessage extends PineTextMessage {
  status: "complete" | "streaming";
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
    const result = await window.pine.resumeSession({ sessionId });
    activeSession.value = result.session;
    currentSessionId = result.session.id;
    messages.value = [];
    hasEarlierMessages.value = false;
    nextBefore.value = undefined;
    await loadInitialMessages(result.session.id);
    return result.session;
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
        })),
        ...messages.value,
      ];
      hasEarlierMessages.value = result.hasMore;
      nextBefore.value = result.nextBefore;
    } finally {
      if (currentSessionId === sessionId) isLoadingMessages.value = false;
    }
  }

  async function prompt(message: string): Promise<void> {
    isRunning.value = true;
    try {
      const result = await window.pine.promptSession({ message });
      activeSession.value = result.session;
      currentSessionId = result.session.id;
    } catch (error) {
      isRunning.value = false;
      throw error;
    }
  }

  async function abort(): Promise<void> {
    await window.pine.abortSession();
  }

  function handleAgentEvent(event: PineAgentEvent): void {
    if (event.type === "run-state") {
      if (event.state === "running") currentSessionId = event.sessionId;
      if (currentSessionId !== event.sessionId) return;
      isRunning.value = event.state === "running" || event.state === "aborting";
      return;
    }
    if (event.type === "session-updated") {
      if (currentSessionId !== event.sessionId) return;
      activeSession.value = event.summary;
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
    const nextMessage: PineTranscriptMessage = {
      createdAt: messageCreatedAt(event.message),
      id: event.messageId,
      role,
      status: event.type === "message-end" ? "complete" : "streaming",
      text: messageText(messageContent(event.message)),
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

  function startTransientSession(): void {
    activeSession.value = null;
    currentSessionId = null;
    messages.value = [];
    hasEarlierMessages.value = false;
    nextBefore.value = undefined;
    isRunning.value = false;
  }

  function reset(): void {
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
    hasEarlierMessages.value = false;
    nextBefore.value = undefined;
  }

  return {
    activeSession,
    abort,
    connectAgentEvents,
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
    startTransientSession,
  };
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSessionStore, import.meta.hot));
}
