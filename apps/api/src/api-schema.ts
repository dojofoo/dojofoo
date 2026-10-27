import { t } from "elysia";

const count = () => t.Integer({ minimum: 0 });
const nullableString = (options?: { description: string }) => t.Union([t.String(), t.Null()], options);
// Match Elysia's response-validator default up front so OpenAPI does not
// change when lazy validation compiles a route after its first request.
const error = t.Object({ error: t.String(), message: t.String() }, { additionalProperties: false });
const listing = t.Object({
  id: t.String({ examples: ["dojofoo/effect-ts"] }), slug: t.String({ examples: ["effect-ts"] }),
  name: t.String({ examples: ["Effect TS"] }), source: t.String({ examples: ["dojofoo"] }),
  installs: count(), sourceType: t.Union([t.Literal("github"), t.Literal("well-known"), t.Literal("npm")]),
  installUrl: nullableString(), url: t.String(), mode: t.Optional(t.Union([t.Literal("katas"), t.Literal("interactive")])),
});
const profile = t.Object({
  id: t.String(), description: t.String(), version: t.String(), publishedAt: t.String(), repository: t.String(),
  repositoryUrl: t.String(), author: t.String(), language: t.String(), framework: nullableString(),
  tags: t.Array(t.String()), kataCount: count(),
});
const metrics = t.Object({
  installs: count(), started: count(), progressing: count(), finished: count(), completionRate: t.Number(),
  kataProgress: t.Array(t.Object({ kata: t.String(), started: count(), finished: count(), active: count() })),
  weeklyActivity: t.Array(t.Object({ week: t.String(), installs: count(), started: count(), finished: count() })),
}, { additionalProperties: false });
const course = t.Object({
  id: t.String(), source: t.String(), slug: t.String(), installs: count(), hash: nullableString(),
  files: t.Union([t.Array(t.Object({ path: t.String(), contents: t.String() })), t.Null()]),
}, { additionalProperties: false });
const risk = () => t.String({ enum: ["NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL"] });
const audit = t.Object({
  id: t.String({ examples: ["acme/typescript-basics"] }), source: t.String({ examples: ["acme"] }), slug: t.String({ examples: ["typescript-basics"] }),
  status: t.String({ enum: ["trial", "enabled"], description: "A trial course installs by its repository but isn't in the catalog yet." }),
  hash: nullableString(),
  audits: t.Array(t.Object({
    provider: t.String({ examples: ["Dojo"] }), slug: t.String({ enum: ["dojo", "cisco"] }),
    status: t.String({ enum: ["pass", "warn", "fail"] }), riskLevel: risk(),
    summary: t.String({ examples: ["No risks detected"] }), auditedAt: t.String(), hash: nullableString({ description: "The snapshot the provider audited." }),
    findings: t.Array(t.Object({ rule: t.String({ examples: ["install_script"] }), riskLevel: risk(), message: t.String(), path: t.Optional(t.String()), line: t.Optional(t.Integer()) })),
  })),
}, { additionalProperties: false });
const event = t.Object({
  instanceId: t.String({ description: "Random identifier for the local project; do not send names, email addresses or file contents.", examples: ["a-random-project-id"] }),
  courseId: t.String({ examples: ["dojofoo/effect-ts"] }),
  event: t.String({ enum: ["installed", "started", "kata_completed", "finished"] }),
  occurredAt: t.Optional(t.String({ description: "ISO 8601 timestamp; defaults to the server time." })),
  kata: t.Optional(t.String({ examples: ["001-hello-effect"] })),
  source: t.Optional(t.Object({ type: t.Literal("github"), repository: t.String({ examples: ["owner/repository"] }), integrity: t.Optional(t.String()) })),
});

// Query errors remain the API's existing 400 responses. Document their constraints
// without introducing a second request validator with different status codes.
const query = (name: string, schema: Record<string, unknown>, description: string, required = false) => ({ name, in: "query" as const, required, description, schema });
const details = (operationId: string, summary: string, description: string, tag = "Courses") => ({ operationId, summary, description, tags: [tag] });
const params = t.Object({ source: t.String({ examples: ["dojofoo"] }), slug: t.String({ examples: ["effect-ts"] }) });

export const apiRoutes = {
  health: { detail: details("getHealth", "Check health", "Check whether the Course API is available.", "Health"), response: t.Object({ status: t.String() }, { additionalProperties: false }) },
  profiles: {
    detail: details("listCourseProfiles", "List course profiles", "Read course descriptions, authors, languages and repository links without the full metrics payload."),
    response: t.Object({ data: t.Array(profile) }, { additionalProperties: false }),
  },
  marketplace: {
    detail: details("getMarketplace", "Get the marketplace", "Read the complete marketplace catalog, including profiles, lifecycle metrics and trending rank."),
    response: t.Object({ data: t.Array(t.Object({ ...listing.properties, ...profile.properties, metrics, trendingRank: t.Integer() })) }, { additionalProperties: false }),
  },
  list: {
    detail: { ...details("listCourses", "List courses", "Browse courses by lifetime installs, installs over the last seven days, or the change in installs since yesterday. Page numbers start at zero."), parameters: [
      query("view", { type: "string", enum: ["all-time", "trending", "hot"], default: "all-time" }, "Ranking to use. The hot view also includes installsYesterday and change."),
      query("page", { type: "integer", minimum: 0, default: 0 }, "Zero-based page number."),
      query("per_page", { type: "integer", minimum: 1, maximum: 500, default: 100 }, "Number of courses per page."),
    ] },
    response: { 200: t.Object({ data: t.Array(t.Object({ ...listing.properties, installsYesterday: t.Optional(t.Integer()), change: t.Optional(t.Number()) })), pagination: t.Object({ page: count(), perPage: t.Integer(), total: count(), hasMore: t.Boolean() }) }, { additionalProperties: false }), 400: error },
  },
  search: {
    detail: { ...details("searchCourses", "Search courses", "Find courses by name, source, description, author, language, framework or tags."), parameters: [
      query("q", { type: "string", minLength: 2, example: "effect" }, "Search text, with at least two non-whitespace characters.", true),
      query("limit", { type: "integer", minimum: 1, maximum: 200, default: 50 }, "Maximum number of results."),
      query("owner", { type: "string", example: "dojofoo" }, "Restrict results to this course owner."),
    ] },
    response: { 200: t.Object({ data: t.Array(listing), query: t.String(), searchType: t.String(), count: count(), durationMs: t.Number() }, { additionalProperties: false }), 400: error },
  },
  curated: {
    detail: details("listCuratedCourses", "List courses by owner", "Browse owners and their most installed course, along with each owner's course catalog."),
    response: t.Object({ data: t.Array(t.Object({ owner: t.String(), totalInstalls: count(), featuredRepo: t.String(), featuredCourse: t.String(), courses: t.Array(listing) })), totalOwners: count(), totalCourses: count(), generatedAt: t.String() }, { additionalProperties: false }),
  },
  metrics: { detail: details("getCourseMetrics", "Get course metrics", "Read installs, starts, completions, progress by kata and weekly activity for one course."), params, response: { 200: metrics, 404: error } },
  audit: {
    detail: details("getCourseAudit", "Get course audits", "Read the security checks on a course: Dojo's own on every new snapshot, then Cisco's skill-scanner. A fail stops the CLI from installing the course; a warn asks first. Courses without audits return 404."),
    params, response: { 200: audit, 404: error },
  },
  course: { detail: details("getCourse", "Download a course", "Read the course's content hash and files. Unknown courses return 404."), params, response: { 200: course, 404: error } },
  events: {
    detail: { ...details("recordCourseEvent", "Record a lifecycle event", "Record an install, start, kata completion or finish. Duplicate events are accepted without being counted twice. An installed event can register a public GitHub source when source.repository matches courseId.", "Events"), requestBody: { required: true, content: { "application/json": { schema: event } } } },
    response: { 202: t.Object({ accepted: t.Boolean(), duplicate: t.Boolean() }, { additionalProperties: false }), 400: error },
  },
};
