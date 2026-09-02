import { describe, expect, it } from "vitest";
import { normalizeWarehouseAssistantAnswer } from "@/lib/warehouse/assistant-response";

describe("warehouse assistant response formatting", () => {
  it("removes raw Markdown while keeping a clean, readable list", () => {
    const response = normalizeWarehouseAssistantAnswer(`### **Summary of Totals**

* **Active Assets:** 15
* **Occupied Docks:** 3 / 10

---

**Lane 2:** \`LAY\` is in Slot 1.`);

    expect(response).toBe(`Summary of Totals
• Active Assets: 15
• Occupied Docks: 3 / 10

Lane 2: LAY is in Slot 1.`);
    expect(response).not.toMatch(/[*#`]/);
  });
});
