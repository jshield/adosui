import { useState, useEffect, useRef, useCallback } from "react";
import * as signalR from "@microsoft/signalr";
import { appendSignalRLines } from "../lib/pipelineLogsDB";

/**
 * Manages a SignalR connection for live pipeline log streaming.
 *
 * Only connects when `isRunning` is true. Automatically disconnects
 * when the run completes or when the component unmounts.
 *
 * @param {object|null} client     ADOClient instance
 * @param {string|null} projectName  ADO project name
 * @param {number|null} runId      Build/run ID
 * @param {boolean}     isRunning  Whether the run is currently in progress
 * @returns {{ connectionStatus, buildStatus, onLogLines, clearCallbacks }}
 */
export function usePipelineSignalR(client, projectName, runId, isRunning) {
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [buildStatus, setBuildStatus] = useState(null);

  const connectionRef = useRef(null);
  const callbacksRef = useRef({ onLogLines: null, onBuildCompleted: null });

  /**
   * Set a callback to receive log lines: (recordId, lines[]) => void
   * Called externally so the parent can route lines to the right viewer.
   */
  const setOnLogLines = useCallback((fn) => {
    callbacksRef.current.onLogLines = fn;
  }, []);

  const setOnBuildCompleted = useCallback((fn) => {
    callbacksRef.current.onBuildCompleted = fn;
  }, []);

  const disconnect = useCallback(async () => {
    const conn = connectionRef.current;
    if (!conn) return;
    connectionRef.current = null;
    try {
      await conn.stop();
    } catch {
      // Ignore errors on disconnect
    }
    setConnectionStatus("disconnected");
  }, []);

  const connect = useCallback(async () => {
    if (!client || !projectName || !runId) return;

    try {
      setConnectionStatus("connecting");

      // Resolve project GUID and org instance ID for negotiation
      const [projectId, orgId] = await Promise.all([
        client.getProjectId(projectName),
        client.getOrganizationId(),
      ]);

      if (!projectId || !orgId) {
        console.error("SignalR: could not resolve projectId or orgId");
        setConnectionStatus("error");
        return;
      }

      // Negotiate to get the WebSocket URL and access token
      const negotiateUrl =
        `${client.base}/_apis/${encodeURIComponent(projectId)}/signalr/negotiate` +
        `?transport=webSockets&contextToken=${encodeURIComponent(orgId)}`;

      const negotiateRes = await fetch(negotiateUrl, {
        method: "POST",
        headers: client._getHeaders(),
      });

      if (!negotiateRes.ok) {
        console.error("SignalR negotiate failed:", negotiateRes.status);
        setConnectionStatus("error");
        return;
      }

      const { url, accessToken } = await negotiateRes.json();

      // Build the connection
      const connection = new signalR.HubConnectionBuilder()
        .withUrl(url, { accessTokenFactory: () => accessToken })
        .withAutomaticReconnect([0, 1000, 5000, 10000, 30000])
        .configureLogging(signalR.LogLevel.Warning)
        .build();

      // Register message handlers
      connection.on("logConsoleLines", (messages) => {
        const msgArray = Array.isArray(messages) ? messages : [messages];
        for (const msg of msgArray) {
          if (!msg.lines || !Array.isArray(msg.lines)) continue;
          const recordId = msg.stepRecordId || msg.timelineRecordId;
          if (!recordId) continue;

          // Persist to Dexie
          appendSignalRLines(runId, recordId, msg.lines).catch(() => {});

          // Notify callback
          if (callbacksRef.current.onLogLines) {
            callbacksRef.current.onLogLines(recordId, msg.lines);
          }
        }
      });

      connection.on("buildUpdated", (data) => {
        const build = data?.build || data;
        if (!build) return;
        setBuildStatus(build);

        if (
          build.status === "completed" ||
          build.state === "completed" ||
          build.result
        ) {
          // Build finished — disconnect and notify
          disconnect();
          if (callbacksRef.current.onBuildCompleted) {
            callbacksRef.current.onBuildCompleted(build);
          }
        }
      });

      connection.on("timelineRecordsUpdated", () => {
        // Timeline changed — parent can refetch if needed
      });

      connection.onclose(() => setConnectionStatus("disconnected"));
      connection.onreconnecting(() => setConnectionStatus("reconnecting"));
      connection.onreconnected(() => setConnectionStatus("connected"));

      // Start and subscribe
      await connection.start();
      setConnectionStatus("connected");

      await connection.invoke("WatchBuild", projectId, runId);
      connectionRef.current = connection;
    } catch (err) {
      console.error("SignalR connection failed:", err);
      setConnectionStatus("error");
    }
  }, [client, projectName, runId, disconnect]);

  // Connect/disconnect based on isRunning
  useEffect(() => {
    if (isRunning && runId && projectName && client) {
      connect();
    } else {
      disconnect();
    }
    return () => disconnect();
  }, [isRunning, runId, projectName, client, connect, disconnect]);

  return {
    connectionStatus,
    buildStatus,
    setOnLogLines,
    setOnBuildCompleted,
    disconnect,
  };
}
