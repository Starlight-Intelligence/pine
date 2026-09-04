import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { createAppI18n } from "@/app/i18n";
import type { PineTranscriptMessage } from "@/stores/session";
import ProjectTranscriptOutline from "../ProjectTranscriptOutline.vue";

vi.mock("@/components/ui/message-scroller", () => ({
  useMessageScroller: () => ({ scrollToMessage: vi.fn() }),
  useMessageScrollerVisibility: () => ({
    value: { currentAnchorId: "message-1" },
  }),
}));

const messages: PineTranscriptMessage[] = [
  {
    blocks: [{ type: "text", text: "First prompt" }],
    createdAt: "2026-09-01T00:00:00.000Z",
    id: "message-1",
    role: "user",
    status: "complete",
  },
  {
    blocks: [{ type: "text", text: "Second prompt" }],
    createdAt: "2026-09-01T00:01:00.000Z",
    id: "message-2",
    role: "user",
    status: "complete",
  },
  {
    blocks: [{ type: "text", text: "Third prompt" }],
    createdAt: "2026-09-01T00:02:00.000Z",
    id: "message-3",
    role: "user",
    status: "complete",
  },
];

describe("ProjectTranscriptOutline", () => {
  function mountOutline(testMessages: PineTranscriptMessage[]) {
    return mount(ProjectTranscriptOutline, {
      props: { messages: testMessages },
      global: {
        plugins: [createAppI18n("en-US")],
        stubs: {
          HoverCard: { template: "<div><slot /></div>" },
          HoverCardContent: {
            template: '<div data-slot="hover-card-content"><slot /></div>',
          },
          HoverCardTrigger: { template: "<div><slot /></div>" },
        },
      },
    });
  }

  it("hides the message navigation before the third user message", () => {
    const wrapper = mountOutline(messages.slice(0, 2));

    expect(
      wrapper.find('[data-slot="project-transcript-outline-menu"]').exists(),
    ).toBe(false);
  });

  it("shows the message navigation from the third user message", () => {
    const wrapper = mountOutline(messages);

    expect(
      wrapper.find('[data-slot="project-transcript-outline-menu"]').exists(),
    ).toBe(true);
  });

  it("uses compact popup spacing for the message navigation", () => {
    const wrapper = mountOutline(messages);

    expect(wrapper.get('[data-slot="hover-card-content"]').classes()).toContain(
      "p-1.5",
    );
    expect(
      wrapper.get('[data-slot="project-transcript-outline-menu"]').classes(),
    ).toContain("gap-0.5");
  });
});
