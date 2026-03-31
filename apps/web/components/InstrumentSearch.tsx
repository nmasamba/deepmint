"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { trpc } from "@/lib/trpc";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";

interface Instrument {
  id: string;
  ticker: string;
  name: string;
  sector: string | null;
  exchange: string | null;
}

interface InstrumentSearchProps {
  onSelect?: (instrument: Instrument) => void;
  trigger?: "button" | "inline";
}

export function InstrumentSearch({
  onSelect,
  trigger = "button",
}: InstrumentSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 300);

  const { data: results, isLoading } = trpc.instruments.search.useQuery(
    { q: debouncedQuery },
    { enabled: debouncedQuery.length >= 1 },
  );

  const handleSelect = (instrument: Instrument) => {
    onSelect?.(instrument);
    setOpen(false);
    setQuery("");
  };

  if (trigger === "inline") {
    return (
      <div className="relative w-full">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!open && e.target.value.length > 0) setOpen(true);
            }}
            onFocus={() => query.length > 0 && setOpen(true)}
            placeholder="Search tickers..."
            className="h-9 w-full rounded-md border border-border bg-bg-secondary pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
        </div>
        {open && query.length > 0 && (
          <div className="absolute top-10 z-50 w-full rounded-md border border-border bg-bg-secondary shadow-lg">
            {isLoading ? (
              <div className="px-4 py-3 text-sm text-text-secondary">
                Searching...
              </div>
            ) : results && results.length > 0 ? (
              <ul>
                {results.map((instrument) => (
                  <li key={instrument.id}>
                    <button
                      onClick={() => handleSelect(instrument)}
                      className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-bg-tertiary"
                    >
                      <span className="font-mono text-sm font-bold text-text-primary">
                        {instrument.ticker}
                      </span>
                      <span className="truncate text-sm text-text-secondary">
                        {instrument.name}
                      </span>
                      {instrument.sector && (
                        <Badge
                          variant="outline"
                          className="ml-auto shrink-0 border-border text-text-muted"
                        >
                          {instrument.sector}
                        </Badge>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 py-3 text-sm text-text-secondary">
                No instruments found.
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 items-center gap-2 rounded-md border border-border bg-bg-secondary px-3 text-sm text-text-muted hover:border-border-hover hover:text-text-secondary"
      >
        <Search className="h-4 w-4" />
        <span>Search tickers...</span>
        <kbd className="ml-4 hidden rounded border border-border bg-bg-primary px-1.5 py-0.5 font-mono text-xs text-text-muted md:inline-block">
          /
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search by ticker or company name..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>
            {isLoading ? "Searching..." : "No instruments found."}
          </CommandEmpty>
          {results && results.length > 0 && (
            <CommandGroup heading="Instruments">
              {results.map((instrument) => (
                <CommandItem
                  key={instrument.id}
                  value={`${instrument.ticker} ${instrument.name}`}
                  onSelect={() => handleSelect(instrument)}
                  className="flex items-center gap-3"
                >
                  <span className="font-mono text-sm font-bold text-text-primary">
                    {instrument.ticker}
                  </span>
                  <span className="truncate text-sm text-text-secondary">
                    {instrument.name}
                  </span>
                  {instrument.sector && (
                    <Badge
                      variant="outline"
                      className="ml-auto shrink-0 border-border text-text-muted"
                    >
                      {instrument.sector}
                    </Badge>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
