'use client';

import { useMemo, useState, useTransition } from 'react';
import InlineText from './InlineText';
import RichText from './RichText';
import TemplateActions from './TemplateActions';
import {
  createComment,
  createItem,
  createSection,
  removeComment,
  removeItem,
  removeSection,
  renameItem,
  renameSection,
  renameTemplate,
  saveComment,
} from '@/app/actions';
import type { CommentRow, ItemRow, SectionRow, TemplateTree } from '@/lib/db';

type Toast = { text: string; bad?: boolean } | null;

const TYPE_LABEL: Record<CommentRow['comment_type'], string> = {
  info: 'info',
  limitation: 'limitation',
  defect: 'defect',
};

export default function TemplateEditor({ template }: { template: TemplateTree }) {
  const [tree, setTree] = useState<TemplateTree>(template);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<Toast>(null);
  const [, startTransition] = useTransition();

  const id = tree.id;

  function say(text: string, bad = false) {
    setToast({ text, bad });
    setTimeout(() => setToast(null), bad ? 5000 : 1800);
  }

  /** Run a server action, show the outcome, and keep local state in step. */
  function run(work: () => Promise<void>, ok: string, apply?: () => void) {
    apply?.();
    startTransition(async () => {
      try {
        await work();
        say(ok);
      } catch (err) {
        say(err instanceof Error ? err.message : 'Could not save that change.', true);
      }
    });
  }

  function patchSections(fn: (sections: SectionRow[]) => SectionRow[]) {
    setTree((t) => ({ ...t, sections: fn(t.sections) }));
  }

  const counts = useMemo(() => {
    const items = tree.sections.flatMap((s) => s.items);
    return {
      sections: tree.sections.length,
      items: items.length,
      comments: items.reduce((n, i) => n + i.comments.length, 0),
    };
  }, [tree]);

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!needle) return tree.sections;
    return tree.sections
      .map((section) => {
        const sectionHit = section.name.toLowerCase().includes(needle);
        const items = section.items
          .map((item) => {
            const itemHit = item.name.toLowerCase().includes(needle);
            const comments =
              sectionHit || itemHit
                ? item.comments
                : item.comments.filter(
                    (c) =>
                      c.name.toLowerCase().includes(needle) ||
                      c.body_text.toLowerCase().includes(needle),
                  );
            return itemHit || comments.length ? { ...item, comments } : null;
          })
          .filter(Boolean) as ItemRow[];
        return sectionHit || items.length ? { ...section, items } : null;
      })
      .filter(Boolean) as SectionRow[];
  }, [tree.sections, needle]);

  const searching = needle.length > 0;
  const visible = (sectionId: string) => searching || open.has(sectionId);

  function toggle(sectionId: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }

  const allOpen = open.size === tree.sections.length && tree.sections.length > 0;

  return (
    <>
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="pad">
          <div className="row wrap">
            <div className="grow" style={{ flex: 1, minWidth: 220 }}>
              <InlineText
                ariaLabel="Template name"
                value={tree.name}
                style={{ fontSize: 22, fontWeight: 650, letterSpacing: '-0.02em' }}
                onSave={async (next) => {
                  setTree((t) => ({ ...t, name: next }));
                  await renameTemplate(id, next);
                  say('Template renamed');
                }}
              />
              <div className="meta" style={{ paddingLeft: 7 }}>
                {counts.sections} sections &middot; {counts.items} items &middot; {counts.comments}{' '}
                comments
                {tree.source_file ? ` · from ${tree.source_file}` : ''}
              </div>
            </div>
            <TemplateActions id={id} name={tree.name} />
          </div>

          <div className="row wrap mt">
            <input
              type="text"
              placeholder="Search sections, items and comment text…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ flex: 1, minWidth: 220 }}
            />
            <button
              onClick={() =>
                setOpen(allOpen ? new Set() : new Set(tree.sections.map((s) => s.id)))
              }
            >
              {allOpen ? 'Collapse all' : 'Expand all'}
            </button>
            <button
              onClick={() =>
                run(
                  async () => {
                    const newId = await createSection(id);
                    patchSections((s) => [
                      ...s,
                      {
                        id: newId,
                        template_id: id,
                        name: 'New section',
                        position: s.length,
                        items: [],
                      },
                    ]);
                    setOpen((prev) => new Set(prev).add(newId));
                  },
                  'Section added',
                )
              }
            >
              Add section
            </button>
          </div>

          {searching && (
            <div className="meta mt">
              {filtered.length === 0
                ? 'Nothing matches that.'
                : `Showing matches for “${query.trim()}”.`}
            </div>
          )}
        </div>
      </div>

      {filtered.map((section) => (
        <div className="section" key={section.id}>
          <header>
            <button
              className="twist"
              aria-label={visible(section.id) ? 'Collapse section' : 'Expand section'}
              onClick={() => toggle(section.id)}
            >
              {visible(section.id) ? '▾' : '▸'}
            </button>
            <InlineText
              ariaLabel="Section name"
              value={section.name}
              style={{ fontWeight: 650, fontSize: 16 }}
              onSave={async (next) => {
                patchSections((all) =>
                  all.map((s) => (s.id === section.id ? { ...s, name: next } : s)),
                );
                await renameSection(id, section.id, next);
                say('Section renamed');
              }}
            />
            <span className="meta small" style={{ whiteSpace: 'nowrap' }}>
              {section.items.length} items
            </span>
            <button
              className="ghost danger"
              title="Delete this section and everything in it"
              onClick={() => {
                if (!confirm(`Delete the section "${section.name}" and everything in it?`)) return;
                run(
                  () => removeSection(id, section.id),
                  'Section deleted',
                  () => patchSections((all) => all.filter((s) => s.id !== section.id)),
                );
              }}
            >
              Delete
            </button>
          </header>

          {visible(section.id) && (
            <div className="section-body">
              {section.items.map((item) => (
                <ItemBlock
                  key={item.id}
                  templateId={id}
                  item={item}
                  onRun={run}
                  onPatch={(fn) =>
                    patchSections((all) =>
                      all.map((s) =>
                        s.id === section.id
                          ? { ...s, items: s.items.map((i) => (i.id === item.id ? fn(i) : i)) }
                          : s,
                      ),
                    )
                  }
                  onDelete={() =>
                    run(
                      () => removeItem(id, item.id),
                      'Item deleted',
                      () =>
                        patchSections((all) =>
                          all.map((s) =>
                            s.id === section.id
                              ? { ...s, items: s.items.filter((i) => i.id !== item.id) }
                              : s,
                          ),
                        ),
                    )
                  }
                />
              ))}

              <button
                className="ghost"
                style={{ marginTop: 10 }}
                onClick={() =>
                  run(async () => {
                    const newId = await createItem(id, section.id);
                    patchSections((all) =>
                      all.map((s) =>
                        s.id === section.id
                          ? {
                              ...s,
                              items: [
                                ...s.items,
                                {
                                  id: newId,
                                  section_id: section.id,
                                  name: 'New item',
                                  position: s.items.length,
                                  comments: [],
                                },
                              ],
                            }
                          : s,
                      ),
                    );
                  }, 'Item added')
                }
              >
                + Add item
              </button>
            </div>
          )}
        </div>
      ))}

      {tree.sections.length === 0 && (
        <div className="card">
          <div className="empty">This template has no sections yet.</div>
        </div>
      )}

      {toast && <div className={toast.bad ? 'toast bad' : 'toast'}>{toast.text}</div>}
    </>
  );
}

/* ------------------------------------------------------------------ item */

function ItemBlock({
  templateId,
  item,
  onRun,
  onPatch,
  onDelete,
}: {
  templateId: string;
  item: ItemRow;
  onRun: (work: () => Promise<void>, ok: string, apply?: () => void) => void;
  onPatch: (fn: (item: ItemRow) => ItemRow) => void;
  onDelete: () => void;
}) {
  return (
    <div className="item">
      <header>
        <InlineText
          ariaLabel="Item name"
          value={item.name}
          style={{ fontWeight: 600 }}
          onSave={async (next) => {
            onPatch((i) => ({ ...i, name: next }));
            await renameItem(templateId, item.id, next);
          }}
        />
        <span className="meta small" style={{ whiteSpace: 'nowrap' }}>
          {item.comments.length}
        </span>
        <button className="ghost danger" onClick={onDelete} title="Delete this item">
          Delete
        </button>
      </header>

      {item.comments.map((comment) => (
        <CommentBlock
          key={comment.id}
          templateId={templateId}
          comment={comment}
          onRun={onRun}
          onPatch={(fn) =>
            onPatch((i) => ({
              ...i,
              comments: i.comments.map((c) => (c.id === comment.id ? fn(c) : c)),
            }))
          }
          onDelete={() =>
            onRun(
              () => removeComment(templateId, comment.id),
              'Comment deleted',
              () =>
                onPatch((i) => ({
                  ...i,
                  comments: i.comments.filter((c) => c.id !== comment.id),
                })),
            )
          }
        />
      ))}

      <button
        className="ghost"
        onClick={() =>
          onRun(async () => {
            const newId = await createComment(templateId, item.id);
            onPatch((i) => ({
              ...i,
              comments: [...i.comments, blankComment(newId, item.id, i.comments.length)],
            }));
          }, 'Comment added')
        }
      >
        + Add comment
      </button>
    </div>
  );
}

function blankComment(id: string, itemId: string, position: number): CommentRow {
  return {
    id,
    item_id: itemId,
    name: 'New comment',
    body_html: '',
    body_text: '',
    comment_type: 'info',
    severity: null,
    recommendation: null,
    answer_type: null,
    choices: [],
    unit_types: [],
    default_value: null,
    default_value_2: null,
    default_unit_type: null,
    default_location: null,
    estimate_min: null,
    estimate_max: null,
    locked: false,
    simple_format: false,
    disable_photos: false,
    uses: 0,
    photos: [],
    position,
    source_row: null,
  };
}

/* --------------------------------------------------------------- comment */

function CommentBlock({
  templateId,
  comment,
  onRun,
  onPatch,
  onDelete,
}: {
  templateId: string;
  comment: CommentRow;
  onRun: (work: () => Promise<void>, ok: string, apply?: () => void) => void;
  onPatch: (fn: (c: CommentRow) => CommentRow) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body_html);

  return (
    <div className="comment">
      <header>
        <InlineText
          ariaLabel="Comment name"
          value={comment.name}
          style={{ fontWeight: 600, fontSize: 14 }}
          onSave={async (next) => {
            onPatch((c) => ({ ...c, name: next }));
            await saveComment(templateId, comment.id, { name: next });
          }}
        />
        <span className={`tag ${comment.comment_type}`}>{TYPE_LABEL[comment.comment_type]}</span>
        {comment.severity && <span className={`tag ${comment.severity}`}>{comment.severity}</span>}
        {comment.answer_type && <span className="tag plain">{comment.answer_type}</span>}
        <button
          className="ghost"
          onClick={() => {
            setDraft(comment.body_html);
            setEditing((v) => !v);
          }}
        >
          {editing ? 'Close' : 'Edit'}
        </button>
        <button className="ghost danger" onClick={onDelete} title="Delete this comment">
          Delete
        </button>
      </header>

      {!editing && comment.body_html && (
        <div className="body" dangerouslySetInnerHTML={{ __html: comment.body_html }} />
      )}

      {!editing && !comment.body_html && comment.choices.length > 0 && (
        <div className="body muted small">Options: {comment.choices.join(', ')}</div>
      )}

      {editing && (
        <div className="stack-sm" style={{ marginTop: 10 }}>
          <RichText html={draft} onChange={setDraft} />

          <div className="grid2">
            <label className="field" style={{ marginBottom: 0 }}>
              <span>Type</span>
              <select
                value={comment.comment_type}
                onChange={(e) => {
                  const value = e.target.value as CommentRow['comment_type'];
                  onRun(
                    () => saveComment(templateId, comment.id, { comment_type: value }),
                    'Type updated',
                    () => onPatch((c) => ({ ...c, comment_type: value })),
                  );
                }}
              >
                <option value="info">Info</option>
                <option value="limitation">Limitation</option>
                <option value="defect">Defect</option>
              </select>
            </label>

            <label className="field" style={{ marginBottom: 0 }}>
              <span>Severity</span>
              <select
                value={comment.severity ?? ''}
                onChange={(e) => {
                  const value = (e.target.value || null) as CommentRow['severity'];
                  onRun(
                    () => saveComment(templateId, comment.id, { severity: value }),
                    'Severity updated',
                    () => onPatch((c) => ({ ...c, severity: value })),
                  );
                }}
              >
                <option value="">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
          </div>

          <div className="row">
            <button
              className="primary"
              onClick={() =>
                onRun(
                  () => saveComment(templateId, comment.id, { body_html: draft }),
                  'Comment saved',
                  () => {
                    onPatch((c) => ({ ...c, body_html: draft }));
                    setEditing(false);
                  },
                )
              }
            >
              Save text
            </button>
            <button onClick={() => setEditing(false)}>Cancel</button>
            {comment.source_row && (
              <span className="meta small">from row {comment.source_row} of the export</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
