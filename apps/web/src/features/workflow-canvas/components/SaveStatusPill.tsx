interface SaveStatusPillProps {
  dirty: boolean
  saving: boolean
}

export function SaveStatusPill({ dirty, saving }: SaveStatusPillProps) {
  return <div className="mina-wc-save-pill">{saving ? 'Saving' : dirty ? 'Unsaved' : 'Saved'}</div>
}
