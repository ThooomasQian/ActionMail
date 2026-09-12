type WebMcpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, boolean>;
  execute: (input: unknown) => Promise<unknown>;
};

interface Document {
  modelContext?: {
    registerTool: (
      tool: WebMcpTool,
      options?: { signal?: AbortSignal },
    ) => void;
  };
}
