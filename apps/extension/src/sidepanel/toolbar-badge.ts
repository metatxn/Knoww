type PanelEvent = chrome.events.Event<(info: { windowId: number }) => void>;

/** A visible global side panel follows the active tab in its own window. */
export function installSidepanelBadgeLifecycle(): () => void {
  let port: chrome.runtime.Port | undefined;
  let disposed = false;
  let generation = 0;
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  let windowId: number | undefined;
  let nativeOpen: boolean | undefined;
  const panel = (
    chrome as typeof chrome & {
      sidePanel?: { onOpened?: PanelEvent; onClosed?: PanelEvent };
    }
  ).sidePanel;
  const update = async () => {
    const current = ++generation;
    try {
      windowId ??= (await chrome.windows.getCurrent()).id;
      if (windowId === undefined) return;
      const [tab] = await chrome.tabs.query({ active: true, windowId });
      if (disposed || current !== generation || tab?.id === undefined) return;
      if (!port) {
        const connection = chrome.runtime.connect({
          name: "knoww-sidepanel-badge",
        });
        port = connection;
        connection.onDisconnect.addListener(() => {
          if (port !== connection) return;
          port = undefined;
          if (!disposed) reconnect = setTimeout(() => void update(), 1000);
        });
      }
      port.postMessage({
        tabId: tab.id,
        open: nativeOpen ?? document.visibilityState === "visible",
      });
    } catch {
      /* The next visibility or tab change retries the connection. */
    }
  };
  const onActivated = (info: { windowId: number }) => {
    if (windowId === undefined || info.windowId === windowId) void update();
  };
  const onVisibility = () => void update();
  // Chrome can keep the document visible while the native panel is closed.
  const onOpened = (info: { windowId: number }) => {
    if (info.windowId !== windowId) return;
    nativeOpen = true;
    void update();
  };
  const onClosed = (info: { windowId: number }) => {
    if (info.windowId !== windowId) return;
    nativeOpen = false;
    void update();
  };
  if (panel?.onClosed) panel.onOpened?.addListener(onOpened);
  panel?.onClosed?.addListener(onClosed);
  chrome.tabs.onActivated.addListener(onActivated);
  document.addEventListener("visibilitychange", onVisibility);
  void update();
  return () => {
    disposed = true;
    generation++;
    clearTimeout(reconnect);
    chrome.tabs.onActivated.removeListener(onActivated);
    document.removeEventListener("visibilitychange", onVisibility);
    panel?.onOpened?.removeListener(onOpened);
    panel?.onClosed?.removeListener(onClosed);
    port?.disconnect();
  };
}
