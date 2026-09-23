import { useEffect, useRef, useState } from 'react'
import { keywordLabel, RARITY, TYPES } from './mtg'
import type { CubeSet } from './supabase'
import { EMPTY_ADVANCED, SORTS, type AdvancedFilters } from './filters'

export default function FilterDialog(props: {
  draft: AdvancedFilters
  sets: CubeSet[]
  keywords: string[]
  onDraftChange: (draft: AdvancedFilters) => void
  onApply: (draft: AdvancedFilters) => void
  onDiscard: () => void
}) {
  const { draft, sets, keywords, onDraftChange, onApply, onDiscard } = props
  const ref = useRef<HTMLDialogElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const [setSearch, setSetSearch] = useState('')
  const [keywordSearch, setKeywordSearch] = useState('')
  const setDraft = <K extends keyof AdvancedFilters>(key: K, value: AdvancedFilters[K]) =>
    onDraftChange({ ...draft, [key]: value })
  /** Picking several values is the point: a click adds or removes one. */
  const toggle = (key: 'setCodes' | 'keywordList' | 'cardTypes' | 'cmcs' | 'rarities', value: string) =>
    onDraftChange({
      ...draft,
      [key]: draft[key].includes(value) ? draft[key].filter((v) => v !== value) : [...draft[key], value],
    })

  const visibleSets = sets.filter((set) =>
    `${set.name} ${set.code}`.toLocaleLowerCase('de').includes(setSearch.trim().toLocaleLowerCase('de')),
  )
  const visibleKeywords = keywords.filter((key) =>
    `${keywordLabel(key)} ${key}`.toLocaleLowerCase('de').includes(keywordSearch.trim().toLocaleLowerCase('de')),
  )

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    if (dialog.isConnected && !dialog.open) dialog.showModal()
    const focusFrame = requestAnimationFrame(() => closeButton.current?.focus())
    return () => {
      cancelAnimationFrame(focusFrame)
      document.body.style.overflow = previousOverflow
    }
  }, [])

  function closeOnBackdrop(event: React.MouseEvent<HTMLDialogElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const onDialog =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    if (!onDialog) event.currentTarget.close()
  }

  return (
    <dialog
      ref={ref}
      id="advanced-filters"
      className="filter-dialog"
      aria-labelledby="advanced-filters-title"
      onClick={closeOnBackdrop}
      onClose={onDiscard}
    >
      <div className="filter-dialog-head">
        <div>
          <p className="filter-eyebrow">Kartensuche</p>
          <h2 id="advanced-filters-title">Erweiterte Filter</h2>
        </div>
        <button ref={closeButton} className="dialog-close" aria-label="Filter schließen" onClick={() => ref.current?.close()}>
          ×
        </button>
      </div>

      <div className="filter-dialog-body">
        <fieldset className="filter-fieldset searchable-options">
          <legend>Set</legend>
          <label htmlFor="filter-set-search">Sets durchsuchen</label>
          <input
            id="filter-set-search"
            type="search"
            placeholder="Name oder Code"
            value={setSearch}
            onChange={(event) => setSetSearch(event.target.value)}
          />
          <div className="radio-list">
            {!setSearch && (
              <label>
                <input type="checkbox" checked={!draft.setCodes.length} onChange={() => setDraft('setCodes', [])} />
                Alle Sets
              </label>
            )}
            {visibleSets.map((set) => (
              <label key={set.code}>
                <input
                  type="checkbox"
                  value={set.code}
                  checked={draft.setCodes.includes(set.code)}
                  onChange={() => toggle('setCodes', set.code)}
                />
                <span>{set.parent_code ? `↳ ${set.name}` : set.name}<small>{set.code.toUpperCase()}</small></span>
              </label>
            ))}
            {!visibleSets.length && <p className="muted option-empty">Kein Set gefunden.</p>}
          </div>
        </fieldset>

        <fieldset className="filter-fieldset searchable-options">
          <legend>Schlüsselwort</legend>
          <label htmlFor="filter-keyword-search">Schlüsselwörter durchsuchen</label>
          <input
            id="filter-keyword-search"
            type="search"
            placeholder="Begriff"
            value={keywordSearch}
            onChange={(event) => setKeywordSearch(event.target.value)}
          />
          <div className="radio-list">
            {!keywordSearch && (
              <label>
                <input
                  type="checkbox"
                  checked={!draft.keywordList.length}
                  onChange={() => setDraft('keywordList', [])}
                />
                Alle Schlüsselwörter
              </label>
            )}
            {visibleKeywords.map((key) => (
              <label key={key}>
                <input
                  type="checkbox"
                  value={key}
                  checked={draft.keywordList.includes(key)}
                  onChange={() => toggle('keywordList', key)}
                />
                {keywordLabel(key)}
              </label>
            ))}
            {!visibleKeywords.length && <p className="muted option-empty">Kein Schlüsselwort gefunden.</p>}
          </div>
        </fieldset>

        <fieldset className="filter-fieldset">
          <legend>Kartentyp</legend>
          <div className="choice-pills">
            <button aria-pressed={!draft.cardTypes.length} onClick={() => setDraft('cardTypes', [])}>
              Alle
            </button>
            {TYPES.map(([label]) => (
              <button
                key={label}
                aria-pressed={draft.cardTypes.includes(label)}
                onClick={() => toggle('cardTypes', label)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="filter-fieldset">
          <legend>Manawert</legend>
          <div className="choice-pills">
            <button aria-pressed={!draft.cmcs.length} onClick={() => setDraft('cmcs', [])}>
              Alle
            </button>
            {['0', '1', '2', '3', '4', '5', '6', '7'].map((value) => (
              <button key={value} aria-pressed={draft.cmcs.includes(value)} onClick={() => toggle('cmcs', value)}>
                {value === '7' ? '7+' : value}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="filter-fieldset">
          <legend>Seltenheit</legend>
          <div className="choice-pills">
            <button aria-pressed={!draft.rarities.length} onClick={() => setDraft('rarities', [])}>
              Alle
            </button>
            {Object.entries(RARITY).map(([value, label]) => (
              <button
                key={value}
                aria-pressed={draft.rarities.includes(value)}
                onClick={() => toggle('rarities', value)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="filter-fieldset">
          <legend>Sortierung</legend>
          <div className="choice-pills">
            {Object.entries(SORTS).map(([value, label]) => (
              <button key={value} aria-pressed={draft.sort === value} onClick={() => setDraft('sort', value)}>{label}</button>
            ))}
          </div>
        </fieldset>

        <fieldset className="filter-fieldset filter-toggles">
          <legend>Weitere Optionen</legend>
          <button aria-pressed={draft.showExcluded} onClick={() => setDraft('showExcluded', !draft.showExcluded)}>
            Ausgeschlossene zeigen
          </button>
          <button
            aria-pressed={draft.colors.size > 0 && draft.exactColors}
            disabled={!draft.colors.size}
            onClick={() => setDraft('exactColors', !draft.exactColors)}
          >
            Nur gewählte Farben
          </button>
          {!draft.colors.size && <p className="muted option-hint">Wähle zuerst mindestens eine Farbe in der Filterleiste.</p>}
        </fieldset>
      </div>

      <div className="filter-dialog-actions">
        <button onClick={() => onDraftChange({ colors: new Set(draft.colors), ...EMPTY_ADVANCED })}>Zurücksetzen</button>
        <button className="primary" onClick={() => onApply(draft)}>Filter anwenden</button>
      </div>
    </dialog>
  )
}
