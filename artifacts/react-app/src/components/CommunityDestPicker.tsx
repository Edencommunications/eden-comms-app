// Destination picker for "post reports/recaps into" dropdowns.
// Keeps the main org's communities at the top level and tucks each DBA's
// channels behind a "📁 <DBA name>" folder entry — picking a folder reveals a
// second dropdown with just that DBA's channels, so hundreds of DBA channels
// never flood the first list. 1:1 DM channels (context dbadm:…) never show.
import { useState } from 'react';

const isDbaCtx = (ctx: any) => typeof ctx === 'string' && (ctx.startsWith('dba:') || ctx.startsWith('dbadm:'));

export default function CommunityDestPicker({ communities, dbas, value, onPick, onClear, disabled, B, style }: any) {
  // '' = follow the saved value; a DBA id = the user opened that folder.
  const [folder, setFolder] = useState('');
  const list: any[] = Array.isArray(communities) ? communities : [];
  const main = list.filter((c) => !isDbaCtx(c.context));
  const chansFor = (dbaId: string) => list.filter((c) => c.context === `dba:${dbaId}`);
  const folders = (Array.isArray(dbas) ? dbas : []).filter((d: any) => chansFor(d.id).length > 0);

  // The DBA the saved destination belongs to (if any).
  const cur = list.find((c) => c.id === value);
  const curDba = cur && typeof cur.context === 'string' && cur.context.startsWith('dba:') && !cur.context.startsWith('dbadm:')
    ? cur.context.slice(4) : '';
  // User's explicit folder choice wins; otherwise open the saved value's folder.
  const openFolder = folder || curDba;

  const sel = {
    background: B.surface, border: `1px solid ${B.border}`, borderRadius: 8, padding: '7px 10px',
    fontSize: 12, outline: 'none', cursor: 'pointer', maxWidth: '100%', ...(style || {}),
  } as any;

  return (
    <>
      <select disabled={disabled}
        value={openFolder ? `dbafolder:${openFolder}` : (value || '')}
        onChange={(e) => {
          const v = e.target.value;
          if (v.startsWith('dbafolder:')) { setFolder(v.slice(10)); return; }
          setFolder('');
          if (v) onPick(v);
          else if (onClear) onClear();
        }}
        style={{ ...sel, color: value && !openFolder ? B.gold : B.text }}>
        <option value="">{onClear ? '— none —' : 'Choose a community…'}</option>
        {main.map((c: any) => <option key={c.id} value={c.id}>{c.context === 'team' ? '👥' : '💬'} {c.name}</option>)}
        {folders.map((d: any) => <option key={d.id} value={`dbafolder:${d.id}`}>📁 {d.name} (DBA)</option>)}
      </select>
      {openFolder && (
        <select disabled={disabled}
          value={curDba === openFolder ? value : ''}
          onChange={(e) => { if (e.target.value) { setFolder(''); onPick(e.target.value); } }}
          style={{ ...sel, color: curDba === openFolder ? B.gold : B.text }}>
          <option value="">Choose a channel in this DBA…</option>
          {chansFor(openFolder).map((c: any) => <option key={c.id} value={c.id}>💬 {c.name}</option>)}
        </select>
      )}
    </>
  );
}
