export function normalizeWarehouseAssistantAnswer(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/^\s*```[^\n]*$/gm, "")
    .replace(/```/g, "")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/(^|\s)\*([^*\n]+)\*(?=\s|[.,:;!?)]|$)/g, "$1$2")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\*\*/g, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
