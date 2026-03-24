import { mockUsers } from "@/mocks/users";
import {
  getLocalAdvisorsResponse,
  getLocalRawCourses,
  getLocalRawMajors,
  LOCAL_RUN_ID,
} from "@/data/science-local-data";
import Constants from "expo-constants";
import { Platform } from "react-native";

interface BackendErrorPayload {
  detail?: string | Array<{ msg?: string }>;
}

const MOCK_ACCESS_TOKEN_PREFIX = "mock-token:";

function normalizeStudentNumber(value: string) {
  return value.trim().toUpperCase();
}

function findMockUser(studentNumber: string) {
  const normalizedStudentNumber = normalizeStudentNumber(studentNumber);

  return (
    mockUsers.find(
      (user) =>
        normalizeStudentNumber(user.studentNumber) === normalizedStudentNumber,
    ) ?? null
  );
}

function buildMockAuthPayload(studentNumber: string): StudentLoginResponse {
  const normalizedStudentNumber = normalizeStudentNumber(studentNumber);
  const expiresAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  return {
    authenticated: true,
    student_number: normalizedStudentNumber,
    access_token: `${MOCK_ACCESS_TOKEN_PREFIX}${normalizedStudentNumber}`,
    token_type: "bearer",
    expires_at_iso: expiresAt,
  };
}

function parseMockToken(accessToken: string) {
  if (!accessToken.startsWith(MOCK_ACCESS_TOKEN_PREFIX)) {
    return null;
  }

  const studentNumber = normalizeStudentNumber(
    accessToken.slice(MOCK_ACCESS_TOKEN_PREFIX.length),
  );

  if (!studentNumber) {
    return null;
  }

  return studentNumber;
}

const mockProfileOverrides = new Map<string, StudentProfileResponse>();
const mockPlanOverrides = new Map<string, StudentPlanResponse>();

function buildMockStudentProfileResponse(
  studentNumber: string,
): StudentProfileResponse | null {
  const normalizedStudentNumber = normalizeStudentNumber(studentNumber);
  const overridden = mockProfileOverrides.get(normalizedStudentNumber);
  if (overridden) {
    return {
      ...overridden,
      majors: [...overridden.majors],
    };
  }

  const mockUser = findMockUser(normalizedStudentNumber);
  if (!mockUser) {
    return null;
  }

  return {
    name: mockUser.name,
    student_number: normalizedStudentNumber,
    degree: mockUser.degree,
    year: mockUser.year,
    majors: [...mockUser.majors],
  };
}

function buildMockStudentPlanResponse(
  studentNumber: string,
): StudentPlanResponse | null {
  const normalizedStudentNumber = normalizeStudentNumber(studentNumber);
  const overridden = mockPlanOverrides.get(normalizedStudentNumber);
  if (overridden) {
    return {
      ...overridden,
      planned_courses: overridden.planned_courses.map((course) => ({
        ...course,
      })),
      selected_majors: [...overridden.selected_majors],
    };
  }

  const mockUser = findMockUser(normalizedStudentNumber);
  if (!mockUser) {
    return null;
  }

  return {
    student_number: normalizedStudentNumber,
    // Planned courses are intentionally empty until a student saves a plan.
    planned_courses: [],
    selected_majors: [...mockUser.majors],
    updated_at_iso: new Date().toISOString(),
  };
}


function buildMockScienceCoursesResponse(
  runId?: string,
): ScienceCourseCatalogResponse {
  const rawCourses = getLocalRawCourses();
  const byCode = new Map<string, ScienceCourseCatalogEntry>();

  for (const entry of rawCourses) {
    const normalized = normalizeScienceCourseCatalogEntry(
      entry as RawScienceCourseCatalogEntry,
    );
    if (!normalized.code) {
      continue;
    }
    // Keep the first occurrence of each code (department files don't overlap).
    if (!byCode.has(normalized.code)) {
      byCode.set(normalized.code, { ...normalized, source: "local-json" });
    }
  }

  const courses = Array.from(byCode.values()).sort((a, b) =>
    a.code.localeCompare(b.code),
  );

  return {
    run_id: runId || LOCAL_RUN_ID,
    count: courses.length,
    courses,
  };
}


function buildMockScienceMajorsResponse(runId?: string): ScienceMajorsResponse {
  const raw = getLocalRawMajors() as ScienceMajorsResponse & {
    majors: RawScienceMajorEntry[];
  };
  return normalizeScienceMajorsResponse({
    ...raw,
    run_id: runId || LOCAL_RUN_ID,
  });
}

export interface BackendHealthResponse {
  status: string;
  app: string;
  env: string;
  target_domain: string;
}

export interface SciencePipelineResponse {
  run_id: string;
  target_domain: string;
  document_count: number;
  events: Array<{
    agent: string;
    status: string;
    detail: string;
    timestamp_iso: string;
  }>;
  artifacts: Record<string, string | number>;
}

export interface ScienceAdvisorCitation {
  source: number;
  title: string;
  s3_key: string;
  score: number;
}

export interface ScienceAdvisorResponse {
  run_id: string | null;
  answer: string;
  citations: ScienceAdvisorCitation[];
  retrieval: Record<string, unknown>;
}

export interface ScienceAdvisorChatMessagePayload {
  id: string;
  text: string;
  sender: "user" | "bot" | "system";
  timestamp_iso: string;
}

export interface ScienceAdvisorChatThreadPayload {
  id: string;
  title: string;
  custom_title?: string | null;
  preview: string;
  updated_at_iso: string;
  messages: ScienceAdvisorChatMessagePayload[];
}

export interface ScienceAdvisorChatHistoryResponse {
  current_thread_id: string | null;
  threads: ScienceAdvisorChatThreadPayload[];
}

export interface UploadAttachment {
  uri: string;
  name?: string;
  mimeType?: string;
  file?: File;
}

export interface ScienceCourseCatalogEntry {
  id: string;
  code: string;
  title: string;
  group: "Year 1" | "Year 2" | "Year 3" | "Postgrad";
  credits: number;
  nqf_level: number;
  semester: string;
  department: string;
  delivery: string;
  prerequisites: string;
  description: string;
  outcomes: string[];
  source: string;
  convener_details?: string;
  entry_requirements?: string;
  outline_details?: string;
  lecture_times?: string;
  dp_requirements?: string;
  assessment?: string;
}

interface RawScienceCourseCatalogEntry {
  id?: string;
  code?: string;
  course_code?: string;
  title?: string;
  course_title?: string;
  group?: string;
  year_level?: string | number;
  credits?: number | string;
  course_credits?: number | string;
  nqf_level?: number | string;
  semester?: string | null;
  department?: string | null;
  delivery?: string | null;
  prerequisites?: string | null;
  description?: string | null;
  outcomes?: string[] | null;
  source?: string | null;
  convener_details?: string | null;
  convener?: string | null;
  entry_requirements?: string | null;
  course_outline?: string | null;
  outline_details?: string | null;
  lecture_times?: string | null;
  dp_requirements?: string | null;
  assessment?: string | null;
}

export interface ScienceCourseCatalogResponse {
  run_id: string;
  count: number;
  courses: ScienceCourseCatalogEntry[];
}

export interface ScienceMajorCourse {
  code: string;
  title: string;
  credits: number;
  nqf_level: number;
}

export interface ScienceMajorCombination {
  combination_id: string;
  description: string;
  instruction?: string;
  courses: ScienceMajorCourse[];
  required_core: ScienceMajorCourse[];
  choose_one_of: ScienceMajorCourse[];
  choose_two_of: ScienceMajorCourse[];
  choose_three_of: ScienceMajorCourse[];
}

export interface ScienceMajorYear {
  year: number;
  label: string;
  combinations: ScienceMajorCombination[];
}

export interface ScienceMajorEntry {
  major_name: string;
  major_code: string;
  department?: string;
  notes?: string;
  years: ScienceMajorYear[];
}

interface RawScienceMajorCourse {
  code?: string;
  title?: string;
  credits?: number | string;
  nqf_level?: number | string;
}

interface RawScienceMajorCombination {
  combination_id?: string;
  description?: string;
  instruction?: string;
  courses?: RawScienceMajorCourse[];
  required_core?: RawScienceMajorCourse[];
  choose_one_of?: RawScienceMajorCourse[];
  choose_two_of?: RawScienceMajorCourse[];
  choose_three_of?: RawScienceMajorCourse[];
}

interface RawScienceMajorYear {
  year?: number | string;
  label?: string;
  combinations?: RawScienceMajorCombination[];
}

interface RawScienceMajorEntry {
  major_name?: string;
  major_code?: string;
  department?: string;
  notes?: string;
  years?: RawScienceMajorYear[];
}

export interface ScienceMajorsResponse {
  run_id: string;
  section: string;
  faculty: string;
  institution: string;
  degree: string;
  notes: string;
  count: number;
  majors: ScienceMajorEntry[];
}

export interface ScienceAdvisorEntry {
  name: string;
  area: string;
  room: string;
  email: string;
  note?: string;
  tier: "senior" | "regular";
}

export interface ScienceAdvisorsListResponse {
  faculty: string;
  university: string;
  year: number;
  count: number;
  advisors: ScienceAdvisorEntry[];
}

export interface StudentLoginResponse {
  authenticated: boolean;
  student_number: string;
  access_token: string;
  token_type: string;
  expires_at_iso: string;
}

export interface AuthSessionResponse {
  authenticated: boolean;
  student_number: string;
  access_token: string;
  token_type: string;
  expires_at_iso: string;
}

export interface AuthLogoutResponse {
  logged_out: boolean;
}

export interface StudentProfileResponse {
  name: string;
  student_number: string;
  degree: string;
  year: number;
  majors: string[];
}

export interface StudentProfileUpdatePayload {
  student_number: string;
  name: string;
  degree: string;
  year: number;
  majors: string[];
}

export interface StudentPlanCourse {
  code: string;
  year: string;
  semester: string;
  credits: number;
}

export interface StudentPlanResponse {
  student_number: string;
  planned_courses: StudentPlanCourse[];
  selected_majors: string[];
  updated_at_iso: string;
}

export interface StudentPlanUpdatePayload {
  student_number: string;
  planned_courses: StudentPlanCourse[];
  selected_majors: string[];
}

export interface StudentScheduleSession {
  id: string;
  title: string;
  day: string;
  start_time: string;
  end_time: string;
  course_code?: string;
  location?: string;
}

export interface StudentScheduleTodo {
  id: string;
  title: string;
  due_iso?: string;
  done: boolean;
  course_code?: string;
}

export interface StudentScheduleResponse {
  student_number: string;
  sessions: StudentScheduleSession[];
  todos: StudentScheduleTodo[];
  updated_at_iso: string;
}

export interface StudentScheduleUpdatePayload {
  student_number: string;
  sessions: StudentScheduleSession[];
  todos: StudentScheduleTodo[];
}

export interface HandbookRuleItem {
  id: string;
  title: string;
  description: string;
  category: string;
  severity: "blocker" | "warning" | "info";
}

export interface HandbookPlannerPolicy {
  min_term_credits: number;
  max_term_credits: number;
  min_year_credits?: number | null;
  disallow_postgrad_before_year: number;
  enforce_unique_courses: boolean;
  enforce_prerequisite_sequence: boolean;
  bsc_curriculum_min_total_credits?: number | null;
  bsc_curriculum_min_science_credits?: number | null;
  bsc_curriculum_min_level7_credits?: number | null;
}

export interface FocusedPolicyRules {
  handbook_title?: string;
  readmission_from_2023?: Record<string, unknown>;
  transfer_into_science?: Record<string, unknown>;
  bsc_curricula_rules?: Record<string, unknown>;
  operational_constraints?: Record<string, unknown>;
}

export interface RulebookMajorsSnapshot {
  available_majors?: string[];
  special_constraints?: Record<string, string>;
}

export interface HandbookRulebookSnapshot {
  bsc_degree_rules?: {
    curriculum_rules?: {
      majors?: RulebookMajorsSnapshot;
    };
  };
}

export interface HandbookRulesResponse {
  run_id: string;
  handbook_title: string;
  generated_at: string;
  rule_count: number;
  rules: HandbookRuleItem[];
  planner_policy: HandbookPlannerPolicy;
  focused_policy_rules?: FocusedPolicyRules;
  rulebook?: HandbookRulebookSnapshot;
}

export interface HandbookRuleValidationIssue {
  id: string;
  severity: "blocker" | "warning" | "info";
  category: string;
  title: string;
  message: string;
  relatedCourseCode?: string;
  relatedTerm?: string;
  ruleReference?: string;
  ruleSourceText?: string;
}

export interface HandbookRuleValidationResponse {
  run_id: string;
  handbook_title: string;
  planner_policy: HandbookPlannerPolicy;
  source_rules: HandbookRuleItem[];
  focused_policy_rules?: FocusedPolicyRules;
  issues: HandbookRuleValidationIssue[];
  selected_majors?: string[];
  summary: {
    blockers: number;
    warnings: number;
    infos: number;
  };
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function toTrimmedString(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return "";
}

function toOptionalString(value: unknown): string | undefined {
  const normalized = toTrimmedString(value);
  return normalized.length > 0 ? normalized : undefined;
}

function toNumber(value: unknown, fallback: number = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = Number(value.trim());
    if (Number.isFinite(normalized)) {
      return normalized;
    }
  }

  return fallback;
}

function toCourseGroup(
  group: unknown,
  yearLevel: unknown,
): ScienceCourseCatalogEntry["group"] {
  const normalizedGroup = toTrimmedString(group).toLowerCase();
  if (normalizedGroup === "year 1") {
    return "Year 1";
  }
  if (normalizedGroup === "year 2") {
    return "Year 2";
  }
  if (normalizedGroup === "year 3") {
    return "Year 3";
  }
  if (normalizedGroup === "postgrad") {
    return "Postgrad";
  }

  if (typeof yearLevel === "number") {
    if (yearLevel <= 1) {
      return "Year 1";
    }
    if (yearLevel === 2) {
      return "Year 2";
    }
    if (yearLevel === 3) {
      return "Year 3";
    }
    return "Postgrad";
  }

  const normalizedYearLevel = toTrimmedString(yearLevel).toLowerCase();
  if (
    normalizedYearLevel.includes("first") ||
    normalizedYearLevel.includes("year 1")
  ) {
    return "Year 1";
  }
  if (
    normalizedYearLevel.includes("second") ||
    normalizedYearLevel.includes("year 2")
  ) {
    return "Year 2";
  }
  if (
    normalizedYearLevel.includes("third") ||
    normalizedYearLevel.includes("year 3")
  ) {
    return "Year 3";
  }

  return "Postgrad";
}

function toCourseGroupFromCode(
  code: string,
): ScienceCourseCatalogEntry["group"] | null {
  const levelDigit = code.match(/\d/)?.[0];
  if (!levelDigit) {
    return null;
  }

  const level = Number(levelDigit);
  if (level <= 1) {
    return "Year 1";
  }
  if (level === 2) {
    return "Year 2";
  }
  if (level === 3) {
    return "Year 3";
  }
  return "Postgrad";
}

function inferDelivery(
  delivery: unknown,
  semester: unknown,
  outline: unknown,
  lectureTimes: unknown,
): string {
  const explicit = toTrimmedString(delivery);
  if (explicit) {
    return explicit;
  }

  const combined = [semester, outline, lectureTimes]
    .map((value) => toTrimmedString(value).toLowerCase())
    .join(" ");

  if (combined.includes("online") || combined.includes("blended")) {
    return "Blended / Online";
  }

  if (toTrimmedString(lectureTimes)) {
    return "In person";
  }

  return "Not specified";
}

function normalizeOutcomes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => toTrimmedString(item))
    .filter((item) => item.length > 0);
}

function normalizeScienceCourseCatalogEntry(
  entry: RawScienceCourseCatalogEntry,
): ScienceCourseCatalogEntry {
  const code = toTrimmedString(entry.code ?? entry.course_code).toUpperCase();
  const groupFromCode = toCourseGroupFromCode(code);
  const title =
    toTrimmedString(entry.title ?? entry.course_title) ||
    (code ? `Course ${code}` : "Untitled course");
  const outlineDetails = toOptionalString(
    entry.outline_details ?? entry.course_outline,
  );
  const lectureTimes = toOptionalString(entry.lecture_times);
  const dpRequirements = toOptionalString(entry.dp_requirements);
  const assessment = toOptionalString(entry.assessment);
  const entryRequirements = toOptionalString(
    entry.entry_requirements ?? entry.prerequisites,
  );
  const prerequisites =
    toTrimmedString(entry.prerequisites ?? entry.entry_requirements) ||
    "Not specified";

  return {
    id: toTrimmedString(entry.id) || code.toLowerCase(),
    code,
    title,
    group: groupFromCode ?? toCourseGroup(entry.group, entry.year_level),
    credits: toNumber(entry.credits ?? entry.course_credits),
    nqf_level: toNumber(entry.nqf_level),
    semester: toTrimmedString(entry.semester) || "Not specified",
    department: toTrimmedString(entry.department) || "Not specified",
    delivery: inferDelivery(
      entry.delivery,
      entry.semester,
      entry.course_outline ?? entry.outline_details,
      entry.lecture_times,
    ),
    prerequisites,
    description:
      toTrimmedString(entry.description ?? entry.course_outline) ||
      "No course description available.",
    outcomes: normalizeOutcomes(entry.outcomes),
    source: toTrimmedString(entry.source),
    convener_details: toOptionalString(
      entry.convener_details ?? entry.convener,
    ),
    entry_requirements: entryRequirements,
    outline_details: outlineDetails,
    lecture_times: lectureTimes,
    dp_requirements: dpRequirements,
    assessment,
  };
}

function normalizeScienceCourseCatalogResponse(
  response: ScienceCourseCatalogResponse & {
    courses: RawScienceCourseCatalogEntry[];
  },
): ScienceCourseCatalogResponse {
  const courses = response.courses.map(normalizeScienceCourseCatalogEntry);

  return {
    ...response,
    count: courses.length,
    courses,
  };
}

function normalizeScienceMajorCourse(
  entry: RawScienceMajorCourse,
): ScienceMajorCourse {
  return {
    code: toTrimmedString(entry.code).toUpperCase(),
    title: toTrimmedString(entry.title),
    credits: toNumber(entry.credits),
    nqf_level: toNumber(entry.nqf_level),
  };
}

function normalizeScienceMajorCombination(
  entry: RawScienceMajorCombination,
): ScienceMajorCombination {
  return {
    combination_id: toTrimmedString(entry.combination_id),
    description: toTrimmedString(entry.description),
    instruction: toOptionalString(entry.instruction),
    courses: Array.isArray(entry.courses)
      ? entry.courses.map(normalizeScienceMajorCourse)
      : [],
    required_core: Array.isArray(entry.required_core)
      ? entry.required_core.map(normalizeScienceMajorCourse)
      : [],
    choose_one_of: Array.isArray(entry.choose_one_of)
      ? entry.choose_one_of.map(normalizeScienceMajorCourse)
      : [],
    choose_two_of: Array.isArray(entry.choose_two_of)
      ? entry.choose_two_of.map(normalizeScienceMajorCourse)
      : [],
    choose_three_of: Array.isArray(entry.choose_three_of)
      ? entry.choose_three_of.map(normalizeScienceMajorCourse)
      : [],
  };
}

function normalizeScienceMajorYear(
  entry: RawScienceMajorYear,
): ScienceMajorYear {
  return {
    year: toNumber(entry.year),
    label: toTrimmedString(entry.label),
    combinations: Array.isArray(entry.combinations)
      ? entry.combinations.map(normalizeScienceMajorCombination)
      : [],
  };
}

function normalizeScienceMajorEntry(
  entry: RawScienceMajorEntry,
): ScienceMajorEntry {
  return {
    major_name: toTrimmedString(entry.major_name),
    major_code: toTrimmedString(entry.major_code).toUpperCase(),
    department: toOptionalString(entry.department),
    notes: toOptionalString(entry.notes),
    years: Array.isArray(entry.years)
      ? entry.years.map(normalizeScienceMajorYear)
      : [],
  };
}

function normalizeScienceMajorsResponse(
  response: ScienceMajorsResponse & {
    majors: RawScienceMajorEntry[];
  },
): ScienceMajorsResponse {
  const majors = response.majors.map(normalizeScienceMajorEntry);

  return {
    ...response,
    section: toTrimmedString(response.section),
    faculty: toTrimmedString(response.faculty),
    institution: toTrimmedString(response.institution),
    degree: toTrimmedString(response.degree),
    notes: toTrimmedString(response.notes),
    count: majors.length,
    majors,
  };
}

function getExpoDevHost() {
  const hostUri =
    (Constants as { expoConfig?: { hostUri?: string } }).expoConfig?.hostUri ??
    (
      Constants as {
        manifest2?: { extra?: { expoClient?: { hostUri?: string } } };
      }
    ).manifest2?.extra?.expoClient?.hostUri ??
    (Constants as { manifest?: { debuggerHost?: string } }).manifest
      ?.debuggerHost;

  if (!hostUri) {
    return null;
  }

  const host = hostUri.split(":")[0]?.trim();
  return host || null;
}

function getDefaultBackendBaseUrl() {
  if (Platform.OS === "web") {
    return "http://localhost:8001";
  }

  const expoDevHost = getExpoDevHost();
  if (expoDevHost) {
    return `http://${expoDevHost}:8001`;
  }

  if (Platform.OS === "android") {
    return "http://10.0.2.2:8001";
  }

  return "http://127.0.0.1:8001";
}

function getBackendBaseUrlCandidates() {
  const configuredUrl = process.env.EXPO_PUBLIC_BACKEND_URL?.trim();
  if (configuredUrl) {
    return [trimTrailingSlash(configuredUrl)];
  }

  const candidates = new Set<string>();
  const defaultUrl = trimTrailingSlash(getDefaultBackendBaseUrl());
  candidates.add(defaultUrl);

  const parsed = new URL(defaultUrl);
  const host = parsed.hostname;
  const protocol = parsed.protocol;

  // Local dev fallback ports used in this workspace.
  [8001, 8010, 8000].forEach((port) => {
    candidates.add(`${protocol}//${host}:${port}`);
  });

  return Array.from(candidates.values());
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const detail = (payload as BackendErrorPayload).detail;

  if (typeof detail === "string" && detail.trim().length > 0) {
    return detail;
  }

  if (Array.isArray(detail) && detail.length > 0) {
    const messages = detail
      .map((item) => item?.msg?.trim())
      .filter((item): item is string => Boolean(item));

    if (messages.length > 0) {
      return messages.join("; ");
    }
  }

  return fallback;
}

export function getBackendBaseUrl() {
  return (
    getBackendBaseUrlCandidates()[0] ??
    trimTrailingSlash(getDefaultBackendBaseUrl())
  );
}

export function getBackendSetupHint() {
  return "Set EXPO_PUBLIC_BACKEND_URL to a FastAPI base URL reachable from your Expo app. For real devices, run FastAPI with --host 0.0.0.0 and use your computer LAN IP.";
}

function getBackendRequestTimeoutMs() {
  const raw = process.env.EXPO_PUBLIC_BACKEND_TIMEOUT_MS?.trim();
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed >= 3000) {
    return parsed;
  }
  return 45000;
}

async function fetchWithTimeout(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeoutMs = getBackendRequestTimeoutMs();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: init?.signal ?? controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function isRetriableNetworkError(error: unknown) {
  return (
    error instanceof TypeError ||
    (error instanceof Error &&
      (error.name === "AbortError" ||
        error.message.toLowerCase().includes("failed to fetch")))
  );
}

function parseJsonSafely(text: string) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const candidateBaseUrls = getBackendBaseUrlCandidates();
  let lastError: unknown = null;

  for (const baseUrl of candidateBaseUrls) {
    try {
      const response = await fetchWithTimeout(`${baseUrl}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
      });

      const text = await response.text();
      const payload = parseJsonSafely(text);

      if (!response.ok) {
        throw new Error(
          getErrorMessage(
            payload,
            `Request failed with status ${response.status} ${response.statusText}`,
          ),
        );
      }

      return payload as T;
    } catch (error) {
      lastError = error;
      if (!isRetriableNetworkError(error)) {
        throw error;
      }
    }
  }

  if (lastError instanceof Error) {
    throw new Error(`${lastError.message}. ${getBackendSetupHint()}`);
  }
  throw new Error(`Backend request failed. ${getBackendSetupHint()}`);
}

async function requestMultipart<T>(path: string, formData: FormData) {
  const candidateBaseUrls = getBackendBaseUrlCandidates();
  let lastError: unknown = null;

  for (const baseUrl of candidateBaseUrls) {
    try {
      const response = await fetchWithTimeout(`${baseUrl}${path}`, {
        method: "POST",
        body: formData,
      });

      const text = await response.text();
      const payload = parseJsonSafely(text);

      if (!response.ok) {
        throw new Error(
          getErrorMessage(
            payload,
            `Request failed with status ${response.status} ${response.statusText}`,
          ),
        );
      }

      return payload as T;
    } catch (error) {
      lastError = error;
      if (!isRetriableNetworkError(error)) {
        throw error;
      }
    }
  }

  if (lastError instanceof Error) {
    throw new Error(`${lastError.message}. ${getBackendSetupHint()}`);
  }
  throw new Error(`Backend request failed. ${getBackendSetupHint()}`);
}

export function getBackendHealth() {
  return requestJson<BackendHealthResponse>("/health", {
    method: "GET",
  });
}

export function runSciencePipeline() {
  return requestJson<SciencePipelineResponse>("/pipelines/science/run", {
    method: "POST",
  });
}

export type ScienceAdvisorModelProfile = "fast" | "thinking";

/**
 * The student's full academic profile, sent to the backend so BluBot can
 * cross-reference their course history against handbook prerequisites and
 * give personalised, accurate guidance rather than generic handbook recitation.
 */
export interface BluBotStudentContext {
  name?: string;
  student_number?: string;
  degree?: string;
  year?: number;
  majors?: string[];
  credits_earned?: number;
  credits_total?: number;
  nqf7_credits_earned?: number;
  nqf7_credits_required?: number;
  milestone_label?: string;
  milestone_required?: number;
  /** Courses the student has passed in previous years */
  completed_passed?: Array<{
    code: string;
    title: string;
    credits: number;
    nqf_level: number;
    semester: string;
    grade?: number;
  }>;
  /** Courses failed or incomplete */
  completed_failed?: Array<{
    code: string;
    title: string;
    credits: number;
    nqf_level?: number;
    semester?: string;
    grade?: number;
  }>;
  /** All courses currently registered for in the active academic year */
  courses_in_progress?: Array<{
    code: string;
    title: string;
    credits: number;
    nqf_level: number;
    semester: string;
  }>;
}

export function askScienceAdvisor(payload: {
  query: string;
  top_k?: number;
  run_id?: string;
  model_profile?: ScienceAdvisorModelProfile;
  student_context?: BluBotStudentContext;
}) {
  return requestJson<ScienceAdvisorResponse>("/advisor/science/ask", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function askScienceAdvisorWithUpload(payload: {
  query?: string;
  top_k?: number;
  run_id?: string;
  model_profile?: ScienceAdvisorModelProfile;
  student_context?: BluBotStudentContext;
  attachment: UploadAttachment;
}) {
  const formData = new FormData();

  if (payload.query?.trim()) {
    formData.append("query", payload.query.trim());
  }

  if (payload.top_k) {
    formData.append("top_k", String(payload.top_k));
  }

  if (payload.run_id?.trim()) {
    formData.append("run_id", payload.run_id.trim());
  }

  if (payload.model_profile) {
    formData.append("model_profile", payload.model_profile);
  }

  if (payload.student_context) {
    formData.append("student_context_json", JSON.stringify(payload.student_context));
  }

  const fileName = payload.attachment.name?.trim() || "upload";
  const mimeType =
    payload.attachment.mimeType?.trim() || "application/octet-stream";
  const attachmentForWeb = payload.attachment.file;

  if (attachmentForWeb) {
    formData.append("file", attachmentForWeb, fileName);
  } else {
    formData.append("file", {
      uri: payload.attachment.uri,
      name: fileName,
      type: mimeType,
    } as any);
  }

  return requestMultipart<ScienceAdvisorResponse>(
    "/advisor/science/ask-upload",
    formData,
  );
}

export function getScienceAdvisorChatHistory() {
  return requestJson<ScienceAdvisorChatHistoryResponse>(
    "/advisor/science/chats/list",
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export function syncScienceAdvisorChatHistory(payload: {
  current_thread_id: string | null;
  threads: ScienceAdvisorChatThreadPayload[];
}) {
  return requestJson<ScienceAdvisorChatHistoryResponse>(
    "/advisor/science/chats/sync",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function renameScienceAdvisorChatThread(payload: {
  thread_id: string;
  title: string;
}) {
  return requestJson<{ ok: boolean }>("/advisor/science/chats/rename", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteScienceAdvisorChatThread(payload: { thread_id: string }) {
  return requestJson<{ ok: boolean }>("/advisor/science/chats/delete", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getScienceCourses(payload?: { run_id?: string }) {
  return requestJson<
    ScienceCourseCatalogResponse & {
      courses: RawScienceCourseCatalogEntry[];
    }
  >("/courses/science/list", {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  })
    .then(normalizeScienceCourseCatalogResponse)
    .catch(() => buildMockScienceCoursesResponse(payload?.run_id));
}

export function getScienceMajors(payload?: { run_id?: string }) {
  return requestJson<
    ScienceMajorsResponse & {
      majors: RawScienceMajorEntry[];
    }
  >("/majors/science/list", {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  })
    .then(normalizeScienceMajorsResponse)
    .catch(() => buildMockScienceMajorsResponse(payload?.run_id));
}

export function getScienceAdvisors() {
  return requestJson<ScienceAdvisorsListResponse>("/advisors/science/list", {
    method: "POST",
    body: JSON.stringify({}),
  }).catch(() => getLocalAdvisorsResponse());
}

export function collectScienceDepartmentCourses(payload: {
  department: string;
  handbook_title?: string;
  run_id?: string;
  force_refresh?: boolean;
}) {
  return requestJson<
    ScienceCourseCatalogResponse & {
      courses: RawScienceCourseCatalogEntry[];
    }
  >("/courses/science/collect", {
    method: "POST",
    body: JSON.stringify(payload),
  }).then(normalizeScienceCourseCatalogResponse);
}

export function loginStudent(payload: {
  student_number: string;
  password: string;
}) {
  const studentNumber = normalizeStudentNumber(payload.student_number);
  const password = payload.password;
  const mockUser = findMockUser(studentNumber);

  if (mockUser) {
    if (password === mockUser.password) {
      return Promise.resolve(buildMockAuthPayload(studentNumber));
    }

    throw new Error("Invalid student number or password");
  }

  return requestJson<StudentLoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function validateAuthSession(payload: { access_token: string }) {
  const mockStudentNumber = parseMockToken(payload.access_token);
  if (mockStudentNumber) {
    const mockUser = findMockUser(mockStudentNumber);
    if (!mockUser) {
      throw new Error("Invalid session");
    }

    return Promise.resolve(buildMockAuthPayload(mockStudentNumber));
  }

  return requestJson<AuthSessionResponse>("/auth/session", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function logoutAuthSession(payload: { access_token: string }) {
  if (parseMockToken(payload.access_token)) {
    return Promise.resolve({ logged_out: true });
  }

  return requestJson<AuthLogoutResponse>("/auth/logout", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getStudentProfile(payload: { student_number: string }) {
  const mockProfile = buildMockStudentProfileResponse(payload.student_number);
  if (mockProfile) {
    return Promise.resolve(mockProfile);
  }

  return requestJson<StudentProfileResponse>("/students/profile", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateStudentProfile(payload: StudentProfileUpdatePayload) {
  const normalizedStudentNumber = normalizeStudentNumber(
    payload.student_number,
  );
  if (findMockUser(normalizedStudentNumber)) {
    const nextProfile: StudentProfileResponse = {
      name: payload.name.trim() || "Bluprint Student",
      student_number: normalizedStudentNumber,
      degree: payload.degree.trim() || "BSc Programme",
      year:
        Number.isFinite(payload.year) && payload.year > 0 ? payload.year : 1,
      majors: payload.majors
        .map((major) => major.trim())
        .filter((major) => major.length > 0),
    };

    mockProfileOverrides.set(normalizedStudentNumber, nextProfile);
    return Promise.resolve({
      ...nextProfile,
      majors: [...nextProfile.majors],
    });
  }

  return requestJson<StudentProfileResponse>("/students/profile", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function getStudentPlan(payload: { student_number: string }) {
  const mockPlan = buildMockStudentPlanResponse(payload.student_number);
  if (mockPlan) {
    return Promise.resolve(mockPlan);
  }

  return requestJson<StudentPlanResponse>("/students/plan", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateStudentPlan(payload: StudentPlanUpdatePayload) {
  const normalizedStudentNumber = normalizeStudentNumber(
    payload.student_number,
  );
  if (findMockUser(normalizedStudentNumber)) {
    const nextPlan: StudentPlanResponse = {
      student_number: normalizedStudentNumber,
      planned_courses: payload.planned_courses.map((course) => ({
        code: course.code.trim().toUpperCase(),
        year: course.year.trim(),
        semester: course.semester.trim(),
        credits: Number.isFinite(course.credits) ? course.credits : 0,
      })),
      selected_majors: payload.selected_majors
        .map((major) => major.trim())
        .filter((major) => major.length > 0),
      updated_at_iso: new Date().toISOString(),
    };

    mockPlanOverrides.set(normalizedStudentNumber, nextPlan);
    return Promise.resolve({
      ...nextPlan,
      planned_courses: nextPlan.planned_courses.map((course) => ({
        ...course,
      })),
      selected_majors: [...nextPlan.selected_majors],
    });
  }

  return requestJson<StudentPlanResponse>("/students/plan", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function getStudentSchedule(payload: { student_number: string }) {
  return requestJson<StudentScheduleResponse>("/students/schedule", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateStudentSchedule(payload: StudentScheduleUpdatePayload) {
  return requestJson<StudentScheduleResponse>("/students/schedule", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function extractScienceHandbookRules(payload?: {
  run_id?: string;
  handbook_title?: string;
  force_refresh?: boolean;
}) {
  return requestJson<HandbookRulesResponse>("/rules/science/extract", {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
}

export function validateSciencePlanAgainstRules(payload: {
  planned_courses: Array<{
    code: string;
    year: string;
    semester: string;
    credits: number;
  }>;
  selected_majors?: string[];
  run_id?: string;
  handbook_title?: string;
}) {
  return requestJson<HandbookRuleValidationResponse>(
    "/rules/science/validate-plan",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export interface FacultyHandbookFileResponse {
  filename: string;
  key: string;
  size_bytes: number;
  last_modified: string;
  view_url: string;
  download_url: string;
}

export interface FacultyHandbookFilesResponse {
  faculty: string;
  slug: string;
  files: FacultyHandbookFileResponse[];
}

export function listFacultyHandbookFiles(facultySlug: string) {
  return requestJson<FacultyHandbookFilesResponse>(
    `/handbooks/faculty/${encodeURIComponent(facultySlug)}/files`,
    { method: "GET" },
  );
}
