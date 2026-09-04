import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { createAppI18n } from "@/app/i18n";
import { attachmentImageUrl, type PineAttachment } from "@/shared/attachments";
import ProjectAttachmentList from "../ProjectAttachmentList.vue";

const imageAttachment: PineAttachment = {
  extension: "png",
  kind: "file",
  modifiedAt: "2026-09-02T12:02:00.000Z",
  name: "screenshot.png",
  path: "/pine/projects/p1/attachments/uuid.png",
  size: 2_048,
};

const fileAttachment: PineAttachment = {
  extension: "md",
  kind: "file",
  modifiedAt: "2026-09-02T12:00:00.000Z",
  name: "notes.md",
  path: "/Users/example/notes.md",
  size: 1_024,
};

function mountList(props: {
  attachments: readonly PineAttachment[];
  removable?: boolean;
  surface: "composer" | "message";
}) {
  return mount(ProjectAttachmentList, {
    props,
    global: {
      plugins: [createAppI18n("zh-CN")],
    },
  });
}

describe("ProjectAttachmentList", () => {
  it.each(["composer", "message"] as const)(
    "shows source line ranges on the %s card",
    (surface) => {
      const wrapper = mountList({
        attachments: [
          {
            ...fileAttachment,
            selection: { startLine: 3, endLine: 12, text: "selected" },
          },
        ],
        surface,
      });
      expect(wrapper.get('[data-slot="attachment-description"]').text()).toBe(
        "第 3–12 行",
      );
      expect(wrapper.text()).not.toContain("MD ·");
    },
  );

  it("renders image attachments with the official image variant", () => {
    const wrapper = mountList({
      attachments: [imageAttachment, fileAttachment],
      surface: "message",
    });

    const attachmentCards = wrapper.findAll('[data-slot="attachment"]');
    expect(attachmentCards).toHaveLength(2);

    // Image previews use the stacked official example layout on both
    // surfaces; the composer keeps them inside the rounded input.
    expect(attachmentCards[0].attributes("data-orientation")).toBe("vertical");
    const imageMedia = attachmentCards[0].get('[data-slot="attachment-media"]');
    expect(imageMedia.attributes("data-variant")).toBe("image");
    const img = imageMedia.get("img");
    expect(img.attributes("src")).toBe(
      attachmentImageUrl(imageAttachment.path),
    );
    expect(img.attributes("alt")).toBe("screenshot.png");
    expect(attachmentCards[0].text()).toContain("PNG · 2.0 KB");

    // Non-image attachments keep the icon variant with a type · size line.
    expect(attachmentCards[1].attributes("data-orientation")).toBe(
      "horizontal",
    );
    expect(
      attachmentCards[1]
        .get('[data-slot="attachment-media"]')
        .attributes("data-variant"),
    ).toBeUndefined();
    expect(attachmentCards[1].text()).toContain("MD · 1.0 KB");
  });

  it("stacks image previews vertically on the composer surface too", () => {
    const wrapper = mountList({
      attachments: [imageAttachment],
      surface: "composer",
    });

    expect(
      wrapper.get('[data-slot="attachment"]').attributes("data-orientation"),
    ).toBe("vertical");
    expect(
      wrapper.get('[data-slot="attachment-media"]').attributes("data-variant"),
    ).toBe("image");
  });

  it("falls back to the icon variant when the preview fails to load", async () => {
    const wrapper = mountList({
      attachments: [imageAttachment],
      surface: "message",
    });

    await wrapper.get("img").trigger("error");

    const media = wrapper.get('[data-slot="attachment-media"]');
    expect(media.attributes("data-variant")).toBeUndefined();
    expect(wrapper.find("img").exists()).toBe(false);
  });
});
