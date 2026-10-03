// Machine-authored: Codex / OpenAI. Shared local assets for source and standalone builds.
const embeddedElement = globalThis.document?.getElementById('solar-system-data');
const embedded = embeddedElement ? JSON.parse(embeddedElement.textContent) : null;
export const standalone = embedded?.standalone === true || globalThis.location?.protocol === 'file:';

export async function localData(name, url) {
  if (embedded && Object.hasOwn(embedded, name)) return embedded[name];
  if (standalone) throw new Error(`The standalone file is missing its ${name} data. Rebuild this copy.`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${name} data could not be loaded.`);
  return response.json();
}

// Feed embedded bytes through the same map validators used by the server edition.
export const dataResponse = name => async url => ({ ok: true, json: () => localData(name, url) });
