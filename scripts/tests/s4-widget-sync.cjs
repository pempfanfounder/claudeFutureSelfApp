// Actual widgetSync source, compiled with the locked TypeScript CommonJS
// transform so its lazy native imports can use synthetic adapters without Jest ESM.
const fs = require("node:fs"),
  vm = require("node:vm"),
  assert = require("node:assert/strict"),
  ts = require("typescript");
const platform = { OS: "ios" };
let generation = 1;
const current = () => ({
  userId: "11111111-1111-4111-8111-" + String(generation).padStart(12, "0"),
  generation,
});
const assertIdentity = (id) => {
  if (id.generation !== generation) throw Error("Stale identity");
};
const day = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
let feed;
const prefs = {
  home: { themeId: "minimal_sand", source: "daily", showAuthor: true },
  lock: { source: "daily" },
};
const colors = { bg: "#fff", ink: "#111", ink2: "#333" };
let calls = [],
  blocked = null;
const record = async (name, ...args) => {
  calls.push([name, ...args]);
  if (blocked) {
    const block = blocked;
    blocked = null;
    block.started();
    await block.promise;
  }
};
const modules = {
  "react-native": { Platform: platform },
  "@/lib/appState": {
    captureIdentity: current,
    assertCurrentIdentity: assertIdentity,
    useAppState: { getState: () => ({ isPremium: true }) },
  },
  "@/features/content/dailySet": { getLocalDate: day },
  "@/lib/monitoring": { monitoring: { captureError: () => {} } },
  "@/features/content/feedStore": { useFeedStore: { getState: () => feed } },
  "./pinned": {
    DEFAULT_PINNED: "I am becoming.",
    getPinnedText: async () => "I am becoming.",
  },
  "./widgetPrefs": {
    DEFAULT_WIDGET_PREFS: prefs,
    loadWidgetPrefs: async () => {},
    paletteForWidget: () => colors,
    useWidgetPrefs: { getState: () => ({ prefs }) },
    setWidgetSyncError: () => {},
  },
  "@use-voltra/ios": {
    Voltra: { VStack: "VStack", Text: "WidgetText", Link: "WidgetLink" },
  },
  "@use-voltra/ios-client": {
    scheduleWidget: (...args) => record("schedule", ...args),
    updateWidget: (...args) => record("update", ...args),
  },
  "@use-voltra/android": {
    VoltraAndroid: { Column: "Column", Text: "WidgetText" },
  },
  "@use-voltra/android-client": {
    updateAndroidWidget: (...args) => record("android", ...args),
  },
  "react/jsx-runtime": require("react/jsx-runtime"),
};
const api = {};
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync("src/features/widgets/widgetSync.tsx", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText,
  {
    exports: api,
    require: (name) => {
      if (!(name in modules)) throw Error("Unapproved import " + name);
      return modules[name];
    },
    Date,
    setTimeout,
    clearTimeout,
  },
);
const reset = () => {
  calls = [];
  feed = {
    loading: false,
    ownerGeneration: generation,
    contentDay: day(),
    contentVersion: 1,
    quotes: [],
    affirmations: [],
    lifeGoal: null,
    pinnedAffirmation: null,
  };
};
(async () => {
  for (const os of ["ios", "android"]) {
    platform.OS = os;
    reset();
    await api.syncWidgets();
    assert.equal(calls[0][1], "daily");
    assert.match(JSON.stringify(calls[0]), /Your daily words return here\./);
    console.log(
      "PASS empty " +
        os +
        " feed replaces prior daily widget with neutral content",
    );
  }
  const quote = {
    id: "22222222-2222-4222-8222-222222222222",
    type: "quote",
    body: "Original daily A.",
    author: null,
  };
  for (const os of ["ios", "android"]) {
    platform.OS = os;
    for (const home of ["daily", "pinned"])
      for (const lock of ["daily", "pinned"]) {
        reset();
        feed.quotes = [quote];
        prefs.home.source = home;
        prefs.lock.source = lock;
        await api.syncWidgets();
        const expected = `futureself://content/${quote.id}?kind=quote&source=daily&day=${day()}&owner=${current().userId}`;
        const entry = os === "ios" ? calls[0][2][0] : calls[0][3];
        assert.equal(
          entry.deepLinkUrl,
          home === "daily" ? expected : "futureself://widget-setup",
        );
        if (os === "ios") {
          for (const family of ["accessoryRectangular", "accessoryInline"]) {
            assert.equal(
              entry.variants[family].props.destination,
              lock === "daily" ? expected : "futureself://widget-setup",
            );
            assert.match(
              JSON.stringify(entry.variants[family]),
              lock === "daily" ? /Original daily A/ : /I am becoming/,
            );
          }
        }
      }
  }
  console.log(
    "PASS daily widget links bind owner/day/type, both platforms and mixed iOS source settings",
  );
  prefs.home.source = "daily";
  prefs.lock.source = "daily";
  platform.OS = "ios";
  reset();
  let release, started;
  const dispatched = new Promise((r) => (started = r));
  blocked = { promise: new Promise((r) => (release = r)), started };
  const syncing = api.syncWidgets().catch(() => {});
  await dispatched;
  generation++;
  const clearing = api.clearWidgets();
  await Promise.resolve();
  assert.equal(calls.length, 1);
  release();
  await Promise.all([syncing, clearing]);
  assert.equal(calls.length, 3);
  assert.equal(calls[1][0], "schedule");
  assert.equal(calls[2][0], "update");
  assert.match(JSON.stringify(calls[1]), /Your daily words return here\./);
  assert.match(JSON.stringify(calls[2]), /I am becoming\./);
  console.log(
    "PASS departed account write settles before neutral clear; stale personal follow-up skipped",
  );
  console.log(
    "4/4 synthetic actual widgetSync adapter groups passed; no native runtime evidence",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
