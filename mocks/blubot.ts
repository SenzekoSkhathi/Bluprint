import { MaterialIcons } from "@expo/vector-icons";

export interface SuggestedPrompt {
  id: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  prompt: string;
}

export const BLUBOT_MOCK_USERNAME = "John";

export const BLUBOT_SUGGESTED_PROMPTS: SuggestedPrompt[] = [
  {
    id: "1",
    icon: "school",
    title: "Course Requirements",
    prompt: "What are the requirements for my major?",
  },
  {
    id: "2",
    icon: "event",
    title: "Academic Planning",
    prompt: "Help me plan my courses for next semester",
  },
  {
    id: "3",
    icon: "find-in-page",
    title: "Handbook Rules",
    prompt: "What are the prerequisite rules for advanced courses?",
  },
  {
    id: "4",
    icon: "assignment",
    title: "Degree Progress",
    prompt: "How far am I from completing my degree?",
  },
];
