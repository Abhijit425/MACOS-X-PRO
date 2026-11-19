import { useEffect, useMemo, useRef, useState } from 'react';
import { SquarePen, Trash2, Search, Pin, Bold, Italic, Underline, List, ListOrdered, CheckSquare, Heading, Strikethrough, FolderPlus, Folder, StickyNote } from 'lucide-react';
import type { Note } from '@shared/types';
import { Window } from '../components/Window';
import { api } from '../lib/api';
import { useInvoke, useEvent } from '../lib/hooks';
import { Empty, useContextMenu, useDialog } from '../components/ui';

const strip = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return (d.textContent || '').replace(/\s+/g, ' ').trim(); };
const dateLabel = (ts: number) => { const d = new Date(ts); return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString(); };

export default function Notes() {
  const { data: notes, setData } = useInvoke<Note[]>('notes:list');
  const [sel, setSel] = useState<string | null>(null);
  const [folder, setFolder] = useState('All');
  const [q, setQ] = useState('');
  const [extraFolders, setExtraFolders] = useState<string[]>([]);
  const editor = useRef<HTMLDivElement>(null);
  const saveT = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dialog = useDialog();
  const ctx = useContextMenu();

  const folders = useMemo(() => ['All', ...new Set(['Notes', ...(notes || []).map((n) => n.folder), ...extraFolders])], [notes, extraFolders]);
  const list = useMemo(() => (notes || []).filter((n) => (folder === 'All' || n.folder === folder) && (!q || (n.title + strip(n.body)).toLowerCase().includes(q.toLowerCase()))), [notes, folder, q]);
  const current = (notes || []).find((n) => n.id === sel) || null;

  const create = async () => {
    const n = await api.invoke<Note>('notes:save', { title: 'New Note', body: '', folder: folder === 'All' ? 'Notes' : folder });
    setData([n, ...(notes || [])]); setSel(n.id);
    setTimeout(() => { editor.current?.focus(); document.execCommand('selectAll'); }, 50);
  };
  useEffect(() => { if (notes && !sel && list[0]) setSel(list[0].id); }, [notes]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (new URLSearchParams(location.hash.split('?')[1]).get('new') === '1') void create(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEvent<Record<string, string>>('app:args', (a) => { if (a.new === '1') void create(); });

  useEffect(() => { if (editor.current && current) editor.current.innerHTML = current.body || `<h1>${current.title === 'New Note' ? '' : current.title}</h1>`; }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const onInput = () => {
    if (!current || !editor.current) return;
    const body = editor.current.innerHTML;
    const title = (editor.current.innerText.split('\n').find((l) => l.trim()) || 'New Note').slice(0, 80);
    setData((notes || []).map((n) => (n.id === current.id ? { ...n, body, title, updated: Date.now() } : n)));
    clearTimeout(saveT.current);
    saveT.current = setTimeout(() => void api.invoke('notes:save', { id: current.id, body, title }), 400);
  };
  const remove = async (n: Note) => {
    if (!(await dialog.confirm({ title: `Delete “${n.title}”?`, message: 'This note will be permanently deleted.', confirm: 'Delete', danger: true }))) return;
    await api.invoke('notes:delete', n.id);
    const rest = (notes || []).filter((x) => x.id !== n.id); setData(rest); setSel(rest[0]?.id || null);
  };
  const cmd = (c: string, v?: string) => { document.execCommand(c, false, v); editor.current?.focus(); onInput(); };
  const checklist = () => { document.execCommand('insertHTML', false, '<div><input type="checkbox"> </div>'); onInput(); };

  const side = (
    <div>
      <div className="section-label flex justify-between items-center pr-2">Folders<button title="New folder" onClick={async () => { const n = await dialog.prompt({ title: 'New Folder', input: 'New Folder' }); if (n) { setExtraFolders([...extraFolders, n]); setFolder(n); } }}><FolderPlus size={13} /></button></div>
      {folders.map((f) => (
        <button key={f} onClick={() => setFolder(f)} className={`sidebar-item w-full ${folder === f ? 'active' : ''}`}><Folder size={14} className="text-[#f7b500]" /><span className="flex-1 text-left truncate">{f}</span><span className="text-[11px] muted">{f === 'All' ? notes?.length || 0 : (notes || []).filter((n) => n.folder === f).length}</span></button>
      ))}
    </div>
  );

  return (
    <Window sidebar={side} sidebarWidth={190} title={undefined} toolbar={<>
      <button className="icon-btn" title="Delete note" disabled={!current} onClick={() => current && void remove(current)}><Trash2 size={15} /></button>
      <div className="w-px h-5 bg-[rgb(var(--fg)/.12)] mx-1" />
      <button className="icon-btn" onClick={() => cmd('formatBlock', 'h2')} title="Heading"><Heading size={15} /></button>
      <button className="icon-btn" onClick={() => cmd('bold')} title="Bold (Ctrl+B)"><Bold size={15} /></button>
      <button className="icon-btn" onClick={() => cmd('italic')} title="Italic (Ctrl+I)"><Italic size={15} /></button>
      <button className="icon-btn" onClick={() => cmd('underline')} title="Underline"><Underline size={15} /></button>
      <button className="icon-btn" onClick={() => cmd('strikeThrough')} title="Strikethrough"><Strikethrough size={15} /></button>
      <button className="icon-btn" onClick={() => cmd('insertUnorderedList')} title="Bulleted list"><List size={15} /></button>
      <button className="icon-btn" onClick={() => cmd('insertOrderedList')} title="Numbered list"><ListOrdered size={15} /></button>
      <button className="icon-btn" onClick={checklist} title="Checklist"><CheckSquare size={15} /></button>
      <div className="w-px h-5 bg-[rgb(var(--fg)/.12)] mx-1" />
      <button className="icon-btn" onClick={() => void create()} title="New note (Ctrl+N)"><SquarePen size={15} /></button>
    </>}>
      <div className="h-full flex" onKeyDown={(e) => { if (e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); void create(); } }}>
        <div className="w-[260px] shrink-0 border-r border-[rgb(var(--stroke)/var(--stroke-a))] flex flex-col">
          <div className="p-2"><div className="flex items-center gap-2 field !py-[3px]"><Search size={13} className="opacity-50" /><input className="bg-transparent outline-none flex-1 text-[12.5px]" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} /></div></div>
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {list.map((n) => (
              <button key={n.id} onClick={() => setSel(n.id)} onContextMenu={(e) => ctx(e, [
                { label: n.pinned ? 'Unpin Note' : 'Pin Note', onClick: () => void api.invoke<Note>('notes:save', { id: n.id, pinned: !n.pinned }).then(() => api.invoke<Note[]>('notes:list').then(setData)) },
                { label: 'Move to Folder', submenu: folders.filter((f) => f !== 'All' && f !== n.folder).map((f) => ({ label: f, onClick: () => void api.invoke('notes:save', { id: n.id, folder: f }).then(() => api.invoke<Note[]>('notes:list').then(setData)) })) },
                { separator: true }, { label: 'Delete', danger: true, onClick: () => void remove(n) },
              ])} className={`w-full text-left px-3 py-2 rounded-lg mb-[2px] ${sel === n.id ? 'bg-[#f7b50040]' : 'hover:bg-[rgb(var(--fg)/.05)]'}`}>
                <div className="font-semibold truncate text-[13px] flex items-center gap-1">{n.pinned && <Pin size={11} className="text-[#f7b500]" />}{n.title || 'New Note'}</div>
                <div className="text-[12px] muted truncate"><span className="mr-2">{dateLabel(n.updated)}</span>{strip(n.body).slice(n.title.length, n.title.length + 80) || 'No additional text'}</div>
              </button>
            ))}
            {!list.length && <div className="text-center muted text-[12px] p-4">No notes</div>}
          </div>
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          {current ? (<>
            <div className="text-center text-[11px] muted pt-2">{new Date(current.updated).toLocaleString([], { dateStyle: 'long', timeStyle: 'short' })}</div>
            <div ref={editor} contentEditable suppressContentEditableWarning onInput={onInput}
              onClick={(e) => { const t = e.target as HTMLInputElement; if (t.type === 'checkbox') { t.toggleAttribute('checked', t.checked); onInput(); } }}
              className="flex-1 overflow-y-auto outline-none px-10 py-4 text-[14px] leading-relaxed note-editor" />
            <style>{`.note-editor h1{font-size:24px;font-weight:700;margin:0 0 8px}.note-editor h2{font-size:18px;font-weight:600;margin:10px 0 4px}.note-editor ul{list-style:disc;padding-left:22px}.note-editor ol{list-style:decimal;padding-left:22px}.note-editor input[type=checkbox]{margin-right:6px;accent-color:#f7b500}`}</style>
          </>) : <Empty icon={<StickyNote size={44} />} title="No note selected" action={<button className="btn btn-primary" onClick={() => void create()}><SquarePen size={14} /> New Note</button>} />}
        </div>
      </div>
    </Window>
  );
}
