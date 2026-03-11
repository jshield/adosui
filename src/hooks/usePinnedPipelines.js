import { useCallback } from "react";
import { useLocalStorage } from "./useLocalStorage";

export function usePinnedPipelines() {
  const [pinned, setPinned] = useLocalStorage("ado-superui-pinned-pipelines", []);
  
  const isPinned = useCallback((pipelineId) => {
    return pinned.some(p => String(p.id) === String(pipelineId));
  }, [pinned]);
  
  const pin = useCallback((pipeline) => {
    setPinned(prev => {
      if (prev.some(p => String(p.id) === String(pipeline.id))) return prev;
      return [...prev, { 
        id: pipeline.id, 
        name: pipeline.name, 
        project: pipeline._projectName || pipeline.project?.name || pipeline.project || "",
        folder: pipeline.folder || "",
        configurationType: pipeline.configurationType || pipeline.configuration?.type || ""
      }];
    });
  }, [setPinned]);
  
  const unpin = useCallback((pipelineId) => {
    setPinned(prev => prev.filter(p => String(p.id) !== String(pipelineId)));
  }, [setPinned]);
  
  const toggle = useCallback((pipeline) => {
    if (isPinned(pipeline.id)) {
      unpin(pipeline.id);
    } else {
      pin(pipeline);
    }
  }, [isPinned, pin, unpin]);
  
  return { pinned, isPinned, pin, unpin, toggle };
}
