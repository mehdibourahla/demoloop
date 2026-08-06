import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

describe("Remotion caption layering", () => {
  it("renders the caption in a dedicated foreground layer", () => {
    const source = readFileSync(resolve("remotion/index.tsx"), "utf8")

    expect(source).toMatch(
      /caption\.mode === 'lower-third'[\s\S]*?<AbsoluteFill style=\{\{ zIndex: 1, pointerEvents: 'none' \}\}>/,
    )
  })
})
