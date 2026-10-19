/** Replaces `object[key]` until the returned function puts the original property back exactly as it was. */
function replaceProperty<T extends object>(object: T, key: keyof T & string, value: unknown): () => unknown {
  const original = Object.getOwnPropertyDescriptor(object, key);
  Object.defineProperty(object, key, { value, configurable: true, writable: true });
  return () => {
    if (original) Object.defineProperty(object, key, original);
    else Reflect.deleteProperty(object, key);
  };
}

/**
 * Runs an FMG export that downloads its result through an `<a download>` click, and returns the downloaded blob
 * instead of letting the browser save it. Object URLs made meanwhile are remembered, since FMG revokes some of them
 * right after the click.
 */
export async function captureDownload(runExport: () => Promise<unknown>): Promise<Blob> {
  const blobsByUrl = new Map<string, Blob>();
  const capture: { downloaded: Blob | null } = { downloaded: null };

  const createObjectUrl = URL.createObjectURL.bind(URL);
  const { click } = HTMLAnchorElement.prototype;

  const restoreCreateObjectUrl = replaceProperty(URL, 'createObjectURL', (source: Blob | MediaSource) => {
    const url = createObjectUrl(source);
    if (source instanceof Blob) blobsByUrl.set(url, source);
    return url;
  });
  const restoreClick = replaceProperty(
    HTMLAnchorElement.prototype,
    'click',
    function captureClick(this: HTMLAnchorElement) {
      if (!this.download) {
        click.call(this);
        return;
      }
      capture.downloaded = blobsByUrl.get(this.href) ?? capture.downloaded;
    },
  );

  try {
    await runExport();
  } finally {
    restoreCreateObjectUrl();
    restoreClick();
  }

  if (!capture.downloaded) throw new Error('FMG did not produce the export. Is an editing tool still open?');
  return capture.downloaded;
}
