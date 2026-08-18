// CheckinFormEditor — edit the weekly check-in form for one scope:
//   • coachId = null → the whole organization's form
//   • coachId set    → that coach's personal form (overrides the org form)
// Everyone starts from Eden's standard form; toggles turn standard metrics
// off, and custom metrics (number / 1–10 scale / text) can be added.
import { useState, useEffect } from 'react'
import {
  CHECKIN_SECTIONS, CUSTOM_TYPES, DEFAULT_FORM,
  loadFormAtScope, resolveCheckinForm, saveCheckinForm, deleteCheckinForm,
} from '../lib/checkinForm'
import { T } from '../lib/theme'

export default function CheckinFormEditor({ companyId, coachId = null, coachName = '', onClose }: any) {
  const [form, setForm]         = useState<any>(null)     // null = loading
  const [inherited, setInherited] = useState(false)  // coach scope with no own row yet
  const [saving, setSaving]     = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [draft, setDraft]       = useState({ label: '', type: 'number' })

  useEffect(() => {
    let live = true
    ;(async () => {
      if (!companyId) return
      const own = await loadFormAtScope(companyId, coachId)
      if (!live) return
      if (own) { setForm(own); setInherited(false) }
      else {
        // No customization at this scope yet — start from what's inherited
        const eff = coachId ? await resolveCheckinForm(companyId, coachId) : { ...DEFAULT_FORM }
        if (!live) return
        setForm({ off: [...eff.off], custom: eff.custom.map((c: any) => ({ ...c })) })
        setInherited(true)
      }
    })()
    return () => { live = false }
  }, [companyId, coachId])

  if (!form) return <p style={{ fontSize: 12, color: T.muted, margin: '8px 0' }}>Loading form…</p>

  const isOff = (k: any) => form.off.includes(k)
  const toggle = (k: any) => setForm((f: any) => ({ ...f, off: isOff(k) ? f.off.filter((x: any) => x !== k) : [...f.off, k] }))

  function addCustom() {
    const label = draft.label.trim()
    if (!label) return
    if (form.custom.some((c: any) => c.label.toLowerCase() === label.toLowerCase())) return
    setForm((f: any) => ({ ...f, custom: [...f.custom, { id: `${Date.now()}`, label, type: draft.type }] }))
    setDraft({ label: '', type: draft.type })
  }

  async function save() {
    if (saving) return
    setSaving(true)
    const ok = await saveCheckinForm(companyId, coachId, form)
    setSaving(false)
    if (!ok) { alert("Couldn't save the form — try again."); return }
    setInherited(false)
    setSavedFlash(true); setTimeout(() => setSavedFlash(false), 2000)
  }

  async function resetToInherited() {
    if (!window.confirm(!coachId
      ? 'Reset the organization form back to the standard Eden form?'
      : coachName === 'You'
        ? "Remove your custom form? Your clients will see the organization's form again."
        : `Remove ${coachName || 'this coach'}'s custom form? Their clients will see the organization's form again.`)) return
    setSaving(true)
    const ok = await deleteCheckinForm(companyId, coachId)
    setSaving(false)
    if (!ok) { alert("Couldn't reset — try again."); return }
    const eff = coachId ? await resolveCheckinForm(companyId, coachId) : { ...DEFAULT_FORM }
    setForm({ off: [...eff.off], custom: eff.custom.map((c: any) => ({ ...c })) })
    setInherited(true)
  }

  return (
    <div>
      {coachId && (
        <p style={{ fontSize: 11, color: inherited ? T.muted : T.gold, margin: '0 0 10px' }}>
          {coachName === 'You'
            ? (inherited
                ? "You are currently using the organization's form — saving creates your own version."
                : 'You have a custom form. Your clients see it automatically.')
            : (inherited
                ? `${coachName || 'This coach'} is currently using the organization's form — saving creates their own version.`
                : `${coachName || 'This coach'} has a custom form. Their clients see it automatically.`)}
        </p>
      )}
      {CHECKIN_SECTIONS.map((sec: any) => (
        <div key={sec.id} style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: T.muted, letterSpacing: 1, textTransform: 'uppercase', margin: '0 0 6px' }}>{sec.label}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {sec.items.map((it: any) => {
              const off = isOff(it.key)
              return (
                <button key={it.key} onClick={() => toggle(it.key)}
                  title={off ? 'Click to include this metric' : 'Click to remove this metric'}
                  style={{
                    background: off ? 'none' : `${T.gold}22`,
                    border: `1px solid ${off ? T.border : T.gold + '66'}`,
                    borderRadius: 20, padding: '5px 12px', fontSize: 11, fontWeight: 700,
                    color: off ? T.muted : T.gold, cursor: 'pointer',
                    textDecoration: off ? 'line-through' : 'none', opacity: off ? 0.7 : 1,
                  }}>
                  {off ? '✕ ' : '✓ '}{it.label}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      <div style={{ marginBottom: 12 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: T.muted, letterSpacing: 1, textTransform: 'uppercase', margin: '0 0 6px' }}>Custom Metrics</p>
        {form.custom.map((c: any) => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '7px 10px', marginBottom: 6 }}>
            <span style={{ flex: 1, fontSize: 12, color: T.text, fontWeight: 600 }}>{c.label}</span>
            <span style={{ fontSize: 10, color: T.muted }}>{((CUSTOM_TYPES.find((t: any) => t.value === c.type) || {}) as any).label}</span>
            <button onClick={() => setForm((f: any) => ({ ...f, custom: f.custom.filter((x: any) => x.id !== c.id) }))}
              style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '0 2px' }}>×</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input value={draft.label} onChange={e => setDraft((d: any) => ({ ...d, label: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') addCustom() }}
            placeholder="e.g. Morning fasted glucose"
            style={{ flex: 1, minWidth: 160, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 10px', color: T.text, fontSize: 12, outline: 'none' }}/>
          <select value={draft.type} onChange={e => setDraft((d: any) => ({ ...d, type: e.target.value }))}
            style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 10px', color: T.text, fontSize: 12, outline: 'none', cursor: 'pointer' }}>
            {CUSTOM_TYPES.map((t: any) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <button onClick={addCustom} disabled={!draft.label.trim()}
            style={{ background: draft.label.trim() ? T.gold : T.dim, border: 'none', borderRadius: 8, padding: '8px 14px', color: draft.label.trim() ? T.onAccent : T.muted, fontSize: 12, fontWeight: 800, cursor: draft.label.trim() ? 'pointer' : 'default' }}>
            + Add
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={save} disabled={saving}
          style={{ background: savedFlash ? T.success : T.gold, border: 'none', borderRadius: 8, padding: '9px 16px', color: T.onAccent, fontSize: 12, fontWeight: 800, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving…' : savedFlash ? '✓ Saved — clients see it now' : 'Save Form'}
        </button>
        {!inherited && (
          <button onClick={resetToInherited} disabled={saving}
            style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: 8, padding: '9px 14px', color: T.muted, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            {coachId ? 'Reset to organization form' : 'Reset to standard form'}
          </button>
        )}
        {onClose && (
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.muted, fontSize: 12, cursor: 'pointer', marginLeft: 'auto' }}>Close</button>
        )}
      </div>
    </div>
  )
}
