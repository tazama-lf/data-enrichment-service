const RESERVED_KEYWORDS = new Set([
  'select',
  'insert',
  'update',
  'delete',
  'create',
  'drop',
  'table',
  'from',
  'where',
  'join',
  'user',
  'group',
  'order',
  'by',
  'limit',
]);

const CACHE_TTL = 86400;

export { RESERVED_KEYWORDS, CACHE_TTL };
