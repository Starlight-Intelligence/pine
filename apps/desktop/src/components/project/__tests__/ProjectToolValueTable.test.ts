import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { createAppI18n } from "@/app/i18n";
import ProjectToolValueTable from "../ProjectToolValueTable.vue";

describe("ProjectToolValueTable", () => {
  it("parses JSON strings, flattens nested fields, and preserves newlines", () => {
    const wrapper = mount(ProjectToolValueTable, {
      props: {
        value: JSON.stringify({
          message: "First line\nSecond line",
          nested: { ok: true },
        }),
        emptyLabel: "No value",
      },
      global: {
        plugins: [createAppI18n("en-US")],
      },
    });

    const keys = wrapper
      .findAll("[data-tool-value-key]")
      .map((cell) => cell.text());
    const values = wrapper
      .findAll("[data-tool-value-value]")
      .map((cell) => cell.text());

    expect(keys).toEqual(["message", "nested.ok"]);
    expect(values).toEqual(["First line\nSecond line", "true"]);
    expect(wrapper.text()).not.toContain("{\n");
    expect(wrapper.text()).not.toContain("\\n");
  });
});
