import { useState, useEffect, useMemo } from "react";
import cache from "./cache";
import backgroundWorker from "./backgroundWorker";

/**
 * Shared data hook for fetching collection resources from the worker + cache.
 * Each type streams independently - no Promise.allSettled.
 *
 * @param {object} collection - The active collection
 * @param {import('./adoClient').ADOClient} client
 * @returns {{ fetchedItems: object, loading: boolean, ages: object }}
 */
export function useCollectionData(collection, client) {
  const [workItems, setWorkItems] = useState([]);
  const [repos, setRepos] = useState([]);
  const [pipelines, setPipelines] = useState([]);
  const [prs, setPrs] = useState([]);
  const [serviceConnections, setServiceConnections] = useState([]);
  const [wikiPages, setWikiPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ages, setAges] = useState({});

  const repoIds = (collection.repos || []).map(r => r.id);
  const pipelineIds = (collection.pipelines || []).map(p => String(p.id));
  const prIds = collection.prIds || [];
  const serviceConnectionIds = (collection.serviceConnections || []).map(sc => String(sc.id));
  const wikiPageIds = (collection.wikiPages || []).map(wp => String(wp.id));

  const depKey = [
    collection.id,
    collection.workItemIds?.join(","),
    repoIds.join(","),
    pipelineIds.join(","),
    prIds.join(","),
    serviceConnectionIds.join(","),
    wikiPageIds.join(","),
  ].join("|");

  // Work items - request from worker, read from cache
  useEffect(() => {
    if (!collection.workItemIds?.length) {
      setWorkItems([]);
      return;
    }

    const ids = collection.workItemIds.map(id => parseInt(id));
    const cacheKey = `worker:workitems:${ids.join(',')}`;

    const cached = cache.get(cacheKey);
    if (cached) {
      setWorkItems(cached.data?.items || cached.data || []);
      setAges(prev => ({ ...prev, workItems: cached._timestamp ? Date.now() - cached._timestamp : null }));
      setLoading(false);
    } else {
      backgroundWorker.request('workitems', { ids });
    }
  }, [collection.workItemIds?.join(',')]);

  // Subscribe to work items cache updates
  useEffect(() => {
    if (!collection.workItemIds?.length) return;

    const ids = collection.workItemIds.map(id => parseInt(id));
    const cacheKey = `worker:workitems:${ids.join(',')}`;

    const unsub = cache.subscribe((changedKey, entry) => {
      if (changedKey === cacheKey) {
        setWorkItems(entry.data?.items || entry.data || []);
        setAges(prev => ({ ...prev, workItems: entry.data?._timestamp ? Date.now() - entry.data._timestamp : null }));
        setLoading(false);
      }
    });

    return unsub;
  }, [collection.workItemIds?.join(',')]);

  // Repos - request from worker, read from cache
  useEffect(() => {
    if (!collection.projects?.length) {
      setRepos([]);
      return;
    }

    const projectsKey = collection.projects.sort().join(',');
    const cacheKey = `worker:repos:${projectsKey}`;

    const cached = cache.get(cacheKey);
    if (cached) {
      const allRepos = cached.data?.items || cached.data || [];
      setRepos(allRepos.filter(r => repoIds.includes(r.id)));
      setAges(prev => ({ ...prev, repos: cached.data?._timestamp ? Date.now() - cached.data._timestamp : null }));
      setLoading(false);
    } else {
      backgroundWorker.request('repos', { projects: collection.projects });
    }
  }, [collection.projects?.join(',')]);

  useEffect(() => {
    if (!collection.projects?.length) return;

    const projectsKey = collection.projects.sort().join(',');
    const cacheKey = `worker:repos:${projectsKey}`;

    const unsub = cache.subscribe((changedKey, entry) => {
      if (changedKey === cacheKey) {
        const allRepos = entry.data?.items || entry.data || [];
        setRepos(allRepos.filter(r => repoIds.includes(r.id)));
        setAges(prev => ({ ...prev, repos: entry.data?._timestamp ? Date.now() - entry.data._timestamp : null }));
        setLoading(false);
      }
    });

    return unsub;
  }, [collection.projects?.join(','), repoIds.join(',')]);

  // Pipelines - request from worker, read from cache
  useEffect(() => {
    if (!collection.projects?.length) {
      setPipelines([]);
      return;
    }

    const projectsKey = collection.projects.sort().join(',');
    const cacheKey = `worker:pipelines:${projectsKey}`;

    const cached = cache.get(cacheKey);
    if (cached) {
      const allPipelines = cached.data?.items || cached.data || [];
      setPipelines(allPipelines.filter(p => pipelineIds.includes(String(p.id))));
      setAges(prev => ({ ...prev, pipelines: cached.data?._timestamp ? Date.now() - cached.data._timestamp : null }));
      setLoading(false);
    } else {
      backgroundWorker.request('pipelines', { projects: collection.projects });
    }
  }, [collection.projects?.join(',')]);

  useEffect(() => {
    if (!collection.projects?.length) return;

    const projectsKey = collection.projects.sort().join(',');
    const cacheKey = `worker:pipelines:${projectsKey}`;

    const unsub = cache.subscribe((changedKey, entry) => {
      if (changedKey === cacheKey) {
        const allPipelines = entry.data?.items || entry.data || [];
        setPipelines(allPipelines.filter(p => pipelineIds.includes(String(p.id))));
        setAges(prev => ({ ...prev, pipelines: entry.data?._timestamp ? Date.now() - entry.data._timestamp : null }));
        setLoading(false);
      }
    });

    return unsub;
  }, [collection.projects?.join(','), pipelineIds.join(',')]);

  // PRs - request from worker, read from cache
  useEffect(() => {
    if (!collection.projects?.length) {
      setPrs([]);
      return;
    }

    const key = `prs:${collection.projects.join(',')}`;
    const cacheKey = `worker:${key}`;

    const cached = cache.get(cacheKey);
    if (cached) {
      const allPrs = cached.data?.items || cached.data || [];
      setPrs(allPrs.filter(pr => prIds.includes(String(pr.pullRequestId))));
      setAges(prev => ({ ...prev, prs: cached.data?._timestamp ? Date.now() - cached.data._timestamp : null }));
    }

    backgroundWorker.request('prs', { projects: collection.projects });
  }, [collection.projects?.join(',')]);

  useEffect(() => {
    if (!collection.projects?.length) return;

    const key = `prs:${collection.projects.join(',')}`;
    const cacheKey = `worker:${key}`;

    const unsub = cache.subscribe((changedKey, entry) => {
      if (changedKey === cacheKey) {
        const allPrs = entry.data?.items || entry.data || [];
        setPrs(allPrs.filter(pr => prIds.includes(String(pr.pullRequestId))));
        setAges(prev => ({ ...prev, prs: entry.data?._timestamp ? Date.now() - entry.data._timestamp : null }));
        setLoading(false);
      }
    });

    return unsub;
  }, [collection.projects?.join(','), prIds.join(',')]);

  // Service Connections - request from worker, read from cache
  useEffect(() => {
    if (!collection.projects?.length) {
      setServiceConnections([]);
      return;
    }

    const key = `serviceConnections:${collection.projects.join(',')}`;
    const cacheKey = `worker:${key}`;

    const cached = cache.get(cacheKey);
    if (cached) {
      const allScs = cached.data?.items || cached.data || [];
      setServiceConnections(allScs.filter(sc => serviceConnectionIds.includes(String(sc.id))));
      setAges(prev => ({ ...prev, serviceConnections: cached.data?._timestamp ? Date.now() - cached.data._timestamp : null }));
    }

    backgroundWorker.request('serviceConnections', { projects: collection.projects });
  }, [collection.projects?.join(',')]);

  useEffect(() => {
    if (!collection.projects?.length) return;

    const key = `serviceConnections:${collection.projects.join(',')}`;
    const cacheKey = `worker:${key}`;

    const unsub = cache.subscribe((changedKey, entry) => {
      if (changedKey === cacheKey) {
        const allScs = entry.data?.items || entry.data || [];
        setServiceConnections(allScs.filter(sc => serviceConnectionIds.includes(String(sc.id))));
        setAges(prev => ({ ...prev, serviceConnections: entry.data?._timestamp ? Date.now() - entry.data._timestamp : null }));
        setLoading(false);
      }
    });

    return unsub;
  }, [collection.projects?.join(','), serviceConnectionIds.join(',')]);

  // Wiki pages - stored in collection, no fetch needed
  useEffect(() => {
    setWikiPages(collection.wikiPages || []);
  }, [collection.wikiPages]);

  return {
    fetchedItems: { workitem: workItems, repo: repos, pipeline: pipelines, pr: prs, serviceconnection: serviceConnections, wiki: wikiPages },
    loading,
    ages,
  };
}
