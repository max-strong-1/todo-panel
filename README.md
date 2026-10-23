# todo-panel

A Claude Code mod: two to-do lists in a side pane beside the chat, kept across every session.

- **To-do**: a general list, stored by the plugin.
- **Project**: a second list. Point it at a markdown checklist file (`- [ ] item` lines) and the pane reads and writes that file, so other tools and agents can edit the same list. Leave the file empty and it is stored by the plugin too.

Add items in the pane, with `/todo <text>`, or by asking Claude to put something on the list.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install todo-panel --marketplace max-strong-1/todo-panel
```

Answer `y` to add the marketplace, then pick a scope (user scope is first; press Enter).

From a shell:

```
claude plugin install todo-panel --marketplace max-strong-1/todo-panel
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `max-strong-1/todo-panel`, then Add plugin.

## Options

Set in the config menu (`/config`) after install:

- `projectTitle`: heading for the second list (default `Project`).
- `projectFile`: absolute path to a markdown checklist for the second list.

The pane opens by itself in a terminal at least 144 columns wide; otherwise run `/todo`.
