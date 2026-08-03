export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatCompletionResult {
  content: string;
  model: string;
}

export interface AiChatProvider {
  complete(request: ChatCompletionRequest): Promise<ChatCompletionResult>;
}

export const AI_CHAT_PROVIDER = Symbol("AI_CHAT_PROVIDER");

export const HANDOFF_MARKER = "[HANDOFF]";
