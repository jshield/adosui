import { useState, useEffect } from "react";
import cache from "../lib/cache";
import backgroundWorker from "../lib/backgroundWorker";

export function useWorkerData(type, params = {}, opts = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  
  const key = opts.key || _buildKey(type, params);
  const cacheKey = `worker:${key}`;
  
  function _buildKey(type, params) {
    if (params?.ids) return `${type}:ids:${params.ids.join(',')}`;
    if (params?.query) return `${type}:q:${params.query}`;
    if (params?.projects) return `${type}:${params.projects.join(',')}`;
    if (params?.project) return `${type}:proj:${params.project}`;
    return type;
  }
  
  useEffect(() => {
    const cached = cache.get(cacheKey);
    if (cached) {
      setData(cached.data?.items || cached.data);
      setLoading(false);
    }
    
    if (type && params) {
      backgroundWorker.request(type, { ...params, priority: 'user' });
    }
  }, [type, JSON.stringify(params), cacheKey]);
  
  useEffect(() => {
    const unsub = cache.subscribe((changedKey, entry) => {
      if (changedKey === cacheKey) {
        setData(entry.data?.items || entry.data);
        setLoading(false);
        setError(null);
      }
    });
    
    return unsub;
  }, [cacheKey]);
  
  useEffect(() => {
    return backgroundWorker.subscribe((state) => {
      const inFlight = state.inFlight?.find(f => f.key === key || f.key?.includes(key));
      if (inFlight?.progress) {
        setProgress(inFlight.progress);
      } else if (!inFlight) {
        setProgress(null);
      }
    });
  }, [key]);
  
  const age = data ? Date.now() - (data._timestamp || 0) : null;
  
  return { data, loading, progress, error, age };
}
