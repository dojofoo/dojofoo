export interface CourseListing {
  id: string;
  slug: string;
  name: string;
  source: string;
  installs: number;
  sourceType: "github" | "well-known" | "npm";
  installUrl: string | null;
  url: string;
}

export interface CourseProfile {
  id: string;
  description: string;
  categories: string[];
  kataCount: number;
}

export interface KataProgressMetric {
  kata: string;
  started: number;
  finished: number;
  active: number;
}

export interface CourseMetrics {
  installs: number;
  started: number;
  progressing: number;
  finished: number;
  completionRate: number;
  kataProgress: KataProgressMetric[];
}

export interface MarketplaceCourse extends CourseListing, CourseProfile {
  metrics: CourseMetrics;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Courses API returned ${response.status}.`);
  return response.json() as Promise<T>;
}

export async function getMarketplaceCourses(): Promise<MarketplaceCourse[]> {
  const [listing, profiles] = await Promise.all([
    getJson<{ data: CourseListing[] }>("/api/v1/courses?view=all-time&per_page=100"),
    getJson<{ data: CourseProfile[] }>("/api/v1/course-profiles"),
  ]);
  const profilesById = new Map(profiles.data.map((profile) => [profile.id, profile]));

  return Promise.all(
    listing.data.map(async (course) => {
      const profile = profilesById.get(course.id);
      if (!profile) throw new Error(`Missing profile for ${course.id}.`);
      const metrics = await getJson<CourseMetrics>(
        `/api/v1/courses/${course.source}/${course.slug}/metrics`,
      );
      return { ...course, ...profile, installs: metrics.installs, metrics };
    }),
  );
}
