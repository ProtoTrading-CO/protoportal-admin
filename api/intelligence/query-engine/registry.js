/** Named query registry — Apollo never calls adapters directly. */

const queries = new Map();

export function registerQuery(definition) {
  if (!definition?.id) throw new Error('Query definition requires id');
  if (queries.has(definition.id)) {
    throw new Error(`Query already registered: ${definition.id}`);
  }
  queries.set(definition.id, Object.freeze({ ...definition }));
  return definition.id;
}

export function getQuery(queryId) {
  const def = queries.get(queryId);
  if (!def) {
    const err = new Error(`Unknown query: ${queryId}`);
    err.code = 'UNKNOWN_QUERY';
    throw err;
  }
  return def;
}

export function listQueries() {
  return [...queries.keys()];
}

export function clearRegistry() {
  queries.clear();
}
