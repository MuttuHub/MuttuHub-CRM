import { describe, expect, it } from "vitest"
import { cn } from "./utils"

describe("cn", () => {
  it("merges conflicting tailwind classes keeping the last one", () => {
    expect(cn("px-2", "px-4")).toBe("px-4")
    expect(cn("bg-red-500", "bg-blue-500")).toBe("bg-blue-500")
  })

  it("dedupes repeated utility classes and drops falsy inputs", () => {
    expect(cn("px-2", "px-2")).toBe("px-2")
    expect(cn("block", false && "inline", null, undefined, 0, "block")).toBe(
      "block",
    )
  })
})