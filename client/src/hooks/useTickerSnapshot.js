import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { lookupState } from '../lib/ticker';
import { isValidTicker } from '../lib/validation';

// Once any snapshot row has been seen the table is known to be populated for
// this session, so a missing row can be trusted to mean "not a real ticker".
let tableKnownPopulated = false;

/**
 * Looks a ticker up in public.ticker_snapshots after typing pauses. Returns
 * { state, row } where state is 'idle' | 'loading' | 'found' | 'unknown' |
 * 'unavailable' (see lookupState). Reads Supabase only — never Finnhub.
 */
export default function useTickerSnapshot(ticker, delay = 300) {
  const [result, setResult] = useState({ state: 'idle', row: null });

  useEffect(() => {
    const symbol = (ticker || '').trim().toUpperCase();
    if (!isValidTicker(symbol)) {
      setResult({ state: 'idle', row: null });
      return;
    }

    let active = true;
    setResult({ state: 'loading', row: null });
    const timer = setTimeout(async () => {
      const { data: row, error } = await supabase
        .from('ticker_snapshots')
        .select('*')
        .eq('ticker', symbol)
        .maybeSingle();

      let tableHasRows = tableKnownPopulated || Boolean(row);
      if (!error && !row && !tableHasRows) {
        const { data: any } = await supabase.from('ticker_snapshots').select('ticker').limit(1);
        tableHasRows = Boolean(any && any.length);
      }
      if (tableHasRows) tableKnownPopulated = true;

      if (active) setResult({ state: lookupState({ error, row, tableHasRows }), row: row || null });
    }, delay);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [ticker, delay]);

  return result;
}
