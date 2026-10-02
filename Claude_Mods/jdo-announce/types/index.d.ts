// One announcement in review: the draft, and where it has been sent. `dm` and
// `posted` carry the hash of the exact text sent, so an edit re-locks posting.
export type AnnounceDraft = {
  component: string
  // the component's folder, relative to the JDO repo
  path: string
  text: string
  dm?: { hash: string; link: string }
  posted?: { hash: string; link: string }
}

declare module 'claude-code' {
  interface PluginState {
    'jdo-announce': { draft: AnnounceDraft | null; isBusy: boolean; error: string | null }
  }
}
