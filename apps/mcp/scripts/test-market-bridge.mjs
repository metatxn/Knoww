import assert from "node:assert/strict";
import { test } from "node:test";
import { createContext, runInContext } from "node:vm";
import { BRIDGE_SCRIPT } from "../src/ui/bridge.ts";

function bridge() {
  const sent = [];
  const timers = new Map();
  let listener;
  let disconnected = false;
  const parent = { postMessage: (message) => sent.push(message) };
  const context = createContext({
    window: {
      parent,
      addEventListener: (_, callback) => {
        listener = callback;
      },
    },
    document: { body: { scrollHeight: 400 }, documentElement: { dataset: {} } },
    ResizeObserver: class {
      observe() {}
      disconnect() {
        disconnected = true;
      }
    },
    setTimeout: (callback) => {
      const id = timers.size + 1;
      timers.set(id, callback);
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    receiveResult() {},
    showStatus() {},
    updateControls() {},
  });
  runInContext(BRIDGE_SCRIPT, context);
  return {
    sent,
    timers,
    disconnected: () => disconnected,
    request: () =>
      runInContext(
        'request("tools/call", {name:"show_markets",arguments:{slugs:[]}})',
        context
      ),
    dispatch: (message, source = parent, origin = "https://host.example") =>
      listener({ source, origin, data: { jsonrpc: "2.0", ...message } }),
  };
}

test("a host ping sharing a pending app request ID does not consume its response", async () => {
  const app = bridge();
  const response = app.request();
  app.dispatch({ id: 1, method: "ping" });
  assert.equal(app.timers.size, 1);
  assert.equal(app.sent[1].id, 1);
  assert.equal(JSON.stringify(app.sent[1].result), "{}");
  app.dispatch({ id: 1, result: { markets: [] } });
  assert.deepEqual(await response, { markets: [] });
  assert.equal(app.timers.size, 0);
});

test("a teardown sharing a pending ID cancels the request and acknowledges the host", async () => {
  const app = bridge();
  const response = app.request();
  app.dispatch({ id: 1, method: "ui/resource-teardown" });
  await assert.rejects(response, /View closed/);
  assert.equal(app.disconnected(), true);
  assert.equal(app.timers.size, 0);
  assert.equal(
    JSON.stringify(app.sent[1]),
    '{"jsonrpc":"2.0","id":1,"result":{}}'
  );
});

test("messages from other windows or with no response payload cannot resolve requests", async () => {
  const app = bridge();
  const response = app.request();
  app.dispatch({ id: 1, result: "untrusted" }, {});
  app.dispatch({ id: 1 });
  assert.equal(app.timers.size, 1);
  app.dispatch({ id: 1, result: "trusted" });
  assert.equal(await response, "trusted");
});

test("the bridge pins the parent origin after its first response", async () => {
  const app = bridge();
  const first = app.request();
  app.dispatch({ id: 1, result: "first" });
  await first;
  const second = app.request();
  app.dispatch({ id: 2, result: "wrong" }, undefined, "https://other.example");
  assert.equal(app.timers.size, 1);
  app.dispatch({ id: 2, result: "second" });
  assert.equal(await second, "second");
});
