import { useState, useEffect } from "react";
import { cache } from "./index";
import { getId } from "./resourceTypes";

const CACHE_TTL = 5 * 60 * 1000;

/**
 * Shared data hook for fetching collection resources from the ADO API.
 * Used by CollectionView for both the dashboard and search modes.
 *
 * @param {object} collection - The active collection
 * @param {import('./adoClient').ADOClient} client
 * @returns {{ fetchedItems: object, loading: boolean }}
 */
export function useCollectionData(collection, client) {
  const [workItems, setWorkItems] = useState([]);
  const [repos, setRepos] = useState([]);
  const [pipelines, setPipelines] = useState([]);
  const [prs, setPrs] = useState([]);
  const [serviceConnections, setServiceConnections] = useState([]);
  const [wikiPages, setWikiPages] = useState([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    if (!collection || !client) { setLoading(false); return; }
    setLoading(true);

    const fetchData = async () => {
      const wiPromise = collection.workItemIds?.length > 0
        ? client.getWorkItemsByIds(collection.workItemIds.map(id => parseInt(id)))
        : Promise.resolve([]);

      const reposPromise = repoIds.length > 0
        ? client.getAllRepos().then(all => all.filter(r => repoIds.includes(r.id)))
        : Promise.resolve([]);

      const pipesPromise = pipelineIds.length > 0
        ? client.getAllPipelines().then(all => all.filter(p => pipelineIds.includes(String(p.id))))
        : Promise.resolve([]);

      const prsPromise = prIds.length > 0
        ? client.getAllPullRequests().then(all => all.filter(pr => prIds.includes(String(pr.pullRequestId))))
        : Promise.resolve([]);

      const scsPromise = serviceConnectionIds.length > 0
        ? client.getAllServiceConnections().then(all => all.filter(sc => serviceConnectionIds.includes(String(sc.id))))
        : Promise.resolve([]);

      const wikiPromise = wikiPageIds.length > 0
        ? Promise.resolve(collection.wikiPages || [])
        : Promise.resolve([]);

      const [wi, r, p, pr, scs, wikis] = await Promise.allSettled([
        wiPromise, reposPromise, pipesPromise, prsPromise, scsPromise, wikiPromise,
      ]);

      setWorkItems(wi.status === "fulfilled" ? wi.value : []);
      setRepos(r.status === "fulfilled" ? r.value : []);
      setPipelines(p.status === "fulfilled" ? p.value : []);
      setPrs(pr.status === "fulfilled" ? pr.value : []);
      setServiceConnections(scs.status === "fulfilled" ? scs.value : []);
      setWikiPages(wikis.status === "fulfilled" ? wikis.value : []);
      setLoading(false);
    };

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey]);

  return {
    fetchedItems: { workitem: workItems, repo: repos, pipeline: pipelines, pr: prs, serviceconnection: serviceConnections, wiki: wikiPages },
    loading,
  };
}
