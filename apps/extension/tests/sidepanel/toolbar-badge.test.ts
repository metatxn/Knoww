// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { installSidepanelBadgeLifecycle } from "../../src/sidepanel/toolbar-badge";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("side panel badge lifecycle", () => {
  it("follows tabs in its own window, reports visibility and disposes its connection", async () => {
    const port = {
      postMessage: vi.fn(),
      disconnect: vi.fn(),
      onDisconnect: { addListener: vi.fn() },
    };
    const onActivated = { addListener: vi.fn(), removeListener: vi.fn() };
    const query = vi.fn().mockResolvedValue([{ id: 10 }]);
    const onOpened = { addListener: vi.fn(), removeListener: vi.fn() };
    const onClosed = { addListener: vi.fn(), removeListener: vi.fn() };
    vi.stubGlobal("chrome", {
      windows: { getCurrent: vi.fn().mockResolvedValue({ id: 1 }) },
      tabs: { query, onActivated },
      runtime: { connect: vi.fn().mockReturnValue(port) },
      sidePanel: { onOpened, onClosed },
    });
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("visible");
    const dispose = installSidepanelBadgeLifecycle();
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
    await flush();
    expect(query).toHaveBeenCalledWith({ active: true, windowId: 1 });
    expect(port.postMessage).toHaveBeenLastCalledWith({
      tabId: 10,
      open: true,
    });
    const activated = onActivated.addListener.mock.calls[0][0];
    query.mockClear();
    activated({ windowId: 2 });
    await flush();
    expect(query).not.toHaveBeenCalled();
    query.mockResolvedValue([{ id: 11 }]);
    activated({ windowId: 1 });
    await flush();
    expect(port.postMessage).toHaveBeenLastCalledWith({
      tabId: 11,
      open: true,
    });
    visibility.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(port.postMessage).toHaveBeenLastCalledWith({
      tabId: 11,
      open: false,
    });
    visibility.mockReturnValue("visible");
    onClosed.addListener.mock.calls[0][0]({ windowId: 1 });
    await flush();
    expect(port.postMessage).toHaveBeenLastCalledWith({
      tabId: 11,
      open: false,
    });
    onOpened.addListener.mock.calls[0][0]({ windowId: 1 });
    await flush();
    expect(port.postMessage).toHaveBeenLastCalledWith({
      tabId: 11,
      open: true,
    });
    dispose();
    expect(port.disconnect).toHaveBeenCalledOnce();
    expect(onActivated.removeListener).toHaveBeenCalledWith(activated);
    port.postMessage.mockClear();
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(port.postMessage).not.toHaveBeenCalled();
  });
});
