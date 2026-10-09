import { createContext } from "react";

// Streaming flag for blocks rendered inside an actively streaming assistant
// message — provided by `AssistantText`, consumed by `StreamdownPre`. Cache
// writes are skipped while true so growing prefix snapshots don't churn the
// highlight LRU. Lives in its own module so importing it never pulls `shiki`
// (via `code-block.tsx`) into the eager chunk.
export const CodeBlockStreamingContext = createContext(false);
