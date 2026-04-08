# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Gemini Session Manager — a Chrome extension (Manifest V3) for managing Gemini sessions.

## Architecture

Vanilla JS Chrome extension (no build step). Runs only on `gemini.google.com`.

- `manifest.json` — MV3 manifest, declares content scripts and permissions
- `src/storage.js` — Data layer wrapping `chrome.storage.local`. Manages folders CRUD and conversation-to-folder mapping
- `src/content.js` — Content script injected into Gemini. Renders folder UI in the sidebar, handles drag-and-drop (folder reorder + conversation assignment), rename, context menu
- `src/content.css` — Injected styles with dark mode support via `prefers-color-scheme`
- `src/background.js` — Service worker (minimal, lifecycle events only)

Data schema in storage: `{ folders: [{ id, name, order, conversationIds[] }] }`

Sidebar detection uses polling (`setInterval`) + `MutationObserver` to handle Gemini's SPA navigation.

## Development

Load unpacked in Chrome via `chrome://extensions/` (Developer mode) pointed at the project root. No build step required.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health
