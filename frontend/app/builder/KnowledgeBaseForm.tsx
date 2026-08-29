'use client';

import React, { useRef, useState } from 'react';
import { Agent, KnowledgeItem, useBuilderStore } from '@/store/builderStore';
import { Field, Input, Switch, Textarea } from '@/components/ui/FormElements';
import { GlassTile } from '@/components/ui/GlassTile';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

const ACCEPTED = '.csv,.tsv,.json,.jsonl,.md,.txt';

/** FastAPI returns validation `detail` as a structured object, not a string -
 *  the same trap that produced "[object Object]" in InterviewRoomLive. */
function readDetail(payload: unknown, fallback: string): string {
  const detail = (payload as { detail?: unknown } | null)?.detail;
  if (typeof detail === 'string') return detail;
  if (detail) return JSON.stringify(detail);
  return fallback;
}

export function KnowledgeBaseForm({ agent }: { agent: Agent }) {
  const { updateKnowledge } = useBuilderStore();
  const knowledge = agent.knowledge;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [dragging, setDragging] = useState(false);

  const accent = agent.identity.color;
  const usingBank = knowledge.mode === 'knowledge_base';
  const withAnswers = knowledge.items.filter((i) => i.idealAnswer.trim()).length;

  const applyParsed = (data: { sourceName: string; items: KnowledgeItem[]; withAnswers: number }, append: boolean) => {
    const incoming = data.items.map((i) => ({ ...i, tags: i.tags ?? [] }));
    const items = append ? [...knowledge.items, ...incoming] : incoming;
    updateKnowledge(agent.id, {
      items,
      sourceName: append && knowledge.sourceName ? `${knowledge.sourceName} + ${data.sourceName}` : data.sourceName,
      mode: 'knowledge_base', // uploading is the intent; flip the mode for them
    });
    setNotice(
      `Loaded ${incoming.length} question${incoming.length === 1 ? '' : 's'}` +
      `, ${data.withAnswers} with an ideal answer.`
    );
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.append('file', files[0]);
      const res = await fetch(`${BACKEND_URL}/knowledge/parse`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(readDetail(data, 'Upload failed.'));
      applyParsed(data, knowledge.items.length > 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePaste = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`${BACKEND_URL}/knowledge/parse-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: pasteText, sourceName: 'Pasted questions', format: 'txt' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(readDetail(data, 'Could not parse that text.'));
      applyParsed(data, knowledge.items.length > 0);
      setPasteText('');
      setPasteOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const updateItem = (id: string, patch: Partial<KnowledgeItem>) => {
    updateKnowledge(agent.id, {
      items: knowledge.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    });
  };

  const removeItem = (id: string) => {
    updateKnowledge(agent.id, { items: knowledge.items.filter((i) => i.id !== id) });
  };

  const addBlankItem = () => {
    updateKnowledge(agent.id, {
      items: [
        ...knowledge.items,
        { id: crypto.randomUUID(), question: '', idealAnswer: '', tags: [] },
      ],
      mode: 'knowledge_base',
    });
  };

  const clearAll = () => {
    if (!confirm('Remove every question in this agent\'s knowledge base?')) return;
    updateKnowledge(agent.id, { items: [], sourceName: '' });
    setNotice(null);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ---- Mode choice: the two options, stated plainly ---- */}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <ModeCard
          title="Trust the model"
          body="The agent writes its own questions from its system prompt, role and difficulty band. Answers are judged on the model's own reading of the competencies."
          selected={!usingBank}
          accent={accent}
          onClick={() => updateKnowledge(agent.id, { mode: 'llm' })}
        />
        <ModeCard
          title="Use a knowledge base"
          body="Upload your own questions and ideal answers. The agent is handed one question at a time from your list, and the scorer grades against your answers instead of its own judgement."
          selected={usingBank}
          accent={accent}
          onClick={() => updateKnowledge(agent.id, { mode: 'knowledge_base' })}
          badge={knowledge.items.length > 0 ? `${knowledge.items.length} loaded` : undefined}
        />
      </div>

      {usingBank && (
        <>
          {/* ---- Upload ---- */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: '32px',
              textAlign: 'center',
              borderRadius: '12px',
              border: `1px dashed ${dragging ? accent : 'var(--border)'}`,
              backgroundColor: dragging ? 'rgba(255,255,255,0.03)' : 'var(--surface)',
              cursor: busy ? 'wait' : 'pointer',
              transition: 'border-color 150ms, background-color 150ms',
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
              {busy ? 'Reading file...' : 'Drop a file here, or click to browse'}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              CSV, TSV, JSON, JSONL, Markdown or TXT
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '10px', lineHeight: 1.5 }}>
              A CSV needs a <code>question</code> column; <code>answer</code>, <code>tags</code> and{' '}
              <code>difficulty</code> are optional.<br />
              Text and Markdown files can use <code>Q: ... A: ...</code> blocks, or just one question per line.
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED}
              onChange={(e) => handleFiles(e.target.files)}
              style={{ display: 'none' }}
            />
          </div>

          <div className="flex gap-3 items-center" style={{ flexWrap: 'wrap' }}>
            <SmallButton onClick={() => setPasteOpen(!pasteOpen)}>
              {pasteOpen ? 'Cancel paste' : 'Paste questions instead'}
            </SmallButton>
            <SmallButton onClick={addBlankItem}>Add a question by hand</SmallButton>
            {knowledge.items.length > 0 && (
              <SmallButton onClick={clearAll} danger>Clear all</SmallButton>
            )}
            {knowledge.sourceName && (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                Source: {knowledge.sourceName}
              </span>
            )}
          </div>

          {pasteOpen && (
            <Field label="Paste your questions" description="One per line, or Q: / A: blocks.">
              <Textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={'Q: How would you design a rate limiter?\nA: Token bucket or sliding window; distributed state in Redis.'}
                style={{ minHeight: '140px', fontFamily: 'var(--font-mono)' }}
              />
              <div style={{ marginTop: '10px' }}>
                <SmallButton onClick={handlePaste} accent={accent}>
                  {busy ? 'Parsing...' : 'Parse'}
                </SmallButton>
              </div>
            </Field>
          )}

          {error && (
            <div style={{
              padding: '12px 16px', borderRadius: '8px', fontSize: '13px',
              border: '1px solid var(--accent-rose)', color: 'var(--accent-rose)',
              backgroundColor: 'rgba(255,0,80,0.06)',
            }}>
              {error}
            </div>
          )}
          {notice && !error && (
            <div style={{
              padding: '12px 16px', borderRadius: '8px', fontSize: '13px',
              border: '1px solid var(--border)', color: 'var(--text-secondary)',
              backgroundColor: 'var(--surface)',
            }}>
              {notice}
            </div>
          )}

          {/* ---- Strictness ---- */}
          <GlassTile style={{ padding: '20px' }}>
            <Switch
              label="Ask only what's in the knowledge base"
              checked={knowledge.strict}
              onChange={(val) => updateKnowledge(agent.id, { strict: val })}
            />
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '10px', lineHeight: 1.5 }}>
              {knowledge.strict
                ? 'On: the agent works through your list and nothing else. It can rephrase a question and ask a short clarifier, but it will not introduce new topics, and its turn ends when the list runs out.'
                : 'Off: the agent covers your list first, then may ask its own follow-up questions once the list is done.'}
            </p>
          </GlassTile>

          {/* ---- Items ---- */}
          {knowledge.items.length > 0 && (
            <div>
              <div className="flex justify-between items-center" style={{ marginBottom: '12px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                  Questions
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {knowledge.items.length} total &middot; {withAnswers} with an ideal answer
                </span>
              </div>

              {withAnswers < knowledge.items.length && (
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
                  Questions without an ideal answer still get asked, but the scorer falls back to its own
                  judgement for them - which is the thing a knowledge base is meant to replace.
                </p>
              )}

              <div className="flex flex-col gap-3">
                {knowledge.items.map((item, index) => (
                  <div
                    key={item.id}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: '10px',
                      padding: '16px',
                      backgroundColor: 'var(--surface)',
                      display: 'flex',
                      gap: '12px',
                    }}
                  >
                    <span style={{
                      fontSize: '12px', color: 'var(--text-muted)', minWidth: '24px',
                      paddingTop: '10px', fontVariantNumeric: 'tabular-nums',
                    }}>
                      {index + 1}
                    </span>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <Input
                        value={item.question}
                        placeholder="Question"
                        onChange={(e) => updateItem(item.id, { question: e.target.value })}
                        style={{ fontWeight: 500 }}
                      />
                      <Textarea
                        value={item.idealAnswer}
                        placeholder="Ideal answer - what a strong response has to cover (optional, but this is what the scorer grades against)"
                        onChange={(e) => updateItem(item.id, { idealAnswer: e.target.value })}
                        style={{ minHeight: '64px', fontSize: '13px' }}
                      />
                      {item.tags.length > 0 && (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {item.tags.map((tag) => (
                            <span key={tag} style={{
                              fontSize: '11px', padding: '2px 8px', borderRadius: '10px',
                              border: '1px solid var(--border)', color: 'var(--text-secondary)',
                            }}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => removeItem(item.id)}
                      title="Remove this question"
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: 'var(--text-muted)', fontSize: '18px', padding: '4px 8px',
                        alignSelf: 'flex-start', lineHeight: 1,
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.color = 'var(--accent-rose)')}
                      onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {knowledge.items.length === 0 && !busy && (
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              No questions loaded yet. Until you add some, this agent will fall back to writing its own.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function ModeCard({
  title, body, selected, accent, onClick, badge,
}: {
  title: string; body: string; selected: boolean; accent: string;
  onClick: () => void; badge?: string;
}) {
  return (
    <div
      onClick={onClick}
      role="radio"
      aria-checked={selected}
      style={{
        padding: '20px',
        borderRadius: '12px',
        cursor: 'pointer',
        border: `1px solid ${selected ? accent : 'var(--border)'}`,
        backgroundColor: selected ? 'rgba(255,255,255,0.03)' : 'var(--surface)',
        transition: 'border-color 150ms, background-color 150ms',
      }}
    >
      <div className="flex items-center gap-2" style={{ marginBottom: '8px' }}>
        <span style={{
          width: '14px', height: '14px', borderRadius: '50%', flexShrink: 0,
          border: `2px solid ${selected ? accent : 'var(--border-strong)'}`,
          backgroundColor: selected ? accent : 'transparent',
        }} />
        <span style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)' }}>{title}</span>
        {badge && (
          <span style={{
            marginLeft: 'auto', fontSize: '11px', padding: '2px 8px', borderRadius: '10px',
            border: '1px solid var(--border)', color: 'var(--text-secondary)',
          }}>
            {badge}
          </span>
        )}
      </div>
      <p style={{ fontSize: '13px', lineHeight: 1.5, color: 'var(--text-secondary)', margin: 0 }}>{body}</p>
    </div>
  );
}

function SmallButton({
  children, onClick, danger, accent,
}: {
  children: React.ReactNode; onClick: () => void; danger?: boolean; accent?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '7px 14px',
        borderRadius: '6px',
        fontSize: '13px',
        fontWeight: 500,
        cursor: 'pointer',
        border: accent ? 'none' : '1px solid var(--border)',
        backgroundColor: accent ?? 'var(--surface-raised)',
        color: accent ? '#fff' : danger ? 'var(--accent-rose)' : 'var(--text-primary)',
      }}
    >
      {children}
    </button>
  );
}
