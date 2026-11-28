import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check, UserPlus, AlertCircle, X, Building2 } from 'lucide-react';
import { PartyMaster } from '../../types';

interface SearchablePartySelectProps {
  parties: PartyMaster[];
  selectedPartyId: string;
  onSelectParty: (partyId: string) => void;
  isHindi?: boolean;
  onAddNewParty?: () => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
}

export const SearchablePartySelect: React.FC<SearchablePartySelectProps> = ({
  parties,
  selectedPartyId,
  onSelectParty,
  isHindi = false,
  onAddNewParty,
  placeholder,
  className = '',
  required = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Position state for portal/fixed dropdown to avoid overflow clipping
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);

  const selectedParty = parties.find(p => p.id === selectedPartyId);

  const updatePosition = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      const width = Math.max(rect.width, 340);
      let left = rect.left;
      if (left + width > window.innerWidth - 16) {
        left = window.innerWidth - width - 16;
      }
      if (left < 16) left = 16;

      const openAbove = spaceBelow < 250 && spaceAbove > spaceBelow;
      const maxHeight = openAbove ? Math.min(spaceAbove - 16, 320) : Math.min(spaceBelow - 16, 320);
      const top = openAbove ? (rect.top - maxHeight - 4) : (rect.bottom + 4);

      setCoords({ top, left, width, maxHeight });
    }
  };

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
    }
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current && !containerRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const cleanSearch = search.trim().toLowerCase();
  const filteredParties = parties.filter(p => {
    if (!cleanSearch) return true;
    const nameMatch = (p.name || '').toLowerCase().includes(cleanSearch);
    const codeMatch = (p.code || '').toLowerCase().includes(cleanSearch);
    const gstinMatch = (p.gstin || '').toLowerCase().includes(cleanSearch);
    const phoneMatch = (p.phone || '').toLowerCase().includes(cleanSearch);
    const stateMatch = (p.state || '').toLowerCase().includes(cleanSearch);
    return nameMatch || codeMatch || gstinMatch || phoneMatch || stateMatch;
  });

  const handleOpen = () => {
    setSearch('');
    setHighlightedIndex(0);
    setIsOpen(true);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  const handleSelect = (party: PartyMaster) => {
    onSelectParty(party.id);
    setIsOpen(false);
    setSearch('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleOpen();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev + 1 < filteredParties.length ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev - 1 >= 0 ? prev - 1 : filteredParties.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredParties[highlightedIndex]) {
        handleSelect(filteredParties[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={handleOpen}
        onKeyDown={handleKeyDown}
        className="w-full text-left hv-input hover:bg-[var(--hover-surface)] border focus:border-indigo-500 rounded-xl px-3 py-2 text-xs text-[var(--text-primary)] flex items-center justify-between gap-1 transition shadow-sm cursor-pointer"
      >
        <div className="truncate flex-1 font-medium">
          {selectedParty ? (
            <div className="flex items-center gap-2">
              <span className="font-bold text-[var(--text-primary)] truncate">{selectedParty.name}</span>
              <span className="text-[10px] text-[var(--text-muted)] font-mono">({selectedParty.state})</span>
              {selectedParty.gstin && (
                <span className="text-[10px] hv-pill-indigo px-1 rounded font-mono border">
                  {selectedParty.gstin}
                </span>
              )}
            </div>
          ) : (
            <span className="text-[var(--text-muted)]">
              {placeholder || (isHindi ? '🔍 ग्राहक / पार्टी चुनें या खोजें...' : '🔍 Select or search customer party...')}
            </span>
          )}
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-[var(--text-muted)] shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Floating Dropdown Overlay */}
      {isOpen && coords && (
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            maxHeight: `${coords.maxHeight}px`,
            zIndex: 9999
          }}
          className="hv-surface border rounded-xl shadow-2xl overflow-hidden flex flex-col animate-fadeIn text-xs"
        >
          {/* Search Input Box */}
          <div className="p-2 border-b hv-canvas flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setHighlightedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder={isHindi ? 'नाम, GSTIN, फ़ोन या राज्य खोजें...' : 'Search by name, GSTIN, phone, state...'}
              className="w-full bg-transparent text-[var(--text-primary)] text-xs placeholder:text-[var(--text-muted)] focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-0.5 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Quick Add Header */}
          {onAddNewParty && (
            <div className="px-2.5 py-1.5 hv-elevated border-b flex items-center justify-between">
              <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">
                {filteredParties.length} {isHindi ? 'पार्टियां उपलब्ध' : 'Parties Found'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onAddNewParty();
                }}
                className="text-[11px] text-indigo-500 font-bold flex items-center gap-1 hover:underline cursor-pointer"
              >
                <UserPlus className="w-3 h-3" />
                <span>{isHindi ? '+ नई पार्टी जोड़ें' : '+ Create New Party'}</span>
              </button>
            </div>
          )}

          {/* Parties List */}
          <div className="overflow-y-auto flex-1 divide-y divide-[var(--border-primary)] p-1">
            {filteredParties.length === 0 ? (
              <div className="p-4 text-center space-y-2">
                <AlertCircle className="w-5 h-5 text-amber-500 mx-auto opacity-80" />
                <p className="text-[var(--text-muted)] text-xs">
                  {isHindi ? `"${search}" से संबंधित कोई पार्टी नहीं मिली` : `No party found matching "${search}"`}
                </p>
                {onAddNewParty && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onAddNewParty();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 hv-pill-indigo border rounded-lg font-bold text-xs transition cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{isHindi ? `"${search}" को नई पार्टी बनाएँ` : `Create "${search}" as New Party`}</span>
                  </button>
                )}
              </div>
            ) : (
              filteredParties.map((party, idx) => {
                const isSelected = party.id === selectedPartyId;
                const isHighlighted = idx === highlightedIndex;

                return (
                  <div
                    key={party.id}
                    onClick={() => handleSelect(party)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`p-2 rounded-lg cursor-pointer transition flex items-center justify-between gap-2 ${
                      isHighlighted ? 'hv-pill-indigo border' : 'hover:bg-[var(--hover-surface)] text-[var(--text-primary)]'
                    } ${isSelected ? 'hv-pill-indigo border font-semibold' : ''}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-[var(--text-primary)] truncate">
                          {party.name}
                        </span>
                        <span className="text-[10px] hv-elevated text-[var(--text-secondary)] px-1 rounded font-mono border">
                          {party.code}
                        </span>
                        <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold border ${
                          party.type === 'CUSTOMER' ? 'hv-pill-indigo' : 'hv-pill-amber'
                        }`}>
                          {party.type}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[var(--text-muted)] truncate">
                        <span>📍 {party.state || 'N/A'}</span>
                        {party.gstin ? (
                          <span className="text-[var(--text-secondary)] font-mono">• GSTIN: {party.gstin}</span>
                        ) : (
                          <span className="text-[var(--text-muted)]">• Unregistered</span>
                        )}
                        {party.phone && <span>• 📞 {party.phone}</span>}
                      </div>
                    </div>

                    {isSelected && (
                      <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
