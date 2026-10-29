export interface CourseListing {
  id: string;
  slug: string;
  name: string;
  source: string;
  installs: number;
  sourceType: "github" | "well-known" | "npm";
  installUrl: string | null;
  url: string;
  mode: "katas" | "interactive" | "explorative" | "mentor" | "interview";
}

export interface CourseProfile {
  id: string;
  description: string;
  version: string;
  publishedAt: string;
  repository: string;
  repositoryUrl: string;
  author: string;
  language: string;
  framework: string | null;
  tags: string[];
  kataCount: number;
}

export interface KataProgressMetric {
  kata: string;
  started: number;
  finished: number;
  active: number;
}

export interface WeeklyActivityMetric {
  week: string;
  installs: number;
  started: number;
  finished: number;
}

export interface CourseMetrics {
  installs: number;
  started: number;
  progressing: number;
  finished: number;
  completionRate: number;
  kataProgress: KataProgressMetric[];
  weeklyActivity: WeeklyActivityMetric[];
}

export interface MarketplaceCourse extends CourseListing, CourseProfile {
  metrics: CourseMetrics;
  trendingRank: number;
}

async function getJson<T>(path: string, origin?: string): Promise<T> {
  const response = await fetch(origin ? new URL(path, origin) : path);
  if (!response.ok) throw new Error(`Courses API returned ${response.status}.`);
  return response.json() as Promise<T>;
}

export async function getMarketplaceCourses(origin?: string): Promise<MarketplaceCourse[]> {
  const response = await getJson<{ data: MarketplaceCourse[] }>("/api/v1/marketplace", origin);
  return response.data;
}

export async function searchMarketplaceCourses(query: string): Promise<CourseListing[]> {
  const result = await getJson<{ data: CourseListing[] }>(
    `/api/v1/courses/search?q=${encodeURIComponent(query)}&limit=20`,
  );
  return result.data;
}
