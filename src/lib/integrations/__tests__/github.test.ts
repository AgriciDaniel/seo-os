import { test } from "node:test";
import assert from "node:assert/strict";

import {
  fetchGitHubRepoMetadata,
  parseGitHubRepoUrl,
} from "@/lib/integrations/github.ts";

test("parseGitHubRepoUrl accepts normal GitHub repository URLs", () => {
  assert.deepEqual(parseGitHubRepoUrl("https://github.com/AgriciDaniel/claude-seo"), {
    owner: "AgriciDaniel",
    repo: "claude-seo",
    htmlUrl: "https://github.com/AgriciDaniel/claude-seo",
  });
  assert.equal(
    parseGitHubRepoUrl("https://github.com/AgriciDaniel/claude-seo.git")?.repo,
    "claude-seo",
  );
  assert.equal(parseGitHubRepoUrl("https://example.com/AgriciDaniel/claude-seo"), null);
});

test("fetchGitHubRepoMetadata returns README, releases, stars, and recent commits", async () => {
  const calls: string[] = [];
  const fetcher = async (url: string | URL | Request) => {
    const href = String(url);
    calls.push(href);
    if (href.endsWith("/repos/AgriciDaniel/claude-seo")) {
      return json({
        html_url: "https://github.com/AgriciDaniel/claude-seo",
        description: "SEO workflows for Claude Code",
        homepage: "https://claude-seo.md",
        stargazers_count: 123,
        forks_count: 7,
        open_issues_count: 2,
        default_branch: "main",
        pushed_at: "2026-05-17T12:00:00Z",
        topics: ["seo", "claude-code"],
      });
    }
    if (href.endsWith("/repos/AgriciDaniel/claude-seo/readme")) {
      return json({
        path: "README.md",
        content: Buffer.from("# Claude SEO\n\nOpen-source SEO workflows.").toString(
          "base64",
        ),
      });
    }
    if (href.endsWith("/releases?per_page=5")) {
      return json([
        {
          name: "Launch",
          tag_name: "v1.0.0",
          published_at: "2026-05-16T12:00:00Z",
          html_url: "https://github.com/AgriciDaniel/claude-seo/releases/tag/v1.0.0",
        },
      ]);
    }
    if (href.endsWith("/commits?per_page=5")) {
      return json([
        {
          sha: "abc123",
          html_url: "https://github.com/AgriciDaniel/claude-seo/commit/abc123",
          commit: {
            message: "Improve specialist prompts\n\nBody",
            author: {
              name: "AGRICI DANIEL",
              date: "2026-05-17T12:00:00Z",
            },
          },
        },
      ]);
    }
    return json({}, false);
  };

  const metadata = await fetchGitHubRepoMetadata(
    "https://github.com/AgriciDaniel/claude-seo",
    {
      fetcher: fetcher as typeof fetch,
      now: new Date("2026-05-18T00:00:00Z"),
    },
  );

  assert.ok(metadata);
  assert.equal(metadata.stars, 123);
  assert.equal(metadata.readme.path, "README.md");
  assert.match(metadata.readme.excerpt, /Open-source SEO workflows/);
  assert.deepEqual(metadata.releases.map((release) => release.tag_name), ["v1.0.0"]);
  assert.deepEqual(metadata.recent_commits.map((commit) => commit.message), [
    "Improve specialist prompts",
  ]);
  assert.equal(metadata.fetched_at, "2026-05-18T00:00:00.000Z");
  assert.equal(calls.length, 4);
});

function json(body: unknown, ok = true): Response {
  return {
    ok,
    async json() {
      return body;
    },
  } as Response;
}
