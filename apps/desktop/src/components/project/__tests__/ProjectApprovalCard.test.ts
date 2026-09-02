import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { createAppI18n } from "@/app/i18n";
import ProjectApprovalCard from "../ProjectApprovalCard.vue";

describe("ProjectApprovalCard", () => {
  it("explains explicit privileged execution requests", () => {
    const wrapper = mount(ProjectApprovalCard, {
      props: {
        approval: {
          requestId: "approval-1",
          toolCallId: "privileged-1",
          toolName: "privileged_bash",
          trigger: "privileged-execution",
          description: "打开 Finder",
          subject: "open -a Finder",
        },
      },
      global: {
        plugins: [createAppI18n("zh-CN")],
      },
    });

    expect(wrapper.text()).toContain(
      "该操作请求在 Pine 项目沙箱外使用原生权限执行。",
    );
    expect(wrapper.text()).toContain("open -a Finder");
    wrapper.unmount();
  });
});
