import "server-only";

export interface GitHubRepoRef {
  owner: string;
  repo: string;
  htmlUrl: string;
}

export interface GitHubRepoMetadata {
  owner: string;
  repo: string;
  html_url: string;
  description: string | null;
  homepage: string | null;
  stars: number;
  forks: number;
  open_issues: number;
  default_branch: string;
  pushed_at: string | null;
  topics: string[];
  readme: {
    path: string | null;
    excerpt: string;
  };
  releases: Array<{
    name: string | null;
    tag_name: string;
    published_at: string | null;
    html_url: string;
  }>;
  recent_commits: Array<{
    sha: string;
    message: string;
    author_name: string | null;
    date: string | null;
    html_url: string;
  }>;
  fetched_at: string;
}

type FetchLike = typeof fetch;

export function parseGitHubRepoUrl(input: string): GitHubRepoRef | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
    return null;
  }
  const [owner, repoRaw] = url.pathname.split("/").filter(Boolean);
  if (!owner || !repoRaw) return null;
  const repo = repoRaw.replace(/\.git$/, "");
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) {
    return null;
  }
  return {
    owner,
    repo,
    htmlUrl: `https://github.com/${owner}/${repo}`,
  };
}

export async function fetchGitHubRepoMetadata(
  githubUrl: string,
  options: { fetcher?: FetchLike; now?: Date } = {},
): Promise<GitHubRepoMetadata | null> {
  const ref = parseGitHubRepoUrl(githubUrl);
  if (!ref) return null;
  const fetcher = options.fetcher ?? fetch;
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "SEO-Office-local",
  };

  const repo = await readJson<GitHubRepoResponse>(
    fetcher,
    `https://api.github.com/repos/${ref.owner}/${ref.repo}`,
    headers,
  );
  if (!repo) return null;

  const [readme, releases, commits] = await Promise.all([
    readJson<GitHubReadmeResponse>(
      fetcher,
      `https://api.github.com/repos/${ref.owner}/${ref.repo}/readme`,
      headers,
    ),
    readJson<GitHubReleaseResponse[]>(
      fetcher,
      `https://api.github.com/repos/${ref.owner}/${ref.repo}/releases?per_page=5`,
      headers,
    ),
    readJson<GitHubCommitResponse[]>(
      fetcher,
      `https://api.github.com/repos/${ref.owner}/${ref.repo}/commits?per_page=5`,
      headers,
    ),
  ]);

  return {
    owner: ref.owner,
    repo: ref.repo,
    html_url: repo.html_url ?? ref.htmlUrl,
    description: repo.description ?? null,
    homepage: repo.homepage || null,
    stars: Number(repo.stargazers_count ?? 0),
    forks: Number(repo.forks_count ?? 0),
    open_issues: Number(repo.open_issues_count ?? 0),
    default_branch: repo.default_branch ?? "main",
    pushed_at: repo.pushed_at ?? null,
    topics: Array.isArray(repo.topics) ? repo.topics.filter(isString) : [],
    readme: {
      path: readme?.path ?? null,
      excerpt: readme?.content ? decodeReadmeExcerpt(readme.content) : "",
    },
    releases: Array.isArray(releases)
      ? releases.map((release) => ({
          name: release.name ?? null,
          tag_name: release.tag_name ?? "",
          published_at: release.published_at ?? null,
          html_url: release.html_url ?? "",
        }))
      : [],
    recent_commits: Array.isArray(commits)
      ? commits.map((commit) => ({
          sha: commit.sha ?? "",
          message: firstLine(commit.commit?.message ?? ""),
          author_name: commit.commit?.author?.name ?? null,
          date: commit.commit?.author?.date ?? null,
          html_url: commit.html_url ?? "",
        }))
      : [],
    fetched_at: (options.now ?? new Date()).toISOString(),
  };
}

async function readJson<T>(
  fetcher: FetchLike,
  url: string,
  headers: Record<string, string>,
): Promise<T | null> {
  try {
    const res = await fetcher(url, { headers });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function decodeReadmeExcerpt(content: string): string {
  try {
    const decoded = Buffer.from(content.replace(/\s/g, ""), "base64").toString("utf8");
    return decoded.trim().replace(/\s+/g, " ").slice(0, 2_000);
  } catch {
    return "";
  }
}

function firstLine(value: string): string {
  return value.split(/\r?\n/)[0]?.trim().slice(0, 240) ?? "";
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

interface GitHubRepoResponse {
  html_url?: string;
  description?: string | null;
  homepage?: string | null;
  stargazers_count?: number;
  forks_count?: number;
  open_issues_count?: number;
  default_branch?: string;
  pushed_at?: string | null;
  topics?: unknown[];
}

interface GitHubReadmeResponse {
  path?: string;
  content?: string;
}

interface GitHubReleaseResponse {
  name?: string | null;
  tag_name?: string;
  published_at?: string | null;
  html_url?: string;
}

interface GitHubCommitResponse {
  sha?: string;
  html_url?: string;
  commit?: {
    message?: string;
    author?: {
      name?: string | null;
      date?: string | null;
    };
  };
}
