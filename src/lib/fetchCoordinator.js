import backgroundWorker from "./backgroundWorker";
import cache from "./cache";

class FetchCoordinator {
  constructor() {
    this._pending = new Map();
  }
  
  async request(key, type, params, timeoutMs = 30000) {
    if (this._pending.has(key)) {
      return this._pending.get(key);
    }
    
    backgroundWorker.request(type, params);
    
    const promise = new Promise((resolve, reject) => {
      const unsub = cache.subscribe((cacheKey, entry) => {
        if (cacheKey === `worker:${key}`) {
          resolve(entry.data?.items || entry.data);
          unsub();
          this._pending.delete(key);
        }
      });
      
      setTimeout(() => {
        reject(new Error('Request timeout'));
        unsub();
        this._pending.delete(key);
      }, timeoutMs);
    });
    
    this._pending.set(key, promise);
    return promise;
  }
}

const fetchCoordinator = new FetchCoordinator();
export default fetchCoordinator;
