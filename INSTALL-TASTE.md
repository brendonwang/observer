# Taste Skill, project-local

The redesign follows the `minimalist-ui` skill from [Taste Skill](https://www.tasteskill.dev/).
A copy of the upstream `SKILL.md` is vendored in `.agents/skills/minimalist-ui/SKILL.md`,
so Codex and other agents that read project skills can use it without any extra dependencies.

For newer upstream releases, run on your own Mac from this project directory:

```sh
npx skills add https://github.com/Leonxlnx/taste-skill --skill minimalist-ui
```

Or install the full Taste Skill bundle for Codex:

```sh
npx skills add Leonxlnx/taste-skill -a codex
```

The repository is open source (MIT). Upstream skill content is authored by the Taste Skill team; see its official repository for licensing and version changes.

This project remains a dependency-free Cloudflare Worker and a Python standard-library agent. The Taste instructions affect the interface; they are not loaded or executed by the Worker at runtime.
