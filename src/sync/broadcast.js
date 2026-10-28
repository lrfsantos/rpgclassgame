// BroadcastChannel sync between the GM console (authoritative) and Stage.
//
// - GM console: after every mutation it broadcasts the full state; it also
//   answers any "request" from a stage that just loaded or reconnected.
// - Stage: on load it sends a request and ingests the full state it receives;
//   afterwards it just replaces its copy whenever a new "state" arrives.
// - Single-window mode (index.html) does not use this module: both views share
//   the same in-memory state object.

const CHANNEL = "classroom-rpg";
const PING = "sync-request";
const PONG = "sync-state";

function openChannel() {
  try {
    return new BroadcastChannel(CHANNEL);
  } catch (e) {
    return null;
  }
}

// ---- GM console side (authoritative) ----
export function openGmChannel(getPublishable) {
  const channel = openChannel();
  if (!channel) return null;
  channel.onmessage = (ev) => {
    const msg = ev.data || {};
    if (msg.type === PING) {
      send("state", { state: getPublishable() });
    }
  };
  function send(type, payload = {}) {
    try {
      channel.postMessage({ type, ...payload });
    } catch (e) {
      /* ignore */
    }
  }
  return {
    // Call after every mutation to push the new state to all stages.
    broadcast() {
      send("state", { state: getPublishable() });
    },
    close() {
      try {
        channel.close();
      } catch (e) {
        /* ignore */
      }
    },
  };
}

// ---- Stage side (read-only display) ----
export function openStageChannel(onState) {
  const channel = openChannel();
  if (!channel) return null;
  channel.onmessage = (ev) => {
    const msg = ev.data || {};
    if (msg.type === "state" && msg.state) onState(msg.state);
  };
  function send(type, payload = {}) {
    try {
      channel.postMessage({ type, ...payload });
    } catch (e) {
      /* ignore */
    }
  }
  return {
    request() {
      send(PING);
    },
    close() {
      try {
        channel.close();
      } catch (e) {
        /* ignore */
      }
    },
  };
}
