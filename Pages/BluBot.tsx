import { getPrimaryFacultySlug } from "@/constants/faculty";
import { buildGuidanceTrustMessage } from "@/hooks/use-logged-in-user";
import {
  askHandbookAdvisor,
  askHandbookAdvisorStream,
  askHandbookAdvisorWithUpload,
  deleteHandbookAdvisorChatThread,
  getBackendHealth,
  getHandbookAdvisorChatHistory,
  renameHandbookAdvisorChatThread,
  syncHandbookAdvisorChatHistory,
  type BluBotStreamCallbacks,
  type ScienceAdvisorChatThreadPayload,
  type ScienceAdvisorCitation,
  type ScienceAdvisorModelProfile,
} from "@/services/backend-api";
import { MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  ListRenderItem,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { theme } from "../constants/theme";

interface Message {
  id: string;
  text: string;
  sender: "user" | "bot" | "system";
  timestamp: Date;
}

interface ChatThread {
  id: string;
  title: string;
  customTitle?: string | null;
  preview: string;
  updatedAt: Date;
  messages: Message[];
}

type ConnectionMode = "checking" | "online" | "fallback";
type BluBotPersona = "social" | "professional";
type BluBotResponseTone = "casual" | "concise" | "reassuring";

interface BluBotCourse {
  code: string;
  title: string;
  credits: number;
  nqfLevel: number;
  semester: string;
  grade?: number;
  passed?: boolean;
}

interface BluBotValidationSummary {
  blockers: number;
  warnings: number;
  infos: number;
  projectedCredits: number;
  creditShortfall: number;
  /** Top blockers — passed so BluBot is aware of plan issues without re-running validation */
  topIssues: Array<{ severity: string; category: string; title: string; message: string }>;
}

interface BluBotProps {
  firstName?: string;
  userContext?: {
    studentNumber: string;
    fullName: string;
    degree: string;
    year: number;
    majors: string[];
    creditsEarned?: number;
    creditsTotal?: number;
    milestoneRequired?: number;
    milestoneLabel?: string;
    nqf7Earned?: number;
    nqf7Required?: number;
    /** Courses passed in previous academic years */
    completedPassed?: BluBotCourse[];
    /** Courses failed or incomplete */
    completedFailed?: BluBotCourse[];
    /** All courses registered for in the current academic year */
    coursesInProgress?: BluBotCourse[];
    /** Courses in the student's saved plan (future/current academic plan) */
    plannedCourses?: Array<{
      code: string;
      year: string;
      semester: string;
      credits: number;
    }>;
    /** Majors selected in the student's saved plan */
    selectedMajors?: string[];
  };
  /** Live validation summary from the planner — gives BluBot awareness of plan issues */
  validationSummary?: BluBotValidationSummary;
}

const FALLBACK_NOTICE_ID = "backend-fallback-notice";
const ADVISOR_ESCALATION_NOTE =
  "If this still feels unclear, it would be worth checking with your student advisor so you have the final word.";
function bluBotStorageKey(studentNumber: string): string {
  return `blubot-chat-history-v1-${studentNumber}`;
}
const BLUBOT_MODEL_OPTIONS: Array<{
  id: ScienceAdvisorModelProfile;
  label: string;
  description: string;
}> = [
  {
    id: "fast",
    label: "Fast",
    description: "Quick replies, less detail",
  },
  {
    id: "thinking",
    label: "Thinking",
    description: "Deep analysis — recommended",
  },
];

interface PersistedChatThread {
  id: string;
  title: string;
  customTitle?: string | null;
  preview: string;
  updatedAt: string;
  messages: Array<{
    id: string;
    text: string;
    sender: "user" | "bot" | "system";
    timestamp: string;
  }>;
}

interface PersistedChatState {
  currentThreadId: string | null;
  recentChats: PersistedChatThread[];
}

function createChatId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizePreviewText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function truncateText(text: string, maxLength: number) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trimEnd()}...`;
}

function buildChatThread(
  threadId: string,
  threadMessages: Message[],
  existingThread?: ChatThread,
): ChatThread {
  const firstUserMessage = threadMessages.find(
    (message) => message.sender === "user",
  );
  const lastVisibleMessage = [...threadMessages]
    .reverse()
    .find((message) => message.sender !== "system");
  const customTitle = existingThread?.customTitle?.trim() || null;
  const titleSource =
    customTitle ||
    firstUserMessage?.text ||
    lastVisibleMessage?.text ||
    "New chat";
  const previewSource = lastVisibleMessage?.text || titleSource;

  return {
    id: threadId,
    title: truncateText(normalizePreviewText(titleSource), 30),
    customTitle,
    preview: truncateText(normalizePreviewText(previewSource), 72),
    updatedAt: lastVisibleMessage?.timestamp ?? new Date(),
    messages: threadMessages.map((message) => ({ ...message })),
  };
}

function serializeChatThread(thread: ChatThread): PersistedChatThread {
  return {
    id: thread.id,
    title: thread.title,
    customTitle: thread.customTitle ?? null,
    preview: thread.preview,
    updatedAt: thread.updatedAt.toISOString(),
    messages: thread.messages.map((message) => ({
      id: message.id,
      text: message.text,
      sender: message.sender,
      timestamp: message.timestamp.toISOString(),
    })),
  };
}

function parsePersistedChatThread(thread: PersistedChatThread): ChatThread {
  return {
    id: thread.id,
    title: thread.title,
    customTitle: thread.customTitle ?? null,
    preview: thread.preview,
    updatedAt: new Date(thread.updatedAt),
    messages: thread.messages.map((message) => ({
      id: message.id,
      text: message.text,
      sender: message.sender,
      timestamp: new Date(message.timestamp),
    })),
  };
}

function parseBackendChatThread(
  thread: ScienceAdvisorChatThreadPayload,
): ChatThread {
  return {
    id: thread.id,
    title: thread.title,
    customTitle: thread.custom_title ?? null,
    preview: thread.preview,
    updatedAt: new Date(thread.updated_at_iso),
    messages: thread.messages.map((message) => ({
      id: message.id,
      text: message.text,
      sender: message.sender,
      timestamp: new Date(message.timestamp_iso),
    })),
  };
}

function toBackendChatThread(
  thread: ChatThread,
): ScienceAdvisorChatThreadPayload {
  return {
    id: thread.id,
    title: thread.title,
    custom_title: thread.customTitle ?? null,
    preview: thread.preview,
    updated_at_iso: thread.updatedAt.toISOString(),
    messages: thread.messages.map((message) => ({
      id: message.id,
      text: message.text,
      sender: message.sender,
      timestamp_iso: message.timestamp.toISOString(),
    })),
  };
}

function detectPersona(input: string): BluBotPersona {
  const normalized = input.trim().toLowerCase();

  if (normalized.length === 0) {
    return "professional";
  }

  const socialPatterns = [
    /^(hi|hey|hello|howdy|yo)\b/,
    /\b(good\s*(morning|afternoon|evening)|what'?s up|how are you)\b/,
    /\b(joke|funny|laugh|meme|roast)\b/,
    /\b(chit\s*chat|small\s*talk|chat)\b/,
    /\b(thanks|thank you|cool|nice)\b/,
  ];

  const professionalPatterns = [
    /\b(course|credits?|major|degree|planner|prereq|prerequisite|nqf|graduation|handbook|rule|requirement|advisor|semester|module|faculty|science)\b/,
    /\b(validate|plan|audit|recommend|guid(e|ance)|explain|eligib(le|ility))\b/,
    /\bwhat should i take|which courses|am i on track\b/,
  ];

  if (professionalPatterns.some((pattern) => pattern.test(normalized))) {
    return "professional";
  }

  if (socialPatterns.some((pattern) => pattern.test(normalized))) {
    return "social";
  }

  return "professional";
}

function buildSocialResponse(input: string, firstName: string): string {
  const normalized = input.toLowerCase();
  const tone = detectResponseTone(input);
  const jokes = [
    "Why did the student bring a ladder to class? Because they were going to higher education.",
    "I told my timetable we needed space. It gave me a lecture anyway.",
    "I wanted to study calculus jokes, but the good ones were all derivative.",
  ];

  if (tone === "reassuring") {
    return `Hey ${firstName}, take a breath. We can work through it together, one step at a time.`;
  }

  if (/\bjoke|funny|laugh|meme\b/.test(normalized)) {
    const pick = jokes[Math.floor(Math.random() * jokes.length)];
    return `Hey ${firstName}, ${pick}\n\nIf you want, I can give you a nerdier science one next.`;
  }

  if (/\bhow are you|what'?s up\b/.test(normalized)) {
    return `Hey ${firstName}, I'm doing well. What do you feel like tackling today?`;
  }

  if (/\bthanks|thank you\b/.test(normalized)) {
    return `Hey ${firstName}, always happy to help.`;
  }

  return `Hey ${firstName}, I'm here. Ask me about courses, credits, majors, graduation rules, or anything you want to figure out step by step.`;
}

function detectResponseTone(input: string): BluBotResponseTone {
  const normalized = input.trim().toLowerCase();

  if (normalized.length === 0) {
    return "concise";
  }

  const reassuringPatterns = [
    /\b(stressed|overwhelmed|worried|anxious|panic|panicking|stuck|confused|lost)\b/,
    /\b(help me|please help|i don't know|i dont know|i'm not sure|im not sure)\b/,
    /\b(failing|fail|messed up|behind|urgent|scared)\b/,
  ];

  const casualPatterns = [
    /^(hi|hey|hello|howdy|yo)\b/,
    /\b(how are you|what'?s up|thanks|thank you|joke|funny|meme|chat)\b/,
  ];

  const concisePatterns = [
    /\bwhat|which|when|can i|should i|am i|do i need|how many\b/,
    /\b(course|credits?|major|degree|planner|prereq|graduation|rule|requirement)\b/,
  ];

  if (reassuringPatterns.some((pattern) => pattern.test(normalized))) {
    return "reassuring";
  }

  if (casualPatterns.some((pattern) => pattern.test(normalized))) {
    return "casual";
  }

  if (concisePatterns.some((pattern) => pattern.test(normalized))) {
    return "concise";
  }

  return "concise";
}

function buildToneInstruction(tone: BluBotResponseTone) {
  if (tone === "casual") {
    return "Tone: warm, relaxed, and natural. Get straight to the point and sound like a thoughtful person, not a formal assistant. Keep it engaging without rambling.";
  }

  if (tone === "reassuring") {
    return "Tone: calm, supportive, and reassuring. Get straight into help and avoid sounding cold or rigid. Break things into simple steps.";
  }

  return "Tone: clear, concise, and human. Get straight to the answer in a natural way. Keep it short unless detail is genuinely useful.";
}

function userStartsWithGreeting(input: string): boolean {
  return /^(hi|hey|hello|howdy|yo)\b/i.test(input.trim());
}

function stripAssistantStyleLead(answer: string): string {
  return answer
    .trim()
    .replace(
      /^(?:hi|hey|hello)(?:\s+there|\s+student|\s+[A-Za-z'-]+)?[,!:.-]*\s*/i,
      "",
    )
    .replace(
      /^(?:as\s+(?:blubot|your\s+(?:academic|science)\s+advisor))[^.\n]*[.\n]+\s*/i,
      "",
    )
    .replace(
      /^(?:i\s+am|i'm)\s+(?:blubot|your\s+(?:academic|science)\s+advisor|here\s+to\s+help)[^.\n]*[.\n]+\s*/i,
      "",
    )
    .replace(/^(?:let'?s\s+work\s+through\s+this\.?\s*)/i, "")
    .replace(/^(?:sure|certainly|absolutely)[,!]?\s*/i, "")
    .trim();
}

function ensureFriendlyGreeting(
  answer: string,
  firstName: string,
  tone: BluBotResponseTone,
  includeGreeting: boolean,
): string {
  const cleaned = stripAssistantStyleLead(answer);
  const greeting = tone === "concise" ? "Hi" : "Hey";

  if (cleaned.length === 0) {
    return includeGreeting
      ? `${greeting} ${firstName}, how can I help?`
      : "How can I help?";
  }

  if (tone === "reassuring") {
    if (includeGreeting) {
      return `${greeting} ${firstName},\n\nWe can work through this. ${cleaned}`;
    }

    return `We can work through this. ${cleaned}`;
  }

  if (includeGreeting) {
    return `${greeting} ${firstName},\n\n${cleaned}`;
  }

  return cleaned;
}

function stripInlineSourcesSection(answer: string): string {
  // Remove any trailing "Sources:" / "Sources :" block the model appends
  return answer.replace(/\n+\*{0,2}Sources\*{0,2}\s*:[\s\S]*/i, "").trim();
}

function polishAdvisorReply(
  answer: string,
  firstName: string,
  tone: BluBotResponseTone,
  includeGreeting: boolean,
): string {
  const normalized = stripInlineSourcesSection(answer)
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return ensureFriendlyGreeting(normalized, firstName, tone, includeGreeting);
}

function answerLooksUncertain(answer: string): boolean {
  return /(not sure|uncertain|might|may|possibly|probably|cannot verify|can't verify|insufficient|depends on|recommend confirm|best to confirm)/i.test(
    answer,
  );
}

function addAdvisorEscalationIfNeeded(answer: string): string {
  if (!answerLooksUncertain(answer)) {
    return answer;
  }

  if (answer.includes(ADVISOR_ESCALATION_NOTE)) {
    return answer;
  }

  return `${answer.trim()}\n\n${ADVISOR_ESCALATION_NOTE}`;
}

function formatCitationLabel(citation: ScienceAdvisorCitation) {
  const sourceLabel =
    citation.title || citation.s3_key || `Source ${citation.source}`;
  return citation.s3_key && citation.title
    ? `${sourceLabel} (${citation.s3_key})`
    : sourceLabel;
}

function formatAdvisorResponse(
  answer: string,
  _citations: ScienceAdvisorCitation[],
) {
  return stripInlineSourcesSection(answer);
}

type InlineSegment =
  | { type: "text"; text: string }
  | { type: "strong"; text: string }
  | { type: "link"; text: string; url: string };

type MessageBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string; level: number }
  | { type: "bullets"; items: string[] }
  | { type: "numbered"; items: string[] }
  | { type: "code"; language: string; code: string }
  | { type: "table"; rows: string[][] }
  | { type: "citations"; items: string[] };

function stripTrailingUrlPunctuation(text: string) {
  const match = text.match(/[).,!?;:]+$/);
  if (!match) {
    return { core: text, trailing: "" };
  }

  const trailing = match[0];
  return {
    core: text.slice(0, -trailing.length),
    trailing,
  };
}

function parseInlineFormattedSegments(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  const pattern = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|https?:\/\/[^\s<]+)/g;
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const matchedText = match[0];
    const startIndex = match.index ?? 0;

    if (startIndex > lastIndex) {
      segments.push({
        type: "text",
        text: text.slice(lastIndex, startIndex),
      });
    }

    if (/^https?:\/\//.test(matchedText)) {
      const { core, trailing } = stripTrailingUrlPunctuation(matchedText);
      segments.push({
        type: "link",
        text: core,
        url: core,
      });

      if (trailing) {
        segments.push({
          type: "text",
          text: trailing,
        });
      }
    } else {
      const isDoubleWrapped =
        matchedText.startsWith("**") && matchedText.endsWith("**");
      const unwrappedText = isDoubleWrapped
        ? matchedText.slice(2, -2)
        : matchedText.slice(1, -1);

      segments.push({
        type: "strong",
        text: unwrappedText,
      });
    }

    lastIndex = startIndex + matchedText.length;
  }

  if (lastIndex < text.length) {
    segments.push({
      type: "text",
      text: text.slice(lastIndex),
    });
  }

  return segments;
}

function isHeadingLine(line: string) {
  const trimmed = line.trim();
  return /^(#{1,3})\s+.+$/.test(trimmed) || /^[A-Z][^:]{0,50}:$/.test(trimmed);
}

function isTableLine(line: string) {
  return line.includes("|") && line.split("|").length >= 3;
}

function isTableDivider(line: string) {
  return /^[\s|:-]+$/.test(line) && line.includes("-");
}

function parseTableRows(lines: string[]) {
  return lines
    .filter((line) => !isTableDivider(line))
    .map((line) =>
      line
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cell.trim()),
    );
}

function parseMessageBlocks(text: string): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  const lines = text.split("\n");
  let index = 0;

  while (index < lines.length) {
    const rawLine = lines[index];
    const trimmedLine = rawLine.trim();

    if (trimmedLine.length === 0) {
      index += 1;
      continue;
    }

    if (trimmedLine.startsWith("```")) {
      const language = trimmedLine.slice(3).trim();
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      blocks.push({
        type: "code",
        language,
        code: codeLines.join("\n"),
      });
      continue;
    }

    if (/^Sources:\s*$/i.test(trimmedLine)) {
      const items: string[] = [];
      index += 1;

      while (index < lines.length) {
        const citationMatch = lines[index].match(/^\s*[-*]\s+(.+)$/);
        if (!citationMatch) {
          break;
        }
        items.push(citationMatch[1].trim());
        index += 1;
      }

      if (items.length > 0) {
        blocks.push({ type: "citations", items });
        continue;
      }
    }

    if (isTableLine(trimmedLine)) {
      const tableLines = [rawLine];
      index += 1;

      while (index < lines.length && isTableLine(lines[index].trim())) {
        tableLines.push(lines[index]);
        index += 1;
      }

      const rows = parseTableRows(tableLines);
      if (rows.length > 1) {
        blocks.push({ type: "table", rows });
        continue;
      }

      blocks.push({ type: "paragraph", text: tableLines.join(" ") });
      continue;
    }

    const bulletMatch = rawLine.match(/^\s*[-*]\s+(.+)$/);
    if (bulletMatch) {
      const items: string[] = [];
      while (index < lines.length) {
        const match = lines[index].match(/^\s*[-*]\s+(.+)$/);
        if (!match) {
          break;
        }
        items.push(match[1].trim());
        index += 1;
      }
      blocks.push({ type: "bullets", items });
      continue;
    }

    const numberedMatch = rawLine.match(/^\s*\d+\.\s+(.+)$/);
    if (numberedMatch) {
      const items: string[] = [];
      while (index < lines.length) {
        const match = lines[index].match(/^\s*\d+\.\s+(.+)$/);
        if (!match) {
          break;
        }
        items.push(match[1].trim());
        index += 1;
      }
      blocks.push({ type: "numbered", items });
      continue;
    }

    if (isHeadingLine(trimmedLine)) {
      const markdownHeading = trimmedLine.match(/^(#{1,3})\s+(.+)$/);
      blocks.push({
        type: "heading",
        text: markdownHeading ? markdownHeading[2].trim() : trimmedLine,
        level: markdownHeading ? markdownHeading[1].length : 2,
      });
      index += 1;
      continue;
    }

    const paragraphLines = [trimmedLine];
    index += 1;

    while (index < lines.length) {
      const candidate = lines[index].trim();
      if (
        candidate.length === 0 ||
        candidate.startsWith("```") ||
        /^Sources:\s*$/i.test(candidate) ||
        isTableLine(candidate) ||
        /^\s*[-*]\s+/.test(lines[index]) ||
        /^\s*\d+\.\s+/.test(lines[index]) ||
        isHeadingLine(candidate)
      ) {
        break;
      }
      paragraphLines.push(candidate);
      index += 1;
    }

    blocks.push({
      type: "paragraph",
      text: paragraphLines.join(" "),
    });
  }

  return blocks;
}

function openMessageLink(url: string) {
  void Linking.openURL(url).catch((error) => {
    console.error("Failed to open BluBot link:", error);
  });
}

function renderInlineSegments(
  text: string,
  tone: "user" | "bot" | "system",
  keyPrefix: string,
) {
  const toneTextStyle =
    tone === "user"
      ? styles.userMessageText
      : tone === "system"
        ? styles.systemMessageBodyText
        : styles.botMessageText;

  return parseInlineFormattedSegments(text).map((segment, segmentIndex) => {
    if (segment.type === "link") {
      return (
        <Text
          key={`${keyPrefix}-link-${segmentIndex}`}
          style={[
            toneTextStyle,
            styles.messageLinkText,
            tone === "user" && styles.userMessageLinkText,
          ]}
          selectable
          onPress={() => openMessageLink(segment.url)}
        >
          {segment.text}
        </Text>
      );
    }

    return (
      <Text
        key={`${keyPrefix}-text-${segmentIndex}`}
        style={[
          toneTextStyle,
          segment.type === "strong" && styles.messageStrongText,
        ]}
        selectable
      >
        {segment.text}
      </Text>
    );
  });
}

function renderFormattedMessageContent(
  text: string,
  tone: "user" | "bot" | "system",
) {
  const toneTextStyle =
    tone === "user"
      ? styles.userMessageText
      : tone === "system"
        ? styles.systemMessageBodyText
        : styles.botMessageText;

  return (
    <View style={styles.messageContentStack}>
      {parseMessageBlocks(text).map((block, blockIndex) => {
        if (block.type === "heading") {
          return (
            <Text
              key={`block-${blockIndex}`}
              style={[
                styles.messageText,
                toneTextStyle,
                styles.messageHeadingText,
                block.level === 1 && styles.messageHeadingLarge,
              ]}
              selectable
            >
              {renderInlineSegments(block.text, tone, `heading-${blockIndex}`)}
            </Text>
          );
        }

        if (block.type === "paragraph") {
          return (
            <Text
              key={`block-${blockIndex}`}
              style={[styles.messageText, toneTextStyle]}
              selectable
            >
              {renderInlineSegments(
                block.text,
                tone,
                `paragraph-${blockIndex}`,
              )}
            </Text>
          );
        }

        if (block.type === "bullets" || block.type === "numbered") {
          return (
            <View key={`block-${blockIndex}`} style={styles.messageListGroup}>
              {block.items.map((item, itemIndex) => (
                <View
                  key={`block-${blockIndex}-item-${itemIndex}`}
                  style={styles.messageListRow}
                >
                  <Text
                    style={[styles.messageListMarker, toneTextStyle]}
                    selectable
                  >
                    {block.type === "bullets" ? "•" : `${itemIndex + 1}.`}
                  </Text>
                  <Text
                    style={[
                      styles.messageText,
                      toneTextStyle,
                      styles.messageListText,
                    ]}
                    selectable
                  >
                    {renderInlineSegments(
                      item,
                      tone,
                      `list-${blockIndex}-${itemIndex}`,
                    )}
                  </Text>
                </View>
              ))}
            </View>
          );
        }

        if (block.type === "code") {
          return (
            <View key={`block-${blockIndex}`} style={styles.codeBlockShell}>
              {block.language ? (
                <Text style={styles.codeBlockLabel}>{block.language}</Text>
              ) : null}
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Text style={styles.codeBlockText} selectable>
                  {block.code}
                </Text>
              </ScrollView>
            </View>
          );
        }

        if (block.type === "table") {
          return (
            <ScrollView
              key={`block-${blockIndex}`}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.tableScrollView}
            >
              <View style={styles.tableCard}>
                {block.rows.map((row, rowIndex) => (
                  <View
                    key={`row-${rowIndex}`}
                    style={[
                      styles.tableRow,
                      rowIndex === 0 && styles.tableHeaderRow,
                    ]}
                  >
                    {row.map((cell, cellIndex) => (
                      <View
                        key={`cell-${rowIndex}-${cellIndex}`}
                        style={styles.tableCell}
                      >
                        <Text
                          style={[
                            styles.tableCellText,
                            rowIndex === 0 && styles.tableHeaderCellText,
                          ]}
                          selectable
                        >
                          {cell}
                        </Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
          );
        }

        return null;
      })}
    </View>
  );
}

function createFallbackNotice(message: string): Message {
  return {
    id: FALLBACK_NOTICE_ID,
    text: message,
    sender: "system",
    timestamp: new Date(),
  };
}

function isNetworkFailure(errorMessage: string) {
  const normalized = errorMessage.toLowerCase();
  return (
    normalized.includes("network request failed") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("load failed")
  );
}

function getUserFacingAdvisorError(error: unknown) {
  const fallback =
    "Something went wrong while I was working on that. Please try again.";

  if (!(error instanceof Error)) {
    return {
      message: fallback,
      networkFailure: false,
    };
  }

  const rawMessage = error.message?.trim() || "";
  if (rawMessage.length === 0) {
    return {
      message: fallback,
      networkFailure: false,
    };
  }

  if (/RESOURCE_EXHAUSTED|quota|rate\s*limit/i.test(rawMessage)) {
    return {
      message:
        "the backend Gemini quota is exhausted right now. Please top up the quota or try again a little later.",
      networkFailure: false,
    };
  }

  const networkFailure = isNetworkFailure(rawMessage);
  return {
    message: networkFailure
      ? "I'm having trouble reaching the backend right now. Check your connection and try again in a moment."
      : rawMessage,
    networkFailure,
  };
}

function buildAdvisorContext(
  userContext?: BluBotProps["userContext"],
  validationSummary?: BluBotValidationSummary,
) {
  if (!userContext) {
    return "";
  }

  const majors =
    userContext.majors.length > 0
      ? userContext.majors.join(", ")
      : "None listed";

  const lines = [
    "Student context:",
    `- Name: ${userContext.fullName}`,
    `- Student Number: ${userContext.studentNumber}`,
    `- Degree: ${userContext.degree}`,
    `- Year: ${userContext.year}`,
    `- Majors: ${majors}`,
    `- Credits Earned: ${userContext.creditsEarned ?? "Unknown"}`,
    `- Credits Required: ${userContext.creditsTotal ?? "Unknown"}`,
    `- Current Milestone: ${userContext.milestoneLabel ?? "Unknown"}`,
    `- Milestone Requirement: ${userContext.milestoneRequired ?? "Unknown"}`,
    `- NQF7 Credits: ${userContext.nqf7Earned ?? "Unknown"}/${userContext.nqf7Required ?? "Unknown"}`,
  ];

  if (userContext.completedPassed && userContext.completedPassed.length > 0) {
    lines.push(
      `- Completed (passed): ${userContext.completedPassed.map((c) => c.code).join(", ")}`,
    );
  }

  if (userContext.completedFailed && userContext.completedFailed.length > 0) {
    lines.push(
      `- Failed/incomplete: ${userContext.completedFailed.map((c) => c.code).join(", ")}`,
    );
  }

  if (
    userContext.coursesInProgress &&
    userContext.coursesInProgress.length > 0
  ) {
    lines.push(
      `- Currently registered: ${userContext.coursesInProgress.map((c) => c.code).join(", ")}`,
    );
  }

  if (userContext.plannedCourses && userContext.plannedCourses.length > 0) {
    lines.push(
      `- Planned courses: ${userContext.plannedCourses.map((c) => `${c.code} (${c.year} ${c.semester})`).join(", ")}`,
    );
  }

  // Append live validation summary so BluBot is aware of plan issues
  // across all app sections — not just what's mentioned in the current query.
  if (validationSummary) {
    lines.push("");
    lines.push("Live plan validation (from Planner):");
    lines.push(
      `- Blockers: ${validationSummary.blockers} | Warnings: ${validationSummary.warnings}`,
    );
    lines.push(
      `- Projected credits: ${validationSummary.projectedCredits} | Credit shortfall: ${validationSummary.creditShortfall}`,
    );
    if (validationSummary.topIssues.length > 0) {
      lines.push("- Active issues:");
      validationSummary.topIssues.slice(0, 5).forEach((issue) => {
        lines.push(`  [${issue.severity}/${issue.category}] ${issue.title}: ${issue.message}`);
      });
    }
  }

  lines.push("Use this student context to tailor your advising answer.");
  return lines.join("\n");
}

function detectCrossMajorFaculties(majors: string[] | undefined): string[] {
  const tokens = (majors ?? []).map((major) => major.toLowerCase());
  const mapped = new Set<string>();

  for (const token of tokens) {
    if (
      token.includes("econom") ||
      token.includes("finance") ||
      token.includes("account") ||
      token.includes("commerce") ||
      token.includes("business") ||
      token.includes("information systems")
    ) {
      mapped.add("commerce");
    }
    if (
      token.includes("law") ||
      token.includes("legal") ||
      token.includes("llb")
    ) {
      mapped.add("law");
    }
    if (
      token.includes("engineering") ||
      token.includes("architecture") ||
      token.includes("built environment") ||
      token.includes("geomatics")
    ) {
      mapped.add("engineering");
    }
    if (
      token.includes("medicine") ||
      token.includes("physio") ||
      token.includes("occupational") ||
      token.includes("audiology") ||
      token.includes("health")
    ) {
      mapped.add("health-sciences");
    }
    if (
      token.includes("humanities") ||
      token.includes("politics") ||
      token.includes("philosophy") ||
      token.includes("psychology") ||
      token.includes("sociology")
    ) {
      mapped.add("humanities");
    }
  }

  return Array.from(mapped.values());
}

function buildStudentContextPayload(
  userContext?: BluBotProps["userContext"],
): import("@/services/backend-api").BluBotStudentContext | undefined {
  if (!userContext) return undefined;

  const primaryFaculty = getPrimaryFacultySlug();
  const crossMajorFaculties = detectCrossMajorFaculties(userContext.majors);
  const crossMajorMode = crossMajorFaculties.length > 0;

  return {
    name: userContext.fullName,
    student_number: userContext.studentNumber,
    degree: userContext.degree,
    year: userContext.year,
    majors: userContext.majors,
    credits_earned: userContext.creditsEarned,
    credits_total: userContext.creditsTotal,
    nqf7_credits_earned: userContext.nqf7Earned,
    nqf7_credits_required: userContext.nqf7Required,
    milestone_label: userContext.milestoneLabel,
    milestone_required: userContext.milestoneRequired,
    completed_passed: userContext.completedPassed?.map((c) => ({
      code: c.code,
      title: c.title,
      credits: c.credits,
      nqf_level: c.nqfLevel,
      semester: c.semester,
      grade: c.grade,
    })),
    completed_failed: userContext.completedFailed?.map((c) => ({
      code: c.code,
      title: c.title,
      credits: c.credits,
      nqf_level: c.nqfLevel,
      semester: c.semester,
      grade: c.grade,
    })),
    courses_in_progress: userContext.coursesInProgress?.map((c) => ({
      code: c.code,
      title: c.title,
      credits: c.credits,
      nqf_level: c.nqfLevel,
      semester: c.semester,
    })),
    primary_faculty: primaryFaculty,
    cross_major_mode: crossMajorMode,
    cross_major_faculties: crossMajorFaculties,
    planned_courses: userContext.plannedCourses,
    selected_majors: userContext.selectedMajors,
  };
}

export default function BluBot({
  firstName = "Student",
  userContext,
  validationSummary,
}: BluBotProps) {
  const isWeb = Platform.OS === "web";

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [recentChats, setRecentChats] = useState<ChatThread[]>([]);
  const [hasRestoredChats, setHasRestoredChats] = useState(false);
  const [backendChatSyncEnabled, setBackendChatSyncEnabled] = useState(true);
  const [currentThreadId, setCurrentThreadId] = useState<string>(() =>
    createChatId(),
  );
  const primaryFacultySlug = getPrimaryFacultySlug();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState<string>("");
  const [pendingByThread, setPendingByThread] = useState<
    Record<string, number>
  >({});
  const [isKeyboardVisible, setKeyboardVisible] = useState<boolean>(false);
  const [showScrollButton, setShowScrollButton] = useState<boolean>(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [, setConnectionMode] = useState<ConnectionMode>("checking");
  const [lastBackendSyncedAt, setLastBackendSyncedAt] = useState<string | null>(
    null,
  );
  const [, setIsFallbackGuidance] = useState(false);
  const [selectedModelProfile, setSelectedModelProfile] =
    useState<ScienceAdvisorModelProfile>("thinking");
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [selectedUpload, setSelectedUpload] =
    useState<DocumentPicker.DocumentPickerAsset | null>(null);

  const flatListRef = useRef<FlatList<Message>>(null);
  const currentThreadIdRef = useRef(currentThreadId);
  const messagesRef = useRef(messages);
  const advisorContext = buildAdvisorContext(userContext, validationSummary);
  const studentContextPayload = buildStudentContextPayload(userContext);
  const crossMajorFacultyHint = useMemo(() => {
    if (!studentContextPayload?.cross_major_mode) {
      return "";
    }
    const crossFaculties = (
      studentContextPayload.cross_major_faculties ?? []
    ).join(", ");
    if (!crossFaculties) {
      return "";
    }
    return `Cross-major routing context: primary faculty is science; evaluate major guidance using cross-faculty pathways for ${crossFaculties}.`;
  }, [studentContextPayload]);
  const [streamStatus, setStreamStatus] = useState<string>("");
  const scrollButtonOpacity = useRef(new Animated.Value(0)).current;
  const spinValue = useRef(new Animated.Value(0)).current;
  const activeThreadPendingCount = pendingByThread[currentThreadId] ?? 0;
  const isLoading = activeThreadPendingCount > 0;

  const adjustPendingForThread = (threadId: string, delta: number) => {
    setPendingByThread((prev) => {
      const current = prev[threadId] ?? 0;
      const next = Math.max(0, current + delta);

      if (next === 0) {
        const { [threadId]: _removed, ...rest } = prev;
        return rest;
      }

      return {
        ...prev,
        [threadId]: next,
      };
    });
  };

  const syncThreadsToBackend = async (
    threads: ChatThread[],
    threadId: string | null,
  ) => {
    if (!backendChatSyncEnabled) {
      return;
    }

    try {
      await syncHandbookAdvisorChatHistory({
        current_thread_id: threadId,
        threads: threads.map(toBackendChatThread),
        faculty_slug: primaryFacultySlug,
      });
    } catch (error) {
      console.error(
        "Backend chat sync unavailable; continuing locally:",
        error,
      );
      setBackendChatSyncEnabled(false);
    }
  };

  const appendMessageToThread = (threadId: string, message: Message) => {
    setRecentChats((prev) => {
      const existing = prev.find((thread) => thread.id === threadId);
      const sourceMessages =
        existing?.messages ??
        (threadId === currentThreadIdRef.current ? messagesRef.current : []);
      const nextMessages = [...sourceMessages, message];
      const nextThread = buildChatThread(threadId, nextMessages, existing);

      return [nextThread, ...prev.filter((thread) => thread.id !== threadId)];
    });

    if (threadId === currentThreadIdRef.current) {
      setMessages((prev) => [...prev, message]);
    }
  };

  const upsertMessageInThread = (threadId: string, message: Message) => {
    setRecentChats((prev) => {
      const existing = prev.find((thread) => thread.id === threadId);
      const sourceMessages =
        existing?.messages ??
        (threadId === currentThreadIdRef.current ? messagesRef.current : []);
      const index = sourceMessages.findIndex((item) => item.id === message.id);
      const nextMessages =
        index >= 0
          ? sourceMessages.map((item) =>
              item.id === message.id ? { ...item, ...message } : item,
            )
          : [...sourceMessages, message];
      const nextThread = buildChatThread(threadId, nextMessages, existing);

      return [nextThread, ...prev.filter((thread) => thread.id !== threadId)];
    });

    if (threadId === currentThreadIdRef.current) {
      setMessages((prev) => {
        const index = prev.findIndex((item) => item.id === message.id);
        if (index >= 0) {
          return prev.map((item) =>
            item.id === message.id ? { ...item, ...message } : item,
          );
        }

        return [...prev, message];
      });
    }
  };

  const ensureFallbackNoticeInThread = (
    threadId: string,
    fallbackNoticeText: string,
  ) => {
    setRecentChats((prev) => {
      const existing = prev.find((thread) => thread.id === threadId);
      const sourceMessages =
        existing?.messages ??
        (threadId === currentThreadIdRef.current ? messagesRef.current : []);
      const nextMessages = sourceMessages.some(
        (item) => item.id === FALLBACK_NOTICE_ID,
      )
        ? sourceMessages
        : [...sourceMessages, createFallbackNotice(fallbackNoticeText)];
      const nextThread = buildChatThread(threadId, nextMessages, existing);

      return [nextThread, ...prev.filter((thread) => thread.id !== threadId)];
    });

    if (threadId === currentThreadIdRef.current) {
      setMessages((prev) =>
        prev.some((item) => item.id === FALLBACK_NOTICE_ID)
          ? prev
          : [...prev, createFallbackNotice(fallbackNoticeText)],
      );
    }
  };

  const appendFallbackNoticeAndMessage = (
    threadId: string,
    fallbackNoticeText: string,
    message: Message,
  ) => {
    setRecentChats((prev) => {
      const existing = prev.find((thread) => thread.id === threadId);
      const sourceMessages =
        existing?.messages ??
        (threadId === currentThreadIdRef.current ? messagesRef.current : []);
      const withFallbackNotice = sourceMessages.some(
        (item) => item.id === FALLBACK_NOTICE_ID,
      )
        ? sourceMessages
        : [...sourceMessages, createFallbackNotice(fallbackNoticeText)];
      const nextMessages = [...withFallbackNotice, message];
      const nextThread = buildChatThread(threadId, nextMessages, existing);

      return [nextThread, ...prev.filter((thread) => thread.id !== threadId)];
    });

    if (threadId === currentThreadIdRef.current) {
      setMessages((prev) => {
        const withFallbackNotice = prev.some(
          (item) => item.id === FALLBACK_NOTICE_ID,
        )
          ? prev
          : [...prev, createFallbackNotice(fallbackNoticeText)];
        return [...withFallbackNotice, message];
      });
    }
  };

  const filteredRecentChats = useMemo(() => {
    const normalizedQuery = chatSearchQuery.trim().toLowerCase();

    if (normalizedQuery.length === 0) {
      return recentChats;
    }

    return recentChats.filter((chat) => {
      const messageText = chat.messages
        .map((message) => message.text)
        .join(" ")
        .toLowerCase();
      const haystack =
        `${chat.title} ${chat.preview} ${messageText}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [chatSearchQuery, recentChats]);

  useEffect(() => {
    currentThreadIdRef.current = currentThreadId;
  }, [currentThreadId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    // Wait until we know which student is logged in before restoring their history.
    if (!userContext?.studentNumber) {
      return;
    }

    let isMounted = true;
    const studentStorageKey = bluBotStorageKey(userContext.studentNumber);

    const restoreChats = async () => {
      try {
        // Always start BluBot on a fresh thread — previous conversations are
        // accessible via the sidebar but the active view is always a new chat.
        // This prevents BluBot from picking up mid-conversation state on entry.
        const freshThreadId = createChatId();

        if (backendChatSyncEnabled) {
          try {
            const backendHistory = await getHandbookAdvisorChatHistory({
              faculty_slug: primaryFacultySlug,
            });
            if (!isMounted) {
              return;
            }

            const backendThreads = Array.isArray(backendHistory.threads)
              ? backendHistory.threads.map(parseBackendChatThread)
              : [];

            if (backendThreads.length > 0) {
              setRecentChats(backendThreads);
              // Use a fresh thread — sidebar shows history but active is new.
              setCurrentThreadId(freshThreadId);
              setMessages([]);
              return;
            }
          } catch (error) {
            console.error(
              "Backend chat restore unavailable; using local history:",
              error,
            );
            setBackendChatSyncEnabled(false);
          }
        }

        const raw = await AsyncStorage.getItem(studentStorageKey);
        if (!raw || !isMounted) {
          return;
        }

        const parsed = JSON.parse(raw) as PersistedChatState;
        const restoredChats = Array.isArray(parsed.recentChats)
          ? parsed.recentChats.map(parsePersistedChatThread)
          : [];

        if (!isMounted) {
          return;
        }

        setRecentChats(restoredChats);
        // Always open on a fresh thread even when restoring from local storage.
        setCurrentThreadId(freshThreadId);
        setMessages([]);
      } catch (error) {
        console.error("Failed to restore BluBot chats:", error);
      } finally {
        if (isMounted) {
          setHasRestoredChats(true);
        }
      }
    };

    void restoreChats();

    return () => {
      isMounted = false;
    };
  }, [userContext?.studentNumber]);

  useEffect(() => {
    if (!hasRestoredChats) {
      return;
    }

    if (!userContext?.studentNumber) {
      return;
    }

    const persistChats = async () => {
      try {
        const payload: PersistedChatState = {
          currentThreadId,
          recentChats: recentChats.map(serializeChatThread),
        };
        await AsyncStorage.setItem(
          bluBotStorageKey(userContext.studentNumber),
          JSON.stringify(payload),
        );
      } catch (error) {
        console.error("Failed to persist BluBot chats:", error);
      }
    };

    void persistChats();
  }, [currentThreadId, hasRestoredChats, recentChats, userContext?.studentNumber]);

  useEffect(() => {
    if (!hasRestoredChats) {
      return;
    }

    void syncThreadsToBackend(recentChats, currentThreadId);
  }, [backendChatSyncEnabled, currentThreadId, hasRestoredChats, recentChats]);

  useEffect(() => {
    let isActive = true;

    getBackendHealth()
      .then(() => {
        if (isActive) {
          setConnectionMode("online");
          setLastBackendSyncedAt(new Date().toISOString());
          setIsFallbackGuidance(false);
        }
      })
      .catch(() => {
        if (isActive) {
          setConnectionMode("fallback");
          setIsFallbackGuidance(true);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  // Spin animation for bot avatar loading state
  useEffect(() => {
    if (isLoading) {
      let active = true;

      const runSpin = () => {
        spinValue.setValue(0);
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 900,
          easing: Easing.linear,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished && active) {
            runSpin();
          }
        });
      };

      runSpin();

      return () => {
        active = false;
        spinValue.setValue(0);
      };
    }
  }, [isLoading]);

  // Scroll button animation
  useEffect(() => {
    Animated.timing(scrollButtonOpacity, {
      toValue: showScrollButton ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [showScrollButton]);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";

    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const keyboardDidShowListener = Keyboard.addListener(showEvent, () => {
      setKeyboardVisible(true);
    });

    const keyboardDidHideListener = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
    });

    return () => {
      keyboardDidHideListener.remove();
      keyboardDidShowListener.remove();
    };
  }, []);

  useEffect(() => {
    if (flatListRef.current && messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({
          animated: true,
        });
      }, 100);
    }
  }, [messages]);

  const getRelativeTime = (date: Date): string => {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return "Just now";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400)
      return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  const handleCopyMessage = async (text: string, messageId: string) => {
    try {
      if (Platform.OS === "web") {
        await navigator.clipboard.writeText(text);
      } else {
        await Clipboard.setStringAsync(text);
      }
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const handleEditMessage = (text: string) => {
    setInputValue(text);
    setActiveMessageId(null);
  };

  const scrollToBottom = () => {
    flatListRef.current?.scrollToEnd({ animated: true });
    setShowScrollButton(false);
  };

  const handleScroll = (event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const isNearBottom =
      contentOffset.y + layoutMeasurement.height >= contentSize.height - 100;
    setShowScrollButton(!isNearBottom && messages.length > 3);
  };

  const handleSuggestedPrompt = (prompt: string) => {
    setInputValue(prompt);
    void handleSendMessage(prompt);
  };

  const handleNewChat = () => {
    setCurrentThreadId(createChatId());
    setMessages([]);
    setInputValue("");
    setSelectedUpload(null);
    setCopiedMessageId(null);
    setHoveredMessageId(null);
    setActiveMessageId(null);
    setShowScrollButton(false);
    setChatSearchQuery("");
    setRenamingThreadId(null);
    setRenameDraft("");
    setIsSidebarOpen(false);
  };

  const handleBeginRenameThread = (thread: ChatThread) => {
    setRenamingThreadId(thread.id);
    setRenameDraft(thread.customTitle || thread.title);
  };

  const handleCancelRenameThread = () => {
    setRenamingThreadId(null);
    setRenameDraft("");
  };

  const handleCommitRenameThread = (threadId: string) => {
    const trimmed = renameDraft.trim();
    if (!trimmed) {
      return;
    }

    setRecentChats((prev) =>
      prev.map((thread) => {
        if (thread.id !== threadId) {
          return thread;
        }

        const title = truncateText(normalizePreviewText(trimmed), 30);
        return {
          ...thread,
          title,
          customTitle: title,
        };
      }),
    );

    if (backendChatSyncEnabled) {
      void renameHandbookAdvisorChatThread({
        thread_id: threadId,
        title: trimmed,
        faculty_slug: primaryFacultySlug,
      }).catch((error: unknown) => {
        console.error(
          "Backend rename unavailable; keeping local rename only:",
          error,
        );
        setBackendChatSyncEnabled(false);
      });
    }

    setRenamingThreadId(null);
    setRenameDraft("");
  };

  const handleDeleteThread = (threadId: string) => {
    setPendingByThread((prev) => {
      const { [threadId]: _removed, ...rest } = prev;
      return rest;
    });

    setRecentChats((prev) => {
      const next = prev.filter((thread) => thread.id !== threadId);

      if (threadId === currentThreadIdRef.current) {
        const replacement = next[0];
        if (replacement) {
          setCurrentThreadId(replacement.id);
          setMessages(replacement.messages.map((message) => ({ ...message })));
        } else {
          setCurrentThreadId(createChatId());
          setMessages([]);
        }
      }

      return next;
    });

    if (backendChatSyncEnabled) {
      void deleteHandbookAdvisorChatThread({
        thread_id: threadId,
        faculty_slug: primaryFacultySlug,
      }).catch((error: unknown) => {
        console.error(
          "Backend delete unavailable; keeping local deletion only:",
          error,
        );
        setBackendChatSyncEnabled(false);
      });
    }

    if (renamingThreadId === threadId) {
      setRenamingThreadId(null);
      setRenameDraft("");
    }
  };

  const handleSelectThread = (thread: ChatThread) => {
    setCurrentThreadId(thread.id);
    setMessages(thread.messages.map((message) => ({ ...message })));
    setInputValue("");
    setSelectedUpload(null);
    setCopiedMessageId(null);
    setHoveredMessageId(null);
    setActiveMessageId(null);
    setShowScrollButton(false);
    setRenamingThreadId(null);
    setRenameDraft("");
    setIsSidebarOpen(false);
  };

  const handlePickUpload = async (): Promise<void> => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: "*/*",
      });

      if (result.canceled || result.assets.length === 0) {
        return;
      }

      setSelectedUpload(result.assets[0]);
    } catch (error) {
      console.error("Upload selection failed:", error);
      Alert.alert("Upload", "Couldn't select a file. Please try again.");
    }
  };

  const handleSendMessage = async (promptOverride?: string): Promise<void> => {
    const targetThreadId = currentThreadId;
    const trimmedInput = (promptOverride ?? inputValue).trim();
    const pendingUpload = selectedUpload;
    const uploadName = pendingUpload?.name?.trim() || "attachment";
    const hasUpload = Boolean(pendingUpload);
    const mirrorsGreeting = userStartsWithGreeting(trimmedInput);
    const responseTone = detectResponseTone(trimmedInput);

    if (trimmedInput.length === 0 && !hasUpload) {
      return;
    }

    const userFacingText = hasUpload
      ? [trimmedInput, `[Attachment: ${uploadName}]`]
          .filter((line) => line.length > 0)
          .join("\n")
      : trimmedInput;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: userFacingText,
      sender: "user",
      timestamp: new Date(),
    };

    appendMessageToThread(targetThreadId, userMessage);
    setInputValue("");
    setSelectedUpload(null);

    const persona: BluBotPersona = hasUpload
      ? "professional"
      : detectPersona(trimmedInput);

    if (persona === "social" && !hasUpload) {
      const socialMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: buildSocialResponse(trimmedInput, firstName),
        sender: "bot",
        timestamp: new Date(),
      };
      appendMessageToThread(targetThreadId, socialMessage);
      return;
    }

    adjustPendingForThread(targetThreadId, 1);

    const pendingBotMessageId = `${Date.now()}-pending-bot`;

    const userPromptForAdvisor =
      trimmedInput.length > 0
        ? trimmedInput
        : "Please analyze the uploaded attachment in context.";

    const professionalPersonaInstruction = `Persona: You are BluBot in warm, human academic-advisor mode. Speak naturally and helpfully. Get straight to the answer. Do not explain who you are, do not restate the user's question, and do not use stiff assistant phrases. Do not greet the user unless they greet first. Keep the tone friendly, clear, and engaging. Give practical next steps when useful. If confidence is low, say so plainly and suggest checking with a student advisor. Never cut your response off before finishing — complete every point fully. ${buildToneInstruction(responseTone)}`;
    const advisorTopK = selectedModelProfile === "fast" ? 3 : 8;
    // Always include advisor context — fast mode no longer strips the student
    // profile. The backend already handles what to include per intent.
    const contextForRequest = advisorContext;

    const contextualQuery = contextForRequest
      ? `${contextForRequest}\n${crossMajorFacultyHint ? `\n${crossMajorFacultyHint}` : ""}\n\n${professionalPersonaInstruction}\n\nStudent question:\n${userPromptForAdvisor}`
      : `${crossMajorFacultyHint ? `${crossMajorFacultyHint}\n\n` : ""}${professionalPersonaInstruction}\n\nStudent question:\n${userPromptForAdvisor}`;

    // Build conversation history from the current thread — last 10 visible turns.
    // Exclude system messages and the message we just appended (the current user question).
    const recentHistory = messagesRef.current
      .filter((m) => m.sender === "user" || m.sender === "bot")
      .slice(-11, -1) // last 10 before the current message
      .map((m) => ({
        role: (m.sender === "user" ? "user" : "assistant") as "user" | "assistant",
        text: m.text,
      }));

    try {
      if (pendingUpload) {
        // File uploads don't support streaming — fall back to one-shot request.
        const advisorReply = await askHandbookAdvisorWithUpload({
          query: contextualQuery,
          top_k: advisorTopK,
          model_profile: selectedModelProfile,
          student_context: studentContextPayload,
          faculty_slug: primaryFacultySlug,
          attachment: {
            uri: pendingUpload.uri,
            name: pendingUpload.name,
            mimeType: pendingUpload.mimeType,
            file: pendingUpload.file,
          },
        });

        setConnectionMode("online");
        setLastBackendSyncedAt(new Date().toISOString());
        setIsFallbackGuidance(false);

        const botMessage: Message = {
          id: pendingBotMessageId,
          text: polishAdvisorReply(
            addAdvisorEscalationIfNeeded(
              formatAdvisorResponse(advisorReply.answer, advisorReply.citations),
            ),
            firstName,
            responseTone,
            mirrorsGreeting,
          ),
          sender: "bot",
          timestamp: new Date(),
        };

        upsertMessageInThread(targetThreadId, botMessage);
      } else {
        // Streaming path — tokens arrive progressively for a live-typing feel.
        let accumulatedText = "";
        let streamedCitations: ScienceAdvisorCitation[] = [];
        let streamErrored = false;
        let firstTokenReceived = false;

        setStreamStatus("Thinking...");

        await new Promise<void>((resolve) => {
          const callbacks: BluBotStreamCallbacks = {
            onStatus(text) {
              setStreamStatus(text);
            },
            onToken(token) {
              if (!firstTokenReceived) {
                firstTokenReceived = true;
                setStreamStatus("");
              }
              accumulatedText += token;
              upsertMessageInThread(targetThreadId, {
                id: pendingBotMessageId,
                text: accumulatedText,
                sender: "bot",
                timestamp: new Date(),
              });
            },
            onDone(meta) {
              streamedCitations = (meta.citations ?? []) as ScienceAdvisorCitation[];
              setStreamStatus("");
              resolve();
            },
            onError(message) {
              streamErrored = true;
              accumulatedText = message;
              setStreamStatus("");
              resolve();
            },
          };

          void askHandbookAdvisorStream(
            {
              query: contextualQuery,
              top_k: advisorTopK,
              model_profile: selectedModelProfile,
              student_context: studentContextPayload,
              faculty_slug: primaryFacultySlug,
              conversation_history: recentHistory.length > 0 ? recentHistory : undefined,
            },
            callbacks,
          );
        });

        if (streamErrored) {
          throw new Error(accumulatedText);
        }

        setConnectionMode("online");
        setLastBackendSyncedAt(new Date().toISOString());
        setIsFallbackGuidance(false);

        // Polish the final accumulated text the same way as the one-shot path.
        const finalText = polishAdvisorReply(
          addAdvisorEscalationIfNeeded(
            formatAdvisorResponse(accumulatedText, streamedCitations),
          ),
          firstName,
          responseTone,
          mirrorsGreeting,
        );

        upsertMessageInThread(targetThreadId, {
          id: pendingBotMessageId,
          text: finalText,
          sender: "bot",
          timestamp: new Date(),
        });
      }
    } catch (error) {
      console.error("Backend advisor request failed:", error);

      const advisorError = getUserFacingAdvisorError(error);
      setConnectionMode(advisorError.networkFailure ? "fallback" : "online");
      if (advisorError.networkFailure) {
        setIsFallbackGuidance(true);
      }

      const botMessage: Message = {
        id: pendingBotMessageId,
        text: ensureFriendlyGreeting(
          advisorError.message,
          firstName,
          responseTone,
          mirrorsGreeting,
        ),
        sender: "bot",
        timestamp: new Date(),
      };

      if (advisorError.networkFailure) {
        const fallbackNotice = buildGuidanceTrustMessage({
          syncStatus: "error",
          syncError: "Backend unavailable: BluBot is in fallback mode.",
          lastSyncedAt: lastBackendSyncedAt,
          hasSession: true,
          hasFallbackData: true,
          staleAfterMinutes: 10,
        });
        ensureFallbackNoticeInThread(targetThreadId, fallbackNotice.message);
        upsertMessageInThread(targetThreadId, botMessage);
      } else {
        setIsFallbackGuidance(false);
        setLastBackendSyncedAt(new Date().toISOString());
        upsertMessageInThread(targetThreadId, botMessage);
      }
    } finally {
      adjustPendingForThread(targetThreadId, -1);
      setStreamStatus("");
    }
  };

  const handleKeyPress = (e: any) => {
    if (isWeb) {
      if (e.nativeEvent.key === "Enter" && !e.nativeEvent.shiftKey) {
        e.preventDefault();
        if (inputValue.trim().length > 0 || selectedUpload) {
          void handleSendMessage();
        }
      }
    }
  };

  const renderMessage: ListRenderItem<Message> = ({ item, index }) => {
    const isUserMessage = item.sender === "user";
    const isSystemMessage = item.sender === "system";
    const isCopied = copiedMessageId === item.id;
    const showActions =
      hoveredMessageId === item.id || activeMessageId === item.id;
    const prevMessage = index > 0 ? messages[index - 1] : null;
    const showTimestamp =
      !prevMessage ||
      item.timestamp.getTime() - prevMessage.timestamp.getTime() > 300000; // 5 min

    if (isSystemMessage) {
      return (
        <View style={styles.systemMessageContainer}>
          <View style={styles.systemMessageBubble}>
            {renderFormattedMessageContent(item.text, "system")}
          </View>
        </View>
      );
    }

    return (
      <View style={styles.messageContainer}>
        {showTimestamp && (
          <Text style={styles.timestamp}>
            {getRelativeTime(item.timestamp)}
          </Text>
        )}
        <View
          style={[styles.messageRow, isUserMessage && styles.userMessageRow]}
        >
          {!isUserMessage && (
            <View style={styles.botAvatar}>
              <MaterialIcons
                name="smart-toy"
                size={20}
                color={theme.colors.babyBlue}
              />
            </View>
          )}
          <Pressable
            style={
              isUserMessage ? styles.userMessageColumn : styles.botMessageColumn
            }
            onHoverIn={() => setHoveredMessageId(item.id)}
            onHoverOut={() => setHoveredMessageId(null)}
            onPress={() =>
              !isWeb &&
              setActiveMessageId((prev) => (prev === item.id ? null : item.id))
            }
          >
            <View
              style={
                isUserMessage
                  ? [styles.messageBubble, styles.userMessageBubble]
                  : styles.botMessagePlain
              }
            >
              {renderFormattedMessageContent(
                item.text,
                isUserMessage ? "user" : "bot",
              )}
            </View>
            {showActions && (
              <View
                style={[
                  styles.messageActionBar,
                  isUserMessage && styles.messageActionBarUser,
                ]}
              >
                <TouchableOpacity
                  style={styles.messageActionButton}
                  onPress={() => handleCopyMessage(item.text, item.id)}
                  activeOpacity={0.7}
                >
                  <MaterialIcons
                    name={isCopied ? "check" : "content-copy"}
                    size={14}
                    color={
                      isCopied ? theme.colors.success : theme.colors.textMuted
                    }
                  />
                </TouchableOpacity>
                {isUserMessage && (
                  <TouchableOpacity
                    style={styles.messageActionButton}
                    onPress={() => handleEditMessage(item.text)}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons
                      name="edit"
                      size={14}
                      color={theme.colors.textMuted}
                    />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </Pressable>
        </View>
      </View>
    );
  };

  const renderLoadingIndicator = (): React.ReactElement | null => {
    if (!isLoading) {
      return null;
    }

    const spin = spinValue.interpolate({
      inputRange: [0, 1],
      outputRange: ["0deg", "360deg"],
    });

    return (
      <View style={styles.messageContainer}>
        <View style={[styles.messageRow, { alignItems: "center" }]}>
          <View style={styles.botAvatarSpinWrap}>
            <Animated.View
              style={[
                styles.botAvatarSpinRing,
                { transform: [{ rotate: spin }] },
              ]}
            />
            <View style={styles.botAvatar}>
              <MaterialIcons
                name="smart-toy"
                size={20}
                color={theme.colors.babyBlue}
              />
            </View>
          </View>
          {streamStatus ? (
            <View style={styles.streamStatusWrap}>
              <Text style={styles.streamStatusText}>{streamStatus}</Text>
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  const renderGreeting = () => (
    <View style={styles.greetingContent}>
      <View style={styles.greetingHeader}>
        <Text style={styles.greetingTitle}>
          How can I help you today {firstName}?
        </Text>
      </View>
    </View>
  );

  const renderInputBar = (isCentered: boolean = false) => {
    const isSendDisabled = inputValue.trim().length === 0 && !selectedUpload;
    const selectedModelOption =
      BLUBOT_MODEL_OPTIONS.find(
        (option) => option.id === selectedModelProfile,
      ) ?? BLUBOT_MODEL_OPTIONS[0];

    const wrapperStyles = [
      styles.inputWrapperBase,
      isWeb && styles.inputWrapperWeb,
      !isWeb && isKeyboardVisible && styles.inputWrapperMobileAnchored,
      !isWeb && !isKeyboardVisible && styles.inputWrapperMobileFloating,
      isCentered && styles.inputWrapperCentered,
    ];

    return (
      <View style={wrapperStyles}>
        <TouchableOpacity
          style={[styles.uploadButton, isCentered && styles.uploadButtonLarge]}
          onPress={() => {
            setIsModelMenuOpen(false);
            void handlePickUpload();
          }}
          activeOpacity={0.7}
        >
          <MaterialIcons
            name="add"
            size={isCentered ? 24 : 20}
            color={theme.colors.deepBlue}
          />
        </TouchableOpacity>
        <View style={styles.inputContainer}>
          {selectedUpload && (
            <View style={styles.uploadChip}>
              <MaterialIcons
                name="attach-file"
                size={14}
                color={theme.colors.deepBlue}
              />
              <Text style={styles.uploadChipText} numberOfLines={1}>
                {selectedUpload.name}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setSelectedUpload(null);
                }}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                accessibilityLabel="Remove selected upload"
              >
                <MaterialIcons
                  name="close"
                  size={14}
                  color={theme.colors.textMuted}
                />
              </TouchableOpacity>
            </View>
          )}
          <TextInput
            style={[styles.input, isCentered && styles.inputLarge]}
            placeholder="Talk to BluBot"
            placeholderTextColor={theme.colors.textMuted}
            value={inputValue}
            onChangeText={(text) => {
              setInputValue(text);
            }}
            multiline
            editable
            onFocus={() => {
              setIsModelMenuOpen(false);
            }}
            onKeyPress={handleKeyPress}
          />
        </View>
        <View style={styles.modelDropdownWrapRight}>
          <TouchableOpacity
            style={styles.modelDropdownTrigger}
            onPress={() => {
              setIsModelMenuOpen((prev) => !prev);
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.modelDropdownValue}>
              {selectedModelOption.label}
            </Text>
            <MaterialIcons
              name={isModelMenuOpen ? "arrow-drop-up" : "arrow-drop-down"}
              size={20}
              color={theme.colors.deepBlue}
            />
          </TouchableOpacity>
          {isModelMenuOpen && (
            <View style={styles.modelDropdownMenuRight}>
              {BLUBOT_MODEL_OPTIONS.map((option) => {
                const isActive = selectedModelProfile === option.id;

                return (
                  <TouchableOpacity
                    key={option.id}
                    style={styles.modelDropdownOption}
                    onPress={() => {
                      setSelectedModelProfile(option.id);
                      setIsModelMenuOpen(false);
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={styles.modelDropdownOptionTextGroup}>
                      <Text
                        style={[
                          styles.modelDropdownOptionLabel,
                          isActive && styles.modelDropdownOptionLabelActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                      <Text style={styles.modelDropdownOptionDescription}>
                        {option.description}
                      </Text>
                    </View>
                    {isActive && (
                      <MaterialIcons
                        name="check"
                        size={16}
                        color={theme.colors.deepBlue}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
        <TouchableOpacity
          style={[
            styles.sendButton,
            isCentered && styles.sendButtonLarge,
            isSendDisabled && styles.sendButtonDisabled,
          ]}
          onPress={() => {
            setIsModelMenuOpen(false);
            void handleSendMessage();
          }}
          activeOpacity={0.7}
          disabled={isSendDisabled}
        >
          <MaterialIcons
            name="send"
            size={isCentered ? 24 : 20}
            color={isSendDisabled ? theme.colors.textMuted : theme.colors.white}
          />
        </TouchableOpacity>
      </View>
    );
  };

  const renderSidebar = () => (
    <View style={styles.sidebarPanel}>
      <TouchableOpacity
        style={styles.sidebarPrimaryAction}
        onPress={handleNewChat}
        activeOpacity={0.8}
      >
        <MaterialIcons
          name="add-circle-outline"
          size={20}
          color={theme.colors.deepBlue}
        />
        <Text style={styles.sidebarPrimaryActionText}>New Chat</Text>
      </TouchableOpacity>

      <View style={styles.sidebarSearchSection}>
        <View style={styles.sidebarSectionHeaderRow}>
          <MaterialIcons
            name="search"
            size={18}
            color={theme.colors.textSecondary}
          />
          <Text style={styles.sidebarSectionLabel}>Search Chat</Text>
        </View>
        <View style={styles.sidebarSearchInputShell}>
          <MaterialIcons
            name="manage-search"
            size={18}
            color={theme.colors.textMuted}
          />
          <TextInput
            style={styles.sidebarSearchInput}
            placeholder="Find a recent conversation"
            placeholderTextColor={theme.colors.textMuted}
            value={chatSearchQuery}
            onChangeText={setChatSearchQuery}
          />
        </View>
      </View>

      <View style={styles.sidebarRecentSection}>
        <Text style={styles.sidebarSectionTitle}>Recent Chats</Text>
        <ScrollView
          style={styles.sidebarRecentScrollView}
          contentContainerStyle={styles.sidebarRecentScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {filteredRecentChats.length === 0 ? (
            <View style={styles.sidebarEmptyState}>
              <Text style={styles.sidebarEmptyStateTitle}>
                No recent chats yet
              </Text>
              <Text style={styles.sidebarEmptyStateText}>
                Start a new conversation and it will appear here.
              </Text>
            </View>
          ) : (
            filteredRecentChats.map((chat) => {
              const isActiveThread = chat.id === currentThreadId;
              const isRenaming = renamingThreadId === chat.id;

              return (
                <TouchableOpacity
                  key={chat.id}
                  style={[
                    styles.recentChatCard,
                    isActiveThread && styles.recentChatCardActive,
                  ]}
                  onPress={() => handleSelectThread(chat)}
                  disabled={isRenaming}
                  activeOpacity={0.8}
                >
                  <View style={styles.recentChatCardHeader}>
                    {isRenaming ? (
                      <TextInput
                        style={styles.recentChatRenameInput}
                        value={renameDraft}
                        onChangeText={setRenameDraft}
                        autoFocus
                        maxLength={48}
                        placeholder="Chat title"
                        placeholderTextColor={theme.colors.textMuted}
                        onSubmitEditing={() =>
                          handleCommitRenameThread(chat.id)
                        }
                      />
                    ) : (
                      <Text
                        style={[
                          styles.recentChatTitle,
                          isActiveThread && styles.recentChatTitleActive,
                        ]}
                        numberOfLines={1}
                      >
                        {chat.title}
                      </Text>
                    )}
                    <View style={styles.recentChatHeaderActions}>
                      {isRenaming ? (
                        <>
                          <TouchableOpacity
                            style={styles.recentChatActionButton}
                            onPress={() => handleCommitRenameThread(chat.id)}
                            hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                            accessibilityLabel={`Save chat title ${chat.title}`}
                          >
                            <MaterialIcons
                              name="check"
                              size={16}
                              color={theme.colors.success}
                            />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.recentChatActionButton}
                            onPress={handleCancelRenameThread}
                            hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                            accessibilityLabel={`Cancel chat title edit ${chat.title}`}
                          >
                            <MaterialIcons
                              name="close"
                              size={16}
                              color={theme.colors.textMuted}
                            />
                          </TouchableOpacity>
                        </>
                      ) : (
                        <>
                          <Text style={styles.recentChatTime}>
                            {getRelativeTime(chat.updatedAt)}
                          </Text>
                          <TouchableOpacity
                            style={styles.recentChatActionButton}
                            onPress={() => handleBeginRenameThread(chat)}
                            hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                            accessibilityLabel={`Rename chat ${chat.title}`}
                          >
                            <MaterialIcons
                              name="edit"
                              size={16}
                              color={theme.colors.textMuted}
                            />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.recentChatActionButton}
                            onPress={() => handleDeleteThread(chat.id)}
                            hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                            accessibilityLabel={`Delete chat ${chat.title}`}
                          >
                            <MaterialIcons
                              name="delete-outline"
                              size={16}
                              color={theme.colors.textMuted}
                            />
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  </View>
                  <Text style={styles.recentChatPreview} numberOfLines={2}>
                    {chat.preview}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerMenuButton}
          onPress={() => setIsSidebarOpen((prev) => !prev)}
          activeOpacity={0.8}
          accessibilityLabel={
            isSidebarOpen ? "Collapse chat sidebar" : "Expand chat sidebar"
          }
        >
          <MaterialIcons
            name={isSidebarOpen ? "menu-open" : "menu"}
            size={24}
            color={theme.colors.deepBlue}
          />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>BluBot</Text>
        </View>
      </View>

      <View style={styles.bodyShell}>
        {isSidebarOpen && (
          <Pressable
            style={styles.sidebarBackdrop}
            onPress={() => setIsSidebarOpen(false)}
          />
        )}

        {isSidebarOpen && renderSidebar()}

        <View style={styles.mainContentShell}>
          <View style={styles.webConstrainer}>
            {isWeb && messages.length === 0 ? (
              <View style={styles.emptyStateContainer}>
                {renderGreeting()}

                {renderInputBar(true)}
              </View>
            ) : (
              <KeyboardAvoidingView
                style={styles.keyboardAvoidingView}
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
              >
                {messages.length === 0 ? (
                  <ScrollView
                    contentContainerStyle={styles.emptyStateScrollContent}
                    showsVerticalScrollIndicator={false}
                  >
                    {renderGreeting()}
                  </ScrollView>
                ) : (
                  <View style={styles.chatContainer}>
                    <FlatList
                      ref={flatListRef}
                      data={messages}
                      renderItem={renderMessage}
                      keyExtractor={(item) => item.id}
                      contentContainerStyle={styles.messagesContent}
                      ListFooterComponent={renderLoadingIndicator()}
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator={!isWeb}
                      onScroll={handleScroll}
                      scrollEventThrottle={16}
                      style={styles.messagesList}
                    />

                    {showScrollButton && (
                      <Animated.View
                        style={[
                          styles.scrollToBottomButton,
                          { opacity: scrollButtonOpacity },
                        ]}
                      >
                        <TouchableOpacity
                          style={styles.scrollToBottomButtonInner}
                          onPress={scrollToBottom}
                          activeOpacity={0.8}
                        >
                          <MaterialIcons
                            name="keyboard-arrow-down"
                            size={24}
                            color={theme.colors.white}
                          />
                        </TouchableOpacity>
                      </Animated.View>
                    )}
                  </View>
                )}

                <View style={styles.bottomInputContainer}>
                  {renderInputBar(false)}
                </View>
              </KeyboardAvoidingView>
            )}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  webConstrainer: {
    flex: 1,
    width: "100%",
    maxWidth: Platform.OS === "web" ? 900 : "100%",
    alignSelf: "center",
    backgroundColor: theme.colors.background,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  bodyShell: {
    flex: 1,
    position: "relative",
  },
  mainContentShell: {
    flex: 1,
  },
  header: {
    position: "relative",
    backgroundColor: theme.colors.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.grayLight,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    ...Platform.select({
      web: {
        boxShadow: "0px 2px 8px rgba(0,0,0,0.04)",
      },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
      },
    }),
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    maxWidth: Platform.OS === "web" ? 900 : "100%",
    width: "100%",
    alignSelf: "center",
    minHeight: 40,
  },
  headerMenuButton: {
    position: "absolute",
    left: theme.spacing.lg,
    top: "50%",
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.grayLight,
    transform: [{ translateY: -20 }],
    zIndex: 2,
  },
  headerTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    textAlign: "center",
  },
  sidebarBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(26, 42, 68, 0.18)",
    zIndex: 4,
  },
  sidebarPanel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: Platform.OS === "web" ? 320 : 286,
    backgroundColor: theme.colors.white,
    borderRightWidth: 1,
    borderRightColor: theme.colors.gray,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    zIndex: 5,
    ...Platform.select({
      web: {
        boxShadow: "0px 12px 32px rgba(26,42,68,0.12)",
      },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 3, height: 0 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 8,
      },
    }),
  },
  sidebarPrimaryAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.grayLight,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.gray,
  },
  sidebarPrimaryActionText: {
    fontSize: theme.fontSize.md,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  sidebarSearchSection: {
    marginTop: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  sidebarSectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  sidebarSectionLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  sidebarSearchInputShell: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.grayLight,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: Platform.OS === "web" ? 10 : 8,
    borderWidth: 1,
    borderColor: theme.colors.gray,
  },
  sidebarSearchInput: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    color: theme.colors.textPrimary,
    ...(Platform.OS === "web"
      ? {
          outlineStyle: "none" as any,
        }
      : {}),
  },
  sidebarRecentSection: {
    flex: 1,
    marginTop: theme.spacing.lg,
  },
  sidebarSectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  sidebarRecentScrollView: {
    flex: 1,
  },
  sidebarRecentScrollContent: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
  },
  sidebarEmptyState: {
    backgroundColor: theme.colors.grayLight,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.gray,
  },
  sidebarEmptyStateTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  sidebarEmptyStateText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textLight,
    lineHeight: 18,
  },
  recentChatCard: {
    backgroundColor: theme.colors.grayLight,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.gray,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  recentChatCardActive: {
    borderColor: theme.colors.accentBlue,
    backgroundColor: theme.colors.overlay,
  },
  recentChatCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  recentChatHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  recentChatRenameInput: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.grayDark,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: Platform.OS === "web" ? 5 : 4,
    ...(Platform.OS === "web"
      ? {
          outlineStyle: "none" as any,
        }
      : {}),
  },
  recentChatTitle: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  recentChatTitleActive: {
    color: theme.colors.deepBlue,
  },
  recentChatTime: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textMuted,
  },
  recentChatActionButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.gray,
  },
  recentChatPreview: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textLight,
    lineHeight: 18,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    marginLeft: theme.spacing.sm,
  },
  statusBadgeOnline: {
    backgroundColor: theme.colors.successLight,
  },
  statusBadgeChecking: {
    backgroundColor: theme.colors.grayLight,
  },
  statusBadgeFallback: {
    backgroundColor: theme.colors.overlay,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDotOnline: {
    backgroundColor: theme.colors.success,
  },
  statusDotChecking: {
    backgroundColor: theme.colors.accentBlue,
  },
  statusDotFallback: {
    backgroundColor: theme.colors.deepBlue,
  },
  statusText: {
    fontSize: theme.fontSize.xs,
    fontWeight: "600",
  },
  statusTextOnline: {
    color: theme.colors.success,
  },
  statusTextChecking: {
    color: theme.colors.accentBlue,
  },
  statusTextFallback: {
    color: theme.colors.deepBlue,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: Platform.OS === "web" ? theme.spacing.xl : 0,
    width: "100%",
  },
  emptyStateScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.xl,
  },
  greetingContent: {
    alignItems: "center",
    marginBottom: theme.spacing.xl,
    width: "100%",
  },
  greetingHeader: {
    alignItems: "center",
    marginBottom: theme.spacing.xl,
  },
  botAvatarLarge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: theme.colors.white,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: theme.spacing.lg,
    borderWidth: 3,
    borderColor: theme.colors.babyBlue,
    ...Platform.select({
      web: {
        boxShadow: "0px 8px 24px rgba(0,0,0,0.08)",
      },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 16,
        elevation: 8,
      },
    }),
  },
  greetingTitle: {
    fontSize: Platform.OS === "web" ? 18 : 16,
    fontWeight: "400",
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
    textAlign: "center",
  },
  greetingSubtitle: {
    fontSize: Platform.OS === "web" ? 20 : 18,
    color: theme.colors.textLight,
    textAlign: "center",
    maxWidth: 400,
  },
  suggestedPromptsContainer: {
    width: "100%",
    marginBottom: theme.spacing.xl,
  },
  suggestedPromptsTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.md,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  suggestedPromptsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.md,
    justifyContent: "center",
  },
  promptCard: {
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.grayLight,
    borderRadius: 16,
    padding: theme.spacing.lg,
    width: 160,
    alignItems: "center",
    gap: theme.spacing.sm,
    ...Platform.select({
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
      },
    }),
  },
  promptCardTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    textAlign: "center",
  },
  webSuggestedPromptsContainer: {
    width: "100%",
    maxWidth: 800,
    marginBottom: theme.spacing.xl,
    marginTop: theme.spacing.xl,
  },
  webPromptsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.lg,
    justifyContent: "center",
  },
  webPromptCard: {
    backgroundColor: theme.colors.white,
    borderWidth: 1.5,
    borderColor: theme.colors.grayLight,
    borderRadius: 20,
    padding: theme.spacing.xl,
    width: 180,
    alignItems: "center",
    gap: theme.spacing.md,
    ...Platform.select({
      web: {
        boxShadow: "0px 4px 12px rgba(0,0,0,0.06)",
        cursor: "pointer",
      },
    }),
  },
  webPromptCardTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    textAlign: "center",
  },
  webPromptCardSubtitle: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textMuted,
    textAlign: "center",
  },
  chatContainer: {
    flex: 1,
    position: "relative",
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  messageContainer: {
    marginBottom: theme.spacing.lg,
  },
  timestamp: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textMuted,
    textAlign: "center",
    marginBottom: theme.spacing.md,
    fontWeight: "500",
  },
  messageRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    gap: theme.spacing.sm,
  },
  userMessageRow: {
    justifyContent: "flex-end",
  },
  systemMessageContainer: {
    alignItems: "center",
    marginVertical: theme.spacing.md,
  },
  systemMessageBubble: {
    backgroundColor: theme.colors.grayLight,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: 12,
    overflow: "hidden",
  },
  systemMessageText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textMuted,
  },
  systemMessageBodyText: {
    color: theme.colors.textMuted,
  },
  botAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.white,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: theme.colors.babyBlue,
    ...Platform.select({
      default: {
        shadowColor: theme.colors.babyBlue,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 3,
      },
    }),
  },
  messageBubble: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: 20,
    position: "relative",
  },
  userMessageBubble: {
    backgroundColor: theme.colors.deepBlue,
    borderBottomRightRadius: 4,
    ...Platform.select({
      web: {
        boxShadow: "0px 2px 8px rgba(23, 92, 211, 0.25)",
      },
      default: {
        shadowColor: theme.colors.deepBlue,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 3,
      },
    }),
  },
  botMessageBubble: {
    backgroundColor: theme.colors.white,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: theme.colors.grayLight,
    ...Platform.select({
      web: {
        boxShadow: "0px 2px 8px rgba(0,0,0,0.06)",
      },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
      },
    }),
  },
  botMessagePlain: {
    maxWidth: Platform.OS === "web" ? "80%" : "88%",
    paddingVertical: theme.spacing.xs,
    position: "relative",
  },
  messageText: {
    fontSize: theme.fontSize.md,
    lineHeight: 22,
  },
  messageContentStack: {
    gap: theme.spacing.sm,
  },
  messageStrongText: {
    fontWeight: "700",
  },
  messageHeadingText: {
    fontWeight: "700",
    marginBottom: 2,
  },
  messageHeadingLarge: {
    fontSize: theme.fontSize.lg,
  },
  messageListMarker: {
    fontWeight: "700",
    width: 18,
    marginTop: 1,
  },
  messageListGroup: {
    gap: theme.spacing.xs,
  },
  messageListRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  messageListText: {
    flex: 1,
  },
  messageLinkText: {
    color: theme.colors.deepBlue,
    textDecorationLine: "underline",
  },
  userMessageLinkText: {
    color: theme.colors.white,
  },
  userMessageText: {
    color: theme.colors.white,
  },
  botMessageText: {
    color: theme.colors.textPrimary,
  },
  citationsSection: {
    gap: theme.spacing.xs,
  },
  citationsSectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: theme.colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  citationsChipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.xs,
  },
  citationChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.colors.grayLight,
    borderWidth: 1,
    borderColor: theme.colors.gray,
    borderRadius: theme.borderRadius.round,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    maxWidth: "100%",
  },
  citationChipText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textPrimary,
    flexShrink: 1,
  },
  codeBlockShell: {
    backgroundColor: "#0F1720",
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  codeBlockLabel: {
    fontSize: theme.fontSize.xs,
    color: "#9FB2C8",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  codeBlockText: {
    fontSize: theme.fontSize.sm,
    color: "#E8F0FE",
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
      web: "Consolas, Monaco, monospace",
    }),
    lineHeight: 20,
  },
  tableScrollView: {
    maxWidth: "100%",
  },
  tableCard: {
    borderWidth: 1,
    borderColor: theme.colors.gray,
    borderRadius: theme.borderRadius.md,
    overflow: "hidden",
    backgroundColor: theme.colors.white,
    minWidth: 320,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.gray,
  },
  tableHeaderRow: {
    backgroundColor: theme.colors.grayLight,
  },
  tableCell: {
    flex: 1,
    minWidth: 120,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderRightWidth: 1,
    borderRightColor: theme.colors.gray,
  },
  tableCellText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textPrimary,
  },
  tableHeaderCellText: {
    fontWeight: "700",
  },
  userMessageColumn: {
    maxWidth: Platform.OS === "web" ? "70%" : "75%",
  },
  botMessageColumn: {
    alignItems: "flex-start",
    maxWidth: Platform.OS === "web" ? "80%" : "88%",
  },
  messageActionBar: {
    flexDirection: "row",
    gap: 4,
    marginTop: 4,
    paddingHorizontal: 2,
    alignItems: "center",
  },
  messageActionBarUser: {
    justifyContent: "flex-end",
  },
  messageActionButton: {
    padding: 5,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.04)",
  },
  inputWrapperBase: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.grayLight,
    width: "100%",
    gap: theme.spacing.sm,
  },
  inputWrapperWeb: {
    borderRadius: 28,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    ...Platform.select({
      web: {
        boxShadow: "0px 4px 16px rgba(0,0,0,0.08)",
      },
    }),
  },
  inputWrapperMobileFloating: {
    marginHorizontal: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    borderRadius: 28,
    width: "100%",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    ...Platform.select({
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 6,
      },
    }),
  },
  inputWrapperMobileAnchored: {
    marginHorizontal: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    borderRadius: 28,
    borderBottomWidth: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    ...Platform.select({
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 4,
      },
    }),
  },
  inputWrapperCentered: {
    maxWidth: 700,
    paddingVertical: theme.spacing.md,
    borderRadius: 32,
    ...Platform.select({
      web: {
        boxShadow: "0px 8px 24px rgba(0,0,0,0.12)",
      },
    }),
  },
  bottomInputContainer: {
    borderTopWidth: Platform.OS === "web" ? 0 : 1,
    borderTopColor: theme.colors.grayLight,
    ...(Platform.OS === "web"
      ? {
          padding: theme.spacing.lg,
          backgroundColor: "transparent",
        }
      : {
          backgroundColor: theme.colors.white,
          paddingBottom: 0,
        }),
  },
  inputContainer: {
    flex: 1,
    position: "relative",
  },
  modelDropdownWrapRight: {
    position: "relative",
    zIndex: 3,
    marginBottom: 4,
  },
  modelDropdownTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  modelDropdownValue: {
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: theme.colors.deepBlue,
  },
  modelDropdownMenuRight: {
    position: "absolute",
    right: 0,
    bottom: 46,
    minWidth: 176,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.gray,
    ...Platform.select({
      web: {
        boxShadow: "0px 10px 24px rgba(0,0,0,0.12)",
      },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
        elevation: 8,
      },
    }),
  },
  modelDropdownOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  modelDropdownOptionTextGroup: {
    flexShrink: 1,
  },
  modelDropdownOptionLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  modelDropdownOptionLabelActive: {
    color: theme.colors.deepBlue,
  },
  modelDropdownOptionDescription: {
    marginTop: 2,
    fontSize: theme.fontSize.xs,
    color: theme.colors.textMuted,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: Platform.OS === "web" ? 48 : 56,
    paddingHorizontal: theme.spacing.md,
    paddingTop: Platform.OS === "ios" ? 14 : 12,
    paddingBottom: Platform.OS === "ios" ? 14 : 12,
    fontSize: theme.fontSize.md,
    color: theme.colors.textPrimary,
    lineHeight: 20,
    ...(Platform.OS === "web"
      ? {
          outlineStyle: "none" as any,
        }
      : {}),
  },
  inputLarge: {
    fontSize: theme.fontSize.lg,
    minHeight: 56,
    paddingTop: Platform.OS === "ios" ? 16 : 14,
    paddingBottom: Platform.OS === "ios" ? 16 : 14,
  },
  characterCounter: {
    position: "absolute",
    bottom: 4,
    right: 4,
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  characterCountText: {
    fontSize: 10,
    color: theme.colors.textMuted,
    fontWeight: "500",
  },
  characterCountWarning: {
    color: "#F44336",
  },
  uploadChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.grayLight,
    borderRadius: 12,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    marginTop: theme.spacing.xs,
    marginLeft: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
    maxWidth: "92%",
  },
  uploadChipText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.textPrimary,
    maxWidth: 220,
  },
  uploadButton: {
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.grayLight,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    height: Platform.OS === "web" ? 48 : 56,
    minWidth: Platform.OS === "web" ? 48 : 56,
    marginBottom: 4,
  },
  uploadButtonLarge: {
    height: 56,
    borderRadius: 28,
    minWidth: 56,
    marginBottom: 2,
  },
  sendButton: {
    backgroundColor: theme.colors.deepBlue,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: theme.spacing.lg,
    height: Platform.OS === "web" ? 48 : 56,
    minWidth: Platform.OS === "web" ? 48 : 56,
    marginBottom: 4,
    ...Platform.select({
      web: {},
      default: {
        shadowColor: theme.colors.deepBlue,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 4,
      },
    }),
  },
  sendButtonLarge: {
    height: 56,
    borderRadius: 28,
    paddingHorizontal: theme.spacing.xl,
    minWidth: 56,
    marginBottom: 2,
  },
  sendButtonDisabled: {
    backgroundColor: theme.colors.gray,
    ...Platform.select({
      default: {
        shadowOpacity: 0,
        elevation: 0,
      },
    }),
  },
  scrollToBottomButton: {
    position: "absolute",
    bottom: theme.spacing.lg,
    right: theme.spacing.lg,
    zIndex: 10,
  },
  scrollToBottomButtonInner: {
    backgroundColor: theme.colors.deepBlue,
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    ...Platform.select({
      web: {
        boxShadow: "0px 4px 12px rgba(23, 92, 211, 0.3)",
      },
      default: {
        shadowColor: theme.colors.deepBlue,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
      },
    }),
  },
  botAvatarSpinWrap: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  streamStatusWrap: {
    marginLeft: 10,
    justifyContent: "center",
  },
  streamStatusText: {
    fontSize: 13,
    color: theme.colors.textMuted,
    fontStyle: "italic",
  },
  botAvatarSpinRing: {
    position: "absolute",
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2.5,
    borderTopColor: theme.colors.deepBlue,
    borderRightColor: theme.colors.babyBlue,
    borderBottomColor: "transparent",
    borderLeftColor: "transparent",
  },
  typingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.babyBlue,
  },
});
