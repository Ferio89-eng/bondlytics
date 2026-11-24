import {
  Check,
  Copy,
  FolderPlus,
  Pencil,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { useState } from 'react';
import type { SavedPortfolio } from '../types/portfolio.ts';
import { formatEur } from '../utils/formatters.ts';

interface PortfolioManagerBarProps {
  portfolios: SavedPortfolio[];
  activePortfolioId: string;
  lastSavedLabel: string | null;
  onSelectPortfolio: (id: string) => void;
  onRenamePortfolio: (id: string, newName: string) => void;
  onCreatePortfolio: (name: string, duplicateActive: boolean) => void;
  onDeletePortfolio: (id: string) => void;
  onSaveActivePortfolio: () => void;
}

export function PortfolioManagerBar({
  portfolios,
  activePortfolioId,
  lastSavedLabel,
  onSelectPortfolio,
  onRenamePortfolio,
  onCreatePortfolio,
  onDeletePortfolio,
  onSaveActivePortfolio,
}: PortfolioManagerBarProps) {
  const activePortfolio =
    portfolios.find((p) => p.id === activePortfolioId) ?? portfolios[0];

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');

  const [isCreating, setIsCreating] = useState(false);
  const [newNameDraft, setNewNameDraft] = useState('');
  const [duplicateCurrent, setDuplicateCurrent] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function startRename() {
    if (!activePortfolio) return;
    setRenameDraft(activePortfolio.name);
    setIsRenaming(true);
    setIsCreating(false);
    setConfirmDeleteId(null);
  }

  function submitRename() {
    if (!activePortfolio) return;
    const trimmed = renameDraft.trim();
    if (trimmed) {
      onRenamePortfolio(activePortfolio.id, trimmed);
    }
    setIsRenaming(false);
  }

  function startCreate() {
    setNewNameDraft(`Portafoglio ${portfolios.length + 1}`);
    setDuplicateCurrent(false);
    setIsCreating(true);
    setIsRenaming(false);
    setConfirmDeleteId(null);
  }

  function submitCreate() {
    const trimmed = newNameDraft.trim();
    if (!trimmed) return;
    onCreatePortfolio(trimmed, duplicateCurrent);
    setIsCreating(false);
    setNewNameDraft('');
  }

  return (
    <section
      aria-label="Gestione portafogli"
      className="bg-white border border-slate-200 rounded-xl px-5 py-4 space-y-3"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Portfolio Switcher */}
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="text-xs font-semibold text-slate-500 mr-1 whitespace-nowrap">
            Portafogli ({portfolios.length}):
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {portfolios.map((p) => {
              const isActive = p.id === activePortfolio?.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onSelectPortfolio(p.id);
                    setIsRenaming(false);
                    setConfirmDeleteId(null);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-teal-700 text-white border-teal-700'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span className="truncate max-w-[160px]">{p.name}</span>
                  <span
                    className={`text-[11px] font-mono tabular-nums ${
                      isActive ? 'text-teal-100' : 'text-slate-400'
                    }`}
                  >
                    · {p.holdings.length} · {formatEur(p.settings.totalCapital, 0)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Portfolio Actions */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {lastSavedLabel && (
            <span className="text-[11px] font-mono tabular-nums text-teal-700 mr-1">
              {lastSavedLabel}
            </span>
          )}

          <button
            type="button"
            onClick={onSaveActivePortfolio}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Salva</span>
          </button>

          <button
            type="button"
            onClick={startRename}
            disabled={!activePortfolio}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>Rinomina</span>
          </button>

          <button
            type="button"
            onClick={startCreate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>Nuovo Portafoglio</span>
          </button>

          {portfolios.length > 1 && activePortfolio && (
            confirmDeleteId === activePortfolio.id ? (
              <div className="inline-flex items-center gap-1.5 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1">
                <span className="text-[11px] font-medium text-rose-800 whitespace-nowrap">
                  Eliminare?
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onDeletePortfolio(activePortfolio.id);
                    setConfirmDeleteId(null);
                  }}
                  className="px-2 py-0.5 text-[11px] font-semibold text-white bg-rose-600 rounded hover:bg-rose-700 cursor-pointer"
                >
                  Sì
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(null)}
                  className="px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setConfirmDeleteId(activePortfolio.id);
                  setIsRenaming(false);
                  setIsCreating(false);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-700 bg-white border border-slate-200 rounded-lg hover:bg-rose-50 hover:border-rose-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Elimina</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Inline Rename Row */}
      {isRenaming && activePortfolio && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitRename();
          }}
          className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2.5"
        >
          <label
            htmlFor="rename-portfolio-input"
            className="text-xs font-medium text-slate-700"
          >
            Nuovo nome per &ldquo;{activePortfolio.name}&rdquo;:
          </label>
          <input
            id="rename-portfolio-input"
            type="text"
            autoFocus
            maxLength={60}
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            className="px-3 py-1.5 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 w-64"
          />
          <button
            type="submit"
            disabled={!renameDraft.trim()}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-50 cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Conferma</span>
          </button>
          <button
            type="button"
            onClick={() => setIsRenaming(false)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>Annulla</span>
          </button>
        </form>
      )}

      {/* Inline Create New Portfolio Row */}
      {isCreating && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitCreate();
          }}
          className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-3"
        >
          <label
            htmlFor="new-portfolio-input"
            className="text-xs font-medium text-slate-700"
          >
            Nome nuovo portafoglio:
          </label>
          <input
            id="new-portfolio-input"
            type="text"
            autoFocus
            maxLength={60}
            value={newNameDraft}
            onChange={(e) => setNewNameDraft(e.target.value)}
            placeholder="Es. Portafoglio Cedolare 2030"
            className="px-3 py-1.5 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 w-64"
          />
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={duplicateCurrent}
              onChange={(e) => setDuplicateCurrent(e.target.checked)}
              className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
            />
            <Copy className="w-3.5 h-3.5 text-slate-400" />
            <span>Duplica strumenti attuali</span>
          </label>
          <button
            type="submit"
            disabled={!newNameDraft.trim()}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-50 cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Crea Portafoglio</span>
          </button>
          <button
            type="button"
            onClick={() => setIsCreating(false)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>Annulla</span>
          </button>
        </form>
      )}
    </section>
  );
}
