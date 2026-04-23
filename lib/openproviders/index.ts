// Stub - replaced deleted openproviders module
export const openproviders = (_modelId: string, _options?: unknown, _apiKey?: string) => {
  // Placeholder - SDK calls will fail gracefully
  return {
    chatCompletion: async () => ({ text: "Model SDK stub", json: () => Promise.resolve({}) }),
  }
}
