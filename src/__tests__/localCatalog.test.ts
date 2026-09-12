import {
  LOCAL_CATALOG,
  huggingIndicator,
  isLocalCatalogId,
  resolveContentLibrary,
} from "@/features/content/localCatalog";

describe("local catalog fallback", () => {
  it("has twelve quotes and twelve affirmations", () => {
    expect(LOCAL_CATALOG.filter((item) => item.type === "quote")).toHaveLength(
      12,
    );
    expect(
      LOCAL_CATALOG.filter((item) => item.type === "affirmation"),
    ).toHaveLength(12);
    expect(LOCAL_CATALOG.every((item) => isLocalCatalogId(item.id))).toBe(true);
  });

  it("uses the remote library when the server actually sent items", () => {
    const remote = [
      {
        id: "server-1",
        type: "quote" as const,
        body: "From the server.",
        author: null,
        categories: [],
        tags: [],
        priority: 0,
      },
    ];
    expect(
      resolveContentLibrary(remote, { mockPurchases: true }),
    ).toEqual(remote);
  });

  it("falls back to the local pack only in mock purchases when remote is empty", () => {
    expect(resolveContentLibrary([], { mockPurchases: false })).toEqual([]);
    expect(resolveContentLibrary([], { mockPurchases: true })).toEqual(
      LOCAL_CATALOG,
    );
    expect(resolveContentLibrary(null, { mockPurchases: true })).toEqual(
      LOCAL_CATALOG,
    );
  });
});

describe("hugging tab indicator", () => {
  const layouts = [
    { x: 3, width: 72 },
    { x: 78, width: 118 },
  ];

  it("sits on the selected label instead of splitting the track in half", () => {
    expect(huggingIndicator(layouts, 0)).toEqual({
      translateX: 3,
      width: 72,
    });
    expect(huggingIndicator(layouts, 1)).toEqual({
      translateX: 78,
      width: 118,
    });
  });

  it("interpolates between the two labels while paging", () => {
    expect(huggingIndicator(layouts, 0.5)).toEqual({
      translateX: 40.5,
      width: 95,
    });
  });
});
