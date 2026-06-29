<%*
const title = await tp.system.prompt("Note title");
const noteType = await tp.system.suggester(
  ["concept", "entity", "source", "question", "comparison", "meta", "decision", "flow", "audit", "deliverable", "page-brief"],
  ["concept", "entity", "source", "question", "comparison", "meta", "decision", "flow", "audit", "deliverable", "page-brief"]
);
const tagsInput = await tp.system.prompt("Tags (comma-separated, kebab-case)", "");
const tags = tagsInput.split(",").map(t => t.trim()).filter(t => t.length > 0);
await tp.file.rename(title);
-%>
---
type: <% noteType %>
title: "<% title %>"
created: <% tp.date.now("YYYY-MM-DD") %>
updated: <% tp.date.now("YYYY-MM-DD") %>
tags:
<% tags.map(t => `  - ${t}`).join("\n") %>
status: seed
related:
  - "[[Index]]"
sources: []
---

# <% title %>

## Summary

## Details

## Related

- [[Index]]

## Next Actions

-
