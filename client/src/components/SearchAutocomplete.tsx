import { useEffect, useMemo, useRef, useState } from "react";
import { buildLocalSearchSuggestions, buildSearchSuggestions, getDidYouMeanSuggestion, searchDiscovery, type SearchSuggestion } from "../services/discoveryService";

interface SearchAutocompleteProps {
  query: string;
  onQueryChange: (query: string) => void;
  onNavigate: (path: string) => void;
  onSubmitQuery: (query: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
  autoFocus?: boolean;
}

type SuggestionStatus = "idle" | "loading" | "ready" | "error";

const suggestionCache = new Map<string, SearchSuggestion[]>();

function suggestionTypeLabel(type: SearchSuggestion["type"]) {
  if (type === "playlist") return "Playlist";
  if (type === "collection") return "Collection";
  if (type === "person") return "Person";
  if (type === "title") return "Title";
  if (type === "hub") return "Theme";
  return "Suggestion";
}

export function SearchAutocomplete({
  query,
  onQueryChange,
  onNavigate,
  onSubmitQuery,
  placeholder = "Search Flim",
  label = "Search",
  className = "",
  autoFocus = false,
}: SearchAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [status, setStatus] = useState<SuggestionStatus>("idle");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const cleanQuery = query.trim();
  const cacheKey = useMemo(() => cleanQuery.toLowerCase(), [cleanQuery]);

  useEffect(() => {
    function closeOnOutside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (cleanQuery.length < 2) {
      setSuggestions([]);
      setStatus("idle");
      return () => {
        cancelled = true;
      };
    }

    const cached = suggestionCache.get(cacheKey);
    if (cached) {
      setSuggestions(cached);
      setStatus("ready");
      setOpen(true);
      return () => {
        cancelled = true;
      };
    }

    const controller = new AbortController();
    let requestTimeout = 0;
    setStatus("loading");
    const timeout = window.setTimeout(async () => {
      try {
        requestTimeout = window.setTimeout(() => controller.abort(), 3200);
        const payload = await searchDiscovery(cleanQuery, { signal: controller.signal });
        if (cancelled) return;
        let nextSuggestions = buildSearchSuggestions(cleanQuery, payload, 8);
        if (nextSuggestions.length === 0) {
          nextSuggestions = buildLocalSearchSuggestions(cleanQuery, 5);
          const didYouMean = getDidYouMeanSuggestion(cleanQuery, payload);
          if (didYouMean && !nextSuggestions.some((suggestion) => suggestion.label === didYouMean.label)) nextSuggestions.unshift(didYouMean);
        }
        suggestionCache.set(cacheKey, nextSuggestions);
        setSuggestions(nextSuggestions);
        setStatus("ready");
        setOpen(true);
      } catch {
        if (cancelled) return;
        const fallbackSuggestions = buildLocalSearchSuggestions(cleanQuery, 5);
        setSuggestions(fallbackSuggestions);
        setStatus(fallbackSuggestions.length ? "ready" : "error");
        setOpen(Boolean(fallbackSuggestions.length));
      } finally {
        window.clearTimeout(requestTimeout);
      }
    }, 260);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(requestTimeout);
      window.clearTimeout(timeout);
    };
  }, [cacheKey, cleanQuery]);

  function chooseSuggestion(suggestion: SearchSuggestion) {
    setOpen(false);
    if (suggestion.query) {
      onQueryChange(suggestion.query);
      onSubmitQuery(suggestion.query);
      return;
    }
    if (suggestion.path) {
      onNavigate(suggestion.path);
    }
  }

  const didYouMean = suggestions.find((suggestion) => suggestion.type === "query" && suggestion.meta === "Did you mean");

  return (
    <div className={["autocomplete-search", className].filter(Boolean).join(" ")} ref={rootRef}>
      <span className="autocomplete-label">{label}</span>
      <input
        aria-label={label}
        autoComplete="off"
        autoFocus={autoFocus}
        onChange={(event) => {
          onQueryChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        placeholder={placeholder}
        type="search"
        value={query}
      />
      {open && cleanQuery.length >= 2 ? (
        <div className="autocomplete-panel" role="listbox" aria-label="Search suggestions">
          {status === "loading" ? <p className="autocomplete-status">Finding suggestions...</p> : null}
          {didYouMean ? (
            <button className="autocomplete-did-you-mean" onClick={() => chooseSuggestion(didYouMean)} type="button">
              Did you mean: <strong>{didYouMean.label}</strong>?
            </button>
          ) : null}
          {suggestions.filter((suggestion) => suggestion.id !== didYouMean?.id).map((suggestion) => (
            <button className="autocomplete-option" key={suggestion.id} onClick={() => chooseSuggestion(suggestion)} role="option" type="button">
              <span>{suggestionTypeLabel(suggestion.type)}</span>
              <strong>{suggestion.label}</strong>
              {suggestion.meta ? <small>{suggestion.meta}</small> : null}
              {suggestion.reason ? <em>{suggestion.reason}</em> : null}
            </button>
          ))}
          {status === "ready" && suggestions.length === 0 ? (
            <p className="autocomplete-status">No quick suggestions yet. Press Search for broad results.</p>
          ) : null}
          {status === "error" ? <p className="autocomplete-status">Suggestions are unavailable. Press Search to keep going.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
