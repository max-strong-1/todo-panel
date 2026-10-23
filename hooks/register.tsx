import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Todo } from '../types'
import { BRAND, Wordmark } from './brand'

const PANE = 'todo-panel'

// Each list is rendered top to bottom in this order. A list with `file` keeps its
// canonical copy in that markdown checklist (other agents can edit it too);
// the rest live in the plugin store. The project list's file is the
// `projectFile` option; left empty, that list lives in the store as well.
// Atoms live in top-level consts: the engine's state scan only reads those.
const TODOS = atom({ plugin: 'todo-panel', key: 'todos' } as const, [] as Todo[])
const PROJECT = atom({ plugin: 'todo-panel', key: 'project' } as const, [] as Todo[])
type List = { key: 'todos' | 'project'; title: string; file: string | undefined }
let LISTS: List[] = [
  { key: 'todos', title: 'To-do', file: undefined },
  { key: 'project', title: 'Project', file: undefined },
]
type ListKey = List['key']

const setItems = ($: EngineInterface, list: List, items: Todo[]) =>
  list.key === 'project' ? update($, PROJECT, () => items) : update($, TODOS, () => items)
const readItems = ($: EngineInterface, list: List) => (list.key === 'project' ? read($, PROJECT) : read($, TODOS))

const byKey = (key: unknown): List => LISTS.find(l => l.key === key) ?? LISTS[0]

const ITEM = /^- \[( |x|X)\] (.*)$/

// Checklist lines become items; every other line (title, notes) is kept as-is
// around them. Ids come from the text so they survive other agents reordering.
function parse(md: string): { items: Todo[]; head: string[]; tail: string[] } {
  const lines = md.replace(/\n$/, '').split('\n')
  const idx = lines.flatMap((l, i) => (ITEM.test(l) ? [i] : []))
  const first = idx[0] ?? lines.length
  const last = idx[idx.length - 1] ?? lines.length - 1
  const items = idx.map(i => {
    const [, mark, text] = lines[i].match(ITEM)!
    return { id: `md:${text}`, text, isDone: mark !== ' ' }
  })
  return { items, head: lines.slice(0, first), tail: lines.slice(last + 1) }
}

async function load($: EngineInterface, list: List): Promise<Todo[]> {
  if (!list.file) return ((await $.store.get(list.key)) ?? []) as Todo[]
  try {
    return parse(await $.fs.read(list.file)).items
  } catch {
    return []
  }
}

// Re-read before each change so two sessions (or another agent editing the
// list file) don't overwrite each other's edits.
async function change($: EngineInterface, list: List, fn: (items: Todo[]) => Todo[]) {
  if (list.file) {
    let md = ''
    try {
      md = await $.fs.read(list.file)
    } catch {}
    const { items, head, tail } = parse(md)
    const next = fn(items).map(t => ({ ...t, id: `md:${t.text}` }))
    const body = next.map(t => `- [${t.isDone ? 'x' : ' '}] ${t.text}`)
    await $.fs.write(list.file, [...head, ...body, ...tail].join('\n') + '\n')
    await setItems($, list, next)
    return
  }
  const saved = ((await $.store.get(list.key)) ?? []) as Todo[]
  const next = fn(saved)
  await $.store.set(list.key, next)
  await setItems($, list, next)
}

async function add($: EngineInterface, list: List, text: string) {
  const trimmed = text.trim()
  if (!trimmed) return
  const id = `${await $.clock.now()}-${Math.random().toString(36).slice(2, 6)}`
  await change($, list, items => [...items, { id, text: trimmed, isDone: false }])
}

export const register: Register = (on, options) => {
  const file = typeof options.projectFile === 'string' && options.projectFile.trim() ? options.projectFile.trim() : undefined
  const title = typeof options.projectTitle === 'string' && options.projectTitle.trim() ? options.projectTitle.trim() : 'Project'
  LISTS = [LISTS[0], { key: 'project', title, file }]
  on('session.start', async ($, e, next) => {
    for (const list of LISTS) {
      const saved = await load($, list)
      await setItems($, list, saved)
    }
    await $.command.register({
      name: 'todo',
      description: 'Open the to-do pane, or add an item: /todo <text>',
      argumentHint: '[text]',
    })
    await $.tool.register({
      name: 'add',
      description:
        "Add items to the user's persistent to-do pane (shared across every session). Use when the user asks to put something on the list. `list` picks which list: 'todos' (default, general to-do) or 'project' (the project list).",
      inputSchema: {
        type: 'object',
        properties: {
          items: { type: 'array', items: { type: 'string' } },
          list: { type: 'string', enum: LISTS.map(l => l.key) as ListKey[] },
        },
        required: ['items'],
      },
    })
    void $.ui.open({ id: PANE, title: 'To-do' })

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if ((e.tool as string) !== 'mcp__todo-panel__add') return next(e)
    const raw = e as unknown as {
      items?: unknown
      list?: unknown
      input?: { items?: unknown; list?: unknown }
    }
    const items = (raw.items ?? raw.input?.items ?? []) as unknown[]
    const list = byKey(raw.list ?? raw.input?.list)
    const texts = items.filter((t): t is string => typeof t === 'string' && t.trim() !== '')
    for (const text of texts) await add($, list, text)

    const msg = `Added ${texts.length} item(s) to ${list.title}.`
    return { result: msg, text: msg }
  })

  on('command.run', { command: 'todo' }, async ($, e) => {
    if (e.args.trim()) {
      await add($, LISTS[0], e.args)
      await $.ui.open({ id: PANE, title: 'To-do' })
      return { text: `Added: ${e.args.trim()}` }
    }
    await $.ui.open({ id: PANE, title: 'To-do' })

    return { text: 'To-do pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    // Mobile has no Input; there, add items with /todo <text>.
    const Input = 'Input' in els ? els.Input : undefined
    // File-backed lists re-read on each draw so other agents' edits show up.
    const all = await Promise.all(
      LISTS.map(async l => ({ list: l, items: l.file ? await load($, l) : await readItems($, l) })),
    )

    return (
      <Box flexDirection="column">
        <Wordmark els={els} />
        {all.map(({ list, items }, i) => {
          const open = items.filter(t => !t.isDone).length
          return (
            <Box key={`list-${list.key}`} flexDirection="column" marginTop={1}>
              <Text weight="semibold" color={BRAND.orange}>
                {list.title.toUpperCase()}
              </Text>
              <Text color={BRAND.slate}>
                {open} open · {items.length - open} done
              </Text>
              {items.length === 0 && <Text color={BRAND.slate}>Nothing on the list.</Text>}
              {items.map(t => (
                <Box key={t.id}>
                  <Button
                    key={`toggle-${t.id}`}
                    onPress={() =>
                      change($, list, l => l.map(x => (x.id === t.id ? { ...x, isDone: !x.isDone } : x)))
                    }
                  >
                    {t.isDone ? '[x]' : '[ ]'}
                  </Button>
                  <Box flexGrow={1}>
                    <Text color={t.isDone ? BRAND.slate : BRAND.bone} strikethrough={t.isDone}>
                      {' '}
                      {t.text}
                    </Text>
                  </Box>
                  <Button key={`del-${t.id}`} onPress={() => change($, list, l => l.filter(x => x.id !== t.id))}>
                    ✕
                  </Button>
                </Box>
              ))}
              {Input && (
                <Input
                  key={`add-${list.key}-${items.length}`}
                  placeholder={`Add to ${list.title}, Enter to save`}
                  submitLabel="Add"
                  onSubmit={(value: string) => add($, list, value)}
                />
              )}
              {items.length > open && (
                <Button key={`clear-${list.key}`} onPress={() => change($, list, l => l.filter(x => !x.isDone))}>
                  Clear done
                </Button>
              )}
            </Box>
          )
        })}
      </Box>
    )
  })
}
