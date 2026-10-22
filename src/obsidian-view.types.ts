import 'obsidian';

declare module 'obsidian' {
  interface View {
    /**
     * Not in Obsidian's public typings. Obsidian detaches `containerEl` and then calls `onClose`, so this is the last
     * point where the view's DOM, and any frame in it, is still alive. Every way of closing a view goes through it.
     */
    close(): Promise<void>;
  }
}
