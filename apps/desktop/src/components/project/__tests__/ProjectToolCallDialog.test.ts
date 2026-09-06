import { mount } from "@vue/test-utils";
import {
  AlertCircleIcon,
  GlobeIcon,
  SearchIcon,
  ShieldBanIcon,
} from "@lucide/vue";
import { describe, expect, it } from "vitest";
import { createAppI18n } from "@/app/i18n";
import ProjectToolCallMarker from "../ProjectToolCallMarker.vue";

function mountMarker(decidedBy: "judge" | "user" | "sandbox" | null = "judge") {
  return mount(ProjectToolCallMarker, {
    attachTo: document.body,
    props: {
      toolCall: {
        id: "call-bash-1",
        name: "bash",
        status: "error",
        approval: decidedBy
          ? {
              state: "denied",
              decidedBy,
              reason: "请改用不会覆盖现有文件的命令。",
            }
          : undefined,
        input: {
          command: "dangerous-command",
          description: "覆盖现有文件",
        },
        output: [
          {
            type: "text",
            text: "First paragraph\n\nSecond paragraph",
          },
        ],
        durationMs: 1_250,
      },
    },
    global: {
      plugins: [createAppI18n("zh-CN")],
    },
  });
}

describe("ProjectToolCallDialog", () => {
  it.each(["judge", "user"] as const)(
    "distinguishes %s denials from execution failures",
    async (decidedBy) => {
      const wrapper = mountMarker(decidedBy);
      expect(wrapper.findComponent(ShieldBanIcon).exists()).toBe(true);
      expect(wrapper.findComponent(AlertCircleIcon).exists()).toBe(false);
      expect(wrapper.text()).toContain("已拒绝");
      await wrapper.setProps({
        reviewing: true,
        toolCall: { ...wrapper.props("toolCall"), status: "running" },
      });
      expect(wrapper.text()).toContain("已拒绝");
      expect(wrapper.text()).not.toContain("正在审核");
      await wrapper.get('button[data-slot="marker"]').trigger("click");
      const badges = document.body.querySelectorAll(
        '[data-slot="dialog-content"] [data-slot="badge"]',
      );
      expect(badges).toHaveLength(2);
      expect(document.body.textContent).toContain(
        decidedBy === "judge" ? "自动审批驳回" : "用户已拒绝",
      );
      wrapper.unmount();
    },
  );

  it("labels sandbox denials as sandbox-rejected warnings", async () => {
    const wrapper = mountMarker("sandbox");
    expect(wrapper.findComponent(ShieldBanIcon).exists()).toBe(true);
    expect(wrapper.findComponent(AlertCircleIcon).exists()).toBe(false);
    await wrapper.get('button[data-slot="marker"]').trigger("click");
    expect(document.body.textContent).toContain("沙箱拒绝");
    wrapper.unmount();
  });

  it("keeps execution failures destructive", async () => {
    const wrapper = mountMarker(null);
    expect(wrapper.findComponent(AlertCircleIcon).exists()).toBe(true);
    expect(wrapper.findComponent(ShieldBanIcon).exists()).toBe(false);
    await wrapper.get('button[data-slot="marker"]').trigger("click");
    wrapper.unmount();
  });

  it("shows status, parameters, result, and auto-review rejection reason", async () => {
    const wrapper = mountMarker();
    await wrapper.get('button[data-slot="marker"]').trigger("click");

    const dialogText = document.body.textContent ?? "";
    expect(dialogText).toContain("工具调用详情");
    expect(dialogText).toContain("自动审批驳回");
    expect(dialogText).toContain("请改用不会覆盖现有文件的命令。");
    const tables = document.body.querySelectorAll("[data-tool-value-table]");
    expect(tables).toHaveLength(2);
    expect(dialogText).toContain("command");
    expect(dialogText).toContain("dangerous-command");
    expect(dialogText).toContain("[0].type");
    expect(dialogText).toContain("[0].text");
    expect(dialogText).toContain("First paragraph\n\nSecond paragraph");
    expect(dialogText).not.toContain("\\n\\n");
    expect(dialogText).toContain("1.3 秒");
    wrapper.unmount();
  });

  it("shows a live line count for an in-progress write", async () => {
    const wrapper = mount(ProjectToolCallMarker, {
      attachTo: document.body,
      props: {
        toolCall: {
          id: "call-write-1",
          name: "write",
          status: "running",
          input: {
            path: "src/main.ts",
            content: "line1\nline2\nline3",
          },
        },
      },
      global: {
        plugins: [createAppI18n("zh-CN")],
      },
    });
    const count = wrapper.get("[data-write-lines]");
    expect(count.text()).toBe("（3 行）");
    expect(count.classes()).toContain("text-sm");
    expect(count.classes()).not.toContain("text-xs");
    // The content argument grows as the model streams it.
    await wrapper.setProps({
      toolCall: {
        ...wrapper.props("toolCall"),
        input: {
          path: "src/main.ts",
          content: "line1\nline2\nline3\nline4",
        },
      },
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.get("[data-write-lines]").text()).toBe("（4 行）");
    wrapper.unmount();
  });

  it("shows TinyFish search parameters with a search icon", () => {
    const wrapper = mount(ProjectToolCallMarker, {
      attachTo: document.body,
      props: {
        toolCall: {
          id: "call-web-search-1",
          name: "web_search",
          status: "running",
          input: {
            query: "latest Pine release",
            purpose: "用于补充页面信息",
            domain_type: "news",
            recency_minutes: 1_501,
            include_domains: ["example.com", "docs.example.com"],
            page: 2,
          },
        },
      },
      global: {
        plugins: [createAppI18n("zh-CN")],
      },
    });

    expect(wrapper.findComponent(SearchIcon).exists()).toBe(true);
    const content = wrapper.get('[data-slot="marker-content"]');
    expect(content.text()).toContain("正在搜索");
    expect(content.text()).toContain(
      "近 1 天 1 小时 1 分钟 latest Pine release 的新闻",
    );
    const purpose = wrapper.get("[data-tool-purpose]");
    expect(purpose.text()).toBe("用于补充页面信息");
    expect(purpose.classes()).toContain("font-semibold");
    expect(content.text()).toContain("站点 example.com");
    expect(content.text()).toContain("另 1 个站点");
    expect(content.text()).toContain("第 2 页");
    wrapper.unmount();
  });

  it("shows TinyFish fetch parameters with a globe icon", () => {
    const wrapper = mount(ProjectToolCallMarker, {
      attachTo: document.body,
      props: {
        toolCall: {
          id: "call-web-fetch-1",
          name: "web_fetch",
          status: "running",
          input: {
            urls: ["https://example.com/docs", "https://example.com/faq"],
            purpose: "查看苹果官网首页展示的最新产品信息",
            highlights: {
              query: "pricing and limits",
            },
          },
        },
      },
      global: {
        plugins: [createAppI18n("zh-CN")],
      },
    });

    expect(wrapper.findComponent(GlobeIcon).exists()).toBe(true);
    const content = wrapper.get('[data-slot="marker-content"]');
    expect(content.text()).toContain("正在抓取");
    expect(content.text()).toContain("https://example.com/docs");
    expect(content.text()).toContain("以及另 1 个网页");
    expect(content.text()).not.toContain("格式");
    expect(content.text()).toContain("重点：pricing and limits");
    const purpose = wrapper.get("[data-tool-purpose]");
    expect(purpose.text()).toBe("查看苹果官网首页展示的最新产品信息");
    expect(purpose.classes()).toContain("font-semibold");
    wrapper.unmount();
  });

  it("uses the returned page title and favicon after a fetch completes", () => {
    const wrapper = mount(ProjectToolCallMarker, {
      attachTo: document.body,
      props: {
        toolCall: {
          id: "call-web-fetch-title-1",
          name: "web_fetch",
          status: "complete",
          input: {
            urls: [
              "https://deploymentsafety.openai.com/gpt-6-astra",
              "https://example.com",
            ],
            purpose: "查看 GPT-6 Astra 页面信息",
          },
          output: {
            details: {
              pageTitle:
                "GPT-6 Astra System Card - OpenAI Deployment Safety Hub",
              faviconDataUrl: "data:image/png;base64,iVBORw==",
            },
          },
        },
      },
      global: {
        plugins: [createAppI18n("zh-CN")],
      },
    });

    const content = wrapper.get('[data-slot="marker-content"]');
    expect(content.text()).toContain("GPT-6 Astra System Card…");
    expect(content.text()).not.toContain(
      "https://deploymentsafety.openai.com/gpt-6-astra",
    );
    expect(content.text()).toContain("以及另 1 个网页");
    expect(wrapper.get("[data-tool-favicon]").attributes("src")).toBe(
      "data:image/png;base64,iVBORw==",
    );
    wrapper.unmount();
  });

  it("extracts a title from the TinyFish envelope when details are absent", () => {
    const wrapper = mount(ProjectToolCallMarker, {
      attachTo: document.body,
      props: {
        toolCall: {
          id: "call-web-fetch-envelope-1",
          name: "web_fetch",
          status: "complete",
          input: {
            urls: ["https://deploymentsafety.openai.com/gpt-6-astra"],
          },
          output: {
            content: [
              {
                type: "text",
                text: `<tinyfish_web_data>\n{
  "results": [
    {
      "url": "[https://deploymentsafety.openai.com/gpt-6-astra](https://deploymentsafety.openai.com/gpt-6-astra)",
      "title": "GPT-6 Astra System Card - OpenAI Deployment Safety Hub",
`,
              },
            ],
          },
        },
      },
      global: {
        plugins: [createAppI18n("zh-CN")],
      },
    });

    const content = wrapper.get('[data-slot="marker-content"]');
    expect(content.text()).toContain("GPT-6 Astra System Card…");
    expect(content.text()).not.toContain("https://deploymentsafety.openai.com");
    wrapper.unmount();
  });
});
