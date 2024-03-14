// this is a quick way of making all the assets available
// as URLs to be loaded without having to import each one
// The import.meta.glob is a vite thing.
const ALL_ASSETS = import.meta.glob("../assets/**/*", {
    query: '?url',
    import: 'default',
    eager: true,
    
}) as Record<string, string>;


export const ASSETS: Record<string, string> = {};

for (const key in ALL_ASSETS) {
    ASSETS[key.substring("../assets/".length)] = ALL_ASSETS[key];
}